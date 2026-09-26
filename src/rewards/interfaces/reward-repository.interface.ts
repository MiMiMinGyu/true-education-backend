export const REWARD_REPOSITORY = Symbol('REWARD_REPOSITORY');

export interface RewardRecord {
  /** 목표치 = 누적 스탬프 수(parent_rewards.required_stamps) */
  milestone: number;
  name: string;
}

export interface IRewardRepository {
  sumStamps(studentId: number): Promise<number>;
  /** 목표치 오름차순 */
  listRewards(studentId: number): Promise<RewardRecord[]>;
  /** 학생·목표치당 1개. 있으면 글과 작성 보호자를 바꿉니다 */
  upsertReward(
    parentId: number,
    studentId: number,
    milestone: number,
    name: string,
  ): Promise<void>;
  /** 없으면 아무것도 하지 않습니다 */
  deleteReward(studentId: number, milestone: number): Promise<void>;
}
