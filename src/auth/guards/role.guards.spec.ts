import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionUser } from '../interfaces/session-user.interface';
import { ParentGuard, StudentGuard } from './role.guards';

function createContext(sessionUser?: SessionUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ session: { user: sessionUser } }),
    }),
  } as unknown as ExecutionContext;
}

describe('StudentGuard / ParentGuard', () => {
  it('역할이 맞으면 통과시킨다', () => {
    expect(
      new StudentGuard().canActivate(
        createContext({ userId: 1, role: 'STUDENT' }),
      ),
    ).toBe(true);
    expect(
      new ParentGuard().canActivate(
        createContext({ userId: 1, role: 'PARENT' }),
      ),
    ).toBe(true);
  });

  it('역할이 다르면 ForbiddenException', () => {
    expect(() =>
      new StudentGuard().canActivate(
        createContext({ userId: 1, role: 'PARENT' }),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      new ParentGuard().canActivate(
        createContext({ userId: 1, role: 'STUDENT' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('로그인하지 않았으면 UnauthorizedException', () => {
    expect(() => new StudentGuard().canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });
});
