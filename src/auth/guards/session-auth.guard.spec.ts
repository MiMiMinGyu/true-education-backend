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
    const context = createContext({
      id: '1',
      username: 'student01',
      role: 'student',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('세션에 사용자가 없으면 UnauthorizedException을 던진다', () => {
    const context = createContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
