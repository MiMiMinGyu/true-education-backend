import { randomInt } from 'node:crypto';

// nanoid 등 외부 라이브러리 대신 직접 구현한 이유:
// 1) 기능명세 1번 요구사항("영문 대소문자·숫자·특수문자를 조합")을 만족하려면
//    코드마다 각 문자 종류가 최소 1개씩 반드시 포함되어야 하는데, 이는 라이브러리
//    호출만으로는 보장되지 않는 요구사항(각 종류별 최소 개수 보장은 nanoid 자체
//    기능이 아님)이라 결국 커스텀 로직이 필요함
// 2) 학생 코드는 학생이 보고 부모에게 전달 → 부모가 손으로 입력하는 흐름이므로,
//    헷갈리는 문자(I/O/l/o/0/1)를 alphabet에서 미리 제외할 필요가 있음
// 위 두 요구사항을 만족하려면 라이브러리를 쓰더라도 비슷한 양의 커스텀 로직이
// 필요하므로, 의존성을 추가하지 않고 Node 내장 crypto(randomInt, CSPRNG)로 구현함.
// 혼동되기 쉬운 문자(I, O, l, o, 0, 1)는 제외
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%*';
const STUDENT_CODE_LENGTH = 6;

function pickChar(pool: string): string {
  return pool[randomInt(pool.length)];
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 영문 대소문자·숫자·특수문자를 조합한 랜덤 학생 코드 발급 (backend-logic-v2.md 1번)
// TODO: 유효기간·재발급 정책은 협의 중이므로 만료/재발급 로직은 포함하지 않음 (CLAUDE.md D 항목)
export function generateStudentCode(): string {
  const pool = UPPER + LOWER + DIGITS + SPECIAL;
  const required = [
    pickChar(UPPER),
    pickChar(LOWER),
    pickChar(DIGITS),
    pickChar(SPECIAL),
  ];
  const rest = Array.from(
    { length: STUDENT_CODE_LENGTH - required.length },
    () => pickChar(pool),
  );
  return shuffle([...required, ...rest]).join('');
}
