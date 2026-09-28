import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { lockStudentLinks } from '../../users/repositories/prisma-user.repository';
import type { NewConsent } from '../../users/interfaces/user.interface';
import {
  ILinkRepository,
  LinkRequestContext,
  ParentLinkRequest,
  StudentLinkRequest,
} from '../interfaces/link-repository.interface';

@Injectable()
export class PrismaLinkRepository implements ILinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  findStudentByCode(studentCode: string) {
    return this.prisma.student.findUnique({
      where: { studentCode },
      select: { id: true, name: true },
    });
  }

  requestLink(
    parentId: number,
    studentId: number,
    consents: NewConsent[],
    check: (context: LinkRequestContext) => void,
  ): Promise<Date> {
    return this.prisma.$transaction(async (tx) => {
      await lockStudentLinks(tx, studentId);
      const where = { parentId_studentId: { parentId, studentId } };
      const existing = await tx.parentStudent.findUnique({
        where,
        select: { status: true, respondedAt: true },
      });
      const pendingCount = await tx.parentStudent.count({
        where: { studentId, status: 'PENDING' },
      });
      check({ existing, pendingCount });

      const now = new Date();
      const request = {
        status: 'PENDING' as const,
        guardianConsentAgreed: true,
        respondedAt: null,
        createdAt: now,
      };
      await tx.parentStudent.upsert({
        where,
        create: { parentId, studentId, ...request },
        update: request,
      });
      await tx.userConsent.createMany({
        data: consents.map((consent) => ({
          subjectType: 'PARENT' as const,
          parentId,
          studentId,
          consentKey: consent.key,
          version: consent.version,
          agreedAt: now,
        })),
      });
      return now;
    });
  }

  async listParentRequests(parentId: number): Promise<ParentLinkRequest[]> {
    const rows = await this.prisma.parentStudent.findMany({
      where: { parentId, status: { in: ['PENDING', 'REJECTED'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        createdAt: true,
        respondedAt: true,
        student: { select: { id: true, name: true, studentCode: true } },
      },
    });
    return rows.map((row) => ({
      studentId: row.student.id,
      studentName: row.student.name,
      studentCode: row.student.studentCode,
      status: row.status as ParentLinkRequest['status'],
      requestedAt: row.createdAt,
      respondedAt: row.respondedAt,
    }));
  }

  async cancelRequest(parentId: number, studentId: number): Promise<boolean> {
    const { count } = await this.prisma.parentStudent.deleteMany({
      where: { parentId, studentId, status: 'PENDING' },
    });
    return count > 0;
  }

  async listStudentRequests(studentId: number): Promise<StudentLinkRequest[]> {
    const rows = await this.prisma.parentStudent.findMany({
      where: { studentId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, parent: { select: { id: true, name: true } } },
    });
    return rows.map((row) => ({
      parentId: row.parent.id,
      parentName: row.parent.name,
      requestedAt: row.createdAt,
    }));
  }

  async respond(
    studentId: number,
    parentId: number,
    status: 'ACCEPTED' | 'REJECTED',
  ): Promise<boolean> {
    const { count } = await this.prisma.parentStudent.updateMany({
      where: { parentId, studentId, status: 'PENDING' },
      data: { status, respondedAt: new Date() },
    });
    return count > 0;
  }
}
