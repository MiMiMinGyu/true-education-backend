export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

/**
 * 파일 저장소. DB에는 객체 키(예: drawings/12/uuid.png)만 저장하고 URL은 응답할 때 만듭니다.
 * 로컬 개발·시연은 디스크, 운영은 S3로 바꿉니다(STORAGE_DRIVER).
 */
export interface StorageService {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  urlFor(key: string): string;
}
