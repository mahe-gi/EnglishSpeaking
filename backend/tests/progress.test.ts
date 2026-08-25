import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { DecodedIdToken } from "firebase-admin/auth";

const mockTokenVerifier = async (token: string): Promise<DecodedIdToken> => {
  if (token === "valid-firebase-token") {
    return {
      uid: "firebase-uid-999",
      email: "user@example.com",
      name: "Test Learner",
    } as DecodedIdToken;
  }
  throw new Error("Invalid token");
};

describe("Progress Module (GET /api/v1/progress)", () => {
  it("should return 401 when Authorization header is missing", async () => {
    const app = createApp({ tokenVerifier: mockTokenVerifier });
    const response = await request(app).get("/api/v1/progress");

    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.body.error.code, "UNAUTHORIZED");
  });

  it("should return 404 if user is not found", async () => {
    const originalFindUniqueUser = prisma.user.findUnique;
    prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .get("/api/v1/progress")
        .set("Authorization", "Bearer valid-firebase-token");

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.body.error.code, "USER_NOT_FOUND");
    } finally {
      prisma.user.findUnique = originalFindUniqueUser;
    }
  });

  it("should return empty progress state when user has no completed sessions", async () => {
    const originalFindUniqueUser = prisma.user.findUnique;
    const originalFindFirstSession = prisma.practiceSession.findFirst;
    const originalCountSessions = prisma.practiceSession.count;
    const originalAggregateUtterance = prisma.utterance.aggregate;
    const originalFindManySessions = prisma.practiceSession.findMany;

    prisma.user.findUnique = (async () => {
      return {
        id: "user-1",
        firebaseUid: "firebase-uid-999",
        profile: {
          careerStatus: "JOB_SEEKER",
          goal: "JOB_INTERVIEWS",
          baselineScore: null,
          weaknesses: null,
        },
      };
    }) as unknown as typeof prisma.user.findUnique;

    prisma.practiceSession.findFirst = (async () => null) as unknown as typeof prisma.practiceSession.findFirst;
    prisma.practiceSession.count = (async () => 0) as unknown as typeof prisma.practiceSession.count;
    prisma.utterance.aggregate = (async () => ({ _sum: { audioDurationMs: null } })) as unknown as typeof prisma.utterance.aggregate;
    prisma.practiceSession.findMany = (async () => []) as unknown as typeof prisma.practiceSession.findMany;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .get("/api/v1/progress")
        .set("Authorization", "Bearer valid-firebase-token");

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.data.baseline, null);
      assert.strictEqual(response.body.data.practice.completedSessions, 0);
      assert.strictEqual(response.body.data.practice.speakingSeconds, 0);
      assert.strictEqual(response.body.data.practice.speakingMinutes, 0);
      assert.strictEqual(response.body.data.practice.recentWpm, null);
      assert.strictEqual(response.body.data.practice.recentFillerPercentage, null);
      assert.deepStrictEqual(response.body.data.recentSessions, []);
    } finally {
      prisma.user.findUnique = originalFindUniqueUser;
      prisma.practiceSession.findFirst = originalFindFirstSession;
      prisma.practiceSession.count = originalCountSessions;
      prisma.utterance.aggregate = originalAggregateUtterance;
      prisma.practiceSession.findMany = originalFindManySessions;
    }
  });

  it("should aggregate baseline metrics from real Phase 2 schema and recent practice session history", async () => {
    const originalFindUniqueUser = prisma.user.findUnique;
    const originalFindFirstSession = prisma.practiceSession.findFirst;
    const originalCountSessions = prisma.practiceSession.count;
    const originalAggregateUtterance = prisma.utterance.aggregate;
    const originalFindManySessions = prisma.practiceSession.findMany;

    prisma.user.findUnique = (async () => {
      return {
        id: "user-1",
        firebaseUid: "firebase-uid-999",
        profile: {
          careerStatus: "JOB_SEEKER",
          goal: "JOB_INTERVIEWS",
          baselineScore: 78,
          weaknesses: ["Past tense verbs", "Structuring project narratives", "Filler words"],
        },
      };
    }) as unknown as typeof prisma.user.findUnique;

    // Real Phase 2 Baseline Assessment Report Shape: subScores are already 0-100
    prisma.practiceSession.findFirst = (async () => {
      return {
        id: "assessment-1",
        userId: "user-1",
        type: "ASSESSMENT",
        status: "COMPLETED",
        completedAt: new Date("2026-08-20T10:00:00Z"),
        metrics: {
          totalWordCount: 60,
          totalSpeakingSeconds: 30,
          averageWpm: 120,
          totalFillerCount: 3,
          aggregateFillerPercentage: 5.0,
          deliveryScore: 80,
          versionMetadata: {
            scoringVersion: "baseline-v1",
            metricsVersion: "speech-metrics-v1",
            rubricVersion: "assessment-rubric-v1",
            sttModel: "saaras:v4",
            llmModel: "sarvam-105b",
          },
        },
        feedback: {
          subScores: {
            delivery: 80,
            grammar: 80,
            structure: 60,
            vocabulary: 80,
            communication: 80,
            relevance: 100,
          },
          strengths: ["Clear technical articulation", "Good vocabulary"],
          weaknesses: ["Past tense verbs", "Structuring project narratives", "Filler words"],
          feedback: "Overall strong technical communication.",
          rubricVersion: "assessment-rubric-v1",
          llmModel: "sarvam-105b",
        },
        utterances: [
          { sequence: 1, wordCount: 20, audioDurationMs: 10000, fillerCount: 1 },
          { sequence: 2, wordCount: 20, audioDurationMs: 10000, fillerCount: 1 },
          { sequence: 3, wordCount: 20, audioDurationMs: 10000, fillerCount: 1 },
        ],
      };
    }) as unknown as typeof prisma.practiceSession.findFirst;

    prisma.practiceSession.count = (async () => 2) as unknown as typeof prisma.practiceSession.count;

    // Lifetime aggregate across all practice sessions: 90 seconds (90000ms)
    prisma.utterance.aggregate = (async () => ({
      _sum: { audioDurationMs: 90000 },
    })) as unknown as typeof prisma.utterance.aggregate;

    // 2 completed AI practice sessions:
    prisma.practiceSession.findMany = (async () => {
      return [
        {
          id: "session-p2",
          scenario: "recent-project-walkthrough",
          completedAt: new Date("2026-08-25T12:00:00Z"),
          utterances: [
            {
              sequence: 1,
              wordCount: 30,
              audioDurationMs: 15000,
              fillerCount: 0,
              metrics: {
                practiceFeedback: {
                  summary: "Good",
                  grammarIssues: [],
                  betterVersion: "Better",
                  focusArea: "CLARITY",
                  encouragement: "Great",
                  followUpQuestion: "Next",
                  sessionSummary: null,
                  versionMetadata: {
                    practicePromptVersion: "practice-turn-v1",
                    metricsVersion: "speech-metrics-v1",
                    sttModel: "saaras:v4",
                    llmModel: "sarvam-105b",
                  },
                },
              },
            },
            {
              sequence: 2,
              wordCount: 30,
              audioDurationMs: 15000,
              fillerCount: 1,
              metrics: {
                practiceFeedback: {
                  summary: "Good",
                  grammarIssues: [],
                  betterVersion: "Better",
                  focusArea: "CLARITY",
                  encouragement: "Great",
                  followUpQuestion: "Next",
                  sessionSummary: null,
                  versionMetadata: {
                    practicePromptVersion: "practice-turn-v1",
                    metricsVersion: "speech-metrics-v1",
                    sttModel: "saaras:v4",
                    llmModel: "sarvam-105b",
                  },
                },
              },
            },
            {
              sequence: 3,
              wordCount: 30,
              audioDurationMs: 15000,
              fillerCount: 0,
              metrics: {
                practiceFeedback: {
                  summary: "Good",
                  grammarIssues: [],
                  betterVersion: "Better",
                  focusArea: "CLARITY",
                  encouragement: "Great",
                  followUpQuestion: null,
                  sessionSummary: { strength: "Clear", nextPracticeSuggestion: "Pace" },
                  versionMetadata: {
                    practicePromptVersion: "practice-turn-v1",
                    metricsVersion: "speech-metrics-v1",
                    sttModel: "saaras:v4",
                    llmModel: "sarvam-105b",
                  },
                },
              },
            },
          ],
        },
        {
          id: "session-p1",
          scenario: "tell-me-about-yourself",
          completedAt: null, // Test null completedAt
          utterances: [
            {
              sequence: 1,
              wordCount: 30,
              audioDurationMs: 15000,
              fillerCount: 1,
              metrics: {
                practiceFeedback: {
                  summary: "Good",
                  grammarIssues: [],
                  betterVersion: "Better",
                  focusArea: "STRUCTURE",
                  encouragement: "Great",
                  followUpQuestion: "Next",
                  sessionSummary: null,
                  versionMetadata: {
                    practicePromptVersion: "practice-turn-v1",
                    metricsVersion: "speech-metrics-v1",
                    sttModel: "saaras:v4",
                    llmModel: "sarvam-105b",
                  },
                },
              },
            },
            {
              sequence: 2,
              wordCount: 30,
              audioDurationMs: 15000,
              fillerCount: 1,
              metrics: {
                practiceFeedback: {
                  summary: "Good",
                  grammarIssues: [],
                  betterVersion: "Better",
                  focusArea: "STRUCTURE",
                  encouragement: "Great",
                  followUpQuestion: "Next",
                  sessionSummary: null,
                  versionMetadata: {
                    practicePromptVersion: "practice-turn-v1",
                    metricsVersion: "speech-metrics-v1",
                    sttModel: "saaras:v4",
                    llmModel: "sarvam-105b",
                  },
                },
              },
            },
            {
              sequence: 3,
              wordCount: 30,
              audioDurationMs: 15000,
              fillerCount: 0,
              metrics: {
                practiceFeedback: "invalid-json", // Malformed turn feedback
              },
            },
          ],
        },
      ];
    }) as unknown as typeof prisma.practiceSession.findMany;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .get("/api/v1/progress")
        .set("Authorization", "Bearer valid-firebase-token");

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, true);

      // Baseline assertions
      assert.strictEqual(response.body.data.baseline.score, 78);
      assert.strictEqual(response.body.data.baseline.wpm, 120);
      assert.strictEqual(response.body.data.baseline.fillerPercentage, 5.0);
      assert.strictEqual(response.body.data.baseline.dimensions.delivery, 80);
      assert.strictEqual(response.body.data.baseline.dimensions.grammar, 80);
      assert.strictEqual(response.body.data.baseline.dimensions.structure, 60);
      assert.strictEqual(response.body.data.baseline.dimensions.relevance, 100);
      assert.strictEqual(response.body.data.baseline.weaknesses.length, 3);

      // Practice assertions
      assert.strictEqual(response.body.data.practice.completedSessions, 2);
      assert.strictEqual(response.body.data.practice.speakingSeconds, 90);
      assert.strictEqual(response.body.data.practice.speakingMinutes, 1.5);
      assert.strictEqual(response.body.data.practice.recentWpm, 120);
      assert.strictEqual(response.body.data.practice.recentFillerPercentage, 1.7);

      // Focus areas: CLARITY = 3, STRUCTURE = 2
      assert.strictEqual(response.body.data.focusAreas.CLARITY, 3);
      assert.strictEqual(response.body.data.focusAreas.STRUCTURE, 2);

      // Recent sessions list
      assert.strictEqual(response.body.data.recentSessions.length, 2);
      assert.strictEqual(response.body.data.recentSessions[0].id, "session-p2");
      assert.strictEqual(response.body.data.recentSessions[0].primaryFocusArea, "CLARITY");
      assert.strictEqual(response.body.data.recentSessions[1].id, "session-p1");
      assert.strictEqual(response.body.data.recentSessions[1].completedAt, null); // Null completedAt preserved
    } finally {
      prisma.user.findUnique = originalFindUniqueUser;
      prisma.practiceSession.findFirst = originalFindFirstSession;
      prisma.practiceSession.count = originalCountSessions;
      prisma.utterance.aggregate = originalAggregateUtterance;
      prisma.practiceSession.findMany = originalFindManySessions;
    }
  });

  it("should calculate lifetime speaking time correctly when user has 25 completed sessions", async () => {
    const originalFindUniqueUser = prisma.user.findUnique;
    const originalFindFirstSession = prisma.practiceSession.findFirst;
    const originalCountSessions = prisma.practiceSession.count;
    const originalAggregateUtterance = prisma.utterance.aggregate;
    const originalFindManySessions = prisma.practiceSession.findMany;

    prisma.user.findUnique = (async () => {
      return {
        id: "user-active-25",
        firebaseUid: "firebase-uid-999",
        profile: {
          careerStatus: "WORKING_PROFESSIONAL",
          goal: "TEAM_MEETINGS",
          baselineScore: 85,
        },
      };
    }) as unknown as typeof prisma.user.findUnique;

    prisma.practiceSession.findFirst = (async () => null) as unknown as typeof prisma.practiceSession.findFirst;

    // 25 completed sessions
    prisma.practiceSession.count = (async () => 25) as unknown as typeof prisma.practiceSession.count;

    // Aggregate across all 25 sessions: 25 * 60s = 1500s (1500000ms)
    prisma.utterance.aggregate = (async () => ({
      _sum: { audioDurationMs: 1500000 },
    })) as unknown as typeof prisma.utterance.aggregate;

    // findMany is limited to 20
    prisma.practiceSession.findMany = (async (args: { take?: number }) => {
      assert.strictEqual(args.take, 20);
      return Array.from({ length: 20 }, (_, i) => ({
        id: `session-${i}`,
        scenario: "recent-project-walkthrough",
        completedAt: new Date("2026-08-25T12:00:00Z"),
        utterances: [
          { sequence: 1, wordCount: 30, audioDurationMs: 20000, fillerCount: 0 },
          { sequence: 2, wordCount: 30, audioDurationMs: 20000, fillerCount: 0 },
          { sequence: 3, wordCount: 30, audioDurationMs: 20000, fillerCount: 0 },
        ],
      }));
    }) as unknown as typeof prisma.practiceSession.findMany;

    try {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .get("/api/v1/progress")
        .set("Authorization", "Bearer valid-firebase-token");

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.data.practice.completedSessions, 25);
      assert.strictEqual(response.body.data.practice.speakingSeconds, 1500); // Lifetime 25 sessions
      assert.strictEqual(response.body.data.practice.speakingMinutes, 25.0);
      // Recent WPM computed from the 20 fetched sessions: 20 * 90 words = 1800 words in 20 mins = 90 WPM
      assert.strictEqual(response.body.data.practice.recentWpm, 90);
      // Recent history capped at 10
      assert.strictEqual(response.body.data.recentSessions.length, 10);
    } finally {
      prisma.user.findUnique = originalFindUniqueUser;
      prisma.practiceSession.findFirst = originalFindFirstSession;
      prisma.practiceSession.count = originalCountSessions;
      prisma.utterance.aggregate = originalAggregateUtterance;
      prisma.practiceSession.findMany = originalFindManySessions;
    }
  });
});
