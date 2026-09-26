import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

const STUDENT_SELECT = {
  id: true,
  loginId: true,
  passwordHash: true,
  name: true,
  birthYear: true,
  studentCode: true,
} as const;

const PARENT_SELECT = {
  id: true,
  loginId: true,
  passwordHash: true,
  name: true,
} as const;

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isLoginIdTaken(loginId: string): Promise<boolean> {
    return isLoginIdTakenIn(this.prisma, loginId);
  }

  findStudentByLoginId(loginId: string): Promise<StudentAccount | null> {
    return this.prisma.student.findUnique({
      where: { loginId },
      select: STUDENT_SELECT,
    });
  }

  findParentByLoginId(loginId: string): Promise<ParentAccount | null> {
    return this.prisma.parent.findUnique({
      where: { loginId },
      select: PARENT_SELECT,
    });
  }

  findStudentById(id: number): Promise<StudentAccount | null> {
    return this.prisma.student.findUnique({
      where: { id },
      select: STUDENT_SELECT,
    });
  }

  findParentById(id: number): Promise<ParentAccount | null> {
    return this.prisma.parent.findUnique({
      where: { id },
      select: PARENT_SELECT,
    });
  }

  createStudent(student: NewStudent): Promise<StudentAccount> {
    return this.prisma.$transaction(async (tx) => {
      await lockLoginId(tx, student.loginId);
      if (await isLoginIdTakenIn(tx, student.loginId)) {
        throw new LoginIdTakenError(student.loginId);
      }
      const codeOwner = await tx.student.findUnique({
        where: { studentCode: student.studentCode },
        select: { id: true },
      });
      if (codeOwner) {
        throw new StudentCodeTakenError();
      }
      const { consents, ...data } = student;
      const created = await tx.student.create({ data, select: STUDENT_SELECT });
      await tx.userConsent.createMany({
        data: consents.map((consent) => ({
          subjectType: 'STUDENT' as const,
          studentId: created.id,
          consentKey: consent.key,
          version: consent.version,
        })),
      });
      return created;
    });
  }

  createParentWithStudentLink(
    parent: NewParent,
    link: NewParentLink,
  ): Promise<ParentAccount> {
    return this.prisma.$transaction(async (tx) => {
      await lockLoginId(tx, parent.loginId);
      if (await isLoginIdTakenIn(tx, parent.loginId)) {
        throw new LoginIdTakenError(parent.loginId);
      }
      const student = await tx.student.findUnique({
        where: { studentCode: link.studentCode },
        select: { id: true },
      });
      if (!student) {
        throw new StudentCodeNotFoundError();
      }
      const { consents, ...data } = parent;
      const created = await tx.parent.create({
        data: {
          ...data,
          students: {
            create: {
              studentId: student.id,
              guardianConsentAgreed: link.guardianConsentAgreed,
            },
          },
        },
        select: PARENT_SELECT,
      });
      await tx.userConsent.createMany({
        data: consents.map((consent) => ({
          subjectType: 'PARENT' as const,
          parentId: created.id,
          studentId: consent.aboutChild ? student.id : null,
          consentKey: consent.key,
          version: consent.version,
        })),
      });
      return created;
    });
  }
}

type Db = PrismaService | Prisma.TransactionClient;

async function isLoginIdTakenIn(db: Db, loginId: string): Promise<boolean> {
  const [student, parent] = await Promise.all([
    db.student.findUnique({ where: { loginId }, select: { id: true } }),
    db.parent.findUnique({ where: { loginId }, select: { id: true } }),
  ]);
  return student !== null || parent !== null;
}

// 아이디 유일성은 두 테이블에 걸쳐 있어 UNIQUE 제약으로 막을 수 없습니다.
// 같은 아이디로 동시에 가입하는 요청을 트랜잭션 단위로 직렬화합니다(트랜잭션 종료 시 자동 해제).
async function lockLoginId(tx: Prisma.TransactionClient, loginId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${loginId}))`;
}
