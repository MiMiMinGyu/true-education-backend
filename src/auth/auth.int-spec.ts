import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  TestContext,
} from '../test-utils/integration';
import * as studentCode from './utils/student-code.util';

describe('학생 가입 (통합)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const signup = (loginId: string) =>
    request(ctx.app.getHttpServer())
      .post('/auth/signup/student')
      .send({
        name: '학생',
        loginId,
        password: 'password123',
        agreements: ['activityRecord', 'speechToText', 'guardianView'],
      });

  const signupParent = (loginId: string) =>
    request(ctx.app.getHttpServer())
      .post('/auth/signup/parent')
      .send({
        name: '보호자',
        loginId,
        password: 'password123',
        agreements: ['terms', 'guardianPrivacy'],
      });

  it('다른 아이디로 동시에 가입하다 같은 학생 코드를 뽑아도 둘 다 가입되고 코드는 겹치지 않는다', async () => {
    // 처음 두 번은 같은 코드, 그 뒤로는 무작위 → 두 요청 모두 중복 확인을 통과한 뒤 저장에서 충돌
    const random = studentCode.generateStudentCode;
    jest
      .spyOn(studentCode, 'generateStudentCode')
      .mockReturnValueOnce('Aa2$Bb')
      .mockReturnValueOnce('Aa2$Bb')
      .mockImplementation(random);

    const [first, second] = await Promise.all([
      signup('race01'),
      signup('race02'),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.studentCode).not.toBe(second.body.studentCode);
    expect(
      [first.body.studentCode, second.body.studentCode].filter(
        (code: string) => code === 'Aa2$Bb',
      ),
    ).toHaveLength(1);
    expect(await ctx.prisma.student.count()).toBe(2);
  });

  it('같은 아이디로 동시에 가입하면 1건만 성공한다', async () => {
    const statuses = (
      await Promise.all([signup('same01'), signup('same01'), signup('same01')])
    ).map((res) => res.status);

    expect(statuses.sort()).toEqual([201, 409, 409]);
  });

  it('같은 아이디로 학생과 보호자가 동시에 가입하면 1건만 성공한다', async () => {
    const [student, parent] = await Promise.all([
      signup('cross01'),
      signupParent('cross01'),
    ]);

    expect([student.status, parent.status].sort()).toEqual([201, 409]);
    expect(await ctx.prisma.student.count()).toBe(
      student.status === 201 ? 1 : 0,
    );
    expect(await ctx.prisma.parent.count()).toBe(
      parent.status === 201 ? 1 : 0,
    );
  });
});
