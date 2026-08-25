-- CreateIndex
CREATE UNIQUE INDEX "peer_availabilities_userId_startsAt_key" ON "peer_availabilities"("userId", "startsAt");
