import { DOUBLE_STAMP_CHANCE } from '../../common/constants/learning.constants';
import { rollStampAmount } from './stamp.util';

describe('rollStampAmount', () => {
  it('난수가 확률보다 작으면 2개, 아니면 1개', () => {
    expect(rollStampAmount(() => 0)).toBe(2);
    expect(rollStampAmount(() => DOUBLE_STAMP_CHANCE - 0.001)).toBe(2);
    expect(rollStampAmount(() => DOUBLE_STAMP_CHANCE)).toBe(1);
    expect(rollStampAmount(() => 0.999)).toBe(1);
  });
});
