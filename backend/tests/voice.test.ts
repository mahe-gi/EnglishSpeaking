import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/config/env.js";

// Mock Firebase token verifier
const mockUsers: Record<string, { uid: string; email?: string; isAnonymous: boolean; signInProvider: string }> = {
  "token-guest-1": { uid: "fb-anon-v1", isAnonymous: true, signInProvider: "anonymous" },
  "token-guest-2": { uid: "fb-anon-v2", isAnonymous: true, signInProvider: "anonymous" },
  "token-reg-free": { uid: "fb-reg-v1", email: "reg-free@ntalo.app", isAnonymous: false, signInProvider: "google.com" },
  "token-reg-prem": { uid: "fb-reg-prem", email: "reg-prem@ntalo.app", isAnonymous: false, signInProvider: "google.com" },
};

const mockVerifier = async (token: string) => {
  const user = mockUsers[token];
  if (!user) throw new Error("Invalid token");
  return user;
};

describe("Voice Practice Module (Realtime Voice Sessions)", () => {
  const app = createApp({ tokenVerifier: mockVerifier });
  const testInstallationId = "550e8400-e29b-41d4-a716-446655440000";
  const testInstallationId2 = "660e8400-e29b-41d4-a716-446655440001";

  beforeEach(async () => {
    // Clean up test data
    await prisma.usageLedger.deleteMany();
    await prisma.voiceSession.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();

    // Seed test users
    await prisma.user.create({
      data: {
        firebaseUid: "fb-anon-v1",
        identityType: "ANONYMOUS",
        plan: "FREE",
      },
    });

    await prisma.user.create({
      data: {
        firebaseUid: "fb-anon-v2",
        identityType: "ANONYMOUS",
        plan: "FREE",
      },
    });

    await prisma.user.create({
      data: {
        firebaseUid: "fb-reg-v1",
        email: "reg-free@ntalo.app",
        identityType: "REGISTERED",
        plan: "FREE",
      },
    });

    await prisma.user.create({
      data: {
        firebaseUid: "fb-reg-prem",
        email: "reg-prem@ntalo.app",
        identityType: "REGISTERED",
        plan: "PREMIUM",
      },
    });
  });

  describe("POST /api/v1/voice/sessions (Session Creation & Entitlement)", () => {
    it("should return 401 when Authorization header is missing", async () => {
      const res = await request(app).post("/api/v1/voice/sessions");
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, "UNAUTHORIZED");
    });

    it("should return 400 when guest calls without valid x-installation-id", async () => {
      const res = await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-guest-1");

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "INVALID_INSTALLATION_ID");
    });

    it("should create VoiceSession and return LiveKit token for guest within trial quota", async () => {
      const res = await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-guest-1")
        .set("x-installation-id", testInstallationId);

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.sessionId);
      assert.ok(res.body.data.roomName.startsWith("voice_"));
      assert.ok(res.body.data.livekitUrl);
      assert.ok(res.body.data.participantToken);
      assert.equal(res.body.data.allowedSeconds, 120);

      // Verify DB row
      const session = await prisma.voiceSession.findUnique({
        where: { id: res.body.data.sessionId },
      });
      assert.ok(session);
      assert.equal(session.status, "CREATED");
      assert.equal(session.installationId, testInstallationId);
      assert.equal(session.reservedSeconds, 120);
      assert.equal(session.userId, null);
    });

    it("should return 403 ENTITLEMENT_EXHAUSTED when guest trial quota is used up", async () => {
      // Record 120s of completed AI usage for testInstallationId
      await prisma.usageLedger.create({
        data: {
          firebaseUid: "fb-anon-v1",
          installationId: testInstallationId,
          type: "AI",
          sessionId: "old-session",
          billableSeconds: 120,
          planAtTime: "FREE",
          startedAt: new Date(),
          endedAt: new Date(),
        },
      });

      const res = await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-guest-1")
        .set("x-installation-id", testInstallationId);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "ENTITLEMENT_EXHAUSTED");
    });

    it("should enforce idempotency: return same live session on repeated call with same key", async () => {
      const idempotencyKey = "key-voice-idempotent-1";

      const res1 = await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-guest-1")
        .set("x-installation-id", testInstallationId)
        .set("idempotency-key", idempotencyKey);

      assert.equal(res1.status, 201);
      const sessionId1 = res1.body.data.sessionId;

      const res2 = await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-guest-1")
        .set("x-installation-id", testInstallationId)
        .set("idempotency-key", idempotencyKey);

      assert.equal(res2.status, 201);
      assert.equal(res2.body.data.sessionId, sessionId1);

      // Verify only 1 session was created in DB
      const count = await prisma.voiceSession.count({
        where: { idempotencyKey },
      });
      assert.equal(count, 1);
    });

    it("should reject cross-user idempotency collision with 409 IDEMPOTENCY_KEY_CONFLICT", async () => {
      const idempotencyKey = "key-collision-test";

      // Caller 1 uses key
      await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-guest-1")
        .set("x-installation-id", testInstallationId)
        .set("idempotency-key", idempotencyKey);

      // Caller 2 attempts same key with different installationId
      const res = await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-guest-2")
        .set("x-installation-id", testInstallationId2)
        .set("idempotency-key", idempotencyKey);

      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "IDEMPOTENCY_KEY_CONFLICT");
    });

    it("should create session for registered free user with canonical userId", async () => {
      const res = await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-reg-free");

      assert.equal(res.status, 201);
      assert.ok(res.body.data.sessionId);

      const user = await prisma.user.findUnique({ where: { firebaseUid: "fb-reg-v1" } });
      const session = await prisma.voiceSession.findUnique({
        where: { id: res.body.data.sessionId },
      });
      assert.equal(session?.userId, user?.id);
    });
  });

  describe("Internal Worker Lifecycle Endpoints", () => {
    it("should reject internal endpoints when AGENT_INTERNAL_SECRET is missing or wrong", async () => {
      const res1 = await request(app).post("/api/v1/internal/voice-sessions/session-1/active");
      assert.equal(res1.status, 401);
      assert.equal(res1.body.error.code, "UNAUTHORIZED_INTERNAL_CALL");

      const res2 = await request(app)
        .post("/api/v1/internal/voice-sessions/session-1/active")
        .set("Authorization", "Bearer wrong-secret-value-12345");
      assert.equal(res2.status, 401);
      assert.equal(res2.body.error.code, "UNAUTHORIZED_INTERNAL_CALL");
    });

    it("should transition session to ACTIVE and set server-authoritative startedAt", async () => {
      const session = await prisma.voiceSession.create({
        data: {
          firebaseUid: "fb-anon-v1",
          installationId: testInstallationId,
          status: "CREATED",
          allowedSeconds: 120,
          reservedSeconds: 120,
          reservationExpiresAt: new Date(Date.now() + 120_000),
        },
      });

      const res = await request(app)
        .post(`/api/v1/internal/voice-sessions/${session.id}/active`)
        .set("Authorization", `Bearer ${env.AGENT_INTERNAL_SECRET}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.session.status, "ACTIVE");
      assert.ok(res.body.data.session.startedAt);

      // Verify idempotent replay
      const res2 = await request(app)
        .post(`/api/v1/internal/voice-sessions/${session.id}/active`)
        .set("Authorization", `Bearer ${env.AGENT_INTERNAL_SECRET}`);
      assert.equal(res2.status, 200);
      assert.equal(res2.body.data.session.status, "ACTIVE");
    });

    it("should finalize session on complete, clamp actualSeconds, and create single UsageLedger", async () => {
      const startedAt = new Date(Date.now() - 45_000); // 45s ago
      const session = await prisma.voiceSession.create({
        data: {
          firebaseUid: "fb-anon-v1",
          installationId: testInstallationId,
          status: "ACTIVE",
          allowedSeconds: 120,
          reservedSeconds: 120,
          startedAt,
          reservationExpiresAt: new Date(Date.now() + 120_000),
        },
      });

      const res = await request(app)
        .post(`/api/v1/internal/voice-sessions/${session.id}/complete`)
        .set("Authorization", `Bearer ${env.AGENT_INTERNAL_SECRET}`)
        .send({ outcome: "COMPLETED" });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.session.status, "COMPLETED");
      assert.equal(res.body.data.session.reservedSeconds, 0);
      assert.ok(res.body.data.session.actualSeconds >= 44 && res.body.data.session.actualSeconds <= 46);

      // Check UsageLedger created exactly once
      const ledgers = await prisma.usageLedger.findMany({
        where: { sessionId: session.id },
      });
      assert.equal(ledgers.length, 1);
      assert.equal(ledgers[0].billableSeconds, res.body.data.session.actualSeconds);
      assert.equal(ledgers[0].type, "AI");

      // Repeated complete call is idempotent and does not create duplicate ledger
      const res2 = await request(app)
        .post(`/api/v1/internal/voice-sessions/${session.id}/complete`)
        .set("Authorization", `Bearer ${env.AGENT_INTERNAL_SECRET}`)
        .send({ outcome: "COMPLETED" });
      assert.equal(res2.status, 200);

      const ledgersAfter = await prisma.usageLedger.findMany({
        where: { sessionId: session.id },
      });
      assert.equal(ledgersAfter.length, 1);
    });

    it("should ignore stale ACTIVE session whose reservationExpiresAt has passed and allow new session within quota", async () => {
      // Create a stale ACTIVE session that expired in the past (e.g. agent crashed)
      await prisma.voiceSession.create({
        data: {
          firebaseUid: "fb-anon-v1",
          installationId: testInstallationId,
          status: "ACTIVE",
          allowedSeconds: 120,
          reservedSeconds: 120,
          startedAt: new Date(Date.now() - 300_000), // 5 min ago
          reservationExpiresAt: new Date(Date.now() - 100_000), // expired 100s ago
        },
      });

      // Guest should NOT be blocked by the expired reservation
      const res = await request(app)
        .post("/api/v1/voice/sessions")
        .set("Authorization", "Bearer token-guest-1")
        .set("x-installation-id", testInstallationId);

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.allowedSeconds, 120);
    });

    it("should handle concurrent completion requests idempotently and create only one UsageLedger", async () => {
      const startedAt = new Date(Date.now() - 30_000);
      const session = await prisma.voiceSession.create({
        data: {
          firebaseUid: "fb-anon-v1",
          installationId: testInstallationId,
          status: "ACTIVE",
          allowedSeconds: 120,
          reservedSeconds: 120,
          startedAt,
          reservationExpiresAt: new Date(Date.now() + 120_000),
        },
      });

      // Fire two concurrent completion requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/internal/voice-sessions/${session.id}/complete`)
          .set("Authorization", `Bearer ${env.AGENT_INTERNAL_SECRET}`)
          .send({ outcome: "COMPLETED" }),
        request(app)
          .post(`/api/v1/internal/voice-sessions/${session.id}/complete`)
          .set("Authorization", `Bearer ${env.AGENT_INTERNAL_SECRET}`)
          .send({ outcome: "COMPLETED" }),
      ]);

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);

      // Check VoiceSession final status
      const updatedSession = await prisma.voiceSession.findUnique({
        where: { id: session.id },
      });
      assert.equal(updatedSession?.status, "COMPLETED");
      assert.equal(updatedSession?.reservedSeconds, 0);

      // Verify UsageLedger created exactly once
      const ledgers = await prisma.usageLedger.findMany({
        where: { sessionId: session.id },
      });
      assert.equal(ledgers.length, 1);
    });
  });
});
