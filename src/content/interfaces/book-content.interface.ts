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

export interface BookContent {
  paragraphs: BookParagraph[];
  glossary: Record<string, string>;
}
