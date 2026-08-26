/*
  Warnings:

  - You are about to drop the column `name` on the `users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('ANONYMOUS', 'REGISTERED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "VoiceSessionStatus" AS ENUM ('CREATED', 'CONNECTING', 'ACTIVE', 'ENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('AI', 'PEER');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "name",
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "identityType" "IdentityType" NOT NULL DEFAULT 'ANONYMOUS',
ADD COLUMN     "peerAgeConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'FREE',
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "usage_ledgers" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "installationId" TEXT,
    "userId" TEXT,
    "type" "UsageType" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "billableSeconds" INTEGER NOT NULL,
    "planAtTime" "Plan" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_sessions" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "installationId" TEXT,
    "userId" TEXT,
    "status" "VoiceSessionStatus" NOT NULL DEFAULT 'CREATED',
    "allowedSeconds" INTEGER NOT NULL,
    "reservedSeconds" INTEGER NOT NULL,
    "actualSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_intents" (
    "id" TEXT NOT NULL,
    "sourceFirebaseUid" TEXT NOT NULL,
    "sourceUserId" TEXT,
    "targetUserId" TEXT,
    "installationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_ledgers_idempotencyKey_key" ON "usage_ledgers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "usage_ledgers_firebaseUid_type_createdAt_idx" ON "usage_ledgers"("firebaseUid", "type", "createdAt");

-- CreateIndex
CREATE INDEX "usage_ledgers_installationId_type_createdAt_idx" ON "usage_ledgers"("installationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "usage_ledgers_userId_type_createdAt_idx" ON "usage_ledgers"("userId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "voice_sessions_idempotencyKey_key" ON "voice_sessions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "voice_sessions_firebaseUid_status_idx" ON "voice_sessions"("firebaseUid", "status");

-- CreateIndex
CREATE INDEX "voice_sessions_installationId_status_idx" ON "voice_sessions"("installationId", "status");

-- CreateIndex
CREATE INDEX "voice_sessions_userId_status_idx" ON "voice_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "merge_intents_sourceFirebaseUid_expiresAt_idx" ON "merge_intents"("sourceFirebaseUid", "expiresAt");

-- AddForeignKey
ALTER TABLE "usage_ledgers" ADD CONSTRAINT "usage_ledgers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_intents" ADD CONSTRAINT "merge_intents_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_intents" ADD CONSTRAINT "merge_intents_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
