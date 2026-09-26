// 시연용 더미 데이터: npm run demo:seed
// 시연 학생·보호자 계정을 만들고, 지난 5일 동안 하루 1권씩 완료한 기록(읽기·문제 풀이·제목·표지·설명 말하기·스탬프)과
// 보호자 보상을 넣습니다. 오늘은 배정이 없어 학생으로 로그인하면 새 책이 배정됩니다(실시간 시연용).
// 다시 실행하면 시연 계정의 기록을 지우고 새로 만듭니다. 운영 환경(NODE_ENV=production)에서는 실행하지 않습니다.
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { hash } from 'bcryptjs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateStudentCode } from '../auth/utils/student-code.util';
import { PASSWORD_SALT_ROUNDS } from '../common/constants/auth.constants';
import { currentYearKst, todayKst } from '../common/utils/kst-date.util';
import { ContentImportService } from '../content/content-import.service';
import { ContentModule } from '../content/content.module';
import { BookContent } from '../content/interfaces/book-content.interface';
import { ImportBook } from '../content/interfaces/import-book.interface';
import { Prisma } from '../generated/prisma/client';
import { toPages } from '../learning/utils/reading.util';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.interface';
import { StorageModule } from '../storage/storage.module';
import { coverPng } from './demo/png.util';

const SEED_DIR = 'prisma/seed/books';
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEMO_STUDENT = {
  loginId: 'demo_kid',
  password: 'yeoul1234',
  name: '김여울',
  age: 8,
};
export const DEMO_PARENT = {
  loginId: 'demo_parent',
  password: 'yeoul1234',
  name: '김보호',
};

/**
 * 지난 5일의 완료 기록. wrongFirst: 1차에 틀린 유형(이해 질문은 힌트 보고 2차에 맞힘, reveal이면 끝까지 틀림).
 * 대시보드 판정이 원인 이해 = 함께 연습, 순서 정리 = 연습하며 관찰, 마음·인물과 사건 = 스스로 해결이 되도록 짰습니다.
 */
const HISTORY = [
  {
    daysAgo: 5,
    title: '나누면 더 달콤해',
    wrongFirst: ['WHY'],
    reveal: [],
    stamps: 1,
    reflection: '곰이 꿀을 친구들이랑 나눠 먹어서 기분이 좋았어요.',
    colors: [
      [255, 236, 200],
      [240, 150, 80],
    ],
  },
  {
    daysAgo: 4,
    title: '비 오는 날의 우산',
    wrongFirst: ['ORDER'],
    reveal: [],
    stamps: 2,
    reflection: '토끼가 우산을 같이 써 줘서 친구가 안 젖었어요.',
    colors: [
      [210, 232, 255],
      [230, 80, 80],
    ],
  },
  {
    daysAgo: 3,
    title: '숲속 친구들',
    wrongFirst: ['WHY'],
    reveal: ['WHY'],
    stamps: 1,
    reflection: '부엉이가 나무 위에서 다 보고 있었어요.',
    colors: [
      [222, 245, 210],
      [90, 160, 90],
    ],
  },
  {
    daysAgo: 2,
    title: '빨간 우산 이야기',
    wrongFirst: ['WHY', 'EMOTION'],
    reveal: [],
    stamps: 1,
    reflection: '비가 그치고 무지개가 떠서 다 같이 웃었어요.',
    colors: [
      [255, 225, 230],
      [200, 70, 110],
    ],
  },
  {
    daysAgo: 1,
    title: '꿀단지 대소동',
    wrongFirst: ['ORDER'],
    reveal: [],
    stamps: 2,
    reflection: '꿀단지가 굴러가서 깜짝 놀랐는데 다람쥐가 잡아 줬어요.',
    colors: [
      [255, 245, 205],
      [220, 170, 40],
    ],
  },
] as const;

const REWARDS = [
  { milestone: 5, name: '좋아하는 간식 먹기' },
  { milestone: 10, name: '주말에 공원 가기' },
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    ContentModule,
  ],
})
class DemoSeedModule {}

const kstDate = (daysAgo: number) =>
  todayKst(new Date(Date.now() - daysAgo * DAY_MS));
const dateColumn = (date: string) => new Date(`${date}T00:00:00.000Z`);
const kstTime = (date: string, time: string) =>
  new Date(`${date}T${time}+09:00`);

