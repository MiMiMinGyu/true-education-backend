import { BadRequestException } from '@nestjs/common';
import { resolvePeriod } from './dashboard.service';

describe('resolvePeriod', () => {
  it('생략하면 오늘 포함 최근 14일', () => {
    expect(resolvePeriod({}, '2026-09-26')).toEqual({
      startDate: '2026-09-13',
      endDate: '2026-09-26',
    });
    expect(resolvePeriod({ endDate: '2026-03-01' }, '2026-09-26')).toEqual({
      startDate: '2026-02-16',
      endDate: '2026-03-01',
    });
  });

  it('없는 날짜, 시작일 > 종료일, 92일 초과는 400', () => {
    for (const query of [
      { startDate: '2026-02-30', endDate: '2026-03-01' },
      { startDate: '2026-09-27', endDate: '2026-09-26' },
      { startDate: '2026-01-01', endDate: '2026-09-26' },
    ]) {
      expect(() => resolvePeriod(query, '2026-09-26')).toThrow(
        BadRequestException,
      );
    }
    expect(
      resolvePeriod({ startDate: '2026-09-26', endDate: '2026-09-26' }),
    ).toEqual({ startDate: '2026-09-26', endDate: '2026-09-26' });
  });
});
