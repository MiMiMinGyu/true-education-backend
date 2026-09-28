/** books.content 컬럼에 저장하는 본문 형식 */
export interface BookLine {
  /** {paragraph_id}-{n}, n은 1부터 */
  id: string;
  text: string;
  /** 한글 음절(가–힣) 수. 읽기 속도 계산에 씁니다 */
  syllableCount: number;
}

export interface BookParagraph {
  id: string;
  lines: BookLine[];
}

/**
 * 쪽 나누기: LINES = 책 전체 줄을 LINES_PER_PAGE줄씩(기본, 개발용 시드),
 * PARAGRAPH = 문단 하나가 한 쪽(AI 파트가 쪽을 나눠 주는 형식)
 */
export type BookPaging = 'LINES' | 'PARAGRAPH';

export interface BookContent {
  paragraphs: BookParagraph[];
  glossary: Record<string, string>;
  /** 없으면 LINES(이전에 적재한 책) */
  paging?: BookPaging;
}
