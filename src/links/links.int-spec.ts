import request from 'supertest';
import { CHILD_CONSENT_KEYS } from '../common/constants/consent.constants';
import { MAX_PENDING_LINK_REQUESTS } from '../common/constants/link.constants';
import {
  createTestApp,
  loginAsNewParent,
  loginAsNewStudent,
  resetDatabase,
  TestContext,
} from '../test-utils/integration';

describe('보호자 연결 요청 (통합)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const requestBody = (studentCode: string) => ({
    studentCode,
    agreements: CHILD_CONSENT_KEYS,
  });

  it('요청 → 학생 수락 전에는 자녀 화면에 접근할 수 없고, 수락하면 연결된다', async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid01');
    const parent = await loginAsNewParent(ctx.app, 'parent01');

    await parent.agent.get('/parents/me/students').expect(200, []);
    const { body: created } = await parent.agent
      .post('/parents/me/link-requests')
      .send(requestBody(kid.studentCode))
      .expect(201);
    expect(created).toMatchObject({
      studentId: kid.studentId,
      studentName: '테*트',
      studentCode: kid.studentCode,
      status: 'PENDING',
    });

    // 수락 전: 연결된 자녀 아님
    await parent.agent.get('/parents/me/students').expect(200, []);
    await parent.agent
      .get(`/parents/me/students/${kid.studentId}/dashboard`)
      .expect(403);
    await parent.agent
      .get('/parents/me/link-requests')
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));

    // 학생: 새 소식 1건(보호자 이름 그대로)
    const { body: inbox } = await kid.agent
      .get('/students/me/link-requests')
      .expect(200);
    expect(inbox).toEqual([
      {
        parentId: parent.parentId,
        parentName: '보호자',
        requestedAt: expect.any(String),
      },
    ]);

    await kid.agent
      .post(`/students/me/link-requests/${parent.parentId}/accept`)
      .expect(200, { parentId: parent.parentId, status: 'ACCEPTED' });

    await parent.agent
      .get('/parents/me/students')
      .expect(200, [{ studentId: kid.studentId, name: '테스트' }]);
    await parent.agent
      .get(`/parents/me/students/${kid.studentId}/dashboard`)
      .expect(200);
    await parent.agent.get('/parents/me/link-requests').expect(200, []);
    await kid.agent.get('/students/me/link-requests').expect(200, []);

    // 자녀 관련 동의는 요청 시 그 아이 대상으로 기록됨
    const consents = await ctx.prisma.userConsent.findMany({
      where: { parentId: parent.parentId },
      orderBy: { id: 'asc' },
    });
    expect(consents.map((c) => [c.consentKey, c.studentId])).toEqual([
      ['terms', null],
      ['guardianPrivacy', null],
      ...CHILD_CONSENT_KEYS.map((key) => [key, kid.studentId]),
    ]);
  });

  it('학생이 거절하면 연결되지 않고, 보호자는 바로 다시 요청할 수 없다', async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid02');
    const parent = await loginAsNewParent(ctx.app, 'parent02');
    await parent.agent
      .post('/parents/me/link-requests')
      .send(requestBody(kid.studentCode))
      .expect(201);

    await kid.agent
      .post(`/students/me/link-requests/${parent.parentId}/reject`)
      .expect(200);
    await kid.agent
      .post(`/students/me/link-requests/${parent.parentId}/accept`)
      .expect(404);

    const { body } = await parent.agent
      .get('/parents/me/link-requests')
      .expect(200);
    expect(body[0]).toMatchObject({ status: 'REJECTED' });
    expect(body[0].retryAfter).not.toBeNull();
    await parent.agent
      .post('/parents/me/link-requests')
      .send(requestBody(kid.studentCode))
      .expect(409);
    await parent.agent
      .get(`/parents/me/students/${kid.studentId}/rewards`)
      .expect(403);
  });

  it('보호자는 대기 중인 요청을 취소할 수 있다', async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid03');
    const parent = await loginAsNewParent(ctx.app, 'parent03');
    await parent.agent
      .post('/parents/me/link-requests')
      .send(requestBody(kid.studentCode))
      .expect(201);

    await parent.agent
      .delete(`/parents/me/link-requests/${kid.studentId}`)
      .expect(204);
    await kid.agent.get('/students/me/link-requests').expect(200, []);
    await parent.agent
      .delete(`/parents/me/link-requests/${kid.studentId}`)
      .expect(404);
  });

  it('잘못된 코드·동의 누락·역할 불일치를 거부한다', async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid04');
    const parent = await loginAsNewParent(ctx.app, 'parent04');

    await parent.agent
      .post('/parents/me/link-requests')
      .send(requestBody('Zz9$Qx'))
      .expect(404);
    await parent.agent
      .post('/parents/me/link-requests')
      .send({ studentCode: kid.studentCode, agreements: ['childPrivacy'] })
      .expect(400);
    await kid.agent
      .post('/parents/me/link-requests')
      .send(requestBody(kid.studentCode))
      .expect(403);
    await parent.agent.get('/students/me/link-requests').expect(403);
    await request(ctx.app.getHttpServer())
      .get('/students/me/link-requests')
      .expect(401);
  });

  it(`동시에 요청이 몰려도 한 아이의 대기 요청은 ${MAX_PENDING_LINK_REQUESTS}개까지만 만들어진다`, async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid05');
    const parents = await Promise.all(
      Array.from({ length: MAX_PENDING_LINK_REQUESTS + 3 }, (_, i) =>
        loginAsNewParent(ctx.app, `crowd0${i}`),
      ),
    );

    const statuses = await Promise.all(
      parents.map(
        async (p) =>
          (
            await p.agent
              .post('/parents/me/link-requests')
              .send(requestBody(kid.studentCode))
          ).status,
      ),
    );

    expect(statuses.filter((s) => s === 201)).toHaveLength(
      MAX_PENDING_LINK_REQUESTS,
    );
    expect(statuses.filter((s) => s === 409)).toHaveLength(3);
    expect(
      await ctx.prisma.parentStudent.count({
        where: { studentId: kid.studentId, status: 'PENDING' },
      }),
    ).toBe(MAX_PENDING_LINK_REQUESTS);
  });

  it('(전환용) 가입할 때 학생 코드를 보내면 연결이 아니라 수락 대기 요청이 된다', async () => {
    const kid = await loginAsNewStudent(ctx.app, 'kid06');
    const agent = request.agent(ctx.app.getHttpServer());
    await agent
      .post('/auth/signup/parent')
      .send({
        name: '보호자',
        loginId: 'parent06',
        password: 'password123',
        studentCode: kid.studentCode,
        agreements: ['terms', 'guardianPrivacy', ...CHILD_CONSENT_KEYS],
      })
      .expect(201);
    await agent
      .post('/auth/login')
      .send({ role: 'PARENT', loginId: 'parent06', password: 'password123' })
      .expect(200);

    await agent.get('/parents/me/students').expect(200, []);
    await kid.agent
      .get('/students/me/link-requests')
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
  });
});
