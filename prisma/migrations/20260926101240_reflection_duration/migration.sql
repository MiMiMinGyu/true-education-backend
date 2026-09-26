-- 설명 말하기를 브라우저 음성 인식으로 바꿔(2026-09-26) 음성은 서버에 오지 않습니다.
-- audio_url은 쓰일 경로가 없어 지우고, 말한 시간(보호자 대시보드용)을 저장합니다.
-- 이 API 이전에는 행을 만드는 경로가 없어 테이블이 비어 있으므로 기본값 없이 NOT NULL로 추가합니다.

-- AlterTable
ALTER TABLE "drawing_reflections" DROP COLUMN "audio_url",
ADD COLUMN     "duration_ms" INTEGER NOT NULL;

-- Prisma가 표현하지 못하는 CHECK 제약(수동 추가)
ALTER TABLE "drawing_reflections" ADD CONSTRAINT "chk_reflection_duration" CHECK ("duration_ms" >= 0);
