-- Rename completedAt to endedAt to preserve historical completion timestamps
ALTER TABLE "peer_matches" RENAME COLUMN "completedAt" TO "endedAt";

ALTER TABLE "peer_matches"
ADD COLUMN "actualSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "allowedSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "deadlineAt" TIMESTAMP(3),
ADD COLUMN "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "startsAt" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'MATCHED';


CREATE TABLE "peer_queue_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PeerQueueStatus" NOT NULL DEFAULT 'WAITING',
    "matchId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peer_queue_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "peer_queue_entries_userId_key" ON "peer_queue_entries"("userId");
CREATE INDEX "peer_queue_entries_status_expiresAt_idx" ON "peer_queue_entries"("status", "expiresAt");
CREATE INDEX "peer_matches_userAId_status_idx" ON "peer_matches"("userAId", "status");
CREATE INDEX "peer_matches_userBId_status_idx" ON "peer_matches"("userBId", "status");
CREATE INDEX "peer_matches_status_deadlineAt_idx" ON "peer_matches"("status", "deadlineAt");

ALTER TABLE "peer_queue_entries" ADD CONSTRAINT "peer_queue_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
