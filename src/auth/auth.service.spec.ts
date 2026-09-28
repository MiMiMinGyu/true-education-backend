import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { compare } from 'bcryptjs';
import { MAX_PENDING_LINK_REQUESTS } from '../common/constants/link.constants';
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
  agreements: ['activityRecord', 'speechToText', 'guardianView'],
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
  agreements: [
    'terms',
    'guardianPrivacy',
    'childPrivacy',
    'childSpeech',
    'guardianDashboard',
  ],
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

    it('필수 동의 세 항목 중 하나라도 빠지면 BadRequestException', async () => {
      await expect(
        service.signupStudent(
          studentDto({ agreements: ['activityRecord', 'guardianView'] }),
        ),
      ).rejects.toThrow('speechToText');
      expect(repository.students).toHaveLength(0);
      expect(repository.consents).toHaveLength(0);
    });

    it('동의 항목마다 버전과 함께 기록하고 요약 컬럼도 채운다', async () => {
      const { id } = await service.signupStudent(studentDto());
      expect(repository.students[0].guardianShareAgreed).toBe(true);
      expect(repository.consents).toEqual(
        ['activityRecord', 'speechToText', 'guardianView'].map((key) => ({
          key,
          version: '2026-09-26',
          aboutChild: false,
          subjectType: 'STUDENT',
          parentId: null,
          studentId: id,
        })),
      );
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
    it('학생 코드 없이 계정 동의만으로 가입하고, 연결은 만들지 않는다', async () => {
      const parent = await service.signupParent({
        ...parentDto(''),
        studentCode: undefined,
        agreements: ['terms', 'guardianPrivacy', 'childPrivacy'],
      });

      expect(repository.links).toEqual([]);
      // 대상 아이가 없으니 자녀 관련 동의는 기록하지 않는다
      expect(
        repository.consents.map((c) => [c.key, c.parentId, c.studentId]),
      ).toEqual([
        ['terms', parent.id, null],
        ['guardianPrivacy', parent.id, null],
      ]);
    });

    it('(전환용) 학생 코드를 보내면 연결이 아니라 수락 대기 요청을 만든다', async () => {
      const student = await service.signupStudent(studentDto());

      const parent = await service.signupParent(parentDto(student.studentCode));

      expect(repository.links).toEqual([
        {
          parentId: parent.id,
          studentId: student.id,
          guardianConsentAgreed: true,
          status: 'PENDING',
        },
      ]);
    });

    it('(전환용) 학생의 대기 요청이 가득 차면 ConflictException', async () => {
      const student = await service.signupStudent(studentDto());
      for (let n = 1; n <= MAX_PENDING_LINK_REQUESTS; n++) {
        await service.signupParent(
          parentDto(student.studentCode, { loginId: `parent0${n}` }),
        );
      }

      await expect(
        service.signupParent(
          parentDto(student.studentCode, { loginId: 'parentxx' }),
        ),
      ).rejects.toThrow(ConflictException);
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
      'terms',
      'guardianPrivacy',
      'childPrivacy',
      'childSpeech',
      'guardianDashboard',
    ])(
      '(코드를 보낼 때) 필수 항목 %s가 빠지면 BadRequestException',
      async (missing) => {
        const { studentCode } = await service.signupStudent(studentDto());
        const agreements = parentDto(studentCode).agreements.filter(
          (key) => key !== missing,
        );

        await expect(
          service.signupParent(parentDto(studentCode, { agreements })),
        ).rejects.toThrow(BadRequestException);
        expect(repository.parents).toHaveLength(0);
      },
    );

    it('자녀 관련 동의에는 대상 자녀를 남기고, 마케팅은 선택이다', async () => {
      const student = await service.signupStudent(studentDto());
      const parent = await service.signupParent(
        parentDto(student.studentCode, {
          agreements: [...parentDto('').agreements, 'marketing'],
        }),
      );
      const parentConsents = repository.consents.filter(
        (c) => c.subjectType === 'PARENT',
      );
      expect(
        parentConsents.map((c) => [c.key, c.parentId, c.studentId]),
      ).toEqual([
        ['terms', parent.id, null],
        ['guardianPrivacy', parent.id, null],
        ['marketing', parent.id, null],
        ['childPrivacy', parent.id, student.id],
        ['childSpeech', parent.id, student.id],
        ['guardianDashboard', parent.id, student.id],
      ]);
      expect(repository.parents[0]).toMatchObject({
        termsAgreed: true,
        marketingAgreed: true,
      });
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
