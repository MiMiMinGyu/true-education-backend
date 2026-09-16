import { generateStudentCode } from './student-code.util';

describe('generateStudentCode', () => {
  it('6자리 문자열을 생성한다', () => {
    expect(generateStudentCode()).toHaveLength(6);
  });

  it('대문자·소문자·숫자·특수문자를 각각 최소 1개 이상 포함한다', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateStudentCode();
      expect(code).toMatch(/[A-Z]/);
      expect(code).toMatch(/[a-z]/);
      expect(code).toMatch(/[0-9]/);
      expect(code).toMatch(/[!@#$%*]/);
    }
  });

  it('혼동되기 쉬운 문자(I, O, l, o, 0, 1)를 포함하지 않는다', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateStudentCode()).not.toMatch(/[IOl0o1]/);
    }
  });

  it('호출할 때마다 다른 값을 생성한다', () => {
    const codes = new Set(
      Array.from({ length: 30 }, () => generateStudentCode()),
    );
    expect(codes.size).toBeGreaterThan(1);
  });
});
