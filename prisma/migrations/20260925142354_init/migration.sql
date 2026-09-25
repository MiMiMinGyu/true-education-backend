-- CreateEnum
CREATE TYPE "QuestionFormat" AS ENUM ('CHOICE', 'ORDERING');

-- CreateEnum
CREATE TYPE "QuestionStage" AS ENUM ('WHO', 'WHAT', 'WHY', 'EMOTION', 'ORDER');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LearningStage" AS ENUM ('READING', 'QUESTION', 'ORDERING', 'TITLE', 'DRAWING', 'REFLECTION', 'COMPLETED');

-- CreateTable
CREATE TABLE "students" (
    "id" SERIAL NOT NULL,
    "login_id" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "birth_year" SMALLINT,
    "student_code" CHAR(6) NOT NULL,
    "guardian_share_agreed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" SERIAL NOT NULL,
    "login_id" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "terms_agreed" BOOLEAN NOT NULL DEFAULT false,
    "marketing_agreed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_students" (
    "parent_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "guardian_consent_agreed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_students_pkey" PRIMARY KEY ("parent_id","student_id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" SERIAL NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "author" VARCHAR(100),
    "source_url" TEXT,
    "license" VARCHAR(200),
    "bibliography" TEXT,
    "content" JSONB NOT NULL,
    "cover_image_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" SERIAL NOT NULL,
    "book_id" INTEGER NOT NULL,
    "external_key" VARCHAR(20) NOT NULL,
    "question_format" "QuestionFormat" NOT NULL,
    "stage" "QuestionStage" NOT NULL,
    "question_order" SMALLINT NOT NULL,
    "question_text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_answer" JSONB NOT NULL,
    "hint" TEXT,
    "evidence" JSONB,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tts_audio" (
    "id" SERIAL NOT NULL,
    "book_id" INTEGER NOT NULL,
    "line_id" VARCHAR(30) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "audio_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tts_audio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_assignments" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "book_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "student_title" VARCHAR(100),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_sessions" (
    "id" SERIAL NOT NULL,
    "book_assignment_id" INTEGER NOT NULL,
    "session_date" DATE NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_syllable_count" INTEGER NOT NULL DEFAULT 0,
    "reading_duration_ms" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_attempts" (
    "id" SERIAL NOT NULL,
    "book_assignment_id" INTEGER NOT NULL,
    "learning_session_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "student_answer" JSONB NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "response_time_ms" INTEGER,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "book_assignment_id" INTEGER NOT NULL,
    "current_stage" "LearningStage" NOT NULL DEFAULT 'READING',
    "current_step" SMALLINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("book_assignment_id")
);

-- CreateTable
CREATE TABLE "drawings" (
    "id" SERIAL NOT NULL,
    "book_assignment_id" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_reflections" (
    "id" SERIAL NOT NULL,
    "drawing_id" INTEGER NOT NULL,
    "audio_url" TEXT,
    "transcript" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_stamps" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "book_assignment_id" INTEGER NOT NULL,
    "amount" SMALLINT NOT NULL DEFAULT 1,
    "earned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_stamps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_rewards" (
    "id" SERIAL NOT NULL,
    "parent_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "required_stamps" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_login_id_key" ON "students"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_code_key" ON "students"("student_code");

-- CreateIndex
CREATE UNIQUE INDEX "parents_login_id_key" ON "parents"("login_id");

-- CreateIndex
CREATE INDEX "parent_students_student_id_idx" ON "parent_students"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "books_external_id_key" ON "books"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_book_id_external_key_key" ON "questions"("book_id", "external_key");

-- CreateIndex
CREATE UNIQUE INDEX "questions_book_id_question_order_key" ON "questions"("book_id", "question_order");

-- CreateIndex
CREATE UNIQUE INDEX "tts_audio_book_id_line_id_key" ON "tts_audio"("book_id", "line_id");

-- CreateIndex
CREATE INDEX "book_assignments_student_id_completed_at_idx" ON "book_assignments"("student_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "book_assignments_student_id_start_date_key" ON "book_assignments"("student_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "book_assignments_student_id_book_id_key" ON "book_assignments"("student_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_sessions_book_assignment_id_session_date_key" ON "learning_sessions"("book_assignment_id", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "question_attempts_book_assignment_id_question_id_attempt_nu_key" ON "question_attempts"("book_assignment_id", "question_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "drawings_book_assignment_id_key" ON "drawings"("book_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "drawing_reflections_drawing_id_key" ON "drawing_reflections"("drawing_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_stamps_book_assignment_id_key" ON "student_stamps"("book_assignment_id");

-- CreateIndex
CREATE INDEX "student_stamps_student_id_idx" ON "student_stamps"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "parent_rewards_student_id_required_stamps_key" ON "parent_rewards"("student_id", "required_stamps");

-- CreateIndex
CREATE INDEX "idx_user_sessions_expire" ON "user_sessions"("expire");

-- AddForeignKey
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tts_audio" ADD CONSTRAINT "tts_audio_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_assignments" ADD CONSTRAINT "book_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_assignments" ADD CONSTRAINT "book_assignments_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_book_assignment_id_fkey" FOREIGN KEY ("book_assignment_id") REFERENCES "book_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_book_assignment_id_fkey" FOREIGN KEY ("book_assignment_id") REFERENCES "book_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_learning_session_id_fkey" FOREIGN KEY ("learning_session_id") REFERENCES "learning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_assignment_id_fkey" FOREIGN KEY ("book_assignment_id") REFERENCES "book_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_book_assignment_id_fkey" FOREIGN KEY ("book_assignment_id") REFERENCES "book_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_reflections" ADD CONSTRAINT "drawing_reflections_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_stamps" ADD CONSTRAINT "student_stamps_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_stamps" ADD CONSTRAINT "student_stamps_book_assignment_id_fkey" FOREIGN KEY ("book_assignment_id") REFERENCES "book_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_rewards" ADD CONSTRAINT "parent_rewards_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_rewards" ADD CONSTRAINT "parent_rewards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Prisma 스키마로 표현할 수 없는 제약 (수동 추가)
-- ---------------------------------------------------------------------

-- 학생당 진행 중인 책은 1권만
CREATE UNIQUE INDEX "uq_one_in_progress_per_student" ON "book_assignments"("student_id") WHERE "status" = 'IN_PROGRESS';

ALTER TABLE "students" ADD CONSTRAINT "chk_students_birth_year" CHECK ("birth_year" IS NULL OR "birth_year" BETWEEN 2000 AND 2100);

ALTER TABLE "book_assignments" ADD CONSTRAINT "chk_assignment_completed" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL));

ALTER TABLE "question_attempts" ADD CONSTRAINT "chk_attempt_number" CHECK ("attempt_number" BETWEEN 1 AND 3);

ALTER TABLE "student_stamps" ADD CONSTRAINT "chk_stamp_amount" CHECK ("amount" > 0);

ALTER TABLE "parent_rewards" ADD CONSTRAINT "chk_required_stamps" CHECK ("required_stamps" > 0);
