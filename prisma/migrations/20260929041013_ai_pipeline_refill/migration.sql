-- CreateEnum
CREATE TYPE "RefillStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "ContentImportSource" ADD VALUE 'PIPELINE';

-- CreateTable
CREATE TABLE "content_refill_requests" (
    "id" VARCHAR(64) NOT NULL,
    "job_id" VARCHAR(64) NOT NULL,
    "request_body" JSONB NOT NULL,
    "status" "RefillStatus" NOT NULL DEFAULT 'PENDING',
    "ai_status" VARCHAR(30),
    "delivery_status" VARCHAR(30),
    "error" TEXT,
    "book_external_id" VARCHAR(100),
    "submit_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_refill_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_book_deliveries" (
    "id" SERIAL NOT NULL,
    "delivery_key" VARCHAR(250) NOT NULL,
    "job_id" VARCHAR(64) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "body_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_book_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_refill_requests_job_id_key" ON "content_refill_requests"("job_id");

-- CreateIndex
CREATE INDEX "content_refill_requests_status_finished_at_idx" ON "content_refill_requests"("status", "finished_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_book_deliveries_delivery_key_key" ON "ai_book_deliveries"("delivery_key");

-- CreateIndex
CREATE INDEX "ai_book_deliveries_job_id_idx" ON "ai_book_deliveries"("job_id");

-- 수동 추가(Prisma 미지원): 진행 중(PENDING·ACTIVE) 보충 요청은 전체에서 1개만 → 동시 요청·다중 서버에서도 중복 생성 방지
CREATE UNIQUE INDEX "uq_one_active_refill" ON "content_refill_requests" ((true)) WHERE "status" IN ('PENDING', 'ACTIVE');
