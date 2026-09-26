import { BookContent } from '../../content/interfaces/book-content.interface';

export const TTS_REPOSITORY = Symbol('TTS_REPOSITORY');

export interface CachedAudio {
  contentHash: string;
  /** 저장소 객체 키(tts_audio.audio_url) */
  key: string;
}

export interface ITtsRepository {
  findBookContent(bookId: number): Promise<BookContent | null>;
  /** externalId가 없으면 모든 책(id 오름차순) */
  listBooks(externalId?: string): Promise<{ id: number; externalId: string }[]>;
  findAudio(bookId: number, lineId: string): Promise<CachedAudio | null>;
  upsertAudio(
    bookId: number,
    lineId: string,
    contentHash: string,
    key: string,
  ): Promise<void>;
}
