import { BookSelector } from './book-selector';
import { ILearningRepository } from './interfaces/learning-repository.interface';

function selectorWith(candidates: number[]) {
  const repository = {
    findUnassignedBookIds: jest.fn().mockResolvedValue(candidates),
  } as unknown as ILearningRepository;
  return new BookSelector(repository);
}

describe('BookSelector', () => {
  it('배정하지 않은 책 중에서 무작위로 고른다', async () => {
    await expect(
      selectorWith([3, 5, 9]).pick(1, 'RANDOM', () => 0.5),
    ).resolves.toBe(5);
    await expect(
      selectorWith([3, 5, 9]).pick(1, 'RANDOM', () => 0.99),
    ).resolves.toBe(9);
  });

  it('SEQUENTIAL이면 가장 앞(id가 작은) 책', async () => {
    await expect(selectorWith([3, 5, 9]).pick(1, 'SEQUENTIAL')).resolves.toBe(
      3,
    );
  });

  it('고를 책이 없으면 null', async () => {
    await expect(selectorWith([]).pick(1)).resolves.toBeNull();
  });
});
