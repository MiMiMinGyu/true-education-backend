import {
  BOOK_TITLE_MAX_LENGTH,
  EXTERNAL_ID_MAX_LENGTH,
  LINE_ID_MAX_LENGTH,
  ORDERING_EXTERNAL_KEY,
  QUESTION_KEY_MAX_LENGTH,
  TTS_MAX_LINE_LENGTH,
} from '../../common/constants/content.constants';
import { ImportBook } from '../interfaces/import-book.interface';
import { lineId } from './book-content.util';

export interface ValidationResult {
  /** 하나라도 있으면 이 책은 적재하지 않습니다 */
  errors: string[];
  /** 적재는 하되 사람이 확인해야 할 점 */
  warnings: string[];
}

const CHOICE_STAGES = new Set(['WHO', 'WHAT', 'WHY', 'EMOTION']);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const normalizeSpace = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * 적재 입력 검증. 파일에서 읽은 JSON이 타입과 다를 수 있으므로 모든 값을 방어적으로 확인합니다.
 * 규칙: backend-logic-v5 12번 "검증".
 */
export function validateImportBook(input: ImportBook): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const book = input as Partial<ImportBook> | null;

  if (!book || typeof book !== 'object') {
    return { errors: ['책 데이터가 객체가 아닙니다.'], warnings };
  }

  if (!isNonEmptyString(book.externalId))
    errors.push('externalId가 비어 있습니다.');
  else if (book.externalId.length > EXTERNAL_ID_MAX_LENGTH)
    errors.push(`externalId는 ${EXTERNAL_ID_MAX_LENGTH}자 이하여야 합니다.`);

  if (!isNonEmptyString(book.title)) errors.push('title이 비어 있습니다.');
  else if (book.title.length > BOOK_TITLE_MAX_LENGTH)
    errors.push(`title은 ${BOOK_TITLE_MAX_LENGTH}자 이하여야 합니다.`);

  if (
    book.paging !== undefined &&
    book.paging !== 'LINES' &&
    book.paging !== 'PARAGRAPH'
  ) {
    errors.push('paging은 LINES 또는 PARAGRAPH여야 합니다.');
  }

  // 문단별 줄 text (evidence quote 확인용)
  const paragraphText = new Map<string, string>();

  if (!Array.isArray(book.paragraphs) || book.paragraphs.length === 0) {
    errors.push('paragraphs가 1개 이상 있어야 합니다.');
  } else {
    book.paragraphs.forEach((paragraph, p) => {
      const where = `paragraphs[${p}]`;
      if (!paragraph || !isNonEmptyString(paragraph.id)) {
        errors.push(`${where}.id가 비어 있습니다.`);
        return;
      }
      if (paragraphText.has(paragraph.id)) {
        errors.push(`${where}.id "${paragraph.id}"가 중복됩니다.`);
        return;
      }
      if (
        !Array.isArray(paragraph.sentences) ||
        paragraph.sentences.length === 0
      ) {
        errors.push(`${where}(${paragraph.id})에 줄이 없습니다.`);
        return;
      }
      const lastId = lineId(paragraph.id, paragraph.sentences.length - 1);
      if (lastId.length > LINE_ID_MAX_LENGTH) {
        errors.push(
          `${where}.id "${paragraph.id}"가 너무 깁니다(줄 id ${LINE_ID_MAX_LENGTH}자 초과).`,
        );
      }
      paragraph.sentences.forEach((sentence, s) => {
        if (!isNonEmptyString(sentence)) {
          errors.push(`${where}.sentences[${s}]가 비어 있습니다.`);
        } else if (sentence.trim().length > TTS_MAX_LINE_LENGTH) {
          warnings.push(
            `${lineId(paragraph.id, s)} 줄이 ${TTS_MAX_LINE_LENGTH}자를 넘어 음성(TTS)을 만들 수 없습니다.`,
          );
        }
      });
      paragraphText.set(
        paragraph.id,
        normalizeSpace(paragraph.sentences.filter(isNonEmptyString).join(' ')),
      );
    });
  }

  if (!Array.isArray(book.questions)) {
    errors.push('questions가 배열이 아닙니다(문제가 없으면 빈 배열).');
  } else {
    if (book.questions.length === 0) warnings.push('이해 질문이 없습니다.');
    const keys = new Set<string>();
    book.questions.forEach((question, q) => {
      const where = `questions[${q}]`;
      if (!question || typeof question !== 'object') {
        errors.push(`${where}가 객체가 아닙니다.`);
        return;
      }
      const label = isNonEmptyString(question.externalKey)
        ? `${where}(${question.externalKey})`
        : where;

      if (!isNonEmptyString(question.externalKey)) {
        errors.push(`${where}.externalKey가 비어 있습니다.`);
      } else if (question.externalKey.length > QUESTION_KEY_MAX_LENGTH) {
        errors.push(
          `${label}.externalKey는 ${QUESTION_KEY_MAX_LENGTH}자 이하여야 합니다.`,
        );
      } else if (question.externalKey === ORDERING_EXTERNAL_KEY) {
        errors.push(
          `${label}.externalKey "${ORDERING_EXTERNAL_KEY}"는 순서 맞추기용 예약어입니다.`,
        );
      } else if (keys.has(question.externalKey)) {
        errors.push(`${label}.externalKey가 중복됩니다.`);
      } else {
        keys.add(question.externalKey);
      }

      if (!CHOICE_STAGES.has(question.stage)) {
        errors.push(
          `${label}.stage는 WHO·WHAT·WHY·EMOTION 중 하나여야 합니다.`,
        );
      }
      if (!isNonEmptyString(question.text))
        errors.push(`${label}.text가 비어 있습니다.`);

      const options = question.options;
      if (
        !Array.isArray(options) ||
        options.length < 2 ||
        !options.every(isNonEmptyString)
      ) {
        errors.push(
          `${label}.options는 빈 칸 없는 보기 2개 이상이어야 합니다.`,
        );
      } else if (
        !Number.isInteger(question.correct) ||
        question.correct < 0 ||
        question.correct >= options.length
      ) {
        errors.push(
          `${label}.correct가 보기 범위(0~${options.length - 1}) 밖입니다.`,
        );
      }

      const evidence = question.evidence;
      const hasHint = isNonEmptyString(question.hint);
      if (evidence != null && !Array.isArray(evidence)) {
        errors.push(`${label}.evidence가 배열이 아닙니다.`);
      } else if (Array.isArray(evidence)) {
        evidence.forEach((item, e) => {
          const text = item && paragraphText.get(item.paragraph_id);
          if (!item || text === undefined) {
            errors.push(
              `${label}.evidence[${e}].paragraph_id가 본문에 없습니다.`,
            );
          } else if (
            isNonEmptyString(item.quote) &&
            !text.includes(normalizeSpace(item.quote))
          ) {
            warnings.push(
              `${label}.evidence[${e}].quote가 ${item.paragraph_id} 문단에 없습니다.`,
            );
          }
        });
      }
      if (!hasHint && (!Array.isArray(evidence) || evidence.length === 0)) {
        warnings.push(
          `${label}에 hint와 evidence가 모두 없어 1차 오답 때 보여 줄 힌트가 없습니다.`,
        );
      }
    });
  }

  const ordering = book.ordering;
  if (ordering == null) {
    warnings.push(
      '순서 맞추기 문제가 없습니다(이 책은 순서 맞추기 단계를 건너뜁니다).',
    );
  } else if (!Array.isArray(ordering.cards) || ordering.cards.length < 2) {
    errors.push('ordering.cards는 2개 이상이어야 합니다.');
  } else {
    const ids = new Set<string>();
    ordering.cards.forEach((card, c) => {
      if (!card || !isNonEmptyString(card.id))
        errors.push(`ordering.cards[${c}].id가 비어 있습니다.`);
      else if (ids.has(card.id))
        errors.push(`ordering.cards[${c}].id "${card.id}"가 중복됩니다.`);
      else ids.add(card.id);
      if (!card || !isNonEmptyString(card.text))
        errors.push(`ordering.cards[${c}].text가 비어 있습니다.`);
    });
  }

  return { errors, warnings };
}
