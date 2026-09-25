// "오늘"·연도 판단은 서버 TZ와 무관하게 항상 Asia/Seoul 기준으로 계산합니다.
const KST_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Asia/Seoul 기준 날짜 (YYYY-MM-DD) */
export function todayKst(now: Date = new Date()): string {
  return KST_DATE_FORMAT.format(now);
}

/** Asia/Seoul 기준 연도 */
export function currentYearKst(now: Date = new Date()): number {
  return Number(todayKst(now).slice(0, 4));
}
