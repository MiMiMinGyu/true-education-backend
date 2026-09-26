import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { StorageService } from './storage.interface';

/** 파일을 서버 디스크에 저장하고 /files 경로로 제공합니다(app.setup.ts) */
export class LocalStorageService implements StorageService {
  private readonly root: string;

  constructor(
    root: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = resolve(root);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  urlFor(key: string): string {
    return `${this.publicBaseUrl}${LOCAL_FILES_PATH}/${key}`;
  }

  private pathFor(key: string): string {
    // 키는 서버가 만들지만, 저장 폴더 밖을 가리키는 키는 막아 둡니다.
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`저장소 밖을 가리키는 키입니다: ${key}`);
    }
    return path;
  }
}

export const LOCAL_FILES_PATH = '/files';