/** 개발용 시드 동화를 적재하고, 시연에 필요한 권수(완료 5권 + 오늘 1권)가 모자라면 시드를 복제해 채웁니다 */
async function ensureBooks(
  prisma: PrismaService,
  importer: ContentImportService,
  needed: number,
) {
  const seeds: ImportBook[] = [];
  for (const file of (await readdir(SEED_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const book = JSON.parse(
      await readFile(join(SEED_DIR, file), 'utf8'),
    ) as ImportBook;
    seeds.push(book);
    await importer.importBook(book);
  }
  // TODO: AI 파트 동화가 들어오면 복제본 없이 실제 동화로 시연합니다.
  for (let n = 1; (await prisma.book.count()) < needed; n++) {
    const seed = seeds[(n - 1) % seeds.length];
    await importer.importBook({
      ...seed,
      externalId: `demo-copy-${n}`,
      title: `${seed.title} ${n + 1}`,
    });
  }
}

/** 시연 계정과 그 기록을 모두 지웁니다(다시 실행용) */
async function removeDemoAccounts(tx: Prisma.TransactionClient) {
  const student = await tx.student.findUnique({
    where: { loginId: DEMO_STUDENT.loginId },
    select: { id: true },
  });
  if (student) {
    const where = { assignment: { studentId: student.id } };
    await tx.drawingReflection.deleteMany({ where: { drawing: where } });
    await tx.drawing.deleteMany({ where });
    await tx.studentStamp.deleteMany({ where: { studentId: student.id } });
    await tx.questionAttempt.deleteMany({ where });
    await tx.learningSession.deleteMany({ where });
    await tx.readingProgress.deleteMany({ where });
    await tx.bookAssignment.deleteMany({ where: { studentId: student.id } });
    await tx.parentReward.deleteMany({ where: { studentId: student.id } });
    await tx.parentStudent.deleteMany({ where: { studentId: student.id } });
  }
  const parent = await tx.parent.findUnique({
    where: { loginId: DEMO_PARENT.loginId },
    select: { id: true },
  });
  if (parent) {
    await tx.parentReward.deleteMany({ where: { parentId: parent.id } });
    await tx.parentStudent.deleteMany({ where: { parentId: parent.id } });
    await tx.parent.delete({ where: { id: parent.id } });
  }
  if (student) await tx.student.delete({ where: { id: student.id } });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('운영 환경에서는 시연용 데이터를 만들지 않습니다.');
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.createApplicationContext(DemoSeedModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const storage = app.get<StorageService>(STORAGE_SERVICE);
    await ensureBooks(
      prisma,
      app.get(ContentImportService),
      HISTORY.length + 1,
    );

    const books = await prisma.book.findMany({
      orderBy: { id: 'asc' },
      take: HISTORY.length,
      include: { questions: { orderBy: { questionOrder: 'asc' } } },
    });
    const passwordHash = await hash(
      DEMO_STUDENT.password,
      PASSWORD_SALT_ROUNDS,
    );

    // 표지 그림 파일은 트랜잭션 밖에서 먼저 저장합니다.
    const drawingKeys = await Promise.all(
      HISTORY.map(async (day, i) => {
        const key = `drawings/demo/${DEMO_STUDENT.loginId}-${i + 1}.png`;
        const [from, to] = day.colors;
        await storage.put(
          key,
          coverPng(326, 318, [...from], [...to]),
          'image/png',
        );
        return key;
      }),
    );

    const summary = await prisma.$transaction(
      async (tx) => {
        await removeDemoAccounts(tx);
        const student = await tx.student.create({
          data: {
            loginId: DEMO_STUDENT.loginId,
            passwordHash,
            name: DEMO_STUDENT.name,
            birthYear: currentYearKst() - DEMO_STUDENT.age,
            studentCode: generateStudentCode(),
            guardianShareAgreed: true,
          },
        });
        const parent = await tx.parent.create({
          data: {
            loginId: DEMO_PARENT.loginId,
            passwordHash,
            name: DEMO_PARENT.name,
            termsAgreed: true,
            marketingAgreed: false,
            students: {
              create: { studentId: student.id, guardianConsentAgreed: true },
            },
          },
        });

        for (const [i, day] of HISTORY.entries()) {
          const book = books[i];
          const date = kstDate(day.daysAgo);
          const content = book.content as unknown as BookContent;
          const studentLines = toPages(content)
            .flatMap((page) => page.lines)
            .filter((line) => line.speaker === 'STUDENT');
          const syllables = studentLines.reduce(
            (sum, l) => sum + l.syllableCount,
            0,
          );

          const assignment = await tx.bookAssignment.create({
            data: {
              studentId: student.id,
              bookId: book.id,
              startDate: dateColumn(date),
              studentTitle: day.title,
              status: 'COMPLETED',
              completedAt: kstTime(date, '17:30:00'),
              progress: {
                create: { currentStage: 'COMPLETED', currentStep: 0 },
              },
              sessions: {
                create: {
                  sessionDate: dateColumn(date),
                  startedAt: kstTime(date, '17:00:00'),
                  lastActiveAt: kstTime(date, '17:30:00'),
                  readSyllableCount: syllables,
                  // 음절당 약 0.55~0.75초(날이 갈수록 조금 빨라지게)
                  readingDurationMs: Math.round(syllables * (750 - i * 40)),
                },
              },
              stamp: {
                create: {
                  studentId: student.id,
                  amount: day.stamps,
                  earnedAt: kstTime(date, '17:30:00'),
                },
              },
              drawing: {
                create: {
                  imageUrl: drawingKeys[i],
                  createdAt: kstTime(date, '17:25:00'),
                  reflection: {
                    create: {
                      transcript: day.reflection,
                      durationMs: 18000 + i * 3000,
                      createdAt: kstTime(date, '17:29:00'),
                    },
                  },
                },
              },
            },
            include: { sessions: true },
          });

          const sessionId = assignment.sessions[0].id;
          let minute = 10;
          for (const question of book.questions) {
            const wrong = (day.wrongFirst as readonly string[]).includes(
              question.stage,
            );
            const reveal = (day.reveal as readonly string[]).includes(
              question.stage,
            );
            const correct = question.correctAnswer as unknown;
            const wrongAnswer =
              question.questionFormat === 'CHOICE'
                ? ((correct as number) + 1) %
                  (question.options as string[]).length
                : [...(correct as string[])].reverse();
            const answers = !wrong
              ? [correct]
              : reveal
                ? [
                    wrongAnswer,
                    wrongAnswer,
                    ...(question.questionFormat === 'ORDERING'
                      ? [wrongAnswer]
                      : []),
                  ]
                : [wrongAnswer, correct];
            for (const [n, answer] of answers.entries()) {
              await tx.questionAttempt.create({
                data: {
                  bookAssignmentId: assignment.id,
                  learningSessionId: sessionId,
                  questionId: question.id,
                  attemptNumber: n + 1,
                  studentAnswer: answer as Prisma.InputJsonValue,
                  isCorrect:
                    answer === correct ||
                    JSON.stringify(answer) === JSON.stringify(correct),
                  responseTimeMs: 4000 + n * 2500,
                  answeredAt: kstTime(
                    date,
                    `17:${String(minute++).padStart(2, '0')}:00`,
                  ),
                },
              });
            }
          }
        }

        for (const reward of REWARDS) {
          await tx.parentReward.create({
            data: {
              parentId: parent.id,
              studentId: student.id,
              requiredStamps: reward.milestone,
              name: reward.name,
            },
          });
        }
        return {
          studentCode: student.studentCode,
          stampTotal: HISTORY.reduce((sum, day) => sum + day.stamps, 0),
        };
      },
      { timeout: 30_000 },
    );

    console.log('시연용 데이터를 만들었습니다.');
    console.log(
      `  학생   ${DEMO_STUDENT.loginId} / ${DEMO_STUDENT.password} (${DEMO_STUDENT.name}, 학생 코드 ${summary.studentCode})`,
    );
    console.log(
      `  보호자 ${DEMO_PARENT.loginId} / ${DEMO_PARENT.password} (${DEMO_PARENT.name})`,
    );
    console.log(
      `  완료한 책 ${HISTORY.length}권(${kstDate(5)} ~ ${kstDate(1)}), 스탬프 ${summary.stampTotal}개, 보상 ${REWARDS.length}개`,
    );
    console.log('  오늘은 배정이 없어 학생으로 로그인하면 새 책이 배정됩니다.');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  new Logger('demo-seed').error(error);
  process.exit(1);
});
