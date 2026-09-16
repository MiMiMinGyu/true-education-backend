import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { compare } from 'bcryptjs';
import { USER_REPOSITORY } from '../users/interfaces/user-repository.interface';
import type { IUserRepository } from '../users/interfaces/user-repository.interface';
import { ParentUser, StudentUser, User } from '../users/interfaces/user.interface';
import { AuthService } from './auth.service';

// DB 스키마 확정 전이므로 InMemoryUserRepository 대신, 테스트 전용 Fake 구현체를
// 직접 주입한다 (Repository 패턴 덕분에 AuthService는 어떤 구현체인지 몰라도 됨).
class FakeUserRepository implements IUserRepository {
  private readonly users: User[] = [];

  async save(user: User): Promise<User> {
    this.users.push(user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.users.find((user) => user.username === username) ?? null;
  }

  async findStudentByCode(code: string): Promise<StudentUser | null> {
    return (
      this.users.find(
        (user): user is StudentUser =>
          user.role === 'student' && user.studentCode === code,
      ) ?? null
    );
  }
}

function buildStudentUser(overrides: Partial<StudentUser> = {}): StudentUser {
  return {
    id: 'fake-student-id',
    username: 'fake-student',
    passwordHash: 'fake-hash',
    role: 'student',
    studentCode: 'DUP001',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let repository: FakeUserRepository;

  beforeEach(async () => {
    repository = new FakeUserRepository();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: USER_REPOSITORY, useValue: repository }],
    }).compile();

    service = module.get(AuthService);
  });

  describe('signupStudent', () => {
    it('학생을 가입시키고 6자리 학생 코드를 발급한다', async () => {
      const result = await service.signupStudent({
        username: 'student01',
        password: 'pass1234',
      });

      expect(result.username).toBe('student01');
      expect(result.studentCode).toHaveLength(6);
    });

    it('비밀번호를 평문이 아닌 해시로 저장한다', async () => {
      await service.signupStudent({ username: 'student01', password: 'pass1234' });
      const saved = await repository.findByUsername('student01');

      expect(saved?.passwordHash).not.toBe('pass1234');
      expect(await compare('pass1234', saved!.passwordHash)).toBe(true);
    });

    it('이미 존재하는 아이디면 ConflictException을 던진다', async () => {
      await service.signupStudent({ username: 'student01', password: 'pass1234' });

      await expect(
        service.signupStudent({ username: 'student01', password: 'other1234' }),
      ).rejects.toThrow(ConflictException);
    });

    it('생성된 학생 코드가 이미 존재하면 중복되지 않을 때까지 재발급한다', async () => {
      const spy = jest
        .spyOn(repository, 'findStudentByCode')
        .mockResolvedValueOnce(buildStudentUser({ studentCode: 'DUP001' }))
        .mockResolvedValueOnce(null);

      const result = await service.signupStudent({
        username: 'student02',
        password: 'pass1234',
      });

      expect(spy).toHaveBeenCalledTimes(2);
      expect(result.studentCode).not.toBe('DUP001');
    });
  });

  describe('signupParent', () => {
    it('학생 코드가 일치하면 부모 계정을 해당 학생과 연결한다', async () => {
      const student = await service.signupStudent({
        username: 'student01',
        password: 'pass1234',
      });

      await service.signupParent({
        username: 'parent01',
        password: 'pass1234',
        studentCode: student.studentCode,
      });

      const savedParent = (await repository.findByUsername('parent01')) as ParentUser;
      expect(savedParent.linkedStudentIds).toContain(student.id);
    });

    it('일치하는 학생 코드가 없으면 NotFoundException을 던진다', async () => {
      await expect(
        service.signupParent({
          username: 'parent01',
          password: 'pass1234',
          studentCode: 'NOTFOUND',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('이미 존재하는 아이디면 ConflictException을 던진다', async () => {
      const student = await service.signupStudent({
        username: 'student01',
        password: 'pass1234',
      });
      await service.signupParent({
        username: 'parent01',
        password: 'pass1234',
        studentCode: student.studentCode,
      });

      await expect(
        service.signupParent({
          username: 'parent01',
          password: 'pass1234',
          studentCode: student.studentCode,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('아이디·비밀번호가 일치하면 세션에 담을 사용자 정보를 반환한다', async () => {
      const student = await service.signupStudent({
        username: 'student01',
        password: 'pass1234',
      });

      const result = await service.login({ username: 'student01', password: 'pass1234' });

      expect(result).toEqual({ id: student.id, username: 'student01', role: 'student' });
    });

    it('존재하지 않는 아이디면 UnauthorizedException을 던진다', async () => {
      await expect(
        service.login({ username: 'nobody', password: 'pass1234' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('비밀번호가 틀리면 UnauthorizedException을 던진다', async () => {
      await service.signupStudent({ username: 'student01', password: 'pass1234' });

      await expect(
        service.login({ username: 'student01', password: 'wrongpass' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
