import { currentYearKst, todayKst } from './kst-date.util';

describe('kst-date.util', () => {
  it('UTC로는 전날이어도 한국 시간 기준 날짜를 반환한다', () => {
    // 2026-09-25 16:00 UTC = 2026-09-26 01:00 KST
    expect(todayKst(new Date('2026-09-25T16:00:00Z'))).toBe('2026-09-26');
  });

  it('UTC 12월 31일 밤이면 한국 기준 다음 해를 반환한다', () => {
    // 2026-12-31 15:30 UTC = 2027-01-01 00:30 KST
    expect(currentYearKst(new Date('2026-12-31T15:30:00Z'))).toBe(2027);
  });
});
