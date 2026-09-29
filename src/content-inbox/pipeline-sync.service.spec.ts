import type { AiPipelineClient } from './ai-pipeline.client';
import type { AiStoryImportService } from './ai-story-import.service';
import type { IInboxRepository } from './interfaces/inbox-repository.interface';
import { PipelineSyncService } from './pipeline-sync.service';

describe('PipelineSyncService', () => {
  const client = {
    enabled: true,
    listBooks: jest.fn(),
    getBook: jest.fn(),
  };
  const importer = { importJson: jest.fn() };
  const repository = { existingExternalIds: jest.fn() };
  let service: PipelineSyncService;

  beforeEach(() => {
    jest.resetAllMocks();
    client.enabled = true;
    service = new PipelineSyncService(
      client as AiPipelineClient,
      importer as unknown as AiStoryImportService,
      repository as unknown as IInboxRepository,
    );
    importer.importJson.mockImplementation((raw: { id: string }) =>
      Promise.resolve({
        externalId: raw.id,
        status: 'CREATED',
        summary: null,
        errors: [],
        warnings: [],
      }),
    );
  });

  it('DB에 없는 책만 받아 적재한다', async () => {
    client.listBooks.mockResolvedValue([
      { id: 'folkency-5747', title: '금도끼은도끼' },
      { id: 'folkency-5720', title: '감기의 유래' },
    ]);
    repository.existingExternalIds.mockResolvedValue(['folkency-5747']);
    client.getBook.mockImplementation((id: string) => Promise.resolve({ id }));

    const result = await service.sync();

    expect(client.getBook).toHaveBeenCalledTimes(1);
    expect(client.getBook).toHaveBeenCalledWith('folkency-5720');
    expect(importer.importJson).toHaveBeenCalledWith(
      { id: 'folkency-5720' },
      { source: 'API' },
    );
    expect(result).toMatchObject({ listed: 2, existing: 1, failed: [] });
    expect(result.imported.map((r) => r.externalId)).toEqual(['folkency-5720']);
  });

  it('개별 조회가 실패(404 등)한 책은 건너뛰고 나머지는 계속 적재한다', async () => {
    client.listBooks.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    repository.existingExternalIds.mockResolvedValue([]);
    client.getBook.mockImplementation((id: string) =>
      id === 'a'
        ? Promise.reject(new Error('파이프라인 /v1/books/a 응답 404'))
        : Promise.resolve({ id }),
    );

    const result = await service.sync();

    expect(result.failed).toEqual([
      { id: 'a', error: '파이프라인 /v1/books/a 응답 404' },
    ]);
    expect(result.imported.map((r) => r.externalId)).toEqual(['b']);
  });

  it('동시에 불려도 한 번만 실행한다', async () => {
    let release!: (books: { id: string }[]) => void;
    client.listBooks.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    repository.existingExternalIds.mockResolvedValue([]);

    const first = service.sync();
    const second = service.sync();
    release([]);

    expect(await first).toBe(await second);
    expect(client.listBooks).toHaveBeenCalledTimes(1);
  });

  it('설정이 없으면 실행하지 않고 주기 실행도 켜지 않는다', async () => {
    client.enabled = false;
    await expect(service.sync()).rejects.toThrow('AI_PIPELINE_URL');
    service.startSchedule();
    expect(client.listBooks).not.toHaveBeenCalled();
  });
});
