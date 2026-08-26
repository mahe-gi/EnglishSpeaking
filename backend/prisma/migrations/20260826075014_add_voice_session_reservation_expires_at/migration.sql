-- AlterTable
ALTER TABLE "voice_sessions" ADD COLUMN     "reservationExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "voice_sessions_status_reservationExpiresAt_idx" ON "voice_sessions"("status", "reservationExpiresAt");
