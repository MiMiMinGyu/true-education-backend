import { QUESTION_KEY_MAX_LENGTH } from '../../common/constants/content.constants';
import type {
  ChoiceStage,
  ImportBook,
  ImportChoiceQuestion,
  ImportEvidence,
  ImportOrdering,
} from '../interfaces/import-book.interface';

/**
 * AI 파트 동화 JSON → 적재 형식(ImportBook). 파일에서 읽은 값이라 모든 필드를 unknown으로 받고 변환하면서 확인합니다.
 * 기준 형식: docs/samples/folkency-5747.json (2026-09-29, 본문·출처·문제를 한 파일에)
 *
 * { id, title, pages: [["줄", …], …],
 *   meta: { source, source_details: { url, license, attribution, … }, rule_check, validation, …,
 *           activities: { comprehension: [{ id, category, question, choices, answerIndex, hint, evidence, explanation }],
 *                         sequence: { id, events: [정답 순서 문장], displayOrder },
 *                         titleActivity: { originalTitle, hintQuestions } } } }
 *
 * - 쪽은 AI가 나눈 그대로(한 쪽 = 문단 하나, paging PARAGRAPH). 줄 id = p001-1 …
 * - 검수: human_approved는 쓰지 않습니다. meta.rule_check.passed가 false인 파일만 건너뜁니다.
 * - meta 중 본문·문제로 옮기지 않은 정보는 sourceMeta로 그대로 보존합니다.
 * - 첫 샘플(good-brothers)의 문제 없는 형식과, 예전 합의(최상위 questions·order.cards)도 계속 받습니다.
 */
export type AiStoryConversion =
  | { status: 'OK'; book: ImportBook; warnings: string[] }
  | { status: 'SKIPPED'; externalId: string; reason: string }
  | { status: 'INVALID'; externalId: string; errors: string[] };

