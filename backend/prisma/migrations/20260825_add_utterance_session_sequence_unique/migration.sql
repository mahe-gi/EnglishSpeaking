-- AlterEnum
ALTER TYPE "SessionStatus" ADD VALUE 'ANALYZING';

-- AlterTable
ALTER TABLE "practice_sessions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "utterances_sessionId_sequence_key" ON "utterances"("sessionId", "sequence");
