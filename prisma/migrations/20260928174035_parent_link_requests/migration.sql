-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
-- 이미 있던 연결은 수락 절차 이전에 만들어졌으므로 ACCEPTED로 옮기고, 이후 새 행의 기본값은 PENDING입니다.
ALTER TABLE "parent_students" ADD COLUMN     "responded_at" TIMESTAMPTZ(6),
ADD COLUMN     "status" "LinkStatus" NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE "parent_students" ALTER COLUMN "status" SET DEFAULT 'PENDING';
