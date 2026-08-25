import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

describe("PUT /api/v1/me", () => {
  const mockTokenVerifier = async (token: string) => {
    if (token === "valid-firebase-token") {
      return {
        uid: "firebase-uid-999",
        email: "learner@example.com",
        name: "Learner One",
        picture: "https://example.com/avatar.png",
      };
    }
    if (token === "no-email-token") {
      return {
        uid: "firebase-uid-no-email",
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

  it("should return 401 when token is invalid", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/me")
      .set("Authorization", "Bearer bad-token");

    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 400 when email claim is missing from auth token", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/me")
      .set("Authorization", "Bearer no-email-token");

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
    assert.strictEqual(response.body.error.code, "EMAIL_REQUIRED");
  });

  it("should return 200 with user, onboardingCompleted: false, assessmentCompleted: false for new user", async () => {
    const originalUpsert = prisma.user.upsert;
    prisma.user.upsert = (async (args: { where: { firebaseUid: string }; create: { firebaseUid: string; email: string; name?: string | null; avatarUrl?: string | null } }) => {
      return {
        id: "user-cuid-1",
        firebaseUid: args.where.firebaseUid,
        email: args.create.email,
        name: args.create.name || null,
        avatarUrl: args.create.avatarUrl || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: null,
        practiceSessions: [],
      };
    }) as unknown as typeof prisma.user.upsert;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .put("/api/v1/me")
        .set("Authorization", "Bearer valid-firebase-token");

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.data.user.firebaseUid, "firebase-uid-999");
      assert.strictEqual(response.body.data.user.email, "learner@example.com");
      assert.strictEqual(response.body.data.user.name, "Learner One");
      assert.strictEqual(response.body.data.onboardingCompleted, false);
      assert.strictEqual(response.body.data.assessmentCompleted, false);
      assert.strictEqual(response.body.data.baselineAssessmentId, null);
    } finally {
      prisma.user.upsert = originalUpsert;
    }
  });

  it("should return onboardingCompleted: true and assessmentCompleted: true when baselineScore is present", async () => {
    const originalUpsert = prisma.user.upsert;
    prisma.user.upsert = (async (args: { where: { firebaseUid: string }; create: { firebaseUid: string; email: string; name?: string | null; avatarUrl?: string | null } }) => {
      return {
        id: "user-cuid-1",
        firebaseUid: args.where.firebaseUid,
        email: args.create.email,
        name: args.create.name || null,
        avatarUrl: args.create.avatarUrl || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: {
          id: "profile-1",
          userId: "user-cuid-1",
          careerStatus: "JOB_SEEKER",
          goal: "JOB_INTERVIEWS",
          nativeLanguage: "TELUGU",
          confidence: 3,
          baselineScore: 78,
          currentScore: 78,
        },
        practiceSessions: [
          {
            id: "session-baseline-1",
            type: "ASSESSMENT",
            status: "COMPLETED",
          },
        ],
      };
    }) as unknown as typeof prisma.user.upsert;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .put("/api/v1/me")
        .set("Authorization", "Bearer valid-firebase-token");

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.data.onboardingCompleted, true);
      assert.strictEqual(response.body.data.assessmentCompleted, true);
      assert.strictEqual(response.body.data.baselineAssessmentId, "session-baseline-1");
    } finally {
      prisma.user.upsert = originalUpsert;
    }
  });

  it("should be idempotent when called repeatedly", async () => {
    let callCount = 0;
    const originalUpsert = prisma.user.upsert;
    prisma.user.upsert = (async () => {
      callCount++;
      return {
        id: "user-cuid-1",
        firebaseUid: "firebase-uid-999",
        email: "learner@example.com",
        name: "Learner One",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: null,
        practiceSessions: [],
      };
    }) as unknown as typeof prisma.user.upsert;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      const res1 = await request(app)
        .put("/api/v1/me")
        .set("Authorization", "Bearer valid-firebase-token");
      const res2 = await request(app)
        .put("/api/v1/me")
        .set("Authorization", "Bearer valid-firebase-token");

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res1.body.data.user.id, res2.body.data.user.id);
      assert.strictEqual(callCount, 2);
    } finally {
      prisma.user.upsert = originalUpsert;
    }
  });
});
