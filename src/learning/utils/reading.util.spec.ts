import { BookContent } from '../../content/interfaces/book-content.interface';
import { paragraphText, speakerAt, toPages } from './reading.util';

const line = (id: string) => ({ id, text: `${id} 문장`, syllableCount: 2 });
const content: BookContent = {
  paragraphs: [
    { id: 'p001', lines: [line('p001-1'), line('p001-2')] },
    { id: 'p002', lines: [line('p002-1'), line('p002-2'), line('p002-3')] },
  ],
  glossary: {},
};

describe('reading.util', () => {
  it('여울이가 먼저, 한 줄씩 번갈아 읽는다', () => {
    expect([0, 1, 2, 3].map(speakerAt)).toEqual([
      'YEOUL',
      'STUDENT',
      'YEOUL',
      'STUDENT',
    ]);
  });

  it('문단과 관계없이 3줄씩 페이지를 나누고 차례는 페이지를 넘어 이어진다', () => {
    const pages = toPages(content);
    expect(pages.map((page) => page.lines.map((item) => item.id))).toEqual([
      ['p001-1', 'p001-2', 'p002-1'],
      ['p002-2', 'p002-3'],
    ]);
    expect(pages[1].lines.map((item) => item.speaker)).toEqual([
      'STUDENT',
      'YEOUL',
    ]);
    expect(pages.map((page) => page.page)).toEqual([1, 2]);
  });

  it('문단 전체 줄을 이어 붙이고, 없는 문단이면 null', () => {
    expect(paragraphText(content, 'p001')).toBe('p001-1 문장 p001-2 문장');
    expect(paragraphText(content, 'p999')).toBeNull();
  });
});
