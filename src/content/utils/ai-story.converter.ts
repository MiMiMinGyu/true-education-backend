import type {
  ChoiceStage,
  ImportBook,
  ImportChoiceQuestion,
  ImportEvidence,
  ImportOrdering,
} from '../interfaces/import-book.interface';

/**
 * AI 파트 동화 JSON(2026-09-29 첫 샘플 docs/samples/good-brothers.json 기준).
 * 파일에서 읽은 값이라 모든 필드를 unknown으로 받고 변환하면서 확인합니다.
 *
 * { id, title, pages: [["줄", "줄"], …], meta: { source, rule_check: { passed } }, questions?, order? }
 *
 * - 쪽은 AI가 나눈 그대로 씁니다(한 쪽 = 문단 하나, paging PARAGRAPH). 줄 id = p001-1 …
 * - 검수: human_approved는 쓰지 않습니다. meta.rule_check.passed가 false인 파일만 건너뜁니다.
 * - 문제는 같은 파일에 담겨 온다고 합의(형식 미정). 그때까지는 12번 형식(questions[]·order.cards)을 임시로 받습니다.
 */
// TODO: AI 파트가 "모든 데이터를 담은 형식"을 주면 출처(작가·링크·라이선스)·문제·어휘 매핑을 그 형식에 맞춥니다.
export interface AiStoryJson {
  id?: unknown;
  title?: unknown;
  pages?: unknown;
  glossary?: unknown;
  meta?: {
    source?: unknown;
    rule_check?: { passed?: unknown };
  } | null;
  questions?: unknown;
  order?: unknown;
}

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const paragraphIdOf = (pageIndex: number) =>
  `p${String(pageIndex + 1).padStart(3, '0')}`;

export function convertAiStory(input: unknown): AiStoryConversion {
  const json: AiStoryJson = isRecord(input) ? input : {};
  const externalId = text(json.id) ?? '(id 없음)';
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return {
      status: 'INVALID',
      externalId,
      errors: ['JSON이 객체가 아닙니다.'],
    };
  }
  if (json.meta?.rule_check?.passed === false) {
    return {
      status: 'SKIPPED',
      externalId,
      reason: 'meta.rule_check.passed가 false입니다(규칙 검사 미통과).',
    };
  }
  if (json.meta?.rule_check?.passed !== true) {
    warnings.push(
      'meta.rule_check.passed가 없습니다(규칙 검사 결과를 확인하지 못함).',
    );
  }

  if (!text(json.id)) errors.push('id가 비어 있습니다.');
  const title = text(json.title);
  if (!title) errors.push('title이 비어 있습니다.');

  const paragraphs: ImportBook['paragraphs'] = [];
  if (!Array.isArray(json.pages) || json.pages.length === 0) {
    errors.push('pages가 1쪽 이상 있어야 합니다.');
  } else {
    json.pages.forEach((page: unknown, p) => {
      if (!Array.isArray(page) || page.length === 0) {
        errors.push(`pages[${p}]가 줄 배열이 아니거나 비어 있습니다.`);
        return;
      }
      // 빈 줄은 검증기가 위치와 함께 알려 주도록 그대로 넘깁니다.
      paragraphs.push({
        id: paragraphIdOf(p),
        sentences: page.map((line: unknown) =>
          typeof line === 'string' ? line : '',
        ),
      });
    });
    const sizes = new Set(paragraphs.map((p) => p.sentences.length));
    if (sizes.size > 1) {
      warnings.push(
        `쪽마다 줄 수가 다릅니다(${[...sizes].sort().join('·')}줄). AI가 나눈 쪽 그대로 씁니다.`,
      );
    }
  }

  const paragraphIds = new Set(paragraphs.map((p) => p.id));
  const questions = convertQuestions(
    json.questions,
    paragraphIds,
    errors,
    warnings,
  );
  const ordering = convertOrdering(json.order, errors);

  if (errors.length > 0) return { status: 'INVALID', externalId, errors };

  return {
    status: 'OK',
    book: {
      externalId: text(json.id)!,
      title: title!,
      author: null,
      sourceUrl: null,
      license: null,
      bibliography: text(json.meta?.source),
      paragraphs,
      paging: 'PARAGRAPH',
      glossary: convertGlossary(json.glossary),
      questions,
      ordering,
    },
    warnings,
  };
}

function convertQuestions(
  value: unknown,
  paragraphIds: Set<string>,
  errors: string[],
  warnings: string[],
): ImportChoiceQuestion[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push('questions가 배열이 아닙니다.');
    return [];
  }
  return value.map((item: unknown, q): ImportChoiceQuestion => {
    const question = isRecord(item) ? item : {};
    const where = `questions[${q}]`;
    const stageText = text(question.stage);
    const stage = stageText ? STAGES[stageText] : undefined;
    if (!stage) {
      errors.push(
        `${where}.stage "${stageText ?? ''}"를 알 수 없습니다(누가·무슨 일·왜·마음).`,
      );
    }
    // 본문에 없는 문단을 가리키는 근거는 빼고 경고만 남깁니다(쪽 번호 체계가 아직 합의되지 않음).
    const evidence = Array.isArray(question.evidence)
      ? question.evidence.filter((e: unknown): e is ImportEvidence => {
          const ok = isRecord(e) && paragraphIds.has(String(e.paragraph_id));
          if (!ok)
            warnings.push(
              `${where}.evidence의 문단을 본문에서 찾지 못해 뺐습니다.`,
            );
          return ok;
        })
      : null;
    return {
      externalKey: text(question.id) ?? `q${q + 1}`,
      stage: stage ?? 'WHO',
      text: text(question.q) ?? text(question.text) ?? '',
      options: Array.isArray(question.options)
        ? question.options.map((option: unknown) => String(option))
        : [],
      correct: typeof question.correct === 'number' ? question.correct : -1,
      hint: text(question.hint),
      evidence,
    };
  });
}

function convertOrdering(
  value: unknown,
  errors: string[],
): ImportOrdering | null {
  if (value == null) return null;
  if (!isRecord(value) || !Array.isArray(value.cards)) {
    errors.push('order.cards가 배열이 아닙니다.');
    return null;
  }
  return {
    text: text(value.text) ?? text(value.q) ?? undefined,
    cards: value.cards.map((card: unknown) => {
      const item = isRecord(card) ? card : {};
      return { id: text(item.id) ?? '', text: text(item.text) ?? '' };
    }),
  };
}

function convertGlossary(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
