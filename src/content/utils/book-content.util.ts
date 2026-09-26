import { BookContent } from '../interfaces/book-content.interface';
import { ImportBook } from '../interfaces/import-book.interface';

const HANGUL_SYLLABLE = /[가-힣]/g;

/** 한글 음절(가–힣) 수. 숫자·영문·문장부호는 세지 않습니다 */
export function countSyllables(text: string): number {
  return text.match(HANGUL_SYLLABLE)?.length ?? 0;
}

export function lineId(paragraphId: string, index: number): string {
  return `${paragraphId}-${index + 1}`;
}

/** 입력 본문을 books.content 형식으로 바꿉니다(줄 id·음절 수 부여). */
export function buildBookContent(book: ImportBook): BookContent {
  return {
    paragraphs: book.paragraphs.map((paragraph) => ({
      id: paragraph.id,
      lines: paragraph.sentences.map((sentence, index) => {
        const text = sentence.trim();
        return {
          id: lineId(paragraph.id, index),
          text,
          syllableCount: countSyllables(text),
        };
      }),
    })),
    glossary: book.glossary ?? {},
  };
}
