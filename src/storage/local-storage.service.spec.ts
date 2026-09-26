import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let root: string;
  let storage: LocalStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'storage-spec-'));
    storage = new LocalStorageService(root, 'http://localhost:4000');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('키 경로에 폴더를 만들어 저장하고 /files URL을 만든다', async () => {
    await storage.put('drawings/1/a.png', Buffer.from('png'), 'image/png');
    expect(await readFile(join(root, 'drawings/1/a.png'), 'utf8')).toBe('png');
    expect(storage.urlFor('drawings/1/a.png')).toBe(
      'http://localhost:4000/files/drawings/1/a.png',
    );
  });

  it('저장 폴더 밖을 가리키는 키는 거부한다', async () => {
    await expect(
      storage.put('../escape.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow('저장소 밖');
  });
});
