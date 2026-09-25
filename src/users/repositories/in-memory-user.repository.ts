import { Injectable } from '@nestjs/common';
import {
  LoginIdTakenError,
  StudentCodeNotFoundError,
  StudentCodeTakenError,
} from '../errors/user-repository.errors';
import { IUserRepository } from '../interfaces/user-repository.interface';
import {
  NewParent,
  NewParentLink,
  NewStudent,
  ParentAccount,
  StudentAccount,
} from '../interfaces/user.interface';

interface ParentStudentLink {
  parentId: number;
  studentId: number;
  guardianConsentAgreed: boolean;
}

/** 단위 테스트용 구현체. PrismaUserRepository와 같은 규칙(두 테이블 아이디 중복, 도메인 오류)을 따릅니다. */
@Injectable()
export class InMemoryUserRepository implements IUserRepository {
  readonly students: (StudentAccount & { guardianShareAgreed: boolean })[] = [];
  readonly parents: (ParentAccount & {
    termsAgreed: boolean;
    marketingAgreed: boolean;
  })[] = [];
  readonly links: ParentStudentLink[] = [];
  private nextId = 1;

  async isLoginIdTaken(loginId: string): Promise<boolean> {
    return (
      this.students.some((s) => s.loginId === loginId) ||
      this.parents.some((p) => p.loginId === loginId)
    );
  }

  async findStudentByLoginId(loginId: string): Promise<StudentAccount | null> {
    return this.students.find((s) => s.loginId === loginId) ?? null;
  }

  async findParentByLoginId(loginId: string): Promise<ParentAccount | null> {
    return this.parents.find((p) => p.loginId === loginId) ?? null;
  }

  async findStudentById(id: number): Promise<StudentAccount | null> {
    return this.students.find((s) => s.id === id) ?? null;
  }

  async findParentById(id: number): Promise<ParentAccount | null> {
    return this.parents.find((p) => p.id === id) ?? null;
  }

  async createStudent(student: NewStudent): Promise<StudentAccount> {
    if (await this.isLoginIdTaken(student.loginId)) {
      throw new LoginIdTakenError(student.loginId);
    }
    if (this.students.some((s) => s.studentCode === student.studentCode)) {
      throw new StudentCodeTakenError();
    }
    const saved = { id: this.nextId++, ...student };
    this.students.push(saved);
    return saved;
  }

  async createParentWithStudentLink(
    parent: NewParent,
    link: NewParentLink,
  ): Promise<ParentAccount> {
    if (await this.isLoginIdTaken(parent.loginId)) {
      throw new LoginIdTakenError(parent.loginId);
    }
    const student = this.students.find(
      (s) => s.studentCode === link.studentCode,
    );
    if (!student) {
      throw new StudentCodeNotFoundError();
    }
    const saved = { id: this.nextId++, ...parent };
    this.parents.push(saved);
    this.links.push({
      parentId: saved.id,
      studentId: student.id,
      guardianConsentAgreed: link.guardianConsentAgreed,
    });
    return saved;
  }
}
