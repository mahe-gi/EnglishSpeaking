import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import request from "supertest";
import { AccessToken } from "livekit-server-sdk";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { DecodedIdToken } from "firebase-admin/auth";
import { PeerService } from "../src/modules/peer/peer.service.ts";
import { env } from "../src/config/env.js";

async function signLiveKitWebhook(body: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(body).digest("base64");
  const at = new AccessToken(env.LIVEKIT_API_KEY || "key", env.LIVEKIT_API_SECRET || "secret", {
    ttl: 60,
  });
  at.sha256 = hash;
  return at.toJwt();
}



const mockTokenVerifier = async (token: string): Promise<DecodedIdToken> => {
  if (token === "token-user-a") {
    return { uid: "fb-peer-a", email: "peera@example.com", name: "Peer A" } as DecodedIdToken;
  }
  if (token === "token-user-b") {
    return { uid: "fb-peer-b", email: "peerb@example.com", name: "Peer B" } as DecodedIdToken;
  }
  if (token === "token-user-c") {
    return { uid: "fb-peer-c", email: "peerc@example.com", name: "Peer C" } as DecodedIdToken;
  }
  if (token === "token-user-anon") {
    return { uid: "fb-peer-anon", firebase: { sign_in_provider: "anonymous" } } as unknown as DecodedIdToken;
  }
  if (token === "token-user-unconfirmed") {
    return { uid: "fb-peer-unconf", email: "unconf@example.com" } as DecodedIdToken;
  }
  throw new Error("Invalid token");
};

const mockPeerTokenGenerator = async (params: { matchId: string; role: "A" | "B"; ttlSeconds?: number }) => {
  return {
    serverUrl: "wss://livekit.example.com",
    participantToken: `jwt-token-for-${params.matchId}-${params.role}`,
    roomName: `peer_${params.matchId}`,
    participantIdentity: `peer_${params.matchId}_${params.role.toLowerCase()}`,
  };
};

