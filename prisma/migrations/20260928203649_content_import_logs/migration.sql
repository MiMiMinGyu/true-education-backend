-- CreateEnum
CREATE TYPE "ContentImportSource" AS ENUM ('API', 'CLI');

-- CreateTable
CREATE TABLE "content_import_logs" (
    "id" SERIAL NOT NULL,
    "source" "ContentImportSource" NOT NULL,
    "external_id" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_import_logs_external_id_idx" ON "content_import_logs"("external_id");

-- CreateIndex
CREATE INDEX "content_import_logs_received_at_idx" ON "content_import_logs"("received_at");
