import { BookContent } from '../../content/interfaces/book-content.interface';
import { paragraphText } from './reading.util';

interface HintSource {
  hint: string | null;
  evidence: unknown;
}

/**
 * 1차 오답 때 보여 줄 힌트. AI가 준 hint가 있으면 그것을, 없으면 첫 근거 문단 전체를 씁니다.
 * TODO: 힌트 표시 형태 확정 전까지 두 경우 모두 처리(CLAUDE.md D 항목)
 */
export function resolveHint(
  question: HintSource,
  content: BookContent,
): string | null {
  if (question.hint?.trim()) return question.hint.trim();
  const first = Array.isArray(question.evidence)
    ? (question.evidence[0] as { paragraph_id?: unknown } | undefined)
    : undefined;
  return typeof first?.paragraph_id === 'string'
    ? paragraphText(content, first.paragraph_id)
    : null;
}

/**
 * 카드를 섞습니다(Fisher–Yates). 결과가 정답 순서와 같으면 다시 섞어 처음부터 정답이 보이지 않게 합니다.
 * random은 테스트에서 고정하기 위해 주입할 수 있습니다.
 */
export function shuffleUntilDifferent<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  if (items.length < 2) return [...items];
  for (;;) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    if (result.some((item, index) => item !== items[index])) return result;
  }
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  return (
    a.length === b.length &&
    setA.size === a.length &&
    new Set(b).size === b.length &&
    b.every((item) => setA.has(item))
  );
}
