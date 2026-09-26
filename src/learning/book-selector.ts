import { Inject, Injectable } from '@nestjs/common';
import {
  BOOK_SELECTION,
  BookSelectionStrategy,
} from '../common/constants/learning.constants';
import {
  LEARNING_REPOSITORY,
  type ILearningRepository,
} from './interfaces/learning-repository.interface';

/** 새로 배정할 책을 고릅니다. 선택 규칙은 이곳 한 곳에서만 바꿉니다 */
@Injectable()
export class BookSelector {
  constructor(
    @Inject(LEARNING_REPOSITORY)
    private readonly repository: ILearningRepository,
  ) {}

  async pick(
    studentId: number,
    strategy: BookSelectionStrategy = BOOK_SELECTION,
    random: () => number = Math.random,
  ): Promise<number | null> {
    const candidates = await this.repository.findUnassignedBookIds(studentId);
    if (candidates.length === 0) return null;
    return strategy === 'SEQUENTIAL'
      ? candidates[0]
      : candidates[Math.floor(random() * candidates.length)];
  }
}
