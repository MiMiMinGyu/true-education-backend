import { LINES_PER_PAGE } from '../../common/constants/learning.constants';
import {
  BookContent,
  BookLine,
} from '../../content/interfaces/book-content.interface';

export type Speaker = 'YEOUL' | 'STUDENT';

export interface ReadingLine extends BookLine {
  speaker: Speaker;
}

export interface ReadingPage {
  page: number;
  lines: ReadingLine[];
}

/** 책 전체 줄 순서 기준 첫 줄(홀수 번째)은 여울이, 다음 줄(짝수 번째)은 학생. 페이지가 바뀌어도 이어집니다 */
export function speakerAt(lineIndex: number): Speaker {
  return lineIndex % 2 === 0 ? 'YEOUL' : 'STUDENT';
}

/** 본문을 LINES_PER_PAGE줄씩 페이지로 나눕니다(1부터 시작) */
export function toPages(content: BookContent): ReadingPage[] {
  const lines = content.paragraphs.flatMap((paragraph) => paragraph.lines);
  const pages: ReadingPage[] = [];
  lines.forEach((line, index) => {
    const pageIndex = Math.floor(index / LINES_PER_PAGE);
    pages[pageIndex] ??= { page: pageIndex + 1, lines: [] };
    pages[pageIndex].lines.push({ ...line, speaker: speakerAt(index) });
  });
  return pages;
}

/** 문단 전체 줄을 이어 붙인 글(힌트용). 문단이 없으면 null */
export function paragraphText(
  content: BookContent,
  paragraphId: string,
): string | null {
  const paragraph = content.paragraphs.find((item) => item.id === paragraphId);
  return paragraph ? paragraph.lines.map((line) => line.text).join(' ') : null;
}
