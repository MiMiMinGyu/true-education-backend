import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { compare } from 'bcryptjs';
import { StudentCodeTakenError } from '../users/errors/user-repository.errors';
import { USER_REPOSITORY } from '../users/interfaces/user-repository.interface';
import { InMemoryUserRepository } from '../users/repositories/in-memory-user.repository';
import { AuthService } from './auth.service';
import { SignupParentDto } from './dto/signup-parent.dto';
import { SignupStudentDto } from './dto/signup-student.dto';

const studentDto = (
  overrides: Partial<SignupStudentDto> = {},
): SignupStudentDto => ({
  name: '김여울',
  loginId: 'student01',
  password: 'password123',
  age: 8,
  guardianShareAgreed: true,
  ...overrides,
});

const parentDto = (
  studentCode: string,
  overrides: Partial<SignupParentDto> = {},
): SignupParentDto => ({
  name: '김보호',
  loginId: 'parent01',
  password: 'password123',
  studentCode,
  termsAgreed: true,
  marketingAgreed: false,
  guardianConsentAgreed: true,
  ...overrides,
});

describe('AuthService', () => {
  let service: AuthService;
  let repository: InMemoryUserRepository;

  beforeEach(async () => {
    repository = new InMemoryUserRepository();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: USER_REPOSITORY, useValue: repository },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.useRealTimers());

  describe('isLoginIdAvailable', () => {
    it('학생·보호자 어느 쪽에서든 쓰인 아이디면 false', async () => {
      const { studentCode } = await service.signupStudent(studentDto());
      await service.signupParent(parentDto(studentCode));

      expect(await service.isLoginIdAvailable('student01')).toBe(false);
      expect(await service.isLoginIdAvailable('parent01')).toBe(false);
      expect(await service.isLoginIdAvailable('newbie01')).toBe(true);
    });
  });

  describe('signupStudent', () => {
    it('학생을 가입시키고 6자리 학생 코드를 발급한다', async () => {
      const result = await service.signupStudent(studentDto());

      expect(result.id).toEqual(expect.any(Number));
      expect(result.studentCode).toHaveLength(6);
    });

    it('나이를 한국 시간 기준 출생 연도로 바꿔 저장한다', async () => {
      // 2026-12-31 15:30 UTC = 2027-01-01 KST
      jest.useFakeTimers({
        now: new Date('2026-12-31T15:30:00Z'),
        doNotFake: ['nextTick', 'setImmediate'],
      });
      await service.signupStudent(studentDto({ age: 8 }));

      expect(repository.students[0].birthYear).toBe(2019);
    });

    it('나이를 입력하지 않으면 출생 연도를 비워 둔다', async () => {
      await service.signupStudent(studentDto({ age: undefined }));

      expect(repository.students[0].birthYear).toBeNull();
    });

    it('비밀번호를 해시로 저장한다', async () => {
      await service.signupStudent(studentDto());
      const saved = repository.students[0];

      expect(saved.passwordHash).not.toBe('password123');
      expect(await compare('password123', saved.passwordHash)).toBe(true);
    });

    it('보호자 전달 동의가 없으면 BadRequestException', async () => {
      await expect(
        service.signupStudent(studentDto({ guardianShareAgreed: false })),
      ).rejects.toThrow(BadRequestException);
      expect(repository.students).toHaveLength(0);
    });

    it('보호자 계정이 쓰는 아이디면 ConflictException', async () => {
      const { studentCode } = await service.signupStudent(studentDto());
      await service.signupParent(
        parentDto(studentCode, { loginId: 'taken01' }),
      );

      await expect(
        service.signupStudent(studentDto({ loginId: 'taken01' })),
      ).rejects.toThrow(ConflictException);
    });

    it('학생 코드가 겹치면 새 코드로 다시 시도한다', async () => {
      const spy = jest
        .spyOn(repository, 'createStudent')
        .mockRejectedValueOnce(new StudentCodeTakenError());

      const result = await service.signupStudent(studentDto());

      expect(spy).toHaveBeenCalledTimes(2);
      expect(result.studentCode).toHaveLength(6);
    });

    it('학생 코드 충돌이 계속되면 재시도를 멈추고 오류를 낸다', async () => {
      const spy = jest
        .spyOn(repository, 'createStudent')
        .mockRejectedValue(new StudentCodeTakenError());

      await expect(service.signupStudent(studentDto())).rejects.toThrow(
        StudentCodeTakenError,
      );
      expect(spy).toHaveBeenCalledTimes(5);
    });
  });

  describe('signupParent', () => {
    it('학생 코드가 일치하면 보호자를 만들고 동의 기록과 함께 학생과 연결한다', async () => {
      const student = await service.signupStudent(studentDto());

      const parent = await service.signupParent(parentDto(student.studentCode));

      expect(repository.links).toEqual([
        {
          parentId: parent.id,
          studentId: student.id,
          guardianConsentAgreed: true,
        },
      ]);
    });

    it('학생 코드는 대소문자를 구분한다', async () => {
      await service.signupStudent(studentDto());
      const code = repository.students[0].studentCode;
      const flipped = [...code]
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join('');

      await expect(service.signupParent(parentDto(flipped))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('일치하는 학생 코드가 없으면 NotFoundException', async () => {
      await expect(service.signupParent(parentDto('Zz9$Qx'))).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.parents).toHaveLength(0);
    });

    it.each([
      ['이용약관', { termsAgreed: false }],
      ['자녀 개인정보 수집·이용', { guardianConsentAgreed: false }],
    ])('%s 동의가 없으면 BadRequestException', async (_label, overrides) => {
      const { studentCode } = await service.signupStudent(studentDto());

      await expect(
        service.signupParent(parentDto(studentCode, overrides)),
      ).rejects.toThrow(BadRequestException);
      expect(repository.parents).toHaveLength(0);
    });

    it('학생 계정이 쓰는 아이디면 ConflictException', async () => {
      const { studentCode } = await service.signupStudent(studentDto());

      await expect(
        service.signupParent(parentDto(studentCode, { loginId: 'student01' })),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('고른 역할의 계정과 비밀번호가 맞으면 세션 정보를 반환한다', async () => {
      const student = await service.signupStudent(studentDto());

      const result = await service.login({
        role: 'STUDENT',
        loginId: 'student01',
        password: 'password123',
      });

      expect(result).toEqual({ userId: student.id, role: 'STUDENT' });
    });

    it('다른 역할 탭으로 로그인하면 UnauthorizedException', async () => {
      await service.signupStudent(studentDto());

      await expect(
        service.login({
          role: 'PARENT',
          loginId: 'student01',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('비밀번호가 틀리면 UnauthorizedException', async () => {
      await service.signupStudent(studentDto());

      await expect(
        service.login({
          role: 'STUDENT',
          loginId: 'student01',
          password: 'wrongpass',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe', () => {
    it('학생이면 학생 코드를 포함한다', async () => {
      const { id, studentCode } = await service.signupStudent(studentDto());

      expect(await service.getMe({ userId: id, role: 'STUDENT' })).toEqual({
        id,
        role: 'STUDENT',
        name: '김여울',
        studentCode,
      });
    });

    it('보호자면 학생 코드 없이 반환한다', async () => {
      const { studentCode } = await service.signupStudent(studentDto());
      const { id } = await service.signupParent(parentDto(studentCode));

      expect(await service.getMe({ userId: id, role: 'PARENT' })).toEqual({
        id,
        role: 'PARENT',
        name: '김보호',
      });
    });

    it('세션의 계정이 없어졌으면 UnauthorizedException', async () => {
      await expect(
        service.getMe({ userId: 999, role: 'STUDENT' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
