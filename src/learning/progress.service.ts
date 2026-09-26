import { Injectable } from '@nestjs/common';
import {
  ActivityStage,
  LearningStage,
} from '../common/constants/learning.constants';
import {
  AssignmentDetail,
  ILearningRepository,
} from './interfaces/learning-repository.interface';
import { featuresOf } from './utils/assignment.util';
import { rollStampAmount } from './utils/stamp.util';
import { nextStage } from './utils/stage-flow.util';

export interface Completion {
  stampsEarned: number;
  stampTotal: number;
}

export interface AdvanceResult {
  stage: LearningStage;
  /** 마지막 단계를 마쳐 책을 완료했을 때만 */
  completion?: Completion;
}

/**
 * 단계 전환을 한 곳에서 처리합니다. 마지막 활동 다음이면 완료(배정 COMPLETED + 스탬프 적립)까지 합니다.
 * 호출하는 쪽의 트랜잭션 저장소(repo)를 받아 같은 트랜잭션 안에서 실행됩니다.
 */
@Injectable()
export class ProgressService {
  /** 스탬프 2개 판정용 난수(테스트에서 바꿀 수 있게 둠) */
  random: () => number = Math.random;

  async advance(
    repo: ILearningRepository,
    assignment: AssignmentDetail,
    current: ActivityStage,
  ): Promise<AdvanceResult> {
    const stage = nextStage(current, featuresOf(assignment));
    if (stage !== 'COMPLETED') {
      await repo.updateProgress(assignment.id, stage, 0);
      return { stage };
    }
    const stampsEarned = rollStampAmount(this.random);
    await repo.completeAssignment(assignment.id);
    await repo.createStamp(assignment.studentId, assignment.id, stampsEarned);
    return {
      stage,
      completion: {
        stampsEarned,
        stampTotal: await repo.sumStamps(assignment.studentId),
      },
    };
  }
}
