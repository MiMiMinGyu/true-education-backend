import { Injectable } from '@nestjs/common';
import { MAX_PENDING_LINK_REQUESTS } from '../../common/constants/link.constants';
import {
  LinkRequestLimitError,
  LoginIdTakenError,
  StudentCodeNotFoundError,
  StudentCodeTakenError,
} from '../errors/user-repository.errors';
import { IUserRepository } from '../interfaces/user-repository.interface';
import {
  NewParent,
  NewConsent,
  NewParentLink,
  NewStudent,
  ParentAccount,
  StudentAccount,
} from '../interfaces/user.interface';

interface ParentStudentLink {
  parentId: number;
  studentId: number;
  guardianConsentAgreed: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
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
  readonly consents: (NewConsent & {
    subjectType: 'STUDENT' | 'PARENT';
    parentId: number | null;
    studentId: number | null;
  })[] = [];
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
    const { consents, ...data } = student;
    const saved = { id: this.nextId++, ...data };
    this.students.push(saved);
    for (const consent of consents) {
      this.consents.push({
        ...consent,
        subjectType: 'STUDENT',
        parentId: null,
        studentId: saved.id,
      });
    }
    return saved;
  }

  async createParent(
    parent: NewParent,
    link?: NewParentLink,
  ): Promise<ParentAccount> {
    if (await this.isLoginIdTaken(parent.loginId)) {
      throw new LoginIdTakenError(parent.loginId);
    }
    let studentId: number | null = null;
    if (link) {
      const student = this.students.find(
        (s) => s.studentCode === link.studentCode,
      );
      if (!student) {
        throw new StudentCodeNotFoundError();
      }
      const pending = this.links.filter(
        (l) => l.studentId === student.id && l.status === 'PENDING',
      ).length;
      if (pending >= MAX_PENDING_LINK_REQUESTS) {
        throw new LinkRequestLimitError();
      }
      studentId = student.id;
    }
    const { consents, ...data } = parent;
    const saved = { id: this.nextId++, ...data };
    this.parents.push(saved);
    for (const consent of consents) {
      this.consents.push({
        ...consent,
        subjectType: 'PARENT',
        parentId: saved.id,
        studentId: consent.aboutChild ? studentId : null,
      });
    }
    if (studentId !== null) {
      this.links.push({
        parentId: saved.id,
        studentId,
        guardianConsentAgreed: true,
        status: 'PENDING',
      });
    }
    return saved;
  }
}
