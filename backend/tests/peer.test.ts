import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { DecodedIdToken } from "firebase-admin/auth";
import { getUpcomingPeerSlots } from "../src/modules/peer/peer-slots.js";

const mockTokenVerifier = async (token: string): Promise<DecodedIdToken> => {
  if (token === "token-user-1") {
    return { uid: "fb-uid-1", email: "user1@example.com", name: "User 1" } as DecodedIdToken;
  }
  if (token === "token-user-2") {
    return { uid: "fb-uid-2", email: "user2@example.com", name: "User 2" } as DecodedIdToken;
  }
  if (token === "token-user-3") {
    return { uid: "fb-uid-3", email: "user3@example.com", name: "User 3" } as DecodedIdToken;
  }
  throw new Error("Invalid token");
};

const mockPeerTokenGenerator = async (params: { matchId: string; role: "A" | "B" }) => {
  return {
    serverUrl: "wss://livekit.example.com",
    participantToken: `jwt-token-for-${params.matchId}-${params.role}`,
    roomName: `peer_${params.matchId}`,
    participantIdentity: `peer_${params.matchId}_${params.role.toLowerCase()}`,
  };
};

describe("Peer Practice Module", () => {
  const futureSlot = getUpcomingPeerSlots()[0]!.startAt;

  describe("GET /api/v1/peer/slots", () => {
    it("should return 401 when Authorization header is missing", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app).get("/api/v1/peer/slots");

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.body.error.code, "UNAUTHORIZED");
    });

    it("should return upcoming selectable peer practice slots", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      prisma.user.findUnique = (async () => ({
        id: "u-1",
        firebaseUid: "fb-uid-1",
        profile: { baselineScore: 80, goal: "JOB_INTERVIEWS" },
      })) as unknown as typeof prisma.user.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .get("/api/v1/peer/slots")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert(Array.isArray(response.body.data.slots));
        assert(response.body.data.slots.length > 0);
        assert.strictEqual(response.body.data.slots[0].durationMinutes, 15);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
      }
    });
  });

  describe("POST /api/v1/peer/availability", () => {
    it("should return 409 ASSESSMENT_REQUIRED if user has not completed baseline", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      prisma.user.findUnique = (async () => ({
        id: "u-1",
        firebaseUid: "fb-uid-1",
        profile: { baselineScore: null, goal: "JOB_INTERVIEWS" },
      })) as unknown as typeof prisma.user.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/availability")
          .set("Authorization", "Bearer token-user-1")
          .send({ startAt: futureSlot });

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.error.code, "ASSESSMENT_REQUIRED");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
      }
    });

    it("should return 400 INVALID_SLOT if startAt is in the past or invalid", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      prisma.user.findUnique = (async () => ({
        id: "u-1",
        firebaseUid: "fb-uid-1",
        profile: { baselineScore: 80, goal: "JOB_INTERVIEWS" },
      })) as unknown as typeof prisma.user.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/availability")
          .set("Authorization", "Bearer token-user-1")
          .send({ startAt: "2020-01-01T10:00:00.000Z" });

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.error.code, "INVALID_SLOT");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
      }
    });

    it("should return 400 INVALID_SLOT if startAt has valid IST hour but is outside published 3-day catalog", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      prisma.user.findUnique = (async () => ({
        id: "u-1",
        firebaseUid: "fb-uid-1",
        profile: { baselineScore: 80, goal: "JOB_INTERVIEWS" },
      })) as unknown as typeof prisma.user.findUnique;

      // 30 days ahead at 18:00 IST (12:30 UTC)
      const distantFuture = new Date();
      distantFuture.setDate(distantFuture.getDate() + 30);
      distantFuture.setUTCHours(12, 30, 0, 0);

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/availability")
          .set("Authorization", "Bearer token-user-1")
          .send({ startAt: distantFuture.toISOString() });

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.error.code, "INVALID_SLOT");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
      }
    });

    it("should return WAITING status for first user booking a slot", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstMatch = prisma.peerMatch.findFirst;
      const originalTransaction = prisma.$transaction;

      prisma.user.findUnique = (async () => ({
        id: "u-1",
        firebaseUid: "fb-uid-1",
        profile: { baselineScore: 80, goal: "JOB_INTERVIEWS", careerStatus: "JOB_SEEKER" },
      })) as unknown as typeof prisma.user.findUnique;

      prisma.peerMatch.findFirst = (async () => null) as unknown as typeof prisma.peerMatch.findFirst;

      prisma.$transaction = (async (cb: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          peerAvailability: {
            findUnique: async () => null,
            findMany: async () => [], // No candidate
            upsert: async () => ({
              id: "avail-1",
              userId: "u-1",
              startsAt: new Date(futureSlot),
              status: "AVAILABLE",
            }),
          },
          peerMatch: {
            findFirst: async () => null,
          },
          block: {
            findFirst: async () => null,
          },
        };
        return cb(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/availability")
          .set("Authorization", "Bearer token-user-1")
          .send({ startAt: futureSlot });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.status, "WAITING");
        assert.strictEqual(response.body.data.availability.id, "avail-1");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerMatch.findFirst = originalFindFirstMatch;
        prisma.$transaction = originalTransaction;
      }
    });

    it("should match second eligible user with first user and create PeerMatch", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstMatch = prisma.peerMatch.findFirst;
      const originalTransaction = prisma.$transaction;

      prisma.user.findUnique = (async () => ({
        id: "u-2",
        firebaseUid: "fb-uid-2",
        profile: { baselineScore: 85, goal: "JOB_INTERVIEWS", careerStatus: "JOB_SEEKER" },
      })) as unknown as typeof prisma.user.findUnique;

      prisma.peerMatch.findFirst = (async () => null) as unknown as typeof prisma.peerMatch.findFirst;

      let peerMatchCreated = false;
      prisma.$transaction = (async (cb: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          peerAvailability: {
            findUnique: async () => null,
            findMany: async () => [
              {
                id: "avail-1",
                userId: "u-1",
                createdAt: new Date("2026-08-25T10:00:00Z"),
                user: {
                  id: "u-1",
                  profile: { baselineScore: 80, goal: "JOB_INTERVIEWS", careerStatus: "JOB_SEEKER" },
                },
              },
            ],
            updateMany: async () => ({ count: 1 }),
            upsert: async () => ({ id: "avail-2", status: "MATCHED" }),
          },
          block: {
            findFirst: async () => null, // No block
          },
          peerMatch: {
            create: async (args: { data: { userAId: string; userBId: string; startsAt: Date } }) => {
              peerMatchCreated = true;
              return {
                id: "match-123",
                userAId: args.data.userAId,
                userBId: args.data.userBId,
                startsAt: args.data.startsAt,
                status: "SCHEDULED",
                livekitRoom: "peer_match_123",
              };
            },
            findFirst: async () => null,
          },
        };
        return cb(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/availability")
          .set("Authorization", "Bearer token-user-2")
          .send({ startAt: futureSlot });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.status, "MATCHED");
        assert.strictEqual(response.body.data.match.id, "match-123");
        assert.strictEqual(response.body.data.match.role, "B"); // User 2 is Learner B
        assert.strictEqual(response.body.data.match.partner.label, "Practice Partner");
        assert.strictEqual(peerMatchCreated, true);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerMatch.findFirst = originalFindFirstMatch;
        prisma.$transaction = originalTransaction;
      }
    });

    it("should NOT match users if either user has blocked the other (bidirectional block check)", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstMatch = prisma.peerMatch.findFirst;
      const originalTransaction = prisma.$transaction;

      prisma.user.findUnique = (async () => ({
        id: "u-2",
        firebaseUid: "fb-uid-2",
        profile: { baselineScore: 85, goal: "JOB_INTERVIEWS", careerStatus: "JOB_SEEKER" },
      })) as unknown as typeof prisma.user.findUnique;

      prisma.peerMatch.findFirst = (async () => null) as unknown as typeof prisma.peerMatch.findFirst;

      prisma.$transaction = (async (cb: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          peerAvailability: {
            findUnique: async () => null,
            findMany: async () => [
              {
                id: "avail-1",
                userId: "u-1",
                createdAt: new Date("2026-08-25T10:00:00Z"),
                user: {
                  id: "u-1",
                  profile: { baselineScore: 80, goal: "JOB_INTERVIEWS", careerStatus: "JOB_SEEKER" },
                },
              },
            ],
            upsert: async () => ({
              id: "avail-2",
              userId: "u-2",
              startsAt: new Date(futureSlot),
              status: "AVAILABLE",
            }),
          },
          block: {
            // Block exists between u-1 and u-2
            findFirst: async () => ({ id: "block-1", blockerId: "u-1", blockedUserId: "u-2" }),
          },
          peerMatch: {
            findFirst: async () => null,
          },
        };
        return cb(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/availability")
          .set("Authorization", "Bearer token-user-2")
          .send({ startAt: futureSlot });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.status, "WAITING"); // Stays waiting because candidate was blocked!
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerMatch.findFirst = originalFindFirstMatch;
        prisma.$transaction = originalTransaction;
      }
    });
  });

  describe("POST /api/v1/peer/matches/:id/token", () => {
    it("should return 404 if match is not found or user is not a participant", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindUniqueMatch = prisma.peerMatch.findUnique;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;
      prisma.peerMatch.findUnique = (async () => null) as unknown as typeof prisma.peerMatch.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/matches/unknown-match/token")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, "MATCH_NOT_FOUND");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerMatch.findUnique = originalFindUniqueMatch;
      }
    });

    it("should return 409 PEER_JOIN_WINDOW_CLOSED if current time is outside join window", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindUniqueMatch = prisma.peerMatch.findUnique;
      const originalFindFirstBlock = prisma.block.findFirst;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;

      // Match starts in 2 hours (well outside 5-minute pre-window)
      const twoHoursAhead = new Date(Date.now() + 2 * 60 * 60 * 1000);
      prisma.peerMatch.findUnique = (async () => ({
        id: "match-future",
        userAId: "u-1",
        userBId: "u-2",
        startsAt: twoHoursAhead,
        status: "SCHEDULED",
      })) as unknown as typeof prisma.peerMatch.findUnique;

      prisma.block.findFirst = (async () => null) as unknown as typeof prisma.block.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/matches/match-future/token")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.error.code, "PEER_JOIN_WINDOW_CLOSED");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerMatch.findUnique = originalFindUniqueMatch;
        prisma.block.findFirst = originalFindFirstBlock;
      }
    });

    it("should generate and return LiveKit participant token when inside join window", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindUniqueMatch = prisma.peerMatch.findUnique;
      const originalFindFirstBlock = prisma.block.findFirst;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;

      // Match starts right now (inside window: -5m to +10m)
      const nowSlot = new Date(Date.now() + 60 * 1000); // 1 min from now
      prisma.peerMatch.findUnique = (async () => ({
        id: "match-now-1",
        userAId: "u-1",
        userBId: "u-2",
        startsAt: nowSlot,
        status: "SCHEDULED",
      })) as unknown as typeof prisma.peerMatch.findUnique;

      prisma.block.findFirst = (async () => null) as unknown as typeof prisma.block.findFirst;

      try {
        const app = createApp({
          tokenVerifier: mockTokenVerifier,
          peerTokenGenerator: mockPeerTokenGenerator,
        });
        const response = await request(app)
          .post("/api/v1/peer/matches/match-now-1/token")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(response.body.data.serverUrl, "wss://livekit.example.com");
        assert.strictEqual(response.body.data.participantToken, "jwt-token-for-match-now-1-A");
        assert.strictEqual(response.body.data.match.role, "A");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerMatch.findUnique = originalFindUniqueMatch;
        prisma.block.findFirst = originalFindFirstBlock;
      }
    });
  });

  describe("Moderation Actions: Report and Block", () => {
    it("should allow reporting partner from a match", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindUniqueMatch = prisma.peerMatch.findUnique;
      const originalCreateReport = prisma.report.create;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;
      prisma.peerMatch.findUnique = (async () => ({
        id: "match-mod-1",
        userAId: "u-1",
        userBId: "u-2",
        startsAt: new Date(),
        status: "ACTIVE",
      })) as unknown as typeof prisma.peerMatch.findUnique;

      let reportCreatedAgainst = "";
      prisma.report.create = (async (args: { data: { reportedUserId: string; reason: string } }) => {
        reportCreatedAgainst = args.data.reportedUserId;
        return { id: "rep-1" };
      }) as unknown as typeof prisma.report.create;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/matches/match-mod-1/report")
          .set("Authorization", "Bearer token-user-1")
          .send({ reason: "HARASSMENT", details: "Inappropriate behavior." });

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(reportCreatedAgainst, "u-2");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerMatch.findUnique = originalFindUniqueMatch;
        prisma.report.create = originalCreateReport;
      }
    });

    it("should allow blocking partner idempotently from a match", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindUniqueMatch = prisma.peerMatch.findUnique;
      const originalUpsertBlock = prisma.block.upsert;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;
      prisma.peerMatch.findUnique = (async () => ({
        id: "match-mod-1",
        userAId: "u-1",
        userBId: "u-2",
        startsAt: new Date(),
        status: "ACTIVE",
      })) as unknown as typeof prisma.peerMatch.findUnique;

      let blockedUser = "";
      prisma.block.upsert = (async (args: { create: { blockedUserId: string } }) => {
        blockedUser = args.create.blockedUserId;
        return { id: "blk-1" };
      }) as unknown as typeof prisma.block.upsert;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/peer/matches/match-mod-1/block")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(blockedUser, "u-2");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerMatch.findUnique = originalFindUniqueMatch;
        prisma.block.upsert = originalUpsertBlock;
      }
    });
  });

  describe("DELETE /api/v1/peer/availability/:id", () => {
    it("should return 401 when Authorization header is missing", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app).delete("/api/v1/peer/availability/avail-1");

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.body.error.code, "UNAUTHORIZED");
    });

    it("should atomically cancel availability when status is AVAILABLE (count === 1)", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalUpdateMany = prisma.peerAvailability.updateMany;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;
      prisma.peerAvailability.updateMany = (async () => ({ count: 1 })) as unknown as typeof prisma.peerAvailability.updateMany;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .delete("/api/v1/peer/availability/avail-1")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerAvailability.updateMany = originalUpdateMany;
      }
    });

    it("should return 409 MATCHED_CANNOT_CANCEL_AVAILABILITY when candidate was concurrently matched (count === 0, status is MATCHED)", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalUpdateMany = prisma.peerAvailability.updateMany;
      const originalFindUniqueAvail = prisma.peerAvailability.findUnique;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;
      // updateMany returns count 0 because matching concurrently claimed it to MATCHED
      prisma.peerAvailability.updateMany = (async () => ({ count: 0 })) as unknown as typeof prisma.peerAvailability.updateMany;
      prisma.peerAvailability.findUnique = (async () => ({
        id: "avail-1",
        userId: "u-1",
        status: "MATCHED",
      })) as unknown as typeof prisma.peerAvailability.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .delete("/api/v1/peer/availability/avail-1")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.error.code, "MATCHED_CANNOT_CANCEL_AVAILABILITY");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerAvailability.updateMany = originalUpdateMany;
        prisma.peerAvailability.findUnique = originalFindUniqueAvail;
      }
    });

    it("should return 200 idempotently if slot was already CANCELLED (count === 0, status is CANCELLED)", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalUpdateMany = prisma.peerAvailability.updateMany;
      const originalFindUniqueAvail = prisma.peerAvailability.findUnique;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;
      prisma.peerAvailability.updateMany = (async () => ({ count: 0 })) as unknown as typeof prisma.peerAvailability.updateMany;
      prisma.peerAvailability.findUnique = (async () => ({
        id: "avail-1",
        userId: "u-1",
        status: "CANCELLED",
      })) as unknown as typeof prisma.peerAvailability.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .delete("/api/v1/peer/availability/avail-1")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerAvailability.updateMany = originalUpdateMany;
        prisma.peerAvailability.findUnique = originalFindUniqueAvail;
      }
    });

    it("should return 404 if availability slot does not exist", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalUpdateMany = prisma.peerAvailability.updateMany;
      const originalFindUniqueAvail = prisma.peerAvailability.findUnique;

      prisma.user.findUnique = (async () => ({ id: "u-1", firebaseUid: "fb-uid-1" })) as unknown as typeof prisma.user.findUnique;
      prisma.peerAvailability.updateMany = (async () => ({ count: 0 })) as unknown as typeof prisma.peerAvailability.updateMany;
      prisma.peerAvailability.findUnique = (async () => null) as unknown as typeof prisma.peerAvailability.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .delete("/api/v1/peer/availability/non-existent-avail")
          .set("Authorization", "Bearer token-user-1");

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, "AVAILABILITY_NOT_FOUND");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.peerAvailability.updateMany = originalUpdateMany;
        prisma.peerAvailability.findUnique = originalFindUniqueAvail;
      }
    });
  });
});
