import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { prisma } from "../src/lib/prisma.js";
import { calculateEntitlements, getTimezoneBoundaries } from "../src/modules/users/entitlement.service.js";
import { completeMerge, createMergeIntent } from "../src/modules/users/account-merge.service.js";

const VALID_INSTALL_ID = "33333333-3333-4333-8333-333333333333";
const VALID_INSTALL_ID_2 = "44444444-4444-4444-8444-444444444444";

describe("Ntalo V2 Entitlement & Anti-Abuse Calculations", () => {
  beforeEach(async () => {
    await prisma.mergeIntent.deleteMany();
    await prisma.usageLedger.deleteMany();
    await prisma.voiceSession.deleteMany();
    await prisma.user.deleteMany();
  });

  it("should calculate correct timezone boundaries in Asia/Kolkata", () => {
    const testDate = new Date("2026-08-26T12:00:00.000Z");
    const { dayStart, monthStart } = getTimezoneBoundaries("Asia/Kolkata", testDate);

    // In Asia/Kolkata (UTC+5:30), 2026-08-26 00:00 IST is 2026-08-25 18:30:00 UTC
    assert.strictEqual(dayStart.toISOString(), "2026-08-25T18:30:00.000Z");
    // Month start: 2026-08-01 00:00 IST is 2026-07-31 18:30:00 UTC
    assert.strictEqual(monthStart.toISOString(), "2026-07-31T18:30:00.000Z");
  });

  it("should enforce guest trial limit per installationId", async () => {
    const installId = VALID_INSTALL_ID;
    const anonUser = await prisma.user.create({
      data: {
        firebaseUid: "anon-uid-1",
        identityType: "ANONYMOUS",
        plan: "FREE",
      },
    });

    // 0 usage: full 120s
    const ent0 = await calculateEntitlements(anonUser, installId);
    assert.strictEqual(ent0.remainingAiSeconds, 120);
    assert.strictEqual(ent0.peerAllowed, false);

    // Record 75s of usage under this installId
    await prisma.usageLedger.create({
      data: {
        firebaseUid: "anon-uid-1",
        installationId: installId,
        type: "AI",
        sessionId: "sess-1",
        billableSeconds: 75,
        planAtTime: "FREE",
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    const ent1 = await calculateEntitlements(anonUser, installId);
    assert.strictEqual(ent1.remainingAiSeconds, 45); // 120 - 75 = 45

    // New anonymous user on same installationId gets same remaining trial (anti-abuse)
    const anonUser2 = await prisma.user.create({
      data: {
        firebaseUid: "anon-uid-2",
        identityType: "ANONYMOUS",
        plan: "FREE",
      },
    });

    const ent2 = await calculateEntitlements(anonUser2, installId);
    assert.strictEqual(ent2.remainingAiSeconds, 45);
  });

  it("should NOT double-count reassigned guest usage after existing account merge", async () => {
    const installId = VALID_INSTALL_ID_2;

    // 1. Anonymous user A consumes 50s of guest trial
    const anonUser = await prisma.user.create({
      data: {
        firebaseUid: "anon-merge-uid",
        identityType: "ANONYMOUS",
        plan: "FREE",
      },
    });

    await prisma.usageLedger.create({
      data: {
        firebaseUid: "anon-merge-uid",
        userId: anonUser.id,
        installationId: installId,
        type: "AI",
        sessionId: "guest-sess-1",
        billableSeconds: 50,
        planAtTime: "FREE",
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });

    // 2. Anonymous user creates merge intent
    const { mergeIntentId } = await createMergeIntent(
      { uid: "anon-merge-uid", isAnonymous: true },
      installId
    );

    // 3. User merges with existing registered Google user B
    const registeredAuth = {
      uid: "registered-google-uid",
      email: "learner.google@example.com",
      name: "Google Learner",
      isAnonymous: false,
      signInProvider: "google.com",
    };

    const mergeResult = await completeMerge(registeredAuth, mergeIntentId, installId);
    assert.strictEqual(mergeResult.success, true);
    assert.strictEqual(mergeResult.user.identityType, "REGISTERED");

    // 4. Registered user entitlement must count 50s used once (120 - 50 = 70s remaining)
    // NOT double counted as (120 - 50 - 50 = 20s)
    const registeredEntitlements = await calculateEntitlements(mergeResult.user, installId);
    assert.strictEqual(registeredEntitlements.remainingAiSeconds, 70);
    assert.strictEqual(registeredEntitlements.productState, "FREE");
    assert.strictEqual(registeredEntitlements.peerAllowed, true);
  });

  it("should ignore expired VoiceSession reservations and count unexpired reservations", async () => {
    const installId = VALID_INSTALL_ID;
    const anonUser = await prisma.user.create({
      data: {
        firebaseUid: "anon-reservations-uid",
        identityType: "ANONYMOUS",
        plan: "FREE",
      },
    });

    // 1. Create a stale expired reservation (expired 2 minutes ago)
    await prisma.voiceSession.create({
      data: {
        firebaseUid: "anon-reservations-uid",
        installationId: installId,
        allowedSeconds: 120,
        reservedSeconds: 60,
        status: "CREATED",
        reservationExpiresAt: new Date(Date.now() - 120000),
      },
    });

    // Stale expired reservation should NOT consume trial seconds (remains 120s)
    const entExpired = await calculateEntitlements(anonUser, installId);
    assert.strictEqual(entExpired.remainingAiSeconds, 120);

    // 2. Create an active unexpired reservation (expires in 5 minutes)
    await prisma.voiceSession.create({
      data: {
        firebaseUid: "anon-reservations-uid",
        installationId: installId,
        allowedSeconds: 120,
        reservedSeconds: 50,
        status: "CONNECTING",
        reservationExpiresAt: new Date(Date.now() + 300000),
      },
    });

    // Active unexpired reservation DOES hold 50s (120 - 50 = 70s remaining)
    const entUnexpired = await calculateEntitlements(anonUser, installId);
    assert.strictEqual(entUnexpired.remainingAiSeconds, 70);
  });

  it("should ensure VoiceSession startedAt is nullable on creation and set only on ACTIVE", async () => {
    const session = await prisma.voiceSession.create({
      data: {
        firebaseUid: "test-voice-uid",
        allowedSeconds: 120,
        reservedSeconds: 120,
        status: "CREATED",
      },
    });

    assert.strictEqual(session.status, "CREATED");
    assert.strictEqual(session.startedAt, null);
    assert.strictEqual(session.endedAt, null);

    // Transition to ACTIVE sets startedAt
    const activeSession = await prisma.voiceSession.update({
      where: { id: session.id },
      data: {
        status: "ACTIVE",
        startedAt: new Date(),
      },
    });

    assert.strictEqual(activeSession.status, "ACTIVE");
    assert.ok(activeSession.startedAt);
  });
});