const STAGES: Record<string, ChoiceStage> = {
  누가: 'WHO',
  '무슨 일': 'WHAT',
  무슨일: 'WHAT',
  왜: 'WHY',
  마음: 'EMOTION',
  WHO: 'WHO',
  WHAT: 'WHAT',
  WHY: 'WHY',
  EMOTION: 'EMOTION',
};

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const record = (value: unknown): Json => (isRecord(value) ? value : {});

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** 근거 인용을 본문에서 찾을 때 따옴표·문장부호·공백 차이는 무시합니다 */
const squash = (value: string) => value.replace(/[\s'"‘’“”.,!?·…]/g, '');

export const paragraphIdOf = (pageIndex: number) =>
  `p${String(pageIndex + 1).padStart(3, '0')}`;

interface Context {
  storyId: string;
  paragraphs: ImportBook['paragraphs'];
  errors: string[];
  warnings: string[];
}

export function convertAiStory(input: unknown): AiStoryConversion {
  const json = record(input);
  const externalId = text(json.id) ?? '(id 없음)';
  if (!isRecord(input)) {
    return {
      status: 'INVALID',
      externalId,
      errors: ['JSON이 객체가 아닙니다.'],
    };
  }

  const meta = record(json.meta);
  const ruleCheck = record(meta.rule_check);
  if (ruleCheck.passed === false) {
    return {
      status: 'SKIPPED',
      externalId,
      reason: 'meta.rule_check.passed가 false입니다(규칙 검사 미통과).',
    };
  }

  const ctx: Context = {
    storyId: externalId,
    paragraphs: [],
    errors: [],
    warnings: [],
  };
  if (ruleCheck.passed !== true) {
    ctx.warnings.push(
      'meta.rule_check.passed가 true가 아닙니다(규칙 검사를 하지 않았거나 결과가 없음).',
    );
  }
  const validation = text(record(meta.validation).status);
  if (validation && validation !== 'passed') {
    ctx.warnings.push(`내용 검증 상태가 "${validation}"입니다.`);
  }

  if (!text(json.id)) ctx.errors.push('id가 비어 있습니다.');
  const title = text(json.title);
  if (!title) ctx.errors.push('title이 비어 있습니다.');
  readPages(json.pages, ctx);

  const activities = record(meta.activities);
  const questions = Array.isArray(activities.comprehension)
    ? convertComprehension(activities.comprehension, ctx)
    : convertLegacyQuestions(json.questions, ctx);
  const ordering = isRecord(activities.sequence)
    ? convertSequence(activities.sequence, ctx)
    : convertLegacyOrdering(json.order, ctx);
  const titleActivity = record(activities.titleActivity);
  const titleHints = strings(titleActivity.hintQuestions)
    .map((hint) => hint.trim())
    .filter(Boolean);

  if (ctx.errors.length > 0) {
    return { status: 'INVALID', externalId, errors: ctx.errors };
  }

  const source = record(meta.source_details);
  return {
    status: 'OK',
    book: {
      externalId,
      title: title!,
      author: text(json.author) ?? text(source.author),
      sourceUrl: text(source.url),
      license: text(source.license),
      bibliography: text(source.attribution) ?? text(meta.source),
      paragraphs: ctx.paragraphs,
      paging: 'PARAGRAPH',
      glossary: convertGlossary(json.glossary ?? meta.glossary),
      questions,
      ordering,
      titleHints: titleHints.length ? titleHints : null,
      sourceMeta: preservedMeta(meta, activities),
    },
    warnings: ctx.warnings,
  };
}

function readPages(value: unknown, ctx: Context) {
  if (!Array.isArray(value) || value.length === 0) {
    ctx.errors.push('pages가 1쪽 이상 있어야 합니다.');
    return;
  }
  value.forEach((page: unknown, p) => {
    if (!Array.isArray(page) || page.length === 0) {
      ctx.errors.push(`pages[${p}]가 줄 배열이 아니거나 비어 있습니다.`);
      return;
    }
    // 빈 줄은 검증기가 위치와 함께 알려 주도록 그대로 넘깁니다.
    ctx.paragraphs.push({
      id: paragraphIdOf(p),
      sentences: page.map((line: unknown) =>
        typeof line === 'string' ? line : '',
      ),
    });
  });

  const sizes = new Set(ctx.paragraphs.map((p) => p.sentences.length));
  if (sizes.size > 1) {
    ctx.warnings.push(
      `쪽마다 줄 수가 다릅니다(${[...sizes].sort().join('·')}줄). AI가 나눈 쪽 그대로 씁니다.`,
    );
  }
  // 생성 과정에서 줄 끝에 따옴표·쉼표가 남은 경우(화면·음성에 그대로 나옴). 내용은 바꾸지 않고 알립니다.
  const stray = ctx.paragraphs
    .flatMap((p) => p.sentences)
    .filter((line) => /['"],\s*$/.test(line)).length;
  if (stray > 0) {
    ctx.warnings.push(
      `줄 끝에 따옴표·쉼표(예: ',)가 남은 줄이 ${stray}개 있습니다. 화면과 음성에 그대로 나옵니다.`,
    );
  }
}

/** 인용 문장이 있는 쪽을 찾아 근거로 만듭니다 */
function evidenceOf(
  quote: string,
  where: string,
  ctx: Context,
): ImportEvidence[] | null {
  const needle = squash(quote);
  const found = ctx.paragraphs.find((p) =>
    squash(p.sentences.join(' ')).includes(needle),
  );
  if (!found) {
    ctx.warnings.push(
      `${where}.evidence "${quote}"를 본문에서 찾지 못했습니다(힌트는 hint를 씀).`,
    );
    return null;
  }
  return [{ paragraph_id: found.id, quote }];
}

/** 문제 id "folkency-5747-q1" → "q1"(DB 칸 길이 제한) */
function questionKey(id: string | null, index: number, storyId: string) {
  const key = id?.startsWith(`${storyId}-`) ? id.slice(storyId.length + 1) : id;
  return key && key.length <= QUESTION_KEY_MAX_LENGTH ? key : `q${index + 1}`;
}

function stageOf(value: unknown, where: string, ctx: Context): ChoiceStage {
  const label = text(value);
  const stage = label ? STAGES[label] : undefined;
  if (!stage) {
    ctx.errors.push(
      `${where}의 유형 "${label ?? ''}"를 알 수 없습니다(누가·무슨 일·왜·마음).`,
    );
  }
  return stage ?? 'WHO';
}

function convertComprehension(
  items: unknown[],
  ctx: Context,
): ImportChoiceQuestion[] {
  return items.map((item, q) => {
    const question = record(item);
    const where = `comprehension[${q}]`;
    const quote = text(question.evidence);
    return {
      externalKey: questionKey(text(question.id), q, ctx.storyId),
      stage: stageOf(question.category, where, ctx),
      text: text(question.question) ?? '',
      options: strings(question.choices),
      correct:
        typeof question.answerIndex === 'number' ? question.answerIndex : -1,
      hint: text(question.hint),
      evidence: quote ? evidenceOf(quote, where, ctx) : null,
      explanation: text(question.explanation),
    };
  });
}

function convertSequence(sequence: Json, ctx: Context): ImportOrdering | null {
  if (!Array.isArray(sequence.events)) {
    ctx.errors.push('sequence.events가 배열이 아닙니다.');
    return null;
  }
  // 카드는 정답 순서로 저장하고 서버가 섞어 보내므로 displayOrder는 쓰지 않습니다.
  return {
    text: text(sequence.question) ?? undefined,
    cards: sequence.events.map((event: unknown, i) => ({
      id: `e${i + 1}`,
      text: typeof event === 'string' ? event.trim() : '',
    })),
  };
}

function convertLegacyQuestions(
  value: unknown,
  ctx: Context,
): ImportChoiceQuestion[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    ctx.errors.push('questions가 배열이 아닙니다.');
    return [];
  }
  const paragraphIds = new Set(ctx.paragraphs.map((p) => p.id));
  return value.map((item: unknown, q): ImportChoiceQuestion => {
    const question = record(item);
    const where = `questions[${q}]`;
    // 본문에 없는 문단을 가리키는 근거는 빼고 경고만 남깁니다.
    const evidence = Array.isArray(question.evidence)
      ? question.evidence.filter((e: unknown): e is ImportEvidence => {
          const ok = isRecord(e) && paragraphIds.has(String(e.paragraph_id));
          if (!ok)
            ctx.warnings.push(
              `${where}.evidence의 문단을 본문에서 찾지 못해 뺐습니다.`,
            );
          return ok;
        })
      : null;
    return {
      externalKey: text(question.id) ?? `q${q + 1}`,
      stage: stageOf(question.stage, where, ctx),
      text: text(question.q) ?? text(question.text) ?? '',
      options: strings(question.options),
      correct: typeof question.correct === 'number' ? question.correct : -1,
      hint: text(question.hint),
      evidence,
      explanation: text(question.explanation),
    };
  });
}

function convertLegacyOrdering(
  value: unknown,
  ctx: Context,
): ImportOrdering | null {
  if (value == null) return null;
  if (!isRecord(value) || !Array.isArray(value.cards)) {
    ctx.errors.push('order.cards가 배열이 아닙니다.');
    return null;
  }
  return {
    text: text(value.text) ?? text(value.q) ?? undefined,
    cards: value.cards.map((card: unknown) => {
      const item = record(card);
      return { id: text(item.id) ?? '', text: text(item.text) ?? '' };
    }),
  };
}

/** 본문·문제로 옮긴 부분을 뺀 meta 전부(출처 상세·생성 정보·검수 상태, 순서 맞추기 id·표시 순서 등) */
function preservedMeta(meta: Json, activities: Json): Json | null {
  const rest: Json = { ...meta };
  delete rest.activities;
  delete rest.glossary;
  const sequence = record(activities.sequence);
  const titleActivity = record(activities.titleActivity);
  const kept: Json = {};
  if (sequence.id !== undefined || sequence.displayOrder !== undefined) {
    kept.sequence = { id: sequence.id, displayOrder: sequence.displayOrder };
  }
  if (titleActivity.originalTitle !== undefined) {
    kept.titleActivity = { originalTitle: titleActivity.originalTitle };
  }
  if (Object.keys(kept).length > 0) rest.activities = kept;
  return Object.keys(rest).length > 0 ? rest : null;
}

function convertGlossary(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
