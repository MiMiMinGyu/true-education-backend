-- AlterTable
ALTER TABLE "books" ADD COLUMN     "source_meta" JSONB,
ADD COLUMN     "title_hints" JSONB;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "explanation" TEXT;
