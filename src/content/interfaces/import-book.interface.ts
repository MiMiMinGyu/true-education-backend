// 적재 입력의 공통 형식. 개발용 시드 JSON은 이 형식으로 직접 쓰고,
// AI 파트 JSON은 받는 대로 이 형식으로 바꾸는 변환기를 따로 둡니다(backend-logic-v5 12번).

import type { BookPaging } from './book-content.interface';

export type ChoiceStage = 'WHO' | 'WHAT' | 'WHY' | 'EMOTION';

export interface ImportEvidence {
  paragraph_id: string;
  quote?: string;
}

export interface ImportChoiceQuestion {
  /** 원본 문제 id (q1~q4) */
  externalKey: string;
  stage: ChoiceStage;
  text: string;
  options: string[];
  /** 0부터 시작하는 보기 번호 */
  correct: number;
  hint?: string | null;
  evidence?: ImportEvidence[] | null;
}

export interface ImportOrderingCard {
  id: string;
  text: string;
}

export interface ImportOrdering {
  text?: string;
  /** 정답 순서대로 */
  cards: ImportOrderingCard[];
}

export interface ImportBook {
  externalId: string;
  title: string;
  author?: string | null;
  sourceUrl?: string | null;
  license?: string | null;
  bibliography?: string | null;
  /** 한 항목 = 한 줄. 여러 문장이 들어 있어도 나누지 않습니다 */
  paragraphs: { id: string; sentences: string[] }[];
  /** 쪽 나누기(기본 LINES). AI 파트 JSON은 쪽을 나눠 주므로 PARAGRAPH(문단 = 쪽) */
  paging?: BookPaging;
  glossary?: Record<string, string>;
  questions: ImportChoiceQuestion[];
  ordering?: ImportOrdering | null;
}
