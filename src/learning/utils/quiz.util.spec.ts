import { BookContent } from '../../content/interfaces/book-content.interface';
import {
  resolveHint,
  sameOrder,
  sameSet,
  shuffleUntilDifferent,
} from './quiz.util';

const content: BookContent = {
  paragraphs: [
    {
      id: 'p002',
      lines: [
        { id: 'p002-1', text: '꿀단지 안에는', syllableCount: 6 },
        { id: 'p002-2', text: '꿀이 가득했어요.', syllableCount: 6 },
      ],
    },
  ],
  glossary: {},
};

describe('quiz.util', () => {
  it('hint가 있으면 hint, 없으면 첫 근거 문단 전체', () => {
    expect(
      resolveHint({ hint: ' 곰을 떠올려 보세요 ', evidence: null }, content),
    ).toBe('곰을 떠올려 보세요');
    expect(
      resolveHint(
        { hint: null, evidence: [{ paragraph_id: 'p002' }] },
        content,
      ),
    ).toBe('꿀단지 안에는 꿀이 가득했어요.');
    expect(resolveHint({ hint: '', evidence: null }, content)).toBeNull();
  });

  it('섞은 결과가 정답 순서와 같으면 다시 섞는다', () => {
    // 첫 섞기는 제자리(정답과 같음)가 나오도록, 두 번째는 바뀌도록 난수를 고정
    const values = [0.99, 0.99, 0.99, 0, 0, 0];
    const random = () => values.shift() ?? 0;
    const result = shuffleUntilDifferent(['e1', 'e2', 'e3', 'e4'], random);
    expect(result).not.toEqual(['e1', 'e2', 'e3', 'e4']);
    expect([...result].sort()).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(values).toHaveLength(0);
  });

  it('카드 집합 비교는 순서는 무시하되 빠짐·중복·다른 카드는 거부', () => {
    const answer = ['e1', 'e2', 'e3'];
    expect(sameSet(['e3', 'e1', 'e2'], answer)).toBe(true);
    expect(sameSet(['e1', 'e1', 'e2'], answer)).toBe(false);
    expect(sameSet(['e1', 'e2'], answer)).toBe(false);
    expect(sameSet(['e1', 'e2', 'x9'], answer)).toBe(false);
    expect(sameOrder(['e1', 'e2', 'e3'], answer)).toBe(true);
    expect(sameOrder(['e2', 'e1', 'e3'], answer)).toBe(false);
  });
});
