-- CreateEnum
CREATE TYPE "ConsentSubject" AS ENUM ('STUDENT', 'PARENT');

-- CreateTable
CREATE TABLE "user_consents" (
    "id" SERIAL NOT NULL,
    "subject_type" "ConsentSubject" NOT NULL,
    "parent_id" INTEGER,
    "student_id" INTEGER,
    "consent_key" VARCHAR(50) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "agreed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_consents_parent_id_idx" ON "user_consents"("parent_id");

-- CreateIndex
CREATE INDEX "user_consents_student_id_idx" ON "user_consents"("student_id");

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma가 표현하지 못하는 CHECK 제약(수동 추가): 학생 본인 동의는 학생만, 보호자 동의는 보호자가 있어야 함
ALTER TABLE "user_consents" ADD CONSTRAINT "chk_consent_subject" CHECK (
  ("subject_type" = 'STUDENT' AND "parent_id" IS NULL AND "student_id" IS NOT NULL)
  OR ("subject_type" = 'PARENT' AND "parent_id" IS NOT NULL)
);
