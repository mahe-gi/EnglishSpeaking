-- AlterTable
ALTER TABLE "voice_sessions" ADD COLUMN "roomName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "voice_sessions_roomName_key" ON "voice_sessions"("roomName");
