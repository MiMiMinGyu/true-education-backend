import {
  AssignmentDetail,
  ILearningRepository,
} from './interfaces/learning-repository.interface';
import { ProgressService } from './progress.service';

function assignment(stage: AssignmentDetail['stage']): AssignmentDetail {
  return {
    id: 7,
    studentId: 3,
    stage,
    step: 0,
    book: {
      id: 1,
      title: '작은 곰',
      author: null,
      content: { paragraphs: [], glossary: {} },
    },
    questions: [],
  };
}

function fakeRepo() {
  return {
    updateProgress: jest.fn(),
    completeAssignment: jest.fn(),
    createStamp: jest.fn(),
    sumStamps: jest.fn().mockResolvedValue(6),
  };
}

describe('ProgressService.advance', () => {
  it('다음 단계가 있으면 진행 상태만 바꾼다(문제 없는 단계는 건너뜀)', async () => {
    const service = new ProgressService();
    const repo = fakeRepo();
    // 문제가 하나도 없는 책: READING 다음은 TITLE
    const result = await service.advance(
      repo as unknown as ILearningRepository,
      assignment('READING'),
      'READING',
    );
    expect(result).toEqual({ stage: 'TITLE' });
    expect(repo.updateProgress).toHaveBeenCalledWith(7, 'TITLE', 0);
    expect(repo.completeAssignment).not.toHaveBeenCalled();
  });

  it('마지막 단계를 마치면 완료하고 스탬프를 적립한다', async () => {
    const service = new ProgressService();
    service.random = () => 0; // 2개 당첨
    const repo = fakeRepo();
    const result = await service.advance(
      repo as unknown as ILearningRepository,
      assignment('REFLECTION'),
      'REFLECTION',
    );
    expect(result).toEqual({
      stage: 'COMPLETED',
      completion: { stampsEarned: 2, stampTotal: 6 },
    });
    expect(repo.completeAssignment).toHaveBeenCalledWith(7);
    expect(repo.createStamp).toHaveBeenCalledWith(3, 7, 2);
    expect(repo.updateProgress).not.toHaveBeenCalled();
  });
});
