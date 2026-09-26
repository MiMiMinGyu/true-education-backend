import { buildImportBook } from '../testing/import-book.fixture';
import { buildBookContent, countSyllables } from './book-content.util';

describe('book-content.util', () => {
  it('한글 음절만 센다(공백·문장부호·숫자·영문 제외)', () => {
    expect(countSyllables('토끼야, 같이 꿀을 먹자!')).toBe(9);
    expect(countSyllables('ABC 123 ?!')).toBe(0);
  });

  it('줄 id를 {문단id}-{1부터} 형식으로 붙이고 앞뒤 공백을 지운다', () => {
    const content = buildBookContent(
      buildImportBook({
        paragraphs: [{ id: 'p007', sentences: ['  첫째 줄  ', '둘째 줄'] }],
        glossary: { 쫑긋: '귀를 세우는 모양' },
      }),
    );

    expect(content).toEqual({
      paragraphs: [
        {
          id: 'p007',
          lines: [
            { id: 'p007-1', text: '첫째 줄', syllableCount: 3 },
            { id: 'p007-2', text: '둘째 줄', syllableCount: 3 },
          ],
        },
      ],
      glossary: { 쫑긋: '귀를 세우는 모양' },
    });
  });

  it('glossary가 없으면 빈 객체로 둔다', () => {
    expect(
      buildBookContent(buildImportBook({ glossary: undefined })).glossary,
    ).toEqual({});
  });
});
