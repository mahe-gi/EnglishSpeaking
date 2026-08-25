import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

describe("PUT /api/v1/onboarding", () => {
  const mockTokenVerifier = async (token: string) => {
    if (token === "valid-firebase-token") {
      return {
        uid: "firebase-uid-999",
        email: "learner@example.com",
        name: "Learner One",
      };
    }
    throw new Error("Invalid token");
  };

  const validPayload = {
    careerStatus: "JOB_SEEKER",
    goal: "JOB_INTERVIEWS",
    nativeLanguage: "TELUGU",
    confidence: 3,
  };

  it("should return 401 when Authorization header is missing", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app).put("/api/v1/onboarding").send(validPayload);

    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 401 when token is invalid", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/onboarding")
      .set("Authorization", "Bearer invalid-token")
      .send(validPayload);

    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 400 when careerStatus is missing", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/onboarding")
      .set("Authorization", "Bearer valid-firebase-token")
      .send({
        goal: "JOB_INTERVIEWS",
        nativeLanguage: "TELUGU",
        confidence: 3,
      });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
    assert.strictEqual(response.body.error.code, "INVALID_REQUEST");
  });

  it("should return 400 when goal is invalid enum", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/onboarding")
      .set("Authorization", "Bearer valid-firebase-token")
      .send({
        ...validPayload,
        goal: "INVALID_GOAL",
      });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 400 when nativeLanguage is invalid enum", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/onboarding")
      .set("Authorization", "Bearer valid-firebase-token")
      .send({
        ...validPayload,
        nativeLanguage: "FRENCH",
      });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 400 when confidence is below 1", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/onboarding")
      .set("Authorization", "Bearer valid-firebase-token")
      .send({
        ...validPayload,
        confidence: 0,
      });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 400 when confidence is above 5", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/onboarding")
      .set("Authorization", "Bearer valid-firebase-token")
      .send({
        ...validPayload,
        confidence: 6,
      });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 400 when confidence is not an integer", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/onboarding")
      .set("Authorization", "Bearer valid-firebase-token")
      .send({
        ...validPayload,
        confidence: 3.5,
      });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 400 when unexpected extra fields are provided", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app)
      .put("/api/v1/onboarding")
      .set("Authorization", "Bearer valid-firebase-token")
      .send({
        ...validPayload,
        hackedField: "malicious_injection",
      });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
  });

  it("should return 200 and persist profile when payload is valid", async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalUpsert = prisma.profile.upsert;

    prisma.user.findUnique = (async () => {
      return {
        id: "user-cuid-1",
        firebaseUid: "firebase-uid-999",
        email: "learner@example.com",
        name: "Learner One",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }) as unknown as typeof prisma.user.findUnique;

    prisma.profile.upsert = (async (args: { where: { userId: string }; create: { userId: string; careerStatus: string; goal: string; nativeLanguage: string; confidence: number } }) => {
      return {
        id: "profile-cuid-1",
        userId: args.where.userId,
        careerStatus: args.create.careerStatus,
        goal: args.create.goal,
        nativeLanguage: args.create.nativeLanguage,
        confidence: args.create.confidence,
        baselineScore: null,
        currentScore: null,
        weaknesses: null,
        totalSpeakingSeconds: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }) as unknown as typeof prisma.profile.upsert;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .put("/api/v1/onboarding")
        .set("Authorization", "Bearer valid-firebase-token")
        .send(validPayload);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.data.profile.careerStatus, "JOB_SEEKER");
      assert.strictEqual(response.body.data.profile.goal, "JOB_INTERVIEWS");
      assert.strictEqual(response.body.data.profile.nativeLanguage, "TELUGU");
      assert.strictEqual(response.body.data.profile.confidence, 3);
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.profile.upsert = originalUpsert;
    }
  });

  it("updates an existing profile on repeated PUT", async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalUpsert = prisma.profile.upsert;

    prisma.user.findUnique = (async () => {
      return {
        id: "user-cuid-1",
        firebaseUid: "firebase-uid-999",
        email: "learner@example.com",
        name: "Learner One",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }) as unknown as typeof prisma.user.findUnique;

    let storedGoal = "JOB_INTERVIEWS";
    prisma.profile.upsert = (async (args: { where: { userId: string }; update: { goal?: string }; create: { goal: string } }) => {
      if (args.update?.goal) {
        storedGoal = args.update.goal;
      } else {
        storedGoal = args.create.goal;
      }
      return {
        id: "profile-cuid-1",
        userId: args.where.userId,
        careerStatus: "JOB_SEEKER",
        goal: storedGoal,
        nativeLanguage: "TELUGU",
        confidence: 3,
        baselineScore: null,
        currentScore: null,
        weaknesses: null,
        totalSpeakingSeconds: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }) as unknown as typeof prisma.profile.upsert;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });

      const res1 = await request(app)
        .put("/api/v1/onboarding")
        .set("Authorization", "Bearer valid-firebase-token")
        .send({
          careerStatus: "JOB_SEEKER",
          goal: "JOB_INTERVIEWS",
          nativeLanguage: "TELUGU",
          confidence: 3,
        });

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.body.data.profile.goal, "JOB_INTERVIEWS");

      const res2 = await request(app)
        .put("/api/v1/onboarding")
        .set("Authorization", "Bearer valid-firebase-token")
        .send({
          careerStatus: "JOB_SEEKER",
          goal: "WORKPLACE_CONVERSATIONS",
          nativeLanguage: "TELUGU",
          confidence: 3,
        });

      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.body.data.profile.goal, "WORKPLACE_CONVERSATIONS");
      assert.strictEqual(res1.body.data.profile.id, res2.body.data.profile.id);
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.profile.upsert = originalUpsert;
    }
  });

  it("should return 404 if user has not been initialized yet", async () => {
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .put("/api/v1/onboarding")
        .set("Authorization", "Bearer valid-firebase-token")
        .send(validPayload);

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.body.success, false);
      assert.strictEqual(response.body.error.code, "USER_NOT_FOUND");
    } finally {
      prisma.user.findUnique = originalFindUnique;
    }
  });
});
