import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { DecodedIdToken } from "firebase-admin/auth";
import { PracticeTurnFeedback } from "../src/modules/practice/practice.schema.js";

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

const mockTranscriber = async (
  _buffer: Buffer,
  _mimeType: string
): Promise<{ transcript: string }> => {
  return {
    transcript: "I am a software engineer and I built a real-time communications app using Node and WebRTC.",
  };
};

const mockPracticeEvaluatorTurn1 = async (): Promise<PracticeTurnFeedback> => {
  return {
    summary: "Good structured overview of your background and technical skills.",
    grammarIssues: [
      {
        original: "I am work on",
        correction: "I worked on",
        explanation: "Use past tense for completed work.",
      },
    ],
    betterVersion: "I am a software engineer with expertise in building real-time applications using Node.js and WebRTC.",
    focusArea: "STRUCTURE",
    encouragement: "Great start! Let's explore your technical challenges.",
    followUpQuestion: "What was the most challenging technical hurdle you solved on that project?",
    sessionSummary: null,
  };
};

const mockPracticeEvaluatorTurn2 = async (): Promise<PracticeTurnFeedback> => {
  return {
    summary: "Clear explanation of how you tackled latency optimization.",
    grammarIssues: [],
    betterVersion: "We resolved latency by tuning network buffer sizes and optimizing our WebSocket pipelines.",
    focusArea: "CLARITY",
    encouragement: "Strong explanation! One final question.",
    followUpQuestion: "How did you communicate the delay to other team members?",
    sessionSummary: null,
  };
};

const mockPracticeEvaluatorTurn3 = async (): Promise<PracticeTurnFeedback> => {
  return {
    summary: "Excellent stakeholder communication and problem ownership.",
    grammarIssues: [],
    betterVersion: "I proactively informed our team lead with daily status updates and delivered the core milestone on time.",
    focusArea: "DELIVERY",
    encouragement: "Fantastic practice session!",
    followUpQuestion: null,
    sessionSummary: {
      strength: "Strong structured narrative and clear technical vocabulary throughout all 3 turns.",
      nextPracticeSuggestion: "Practice maintaining smooth linking phrases when transitioning between technical details.",
    },
  };
};

