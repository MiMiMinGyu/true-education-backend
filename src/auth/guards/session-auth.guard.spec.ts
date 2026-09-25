import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionUser } from '../interfaces/session-user.interface';

function createContext(sessionUser?: SessionUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ session: { user: sessionUser } }),
    }),
  } as unknown as ExecutionContext;
}

describe('SessionAuthGuard', () => {
  const guard = new SessionAuthGuard();

  it('세션에 로그인된 사용자가 있으면 통과시킨다', () => {
    expect(
      guard.canActivate(createContext({ userId: 1, role: 'STUDENT' })),
    ).toBe(true);
  });

  it('세션에 사용자가 없으면 UnauthorizedException을 던진다', () => {
    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
