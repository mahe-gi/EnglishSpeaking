import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const VALID_INSTALL_ID_1 = "11111111-1111-4111-8111-111111111111";

describe("Ntalo V2 User, Auth Security & Entitlement API", () => {
  beforeEach(async () => {
    await prisma.mergeIntent.deleteMany();
    await prisma.usageLedger.deleteMany();
    await prisma.voiceSession.deleteMany();
    await prisma.user.deleteMany();
  });

  const mockTokenVerifier = async (token: string) => {
    if (token === "valid-registered-token") {
      return {
        uid: "firebase-uid-registered-google",
        email: "registered@example.com",
        name: "Registered User",
        picture: "https://example.com/avatar.png",
        isAnonymous: false,
        signInProvider: "google.com",
      };
    }
    if (token === "valid-registered-token-2") {
      return {
        uid: "firebase-uid-registered-google-2",
        email: "registered2@example.com",
        name: "Registered User 2",
        picture: "https://example.com/avatar2.png",
        isAnonymous: false,
        signInProvider: "google.com",
      };
    }
    if (token === "valid-anonymous-token") {
      return {
        uid: "firebase-uid-anon-1",
        isAnonymous: true,
        signInProvider: "anonymous",
      };
    }
    if (token === "valid-anonymous-token-2") {
      return {
        uid: "firebase-uid-anon-2",
        isAnonymous: true,
        signInProvider: "anonymous",
      };
    }
    if (token === "valid-non-google-token") {
      return {
        uid: "firebase-uid-non-google",
        email: "password@example.com",
        name: "Password User",
        isAnonymous: false,
        signInProvider: "password",
      };
    }
    throw new Error("Invalid token");
  };

  it("should return 401 when Authorization header is missing", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app).put("/api/v1/me");

    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.body.success, false);
    assert.strictEqual(response.body.error.code, "UNAUTHORIZED");
  });

  it("should reject anonymous guest bootstrap when x-installation-id is missing", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/me")
      .set("Authorization", "Bearer valid-anonymous-token");

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error.code, "INVALID_INSTALLATION_ID");
  });

  it("should reject anonymous guest bootstrap when x-installation-id is not a valid UUID", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/me")
      .set("Authorization", "Bearer valid-anonymous-token")
      .set("x-installation-id", "invalid-not-a-uuid");

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error.code, "INVALID_INSTALLATION_ID");
  });

  it("should bootstrap anonymous guest successfully with valid UUID", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/me")
      .set("Authorization", "Bearer valid-anonymous-token")
      .set("x-installation-id", VALID_INSTALL_ID_1);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.data.user.identityType, "ANONYMOUS");
    assert.strictEqual(response.body.data.user.plan, "FREE");
    assert.strictEqual(response.body.data.entitlements.productState, "GUEST");
    assert.strictEqual(response.body.data.entitlements.remainingAiSeconds, 120);
    assert.strictEqual(response.body.data.entitlements.peerAllowed, false);
  });

  it("should bootstrap registered Google user even without x-installation-id", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/me")
      .set("Authorization", "Bearer valid-registered-token");

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.data.user.identityType, "REGISTERED");
    assert.strictEqual(response.body.data.user.email, "registered@example.com");
    assert.strictEqual(response.body.data.entitlements.productState, "FREE");
    assert.strictEqual(response.body.data.entitlements.remainingAiSeconds, 120);
    assert.strictEqual(response.body.data.entitlements.remainingPeerSeconds, 300);
    assert.strictEqual(response.body.data.entitlements.peerAllowed, true);
  });

  it("should enforce age confirmation for registered users and reject anonymous users", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    // 1. Anonymous user rejected
    const anonRes = await request(app)
      .post("/api/v1/users/confirm-age")
      .set("Authorization", "Bearer valid-anonymous-token");

    assert.strictEqual(anonRes.status, 403);
    assert.strictEqual(anonRes.body.error.code, "GUEST_PEER_NOT_ALLOWED");

    // 2. Registered user accepted
    const regRes = await request(app)
      .post("/api/v1/users/confirm-age")
      .set("Authorization", "Bearer valid-registered-token");

    assert.strictEqual(regRes.status, 200);
    assert.strictEqual(regRes.body.success, true);
    assert.ok(regRes.body.data.peerAgeConfirmedAt);
  });

  /* -------------------------------------------------------------
   * P0-1: ACCOUNT MERGE AUTH BYPASS TESTS
   * ------------------------------------------------------------- */

  it("P0-1: should reject createMergeIntent when caller is not anonymous", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    const res = await request(app)
      .post("/api/v1/account/merge-intents")
      .set("Authorization", "Bearer valid-registered-token")
      .set("x-installation-id", VALID_INSTALL_ID_1);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, "ANONYMOUS_IDENTITY_REQUIRED");
  });

  it("P0-1: should allow anonymous caller to create merge intent with valid installation ID", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    const res = await request(app)
      .post("/api/v1/account/merge-intents")
      .set("Authorization", "Bearer valid-anonymous-token")
      .set("x-installation-id", VALID_INSTALL_ID_1);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.mergeIntentId);
  });

  it("P0-1: should reject completeMerge when caller is still anonymous (Auth Bypass Prevention)", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    // 1. Anonymous creates intent
    const intentRes = await request(app)
      .post("/api/v1/account/merge-intents")
      .set("Authorization", "Bearer valid-anonymous-token")
      .set("x-installation-id", VALID_INSTALL_ID_1);
    const { mergeIntentId } = intentRes.body.data;

    // 2. Anonymous tries to call completeMerge -> MUST BE REJECTED WITH 403
    const completeRes = await request(app)
      .post("/api/v1/account/complete-merge")
      .set("Authorization", "Bearer valid-anonymous-token-2")
      .send({ mergeIntentId });

    assert.strictEqual(completeRes.status, 403);
    assert.strictEqual(completeRes.body.error.code, "REGISTERED_IDENTITY_REQUIRED");
  });

  it("P0-1: should reject completeMerge when caller is not verified with google.com provider", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    // 1. Anonymous creates intent
    const intentRes = await request(app)
      .post("/api/v1/account/merge-intents")
      .set("Authorization", "Bearer valid-anonymous-token")
      .set("x-installation-id", VALID_INSTALL_ID_1);
    const { mergeIntentId } = intentRes.body.data;

    // 2. Caller authenticated via password provider instead of google.com
    const completeRes = await request(app)
      .post("/api/v1/account/complete-merge")
      .set("Authorization", "Bearer valid-non-google-token")
      .send({ mergeIntentId });

    assert.strictEqual(completeRes.status, 403);
    assert.strictEqual(completeRes.body.error.code, "REGISTERED_IDENTITY_REQUIRED");
  });

  it("P0-1: should reject completeMerge when target UID is identical to source UID (Case A link mismatch)", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    // 1. User with UID "firebase-uid-registered-google" has an intent with same UID
    const intent = await prisma.mergeIntent.create({
      data: {
        sourceFirebaseUid: "firebase-uid-registered-google",
        installationId: VALID_INSTALL_ID_1,
        expiresAt: new Date(Date.now() + 600000),
      },
    });

    // 2. Same UID attempts Case B completeMerge -> Must reject with 400
    const res = await request(app)
      .post("/api/v1/account/complete-merge")
      .set("Authorization", "Bearer valid-registered-token")
      .send({ mergeIntentId: intent.id });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, "INVALID_CASE_B_MERGE");
  });

  it("P0-1 & P1-1: should complete Case B merge for Google registered user idempotently and without deleting source user", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    // 1. Anonymous user A creates intent
    const intentRes = await request(app)
      .post("/api/v1/account/merge-intents")
      .set("Authorization", "Bearer valid-anonymous-token")
      .set("x-installation-id", VALID_INSTALL_ID_1);
    const { mergeIntentId } = intentRes.body.data;

    // 2. Google registered user B completes merge
    const mergeRes = await request(app)
      .post("/api/v1/account/complete-merge")
      .set("Authorization", "Bearer valid-registered-token")
      .send({ mergeIntentId });

    assert.strictEqual(mergeRes.status, 200);
    assert.strictEqual(mergeRes.body.success, true);
    assert.strictEqual(mergeRes.body.data.user.identityType, "REGISTERED");

    // P1-2: Source anonymous user row must be preserved as tombstone
    const sourceUserRow = await prisma.user.findUnique({
      where: { firebaseUid: "firebase-uid-anon-1" },
    });
    assert.ok(sourceUserRow, "Source anonymous user row must not be deleted");

    // 3. Replay idempotency: re-running complete merge returns current state safely
    const replayRes = await request(app)
      .post("/api/v1/account/complete-merge")
      .set("Authorization", "Bearer valid-registered-token")
      .send({ mergeIntentId });

    assert.strictEqual(replayRes.status, 200);
    assert.strictEqual(replayRes.body.data.alreadyMerged, true);
  });

  it("P1-1: should reject concurrent completeMerge from a different target with 409", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    // 1. Anonymous creates intent
    const intentRes = await request(app)
      .post("/api/v1/account/merge-intents")
      .set("Authorization", "Bearer valid-anonymous-token")
      .set("x-installation-id", VALID_INSTALL_ID_1);
    const { mergeIntentId } = intentRes.body.data;

    // 2. Target 1 claims and completes intent
    const res1 = await request(app)
      .post("/api/v1/account/complete-merge")
      .set("Authorization", "Bearer valid-registered-token")
      .send({ mergeIntentId });
    assert.strictEqual(res1.status, 200);

    // 3. Target 2 tries to claim the same already-claimed intent
    const res2 = await request(app)
      .post("/api/v1/account/complete-merge")
      .set("Authorization", "Bearer valid-registered-token-2")
      .send({ mergeIntentId });

    assert.strictEqual(res2.status, 409);
    assert.strictEqual(res2.body.error.code, "MERGE_INTENT_ALREADY_USED");
  });

  it("P1-3: should preserve guest trial usage strictly by installationId across different anonymous UIDs", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });

    // User A records 40s of usage under VALID_INSTALL_ID_1
    await prisma.usageLedger.create({
      data: {
        firebaseUid: "firebase-uid-anon-1",
        installationId: VALID_INSTALL_ID_1,
        type: "AI",
        sessionId: "test-session-1",
        billableSeconds: 40,
        planAtTime: "FREE",
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    // Anonymous User 2 boots with the same installationId
    const res = await request(app)
      .put("/api/v1/me")
      .set("Authorization", "Bearer valid-anonymous-token-2")
      .set("x-installation-id", VALID_INSTALL_ID_1);

    assert.strictEqual(res.status, 200);
    // Remaining guest AI should be 120 - 40 = 80 seconds
    assert.strictEqual(res.body.data.entitlements.remainingAiSeconds, 80);
  });
});