describe("Daily Practice Module", () => {
  describe("POST /api/v1/practice/sessions", () => {
    it("should return 401 when Authorization header is missing", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app).post("/api/v1/practice/sessions");

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.body.error.code, "UNAUTHORIZED");
    });

    it("should return 404 if user has not been initialized yet", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, "USER_NOT_FOUND");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
      }
    });

    it("should return 409 ONBOARDING_REQUIRED if profile is incomplete", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: null,
        };
      }) as unknown as typeof prisma.user.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.error.code, "ONBOARDING_REQUIRED");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
      }
    });

    it("should return 409 ASSESSMENT_REQUIRED if baseline assessment is incomplete", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            careerStatus: "JOB_SEEKER",
            goal: "JOB_INTERVIEWS",
            nativeLanguage: "TELUGU",
            confidence: 3,
            baselineScore: null,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => null) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.error.code, "ASSESSMENT_REQUIRED");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should create new AI_PRACTICE session and return turn 1 question when none active", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalCreateSession = prisma.practiceSession.create;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            careerStatus: "JOB_SEEKER",
            goal: "JOB_INTERVIEWS",
            nativeLanguage: "TELUGU",
            confidence: 3,
            baselineScore: 80,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async (args: { where: { type: string; status?: string } }) => {
        if (args.where.type === "ASSESSMENT" && args.where.status === "COMPLETED") {
          return { id: "assessment-1", type: "ASSESSMENT", status: "COMPLETED" };
        }
        return null;
      }) as unknown as typeof prisma.practiceSession.findFirst;

      prisma.practiceSession.create = (async (args: { data: { scenario: string } }) => {
        return {
          id: "practice-session-101",
          userId: "user-cuid-1",
          type: "AI_PRACTICE",
          status: "IN_PROGRESS",
          scenario: args.data.scenario,
          startedAt: new Date(),
        };
      }) as unknown as typeof prisma.practiceSession.create;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(response.body.data.session.id, "practice-session-101");
        assert.strictEqual(response.body.data.session.status, "IN_PROGRESS");
        assert.strictEqual(response.body.data.nextTurn.sequence, 1);
        assert(typeof response.body.data.nextTurn.question === "string");
        assert.strictEqual(response.body.data.isNew, true);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.practiceSession.create = originalCreateSession;
      }
    });

    it("should resume active session at Turn 2 when Turn 1 is already completed", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            careerStatus: "JOB_SEEKER",
            goal: "JOB_INTERVIEWS",
            nativeLanguage: "TELUGU",
            confidence: 3,
            baselineScore: 80,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async (args: { where: { type: string; status?: string } }) => {
        if (args.where.type === "ASSESSMENT") {
          return { id: "assessment-1", type: "ASSESSMENT", status: "COMPLETED" };
        }
        if (args.where.type === "AI_PRACTICE" && args.where.status === "IN_PROGRESS") {
          return {
            id: "practice-session-active",
            userId: "user-cuid-1",
            type: "AI_PRACTICE",
            status: "IN_PROGRESS",
            scenario: "recent-project-walkthrough",
            startedAt: new Date(),
            utterances: [
              {
                sequence: 1,
                question: "Walk me through a recent project.",
                transcript: "I built a WebRTC app.",
                metrics: {
                  practiceFeedback: {
                    summary: "Great overview.",
                    grammarIssues: [],
                    betterVersion: "I developed a real-time app.",
                    focusArea: "STRUCTURE",
                    encouragement: "Well done!",
                    followUpQuestion: "What architecture did you use for signaling?",
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
            ],
          };
        }
        return null;
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.session.id, "practice-session-active");
        assert.deepStrictEqual(response.body.data.answeredSequences, [1]);
        assert.strictEqual(response.body.data.nextTurn.sequence, 2);
        assert.strictEqual(response.body.data.nextTurn.question, "What architecture did you use for signaling?");
        assert.strictEqual(response.body.data.isNew, false);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should identify feedback-pending turn across app restart when transcript exists but feedback failed", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            careerStatus: "JOB_SEEKER",
            goal: "JOB_INTERVIEWS",
            nativeLanguage: "TELUGU",
            confidence: 3,
            baselineScore: 80,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async (args: { where: { type: string; status?: string } }) => {
        if (args.where.type === "ASSESSMENT") {
          return { id: "assessment-1", type: "ASSESSMENT", status: "COMPLETED" };
        }
        if (args.where.type === "AI_PRACTICE" && args.where.status === "IN_PROGRESS") {
          return {
            id: "practice-session-pending",
            userId: "user-cuid-1",
            type: "AI_PRACTICE",
            status: "IN_PROGRESS",
            scenario: "tell-me-about-yourself",
            startedAt: new Date(),
            utterances: [
              {
                sequence: 1,
                question: "Tell me about yourself.",
                transcript: "I am a backend developer with Node.js experience.",
                audioDurationMs: 16000,
                metrics: null, // Feedback missing due to prior provider timeout/restart
              },
            ],
          };
        }
        return null;
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.nextTurn.sequence, 1);
        assert.strictEqual(response.body.data.nextTurn.feedbackPending, true);
        assert.strictEqual(response.body.data.nextTurn.durationMs, 16000);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should self-heal finalize session and increment speaking time exactly once when 3 turns are completed", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalTransaction = prisma.$transaction;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            careerStatus: "JOB_SEEKER",
            goal: "JOB_INTERVIEWS",
            nativeLanguage: "TELUGU",
            confidence: 3,
            baselineScore: 80,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async (args: { where: { type: string; status?: string } }) => {
        if (args.where.type === "ASSESSMENT") {
          return { id: "assessment-1", type: "ASSESSMENT", status: "COMPLETED" };
        }
        if (args.where.type === "AI_PRACTICE" && args.where.status === "IN_PROGRESS") {
          return {
            id: "practice-session-3completed",
            userId: "user-cuid-1",
            type: "AI_PRACTICE",
            status: "IN_PROGRESS",
            scenario: "tell-me-about-yourself",
            startedAt: new Date(),
            utterances: [
              {
                sequence: 1,
                question: "Q1",
                transcript: "A1",
                audioDurationMs: 15000,
                metrics: {
                  practiceFeedback: {
                    summary: "S1",
                    grammarIssues: [],
                    betterVersion: "B1",
                    focusArea: "STRUCTURE",
                    encouragement: "E1",
                    followUpQuestion: "Q2",
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
                question: "Q2",
                transcript: "A2",
                audioDurationMs: 20000,
                metrics: {
                  practiceFeedback: {
                    summary: "S2",
                    grammarIssues: [],
                    betterVersion: "B2",
                    focusArea: "CLARITY",
                    encouragement: "E2",
                    followUpQuestion: "Q3",
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
                question: "Q3",
                transcript: "A3",
                audioDurationMs: 25000,
                metrics: {
                  practiceFeedback: {
                    summary: "S3",
                    grammarIssues: [],
                    betterVersion: "B3",
                    focusArea: "DELIVERY",
                    encouragement: "E3",
                    followUpQuestion: null,
                    sessionSummary: {
                      strength: "Great overall",
                      nextPracticeSuggestion: "Practice more",
                    },
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
          };
        }
        return null;
      }) as unknown as typeof prisma.practiceSession.findFirst;

      let incrementCalled = false;
      prisma.$transaction = (async (cb: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          practiceSession: {
            updateMany: async () => ({ count: 1 }),
          },
          profile: {
            update: async () => {
              incrementCalled = true;
              return {};
            },
          },
        };
        return cb(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.session.status, "COMPLETED");
        assert.strictEqual(response.body.data.nextTurn, null);
        assert.strictEqual(incrementCalled, true);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.$transaction = originalTransaction;
      }
    });
  });

  describe("POST /api/v1/practice/sessions/:id/responses", () => {
    it("should return 400 when sequence is invalid", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .post("/api/v1/practice/sessions/session-1/responses")
        .set("Authorization", "Bearer valid-firebase-token")
        .attach("audio", Buffer.from("audio-data"), "turn.m4a")
        .field("sequence", "4")
        .field("durationMs", "15000");

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error.code, "INVALID_SEQUENCE");
    });

    it("should return 400 AUDIO_REQUIRED when audio is missing and no stored transcript exists", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: { careerStatus: "JOB_SEEKER", goal: "JOB_INTERVIEWS" },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-missing-audio",
          userId: "user-cuid-1",
          type: "AI_PRACTICE",
          status: "IN_PROGRESS",
          scenario: "tell-me-about-yourself",
          utterances: [], // No transcript stored
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions/session-missing-audio/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .field("sequence", "1")
          .field("durationMs", "15000");

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.body.error.code, "AUDIO_REQUIRED");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should return 409 INVALID_PRACTICE_SEQUENCE when submitting Turn 2 before Turn 1", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: { careerStatus: "JOB_SEEKER", goal: "JOB_INTERVIEWS" },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-seq-test",
          userId: "user-cuid-1",
          type: "AI_PRACTICE",
          status: "IN_PROGRESS",
          scenario: "tell-me-about-yourself",
          utterances: [], // 0 completed turns
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/practice/sessions/session-seq-test/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("audio-data"), "turn.m4a")
          .field("sequence", "2") // Sequence 2 attempted before sequence 1
          .field("durationMs", "15000");

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.error.code, "INVALID_PRACTICE_SEQUENCE");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should process Turn 1, persist metrics and LLM feedback, and return Turn 2 question", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalUpsertUtterance = prisma.utterance.upsert;
      const originalUpdateUtterance = prisma.utterance.update;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: { careerStatus: "JOB_SEEKER", goal: "JOB_INTERVIEWS", weaknesses: ["Past tense"] },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-turn1",
          userId: "user-cuid-1",
          type: "AI_PRACTICE",
          status: "IN_PROGRESS",
          scenario: "recent-project-walkthrough",
          utterances: [],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      let savedQuestion = "";
      let savedTranscript = "";
      prisma.utterance.upsert = (async (args: { create: { question: string; transcript: string } }) => {
        savedQuestion = args.create.question;
        savedTranscript = args.create.transcript;
        return { id: "u-1" };
      }) as unknown as typeof prisma.utterance.upsert;

      let feedbackSaved = false;
      prisma.utterance.update = (async () => {
        feedbackSaved = true;
        return { id: "u-1" };
      }) as unknown as typeof prisma.utterance.update;

      try {
        const app = createApp({
          tokenVerifier: mockTokenVerifier,
          transcriber: mockTranscriber,
          practiceEvaluator: mockPracticeEvaluatorTurn1,
        });

        const response = await request(app)
          .post("/api/v1/practice/sessions/session-turn1/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("audio-bytes"), "turn.m4a")
          .field("sequence", "1")
          .field("durationMs", "18000");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(response.body.data.utterance.sequence, 1);
        assert.strictEqual(savedQuestion, "Walk me through a recent project you worked on. What was your role and what was the outcome?");
        assert.strictEqual(savedTranscript, "I am a software engineer and I built a real-time communications app using Node and WebRTC.");
        assert.strictEqual(feedbackSaved, true);
        assert.strictEqual(response.body.data.feedback.focusArea, "STRUCTURE");
        assert.strictEqual(response.body.data.nextTurn.sequence, 2);
        assert.strictEqual(response.body.data.nextTurn.question, "What was the most challenging technical hurdle you solved on that project?");
        assert.strictEqual(response.body.data.sessionCompleted, false);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.utterance.upsert = originalUpsertUtterance;
        prisma.utterance.update = originalUpdateUtterance;
      }
    });

    it("should process Turn 2, resolve question from turn 1 follow-up, and return Turn 3 question", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalUpsertUtterance = prisma.utterance.upsert;
      const originalUpdateUtterance = prisma.utterance.update;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: { careerStatus: "JOB_SEEKER", goal: "JOB_INTERVIEWS" },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-turn2",
          userId: "user-cuid-1",
          type: "AI_PRACTICE",
          status: "IN_PROGRESS",
          scenario: "recent-project-walkthrough",
          utterances: [
            {
              sequence: 1,
              question: "Walk me through a recent project.",
              transcript: "I built a WebRTC app.",
              audioDurationMs: 15000,
              wordsPerMinute: 120,
              fillerCount: 1,
              wordCount: 30,
              metrics: {
                practiceFeedback: {
                  summary: "Great overview.",
                  grammarIssues: [],
                  betterVersion: "I built an app.",
                  focusArea: "STRUCTURE",
                  encouragement: "Keep going!",
                  followUpQuestion: "What was your main architectural challenge?",
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
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      let savedQuestion = "";
      prisma.utterance.upsert = (async (args: { create: { question: string } }) => {
        savedQuestion = args.create.question;
        return { id: "u-2" };
      }) as unknown as typeof prisma.utterance.upsert;

      prisma.utterance.update = (async () => ({ id: "u-2" })) as unknown as typeof prisma.utterance.update;

      try {
        const app = createApp({
          tokenVerifier: mockTokenVerifier,
          transcriber: mockTranscriber,
          practiceEvaluator: mockPracticeEvaluatorTurn2,
        });

        const response = await request(app)
          .post("/api/v1/practice/sessions/session-turn2/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("audio-bytes"), "turn.m4a")
          .field("sequence", "2")
          .field("durationMs", "20000");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(savedQuestion, "What was your main architectural challenge?");
        assert.strictEqual(response.body.data.feedback.focusArea, "CLARITY");
        assert.strictEqual(response.body.data.nextTurn.sequence, 3);
        assert.strictEqual(response.body.data.nextTurn.question, "How did you communicate the delay to other team members?");
        assert.strictEqual(response.body.data.sessionCompleted, false);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.utterance.upsert = originalUpsertUtterance;
        prisma.utterance.update = originalUpdateUtterance;
      }
    });

    it("should process Turn 3, finalize session exactly once, and increment speaking seconds", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalUpsertUtterance = prisma.utterance.upsert;
      const originalUpdateUtterance = prisma.utterance.update;
      const originalTransaction = prisma.$transaction;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: { careerStatus: "JOB_SEEKER", goal: "JOB_INTERVIEWS", totalSpeakingSeconds: 30 },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-turn3",
          userId: "user-cuid-1",
          type: "AI_PRACTICE",
          status: "IN_PROGRESS",
          scenario: "recent-project-walkthrough",
          utterances: [
            {
              sequence: 1,
              question: "Q1",
              transcript: "A1",
              audioDurationMs: 15000,
              wordsPerMinute: 120,
              fillerCount: 1,
              wordCount: 30,
              metrics: {
                practiceFeedback: {
                  summary: "S1",
                  grammarIssues: [],
                  betterVersion: "B1",
                  focusArea: "STRUCTURE",
                  encouragement: "E1",
                  followUpQuestion: "Q2",
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
              question: "Q2",
              transcript: "A2",
              audioDurationMs: 20000,
              wordsPerMinute: 115,
              fillerCount: 2,
              wordCount: 38,
              metrics: {
                practiceFeedback: {
                  summary: "S2",
                  grammarIssues: [],
                  betterVersion: "B2",
                  focusArea: "CLARITY",
                  encouragement: "E2",
                  followUpQuestion: "Q3",
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
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      prisma.utterance.upsert = (async () => ({ id: "u-3" })) as unknown as typeof prisma.utterance.upsert;
      prisma.utterance.update = (async () => ({ id: "u-3" })) as unknown as typeof prisma.utterance.update;

      let transactionExecuted = false;
      let profileIncremented = false;
      prisma.$transaction = (async (cb: (tx: typeof prisma) => Promise<unknown>) => {
        transactionExecuted = true;
        const fakeTx = {
          practiceSession: {
            updateMany: async () => ({ count: 1 }), // claimed
          },
          profile: {
            update: async () => {
              profileIncremented = true;
              return {};
            },
          },
        };
        return cb(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      try {
        const app = createApp({
          tokenVerifier: mockTokenVerifier,
          transcriber: mockTranscriber,
          practiceEvaluator: mockPracticeEvaluatorTurn3,
        });

        const response = await request(app)
          .post("/api/v1/practice/sessions/session-turn3/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("audio-bytes"), "turn.m4a")
          .field("sequence", "3")
          .field("durationMs", "25000"); // 15s + 20s + 25s = 60s

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.sessionCompleted, true);
        assert.strictEqual(response.body.data.nextTurn, null);
        assert.strictEqual(response.body.data.summary.speakingSeconds, 60);
        assert.strictEqual(transactionExecuted, true);
        assert.strictEqual(profileIncremented, true);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.utterance.upsert = originalUpsertUtterance;
        prisma.utterance.update = originalUpdateUtterance;
        prisma.$transaction = originalTransaction;
      }
    });

    it("should return stored response on repeated sequence without calling STT or LLM", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      let transcriberCalled = false;
      let evaluatorCalled = false;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: { careerStatus: "JOB_SEEKER", goal: "JOB_INTERVIEWS" },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-idempotent",
          userId: "user-cuid-1",
          type: "AI_PRACTICE",
          status: "IN_PROGRESS",
          scenario: "tell-me-about-yourself",
          utterances: [
            {
              sequence: 1,
              question: "Tell me about yourself.",
              transcript: "I am a software engineer.",
              audioDurationMs: 15000,
              wordsPerMinute: 120,
              fillerCount: 0,
              wordCount: 30,
              metrics: {
                practiceFeedback: {
                  summary: "Great intro.",
                  grammarIssues: [],
                  betterVersion: "I am an engineer.",
                  focusArea: "CLARITY",
                  encouragement: "Keep going!",
                  followUpQuestion: "What is your main programming language?",
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
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      const trackingTranscriber = async () => {
        transcriberCalled = true;
        return { transcript: "new speech" };
      };

      const trackingEvaluator = async () => {
        evaluatorCalled = true;
        return mockPracticeEvaluatorTurn1();
      };

      try {
        const app = createApp({
          tokenVerifier: mockTokenVerifier,
          transcriber: trackingTranscriber,
          practiceEvaluator: trackingEvaluator,
        });

        const response = await request(app)
          .post("/api/v1/practice/sessions/session-idempotent/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("audio-bytes"), "turn.m4a")
          .field("sequence", "1")
          .field("durationMs", "15000");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.utterance.transcript, "I am a software engineer.");
        assert.strictEqual(transcriberCalled, false);
        assert.strictEqual(evaluatorCalled, false);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should allow missing audio file and invoke only LLM if stored transcript already exists (staged retry)", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalUpdateUtterance = prisma.utterance.update;
      let transcriberCalled = false;
      let evaluatorCalled = false;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: { careerStatus: "JOB_SEEKER", goal: "JOB_INTERVIEWS" },
        };
      }) as unknown as typeof prisma.user.findUnique;

      // Utterance has transcript but metrics.practiceFeedback is null (e.g. LLM failed previously)
      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-staged-no-audio",
          userId: "user-cuid-1",
          type: "AI_PRACTICE",
          status: "IN_PROGRESS",
          scenario: "tell-me-about-yourself",
          utterances: [
            {
              sequence: 1,
              question: "Tell me about yourself.",
              transcript: "I am a backend developer.",
              audioDurationMs: 14000,
              wordsPerMinute: 110,
              fillerCount: 1,
              wordCount: 26,
              metrics: null, // feedback missing
            },
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      prisma.utterance.update = (async () => ({ id: "u-1" })) as unknown as typeof prisma.utterance.update;

      const trackingTranscriber = async () => {
        transcriberCalled = true;
        return { transcript: "new speech" };
      };

      const trackingEvaluator = async () => {
        evaluatorCalled = true;
        return mockPracticeEvaluatorTurn1();
      };

      try {
        const app = createApp({
          tokenVerifier: mockTokenVerifier,
          transcriber: trackingTranscriber,
          practiceEvaluator: trackingEvaluator,
        });

        // Request WITHOUT attached audio file
        const response = await request(app)
          .post("/api/v1/practice/sessions/session-staged-no-audio/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .field("sequence", "1")
          .field("durationMs", "14000");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.utterance.transcript, "I am a backend developer.");
        assert.strictEqual(transcriberCalled, false); // STT was NOT called
        assert.strictEqual(evaluatorCalled, true); // LLM was called
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.utterance.update = originalUpdateUtterance;
      }
    });
  });
});
