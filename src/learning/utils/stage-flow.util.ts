import {
  ActivityStage,
  LEARNING_STAGES,
  LearningStage,
  STAGE_ORDER,
} from '../../common/constants/learning.constants';

export interface BookFeatures {
  hasChoice: boolean;
  hasOrdering: boolean;
}

/** 이 책에서 거치는 활동 단계(문제가 없는 단계는 뺌) */
export function bookStages(features: BookFeatures): ActivityStage[] {
  return LEARNING_STAGES.filter(
    (stage) =>
      (stage !== 'QUESTION' || features.hasChoice) &&
      (stage !== 'ORDERING' || features.hasOrdering),
  );
}

/** 현재 단계를 마쳤을 때의 다음 단계. 마지막 활동 다음은 COMPLETED */
export function nextStage(
  current: ActivityStage,
  features: BookFeatures,
): LearningStage {
  const stages = bookStages(features);
  const index = stages.indexOf(current);
  return index === -1 || index === stages.length - 1
    ? 'COMPLETED'
    : stages[index + 1];
}

/** 첫 활동 단계(보통 READING) */
export function firstStage(features: BookFeatures): ActivityStage {
  return bookStages(features)[0];
}

/** current가 target 단계에 도달했는지(같거나 지났는지) */
export function hasReached(
  current: LearningStage,
  target: LearningStage,
): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(target);
}

export type StepStatus = 'DONE' | 'CURRENT' | 'LOCKED';

export function stepStatuses(
  current: LearningStage,
  features: BookFeatures,
): { key: ActivityStage; status: StepStatus }[] {
  return bookStages(features).map((key) => ({
    key,
    status:
      key === current
        ? 'CURRENT'
        : hasReached(current, key)
          ? 'DONE'
          : 'LOCKED',
  }));
}
