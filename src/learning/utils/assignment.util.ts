import { NotFoundException } from '@nestjs/common';
import {
  AssignmentDetail,
  ILearningRepository,
  QuestionData,
} from '../interfaces/learning-repository.interface';
import { BookFeatures } from './stage-flow.util';

export function featuresOf(assignment: AssignmentDetail): BookFeatures {
  return {
    hasChoice: assignment.questions.some(
      (question) => question.format === 'CHOICE',
    ),
    hasOrdering: assignment.questions.some(
      (question) => question.format === 'ORDERING',
    ),
  };
}

export function choiceQuestions(assignment: AssignmentDetail): QuestionData[] {
  return assignment.questions.filter(
    (question) => question.format === 'CHOICE',
  );
}

export function orderingQuestion(
  assignment: AssignmentDetail,
): QuestionData | undefined {
  return assignment.questions.find(
    (question) => question.format === 'ORDERING',
  );
}

export async function loadAssignment(
  repository: ILearningRepository,
  assignmentId: number,
): Promise<AssignmentDetail> {
  const assignment = await repository.getAssignment(assignmentId);
  if (!assignment) throw new NotFoundException('배정을 찾을 수 없습니다.');
  return assignment;
}
