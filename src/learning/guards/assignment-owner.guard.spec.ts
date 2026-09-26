import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ILearningRepository } from '../interfaces/learning-repository.interface';
import { AssignmentOwnerGuard } from './assignment-owner.guard';

function context(id: string, userId: number): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: { id },
        session: { user: { userId, role: 'STUDENT' } },
      }),
    }),
  } as unknown as ExecutionContext;
}

const guard = new AssignmentOwnerGuard({
  findAssignmentOwner: jest.fn(async (id: number) => (id === 10 ? 1 : null)),
} as unknown as ILearningRepository);

describe('AssignmentOwnerGuard', () => {
  it('본인 배정이면 통과', async () => {
    await expect(guard.canActivate(context('10', 1))).resolves.toBe(true);
  });

  it('다른 학생의 배정이면 403', async () => {
    await expect(guard.canActivate(context('10', 2))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('없는 배정이면 404, 숫자가 아니면 400', async () => {
    await expect(guard.canActivate(context('99', 1))).rejects.toThrow(
      NotFoundException,
    );
    await expect(guard.canActivate(context('abc', 1))).rejects.toThrow(
      BadRequestException,
    );
  });
});