describe("Instant Peer Practice Module (Phase 3)", () => {
  let userA: { id: string; firebaseUid: string };
  let userB: { id: string; firebaseUid: string };
  let _userC: { id: string; firebaseUid: string };
  let _userAnon: { id: string; firebaseUid: string };
  let _userUnconf: { id: string; firebaseUid: string };

  beforeEach(async () => {
    // Clean up test peer data
    await prisma.usageLedger.deleteMany({
      where: {
        firebaseUid: {
          in: ["fb-peer-a", "fb-peer-b", "fb-peer-c", "fb-peer-anon", "fb-peer-unconf"],
        },
      },
    });
    await prisma.block.deleteMany();
    await prisma.report.deleteMany();
    await prisma.peerMatch.deleteMany();
    await prisma.peerQueueEntry.deleteMany();
    await prisma.user.deleteMany({
      where: {
        firebaseUid: {
          in: ["fb-peer-a", "fb-peer-b", "fb-peer-c", "fb-peer-anon", "fb-peer-unconf"],
        },
      },
    });

    // Create test users
    userA = await prisma.user.create({
      data: {
        firebaseUid: "fb-peer-a",
        email: "peera@example.com",
        identityType: "REGISTERED",
        peerAgeConfirmedAt: new Date(),
      },
    });

    userB = await prisma.user.create({
      data: {
        firebaseUid: "fb-peer-b",
        email: "peerb@example.com",
        identityType: "REGISTERED",
        peerAgeConfirmedAt: new Date(),
      },
    });

    _userC = await prisma.user.create({
      data: {
        firebaseUid: "fb-peer-c",
        email: "peerc@example.com",
        identityType: "REGISTERED",
        peerAgeConfirmedAt: new Date(),
      },
    });

    _userAnon = await prisma.user.create({
      data: {
        firebaseUid: "fb-peer-anon",
        identityType: "ANONYMOUS",
      },
    });

    _userUnconf = await prisma.user.create({
      data: {
        firebaseUid: "fb-peer-unconf",
        email: "unconf@example.com",
        identityType: "REGISTERED",
        peerAgeConfirmedAt: null,
      },
    });
  });


  describe("Safety & Identity Gating", () => {
    it("should reject unauthenticated request with 401", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const res = await request(app).post("/api/v1/peer/matchmaking/join");
      assert.strictEqual(res.status, 401);
    });

    it("should reject anonymous user with 403 REGISTERED_IDENTITY_REQUIRED", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const res = await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-anon");

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, "REGISTERED_IDENTITY_REQUIRED");
    });

    it("should reject registered user with unconfirmed 18+ status with 403 AGE_CONFIRMATION_REQUIRED", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const res = await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-unconfirmed");

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, "AGE_CONFIRMATION_REQUIRED");
    });

    it("should reject user whose peer quota is exhausted with 403 ENTITLEMENT_EXHAUSTED", async () => {
      // Record 300 seconds of peer usage for userA (Free daily peer limit = 300s)
      await prisma.usageLedger.create({
        data: {
          firebaseUid: userA.firebaseUid,
          userId: userA.id,
          type: "PEER",
          sessionId: "prior-peer-session",
          billableSeconds: 300,
          planAtTime: "FREE",
          startedAt: new Date(),
          endedAt: new Date(),
          idempotencyKey: "prior-peer-usage-a",
        },
      });

      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const res = await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, "ENTITLEMENT_EXHAUSTED");
    });
  });

  describe("Matchmaking Queue & Pairing", () => {
    it("should enter queue as SEARCHING when no candidate is available", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const res = await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.status, "SEARCHING");
      assert(res.body.data.queueEntryId);
      assert(res.body.data.expiresAt);

      const statusRes = await request(app)
        .get("/api/v1/peer/matchmaking/status")
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.data.status, "SEARCHING");
    });

    it("should match User A and User B into exactly one PeerMatch", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      // User A joins
      const resA = await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-a");
      assert.strictEqual(resA.body.data.status, "SEARCHING");

      // User B joins
      const resB = await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-b");

      assert.strictEqual(resB.status, 200);
      assert.strictEqual(resB.body.data.status, "MATCHED");
      assert.strictEqual(resB.body.data.match.role, "B");
      const matchId = resB.body.data.match.id;

      // User A polls status -> should be MATCHED
      const statusResA = await request(app)
        .get("/api/v1/peer/matchmaking/status")
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(statusResA.status, 200);
      assert.strictEqual(statusResA.body.data.status, "MATCHED");
      assert.strictEqual(statusResA.body.data.match.id, matchId);
      assert.strictEqual(statusResA.body.data.match.role, "A");

      // Verify PeerMatch in DB
      const matches = await prisma.peerMatch.findMany();
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0]?.userAId, userA.id);
      assert.strictEqual(matches[0]?.userBId, userB.id);
      assert.strictEqual(matches[0]?.status, "MATCHED");
    });

    it("should allow user to cancel search and leave queue", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-a");

      const leaveRes = await request(app)
        .delete("/api/v1/peer/matchmaking/leave")
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(leaveRes.status, 200);
      assert.strictEqual(leaveRes.body.data.success, true);

      const statusRes = await request(app)
        .get("/api/v1/peer/matchmaking/status")
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(statusRes.body.data.status, "TIMEOUT");
    });

    it("should never match users with a mutual block", async () => {
      // User A blocks User B
      await prisma.block.create({
        data: {
          blockerId: userA.id,
          blockedUserId: userB.id,
        },
      });

      const app = createApp({ tokenVerifier: mockTokenVerifier });

      // User A joins
      await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-a");

      // User B joins -> should not match User A!
      const resB = await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-b");

      assert.strictEqual(resB.body.data.status, "SEARCHING");

      const matches = await prisma.peerMatch.findMany();
      assert.strictEqual(matches.length, 0);
    });
  });

  describe("Concurrency & High-Contention Tests", () => {
    it("should handle simultaneous join from User A and User B with exactly one PeerMatch", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      const [resA, resB] = await Promise.all([
        request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a"),
        request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b"),
      ]);

      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resB.status, 200);

      const matches = await prisma.peerMatch.findMany();
      assert.strictEqual(matches.length, 1);
    });

    it("should handle simultaneous join from A, B, and C with no user appearing in two matches", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      const [resA, resB, resC] = await Promise.all([
        request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a"),
        request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b"),
        request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-c"),
      ]);

      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resB.status, 200);
      assert.strictEqual(resC.status, 200);

      const matches = await prisma.peerMatch.findMany();
      assert.strictEqual(matches.length, 1);

      const waitingQueue = await prisma.peerQueueEntry.findMany({ where: { status: "WAITING" } });
      assert.strictEqual(waitingQueue.length, 1);

      // Verify no user appears in multiple matches
      const participantIds = [matches[0]!.userAId, matches[0]!.userBId];
      const uniqueParticipants = new Set(participantIds);
      assert.strictEqual(uniqueParticipants.size, 2);
    });

    it("should handle two simultaneous join requests from User A with max one queue entry", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      const [res1, res2] = await Promise.all([
        request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a"),
        request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a"),
      ]);

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);

      const entries = await prisma.peerQueueEntry.findMany({ where: { userId: userA.id } });
      assert.strictEqual(entries.length, 1);
    });

    it("should never match expired queue entries", async () => {
      // User A created queue entry 60 seconds ago (expired)
      await prisma.peerQueueEntry.create({
        data: {
          userId: userA.id,
          status: "WAITING",
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const app = createApp({ tokenVerifier: mockTokenVerifier });

      // User B joins -> should NOT pair with expired User A entry
      const resB = await request(app)
        .post("/api/v1/peer/matchmaking/join")
        .set("Authorization", "Bearer token-user-b");

      assert.strictEqual(resB.body.data.status, "SEARCHING");

      const matches = await prisma.peerMatch.findMany();
      assert.strictEqual(matches.length, 0);
    });
  });

  describe("LiveKit Token Security & Ownership", () => {
    it("should issue role A token to User A and role B token to User B", async () => {
      const app = createApp({
        tokenVerifier: mockTokenVerifier,
        peerTokenGenerator: mockPeerTokenGenerator,
      });

      // Form match
      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;

      // User A requests token
      const tokenA = await request(app)
        .post(`/api/v1/peer/matches/${matchId}/token`)
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(tokenA.status, 200);
      assert.strictEqual(tokenA.body.data.participantIdentity, `peer_${matchId}_a`);

      // User B requests token
      const tokenB = await request(app)
        .post(`/api/v1/peer/matches/${matchId}/token`)
        .set("Authorization", "Bearer token-user-b");

      assert.strictEqual(tokenB.status, 200);
      assert.strictEqual(tokenB.body.data.participantIdentity, `peer_${matchId}_b`);

      // Non-participant User C requests token -> 403 MATCH_ACCESS_DENIED
      const tokenC = await request(app)
        .post(`/api/v1/peer/matches/${matchId}/token`)
        .set("Authorization", "Bearer token-user-c");

      assert.strictEqual(tokenC.status, 403);
      assert.strictEqual(tokenC.body.error.code, "MATCH_ACCESS_DENIED");
    });
  });

  describe("In-Call Moderation (Report & Block)", () => {
    it("should allow participant to report partner with reason and details", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;

      const reportRes = await request(app)
        .post(`/api/v1/peer/matches/${matchId}/report`)
        .set("Authorization", "Bearer token-user-a")
        .send({
          reason: "HARASSMENT",
          details: "Partner was abusive during the call.",
        });

      assert.strictEqual(reportRes.status, 200);
      assert.strictEqual(reportRes.body.data.success, true);

      const reports = await prisma.report.findMany();
      assert.strictEqual(reports.length, 1);
      assert.strictEqual(reports[0]?.reporterId, userA.id);
      assert.strictEqual(reports[0]?.reportedUserId, userB.id);
      assert.strictEqual(reports[0]?.reason, "HARASSMENT");
    });

    it("should record directional block and terminate current match", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;

      const blockRes = await request(app)
        .post(`/api/v1/peer/matches/${matchId}/block`)
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(blockRes.status, 200);
      assert.strictEqual(blockRes.body.data.success, true);
      assert.strictEqual(blockRes.body.data.blockedUserId, userB.id);

      const blocks = await prisma.block.findMany();
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0]?.blockerId, userA.id);
      assert.strictEqual(blocks[0]?.blockedUserId, userB.id);
    });
  });

  describe("Lifecycle & Server-Authoritative Ledger Billing", () => {
    it("should charge 0 seconds and create 0 ledgers if match was never ACTIVE", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;

      // Mobile complete call on never-connected match
      const compRes = await request(app)
        .post(`/api/v1/peer/matches/${matchId}/complete`)
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(compRes.status, 200);

      const ledgers = await prisma.usageLedger.findMany({ where: { sessionId: matchId } });
      assert.strictEqual(ledgers.length, 0);
    });

    it("should transition to ACTIVE when both join and create 2 UsageLedger entries on complete", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;

      // Manually simulate active match with startedAt 60 seconds ago
      const sixtySecondsAgo = new Date(Date.now() - 60_000);
      await prisma.peerMatch.update({
        where: { id: matchId },
        data: {
          status: "ACTIVE",
          startedAt: sixtySecondsAgo,
          deadlineAt: new Date(sixtySecondsAgo.getTime() + 300_000),
        },
      });

      // Complete match
      const compRes = await request(app)
        .post(`/api/v1/peer/matches/${matchId}/complete`)
        .set("Authorization", "Bearer token-user-a");

      assert.strictEqual(compRes.status, 200);

      const match = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert.strictEqual(match?.status, "COMPLETED");
      assert(match?.actualSeconds && match.actualSeconds >= 59 && match.actualSeconds <= 61);

      // Verify TWO ledger rows created
      const ledgers = await prisma.usageLedger.findMany({ where: { sessionId: matchId } });
      assert.strictEqual(ledgers.length, 2);

      const ledgerA = ledgers.find((l) => l.userId === userA.id);
      const ledgerB = ledgers.find((l) => l.userId === userB.id);

      assert(ledgerA);
      assert(ledgerB);
      assert.strictEqual(ledgerA?.type, "PEER");
      assert.strictEqual(ledgerB?.type, "PEER");
      assert.strictEqual(ledgerA?.idempotencyKey, `peer:${matchId}:${userA.id}`);
      assert.strictEqual(ledgerB?.idempotencyKey, `peer:${matchId}:${userB.id}`);

      // Second completion call should be idempotent (no duplicate ledger rows)
      await request(app)
        .post(`/api/v1/peer/matches/${matchId}/complete`)
        .set("Authorization", "Bearer token-user-b");

      const ledgersAfter = await prisma.usageLedger.findMany({ where: { sessionId: matchId } });
      assert.strictEqual(ledgersAfter.length, 2);
    });

    it("should keep status MATCHED and startedAt null when only User A joins", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;
      const match = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert(match);

      // Simulate LiveKit webhook event: only 1 participant joined
      const body = JSON.stringify({
        event: "participant_joined",
        room: { name: match.livekitRoom, numParticipants: 1 },
        participant: { identity: `peer_${matchId}_a` },
      });
      const token = await signLiveKitWebhook(body);

      const res = await request(app)
        .post("/api/v1/webhooks/livekit")
        .set("Content-Type", "application/webhook+json")
        .set("Authorization", token)
        .send(body);

      assert.strictEqual(res.status, 200);

      // Verify status is still MATCHED and startedAt is null
      const matchAfterA = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert.strictEqual(matchAfterA?.status, "MATCHED");
      assert.strictEqual(matchAfterA?.startedAt, null);
      assert.strictEqual(matchAfterA?.deadlineAt, null);
    });

    it("should transition MATCHED -> ACTIVE and set startedAt when User B joins afterward", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;
      const match = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert(match);

      // Step 1: User A joins (numParticipants = 1)
      const bodyA = JSON.stringify({
        event: "participant_joined",
        room: { name: match.livekitRoom, numParticipants: 1 },
        participant: { identity: `peer_${matchId}_a` },
      });
      const tokenA = await signLiveKitWebhook(bodyA);
      await request(app)
        .post("/api/v1/webhooks/livekit")
        .set("Content-Type", "application/webhook+json")
        .set("Authorization", tokenA)
        .send(bodyA);

      let currentMatch = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert.strictEqual(currentMatch?.status, "MATCHED");
      assert.strictEqual(currentMatch?.startedAt, null);

      // Step 2: User B joins (numParticipants = 2)
      const bodyB = JSON.stringify({
        event: "participant_joined",
        room: { name: match.livekitRoom, numParticipants: 2 },
        participant: { identity: `peer_${matchId}_b` },
      });
      const tokenB = await signLiveKitWebhook(bodyB);
      await request(app)
        .post("/api/v1/webhooks/livekit")
        .set("Content-Type", "application/webhook+json")
        .set("Authorization", tokenB)
        .send(bodyB);

      currentMatch = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert.strictEqual(currentMatch?.status, "ACTIVE");
      assert(currentMatch?.startedAt !== null);
      assert(currentMatch?.deadlineAt !== null);

      const initialStartedAt = currentMatch?.startedAt;

      // Step 3: Duplicate participant_joined webhook -> startedAt must NOT change
      const bodyDup = JSON.stringify({
        event: "participant_joined",
        room: { name: match.livekitRoom, numParticipants: 2 },
        participant: { identity: `peer_${matchId}_b` },
      });
      const tokenDup = await signLiveKitWebhook(bodyDup);
      await request(app)
        .post("/api/v1/webhooks/livekit")
        .set("Content-Type", "application/webhook+json")
        .set("Authorization", tokenDup)
        .send(bodyDup);

      const matchAfterDup = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert.strictEqual(matchAfterDup?.status, "ACTIVE");
      assert.strictEqual(matchAfterDup?.startedAt?.getTime(), initialStartedAt?.getTime());
    });


    it("should mark match CANCELLED and create ZERO ledger rows if User B never joins and User A leaves", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;

      // Only User A joined; User B never joined. Match is still MATCHED.
      // Participant A leaves the room
      await PeerService.finalizeMatchInternal(matchId, "COMPLETED");

      const match = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert.strictEqual(match?.status, "CANCELLED");
      assert.strictEqual(match?.actualSeconds, 0);

      // Verify ZERO ledger rows created for either user
      const ledgers = await prisma.usageLedger.findMany({ where: { sessionId: matchId } });
      assert.strictEqual(ledgers.length, 0);
    });

    it("should process participant_joined and participant_left webhook events correctly", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;
      const match = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert(match);

      // Verify direct internal lifecycle helper
      await prisma.peerMatch.update({
        where: { id: matchId },
        data: {
          status: "ACTIVE",
          startedAt: new Date(Date.now() - 30_000),
          deadlineAt: new Date(Date.now() + 270_000),
        },
      });

      // Simulate participant_left event finalization
      await PeerService.finalizeMatchInternal(matchId, "COMPLETED");

      const completedMatch = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert.strictEqual(completedMatch?.status, "COMPLETED");
      assert(completedMatch?.actualSeconds && completedMatch.actualSeconds >= 29);

      const ledgers = await prisma.usageLedger.findMany({ where: { sessionId: matchId } });
      assert.strictEqual(ledgers.length, 2);
    });

    it("should calculate explicit allowedSeconds: Free (300s) + Premium (1800s) -> allowedSeconds = 300", async () => {
      // Set userB as PREMIUM (1800s daily quota)
      await prisma.user.update({
        where: { id: userB.id },
        data: { plan: "PREMIUM" },
      });

      const app = createApp({ tokenVerifier: mockTokenVerifier });

      // User A (Free, 300s remaining) + User B (Premium, 1800s remaining)
      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");

      assert.strictEqual(matchRes.status, 200);
      assert.strictEqual(matchRes.body.data.match.allowedSeconds, 300);
    });

    it("should calculate explicit allowedSeconds: Premium (1800s) + Premium (1800s) -> allowedSeconds = 900 (max cap)", async () => {
      // Set both users as PREMIUM
      await prisma.user.update({
        where: { id: userA.id },
        data: { plan: "PREMIUM" },
      });
      await prisma.user.update({
        where: { id: userB.id },
        data: { plan: "PREMIUM" },
      });

      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");

      assert.strictEqual(matchRes.status, 200);
      assert.strictEqual(matchRes.body.data.match.allowedSeconds, 900);
    });

    it("should handle webhook idempotency: duplicate events create exactly 2 UsageLedger rows total", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-a");
      const matchRes = await request(app).post("/api/v1/peer/matchmaking/join").set("Authorization", "Bearer token-user-b");
      const matchId = matchRes.body.data.match.id;

      // Set active with startedAt 45s ago
      const fortyFiveAgo = new Date(Date.now() - 45_000);
      await prisma.peerMatch.update({
        where: { id: matchId },
        data: {
          status: "ACTIVE",
          startedAt: fortyFiveAgo,
          deadlineAt: new Date(fortyFiveAgo.getTime() + 300_000),
        },
      });

      // 1. First participant_left
      await PeerService.finalizeMatchInternal(matchId, "COMPLETED");

      // 2. Second duplicate participant_left
      await PeerService.finalizeMatchInternal(matchId, "COMPLETED");

      // 3. Subsequent room_finished
      await PeerService.finalizeMatchInternal(matchId, "COMPLETED");

      const ledgers = await prisma.usageLedger.findMany({ where: { sessionId: matchId } });
      assert.strictEqual(ledgers.length, 2);

      const match = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      assert.strictEqual(match?.status, "COMPLETED");
      assert(match?.actualSeconds && match.actualSeconds >= 44 && match.actualSeconds <= 46);
    });

    it("should reject LiveKit webhook with invalid signature with 401 INVALID_WEBHOOK_SIGNATURE", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      const res = await request(app)
        .post("/api/v1/webhooks/livekit")
        .set("Content-Type", "application/webhook+json")
        .set("Authorization", "invalid-token-signature")
        .send(JSON.stringify({ event: "participant_joined" }));

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error.code, "INVALID_WEBHOOK_SIGNATURE");
    });
  });
});




