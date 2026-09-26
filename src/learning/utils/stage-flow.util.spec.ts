import {
  bookStages,
  hasReached,
  nextStage,
  stepStatuses,
} from './stage-flow.util';

const full = { hasChoice: true, hasOrdering: true };

describe('stage-flow.util', () => {
  it('문제가 있는 책은 전체 단계를 순서대로 거친다', () => {
    expect(bookStages(full)).toEqual([
      'READING',
      'QUESTION',
      'ORDERING',
      'TITLE',
      'DRAWING',
      'REFLECTION',
    ]);
    expect(nextStage('READING', full)).toBe('QUESTION');
    expect(nextStage('QUESTION', full)).toBe('ORDERING');
    expect(nextStage('REFLECTION', full)).toBe('COMPLETED');
  });

  it('순서 맞추기 문제가 없으면 이해 질문 다음은 제목 짓기', () => {
    expect(nextStage('QUESTION', { hasChoice: true, hasOrdering: false })).toBe(
      'TITLE',
    );
  });

  it('이해 질문이 없으면 읽기 다음은 순서 맞추기', () => {
    expect(nextStage('READING', { hasChoice: false, hasOrdering: true })).toBe(
      'ORDERING',
    );
  });

  it('도달 여부는 전체 단계 순서로 비교하고 COMPLETED는 모든 단계를 지난 것으로 본다', () => {
    expect(hasReached('QUESTION', 'QUESTION')).toBe(true);
    expect(hasReached('READING', 'QUESTION')).toBe(false);
    expect(hasReached('COMPLETED', 'ORDERING')).toBe(true);
  });

  it('단계 목록 상태: 이전 DONE, 현재 CURRENT, 이후 LOCKED, 없는 단계는 빠짐', () => {
    expect(
      stepStatuses('QUESTION', { hasChoice: true, hasOrdering: false }),
    ).toEqual([
      { key: 'READING', status: 'DONE' },
      { key: 'QUESTION', status: 'CURRENT' },
      { key: 'TITLE', status: 'LOCKED' },
      { key: 'DRAWING', status: 'LOCKED' },
      { key: 'REFLECTION', status: 'LOCKED' },
    ]);
  });
});
