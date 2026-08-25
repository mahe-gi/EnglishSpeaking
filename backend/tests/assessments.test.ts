import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { LlmEvaluation } from "../src/services/llm.service.js";

describe("Assessments Module", () => {
  const mockTokenVerifier = async (token: string) => {
    if (token === "valid-firebase-token") {
      return {
        uid: "firebase-uid-999",
        email: "learner@example.com",
        name: "Learner One",
      };
    }
    if (token === "valid-token-user-2") {
      return {
        uid: "firebase-uid-888",
        email: "learner2@example.com",
        name: "Learner Two",
      };
    }
    throw new Error("Invalid token");
  };

  const mockTranscriber = async (buffer: Buffer) => {
    if (buffer.toString() === "empty-speech") {
      return { transcript: "" };
    }
    if (buffer.toString() === "provider-fail") {
      throw new Error("Provider internal failure");
    }
    return {
      transcript: "Um, I am a software developer with three years of experience.",
      languageCode: "en-IN",
    };
  };

  const mockEvaluator = async (): Promise<LlmEvaluation> => {
    return {
      grammarScore: 4,
      structureScore: 4,
      vocabularyScore: 3,
      communicationScore: 4,
      relevanceScore: 5,
      strengths: ["Clear project narrative", "Good professional context"],
      weaknesses: [
        "Inconsistent past-tense verb agreement",
        "Overuse of filler words under pressure",
        "Rushing transition phrases between key points",
      ],
      feedback: "Strong baseline communication with clear technical articulation.",
    };
  };

  describe("POST /api/v1/assessments", () => {
    it("should return 401 when Authorization header is missing", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app).post("/api/v1/assessments");

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.body.success, false);
    });

    it("should return 401 when token is invalid", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier });
      const response = await request(app)
        .post("/api/v1/assessments")
        .set("Authorization", "Bearer invalid-token");

      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.body.success, false);
    });

    it("should return 404 if user has not been initialized yet", async () => {
      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async () => null) as unknown as typeof prisma.user.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/assessments")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error.code, "USER_NOT_FOUND");
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });

    it("should return 409 ONBOARDING_REQUIRED if user profile is incomplete", async () => {
      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          email: "learner@example.com",
          name: "Learner One",
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          profile: null, // Incomplete onboarding
        };
      }) as unknown as typeof prisma.user.findUnique;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/assessments")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.success, false);
        assert.strictEqual(response.body.error.code, "ONBOARDING_REQUIRED");
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });

    it("should create new assessment session with status IN_PROGRESS when onboarding complete and none active", async () => {
      const originalFindUnique = prisma.user.findUnique;
      const originalFindFirst = prisma.practiceSession.findFirst;
      const originalCreate = prisma.practiceSession.create;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          email: "learner@example.com",
          name: "Learner One",
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          profile: {
            id: "profile-1",
            userId: "user-cuid-1",
            careerStatus: "JOB_SEEKER",
            goal: "JOB_INTERVIEWS",
            nativeLanguage: "TELUGU",
            confidence: 3,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => null) as unknown as typeof prisma.practiceSession.findFirst;

      let createdType = "";
      let createdStatus = "";
      prisma.practiceSession.create = (async (args: { data: { userId: string; type: string; status: string; startedAt: Date } }) => {
        createdType = args.data.type;
        createdStatus = args.data.status;
        return {
          id: "session-cuid-100",
          userId: args.data.userId,
          type: args.data.type,
          status: args.data.status,
          startedAt: args.data.startedAt,
          endedAt: null,
          durationSeconds: null,
          overallScore: null,
          createdAt: new Date(),
        };
      }) as unknown as typeof prisma.practiceSession.create;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/assessments")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 201);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(response.body.data.assessment.id, "session-cuid-100");
        assert.strictEqual(response.body.data.assessment.status, "IN_PROGRESS");
        assert.deepStrictEqual(response.body.data.answeredSequences, []);
        assert.strictEqual(createdType, "ASSESSMENT");
        assert.strictEqual(createdStatus, "IN_PROGRESS");
      } finally {
        prisma.user.findUnique = originalFindUnique;
        prisma.practiceSession.findFirst = originalFindFirst;
        prisma.practiceSession.create = originalCreate;
      }
    });

    it("should return existing active assessment session on repeated POST", async () => {
      const originalFindUnique = prisma.user.findUnique;
      const originalFindFirst = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          email: "learner@example.com",
          name: "Learner One",
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          profile: {
            id: "profile-1",
            userId: "user-cuid-1",
            careerStatus: "JOB_SEEKER",
            goal: "JOB_INTERVIEWS",
            nativeLanguage: "TELUGU",
            confidence: 3,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "existing-session-cuid-99",
          userId: "user-cuid-1",
          type: "ASSESSMENT",
          status: "IN_PROGRESS",
          startedAt: new Date("2026-08-25T10:00:00Z"),
          endedAt: null,
          durationSeconds: null,
          overallScore: null,
          createdAt: new Date("2026-08-25T10:00:00Z"),
          utterances: [
            { sequence: 1, transcript: "I am a developer." },
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .post("/api/v1/assessments")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(response.body.data.assessment.id, "existing-session-cuid-99");
        assert.deepStrictEqual(response.body.data.answeredSequences, [1]);
      } finally {
        prisma.user.findUnique = originalFindUnique;
        prisma.practiceSession.findFirst = originalFindFirst;
      }
    });
  });

  describe("GET /api/v1/assessments/:id", () => {
    it("should return assessment and answeredSequences for user", async () => {
      const originalFindUnique = prisma.user.findUnique;
      const originalFindFirst = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-100",
          userId: "user-cuid-1",
          status: "IN_PROGRESS",
          startedAt: new Date(),
          utterances: [{ sequence: 1, transcript: "Hello" }, { sequence: 2, transcript: "World" }],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier });
        const response = await request(app)
          .get("/api/v1/assessments/session-100")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.deepStrictEqual(response.body.data.answeredSequences, [1, 2]);
      } finally {
        prisma.user.findUnique = originalFindUnique;
        prisma.practiceSession.findFirst = originalFindFirst;
      }
    });
  });

  describe("POST /api/v1/assessments/:id/responses", () => {
    it("should return 401 when unauthenticated", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier, transcriber: mockTranscriber });
      const response = await request(app)
        .post("/api/v1/assessments/session-100/responses")
        .attach("audio", Buffer.from("fake-audio"), "rec.m4a")
        .field("sequence", "1")
        .field("durationMs", "5000");

      assert.strictEqual(response.status, 401);
    });

    it("should return 400 when audio file is missing", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier, transcriber: mockTranscriber });
      const response = await request(app)
        .post("/api/v1/assessments/session-100/responses")
        .set("Authorization", "Bearer valid-firebase-token")
        .field("sequence", "1")
        .field("durationMs", "5000");

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error.code, "MISSING_AUDIO_FILE");
    });

    it("should return 400 when durationMs is a float string", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier, transcriber: mockTranscriber });
      const response = await request(app)
        .post("/api/v1/assessments/session-100/responses")
        .set("Authorization", "Bearer valid-firebase-token")
        .attach("audio", Buffer.from("fake-audio"), "rec.m4a")
        .field("sequence", "1")
        .field("durationMs", "1500.8");

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error.code, "INVALID_REQUEST");
    });

    it("should return 400 when durationMs has trailing characters", async () => {
      const app = createApp({ tokenVerifier: mockTokenVerifier, transcriber: mockTranscriber });
      const response = await request(app)
        .post("/api/v1/assessments/session-100/responses")
        .set("Authorization", "Bearer valid-firebase-token")
        .attach("audio", Buffer.from("fake-audio"), "rec.m4a")
        .field("sequence", "1")
        .field("durationMs", "1500abc");

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.error.code, "INVALID_REQUEST");
    });

    it("should return 404 when assessment does not belong to user", async () => {
      const originalFindUnique = prisma.user.findUnique;
      const originalFindFirst = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => null) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, transcriber: mockTranscriber });
        const response = await request(app)
          .post("/api/v1/assessments/session-999/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("fake-audio"), "rec.m4a")
          .field("sequence", "1")
          .field("durationMs", "15000");

        assert.strictEqual(response.status, 404);
        assert.strictEqual(response.body.error.code, "ASSESSMENT_NOT_FOUND");
      } finally {
        prisma.user.findUnique = originalFindUnique;
        prisma.practiceSession.findFirst = originalFindFirst;
      }
    });

    it("should successfully transcribe and persist Utterance with canonical question", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalFindUniqueUtterance = prisma.utterance.findUnique;
      const originalUpsertUtterance = prisma.utterance.upsert;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-100",
          userId: "user-cuid-1",
          status: "IN_PROGRESS",
          type: "ASSESSMENT",
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      prisma.utterance.findUnique = (async () => null) as unknown as typeof prisma.utterance.findUnique;

      let savedQuestion = "";
      let savedTranscript = "";
      let savedDuration = 0;
      prisma.utterance.upsert = (async (args: { create: { question: string; transcript: string; audioDurationMs: number; sequence: number } }) => {
        savedQuestion = args.create.question;
        savedTranscript = args.create.transcript;
        savedDuration = args.create.audioDurationMs;
        return {
          id: "utterance-1",
          sessionId: "session-100",
          sequence: args.create.sequence,
          question: args.create.question,
          transcript: args.create.transcript,
          audioDurationMs: args.create.audioDurationMs,
          wordCount: null,
          wordsPerMinute: null,
          fillerCount: null,
          metrics: null,
          createdAt: new Date(),
        };
      }) as unknown as typeof prisma.utterance.upsert;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, transcriber: mockTranscriber });
        const response = await request(app)
          .post("/api/v1/assessments/session-100/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("real-audio-bytes"), "rec.m4a")
          .field("sequence", "1")
          .field("durationMs", "22500");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert.strictEqual(savedQuestion, "Tell me about yourself.");
        assert.strictEqual(savedTranscript, "Um, I am a software developer with three years of experience.");
        assert.strictEqual(savedDuration, 22500);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.utterance.findUnique = originalFindUniqueUtterance;
        prisma.utterance.upsert = originalUpsertUtterance;
      }
    });

    it("should return existing Utterance on repeated upload without re-transcribing", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalFindUniqueUtterance = prisma.utterance.findUnique;
      let transcriberCalled = false;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-100",
          userId: "user-cuid-1",
          status: "IN_PROGRESS",
          type: "ASSESSMENT",
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      prisma.utterance.findUnique = (async () => {
        return {
          id: "existing-utterance-1",
          sessionId: "session-100",
          sequence: 1,
          question: "Tell me about yourself.",
          transcript: "Previously transcribed text.",
          audioDurationMs: 20000,
          wordCount: null,
          wordsPerMinute: null,
          fillerCount: null,
          metrics: null,
          createdAt: new Date(),
        };
      }) as unknown as typeof prisma.utterance.findUnique;

      const trackingTranscriber = async () => {
        transcriberCalled = true;
        return { transcript: "New transcript" };
      };

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, transcriber: trackingTranscriber });
        const response = await request(app)
          .post("/api/v1/assessments/session-100/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("retry-audio-bytes"), "rec.m4a")
          .field("sequence", "1")
          .field("durationMs", "20000");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.utterance.id, "existing-utterance-1");
        assert.strictEqual(response.body.data.utterance.transcript, "Previously transcribed text.");
        assert.strictEqual(transcriberCalled, false);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.utterance.findUnique = originalFindUniqueUtterance;
      }
    });

    it("should return 422 TRANSCRIPT_EMPTY when STT recognizes no speech", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalFindUniqueUtterance = prisma.utterance.findUnique;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-100",
          userId: "user-cuid-1",
          status: "IN_PROGRESS",
          type: "ASSESSMENT",
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      prisma.utterance.findUnique = (async () => null) as unknown as typeof prisma.utterance.findUnique;

      const emptyTranscriber = async () => {
        return { transcript: "   " };
      };

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, transcriber: emptyTranscriber });
        const response = await request(app)
          .post("/api/v1/assessments/session-100/responses")
          .set("Authorization", "Bearer valid-firebase-token")
          .attach("audio", Buffer.from("silent-audio"), "rec.m4a")
          .field("sequence", "1")
          .field("durationMs", "10000");

        assert.strictEqual(response.status, 422);
        assert.strictEqual(response.body.error.code, "TRANSCRIPT_EMPTY");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.utterance.findUnique = originalFindUniqueUtterance;
      }
    });
  });

  describe("POST /api/v1/assessments/:id/complete", () => {
    it("should return 409 ASSESSMENT_INCOMPLETE if not all 3 sequences are answered", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-incomplete",
          userId: "user-cuid-1",
          status: "IN_PROGRESS",
          type: "ASSESSMENT",
          utterances: [
            { id: "u1", sequence: 1, transcript: "Answer 1", audioDurationMs: 15000 },
            { id: "u2", sequence: 2, transcript: "Answer 2", audioDurationMs: 20000 },
          ], // sequence 3 missing
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, evaluator: mockEvaluator });
        const response = await request(app)
          .post("/api/v1/assessments/session-incomplete/complete")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.error.code, "ASSESSMENT_INCOMPLETE");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should evaluate assessment, compute weighted score, and persist report in transaction", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalUpdateMany = prisma.practiceSession.updateMany;
      const originalTransaction = prisma.$transaction;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            id: "profile-1",
            userId: "user-cuid-1",
            baselineScore: null,
            totalSpeakingSeconds: 0,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-complete-1",
          userId: "user-cuid-1",
          status: "IN_PROGRESS",
          type: "ASSESSMENT",
          utterances: [
            { id: "u1", sequence: 1, question: "Tell me about yourself.", transcript: "Um, I am a developer with experience in React and Node.", audioDurationMs: 15000 },
            { id: "u2", sequence: 2, question: "Tell me about a project.", transcript: "I built an audio streaming platform using WebRTC.", audioDurationMs: 20000 },
            { id: "u3", sequence: 3, question: "Missed a deadline.", transcript: "I communicated early with my team and delivered the core module.", audioDurationMs: 25000 },
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      prisma.practiceSession.updateMany = (async () => {
        return { count: 1 };
      }) as unknown as typeof prisma.practiceSession.updateMany;

      let transactionExecuted = false;
      prisma.$transaction = (async (cb: (tx: typeof prisma) => Promise<unknown>) => {
        transactionExecuted = true;
        const fakeTx = {
          utterance: {
            update: async () => ({}),
          },
          practiceSession: {
            update: async () => ({}),
          },
          profile: {
            upsert: async () => ({}),
          },
        };
        return cb(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, evaluator: mockEvaluator });
        const response = await request(app)
          .post("/api/v1/assessments/session-complete-1/complete")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        assert(response.body.data.report.overallScore >= 1 && response.body.data.report.overallScore <= 100);
        assert.strictEqual(response.body.data.report.strengths.length, 2);
        assert.strictEqual(response.body.data.report.weaknesses.length, 3);
        assert.strictEqual(transactionExecuted, true);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.practiceSession.updateMany = originalUpdateMany;
        prisma.$transaction = originalTransaction;
      }
    });

    it("should be idempotent and return existing report on repeated complete without calling LLM evaluator", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      let evaluatorCalled = false;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            id: "profile-1",
            userId: "user-cuid-1",
            baselineScore: 82,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-already-completed",
          userId: "user-cuid-1",
          status: "COMPLETED",
          type: "ASSESSMENT",
          overallScore: 82,
          metrics: {
            totalWordCount: 100,
            totalSpeakingSeconds: 60,
            averageWpm: 100,
            totalFillerCount: 2,
            aggregateFillerPercentage: 2.0,
            deliveryScore: 85,
            versionMetadata: {
              scoringVersion: "baseline-v1",
              metricsVersion: "speech-metrics-v1",
              rubricVersion: "assessment-rubric-v1",
              sttModel: "saaras:v4",
              llmModel: "sarvam-105b",
            },
          },
          feedback: {
            subScores: { delivery: 85, grammar: 80, structure: 80, vocabulary: 80, communication: 80, relevance: 100 },
            strengths: ["Clear speech", "Good context"],
            weaknesses: ["Filler words", "Structure", "Pacing"],
            feedback: "Great performance!",
            rubricVersion: "assessment-rubric-v1",
            llmModel: "sarvam-105b",
          },
          completedAt: new Date("2026-08-25T12:00:00Z"),
          utterances: [],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      const trackingEvaluator = async () => {
        evaluatorCalled = true;
        return mockEvaluator();
      };

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, evaluator: trackingEvaluator });
        const response = await request(app)
          .post("/api/v1/assessments/session-already-completed/complete")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.data.report.overallScore, 82);
        assert.strictEqual(evaluatorCalled, false);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should return 409 ASSESSMENT_ANALYSIS_IN_PROGRESS when assessment is already in ANALYZING state", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-analyzing",
          userId: "user-cuid-1",
          status: "ANALYZING",
          type: "ASSESSMENT",
          utterances: [
            { id: "u1", sequence: 1, transcript: "A1", audioDurationMs: 10000 },
            { id: "u2", sequence: 2, transcript: "A2", audioDurationMs: 10000 },
            { id: "u3", sequence: 3, transcript: "A3", audioDurationMs: 10000 },
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, evaluator: mockEvaluator });
        const response = await request(app)
          .post("/api/v1/assessments/session-analyzing/complete")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.body.error.code, "ASSESSMENT_ANALYSIS_IN_PROGRESS");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should return 500 ASSESSMENT_REPORT_INVALID when stored completed report has corrupt feedback JSON", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-corrupt",
          userId: "user-cuid-1",
          status: "COMPLETED",
          type: "ASSESSMENT",
          overallScore: 80,
          metrics: null, // Corrupt/missing
          feedback: null, // Corrupt/missing
          completedAt: new Date(),
          utterances: [],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, evaluator: mockEvaluator });
        const response = await request(app)
          .post("/api/v1/assessments/session-corrupt/complete")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 500);
        assert.strictEqual(response.body.error.code, "ASSESSMENT_REPORT_INVALID");
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
      }
    });

    it("should rollback ANALYZING status to IN_PROGRESS if evaluator throws an error", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalUpdateMany = prisma.practiceSession.updateMany;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-fail-eval",
          userId: "user-cuid-1",
          status: "IN_PROGRESS",
          type: "ASSESSMENT",
          utterances: [
            { id: "u1", sequence: 1, question: "Q1", transcript: "A1", audioDurationMs: 10000 },
            { id: "u2", sequence: 2, question: "Q2", transcript: "A2", audioDurationMs: 10000 },
            { id: "u3", sequence: 3, question: "Q3", transcript: "A3", audioDurationMs: 10000 },
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      const statusHistory: string[] = [];
      prisma.practiceSession.updateMany = (async (args: { data: { status?: string } }) => {
        if (args.data.status) {
          statusHistory.push(args.data.status);
        }
        return { count: 1 };
      }) as unknown as typeof prisma.practiceSession.updateMany;

      const failingEvaluator = async () => {
        throw new Error("Provider rate limit or temporary network failure");
      };

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, evaluator: failingEvaluator });
        const response = await request(app)
          .post("/api/v1/assessments/session-fail-eval/complete")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 500);
        // Expect status transition: IN_PROGRESS -> ANALYZING (claim) -> IN_PROGRESS (revert)
        assert.deepStrictEqual(statusHistory, ["ANALYZING", "IN_PROGRESS"]);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.practiceSession.updateMany = originalUpdateMany;
      }
    });

    it("should rollback ANALYZING status to IN_PROGRESS if evaluator succeeds but final Prisma transaction throws", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalUpdateMany = prisma.practiceSession.updateMany;
      const originalTransaction = prisma.$transaction;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            id: "profile-1",
            userId: "user-cuid-1",
            baselineScore: null,
            totalSpeakingSeconds: 0,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-fail-tx",
          userId: "user-cuid-1",
          status: "IN_PROGRESS",
          type: "ASSESSMENT",
          utterances: [
            { id: "u1", sequence: 1, question: "Q1", transcript: "A1", audioDurationMs: 10000 },
            { id: "u2", sequence: 2, question: "Q2", transcript: "A2", audioDurationMs: 10000 },
            { id: "u3", sequence: 3, question: "Q3", transcript: "A3", audioDurationMs: 10000 },
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      const statusHistory: string[] = [];
      prisma.practiceSession.updateMany = (async (args: { data: { status?: string } }) => {
        if (args.data.status) {
          statusHistory.push(args.data.status);
        }
        return { count: 1 };
      }) as unknown as typeof prisma.practiceSession.updateMany;

      prisma.$transaction = (async () => {
        throw new Error("Database transaction lock deadlock");
      }) as unknown as typeof prisma.$transaction;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, evaluator: mockEvaluator });
        const response = await request(app)
          .post("/api/v1/assessments/session-fail-tx/complete")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 500);
        // Expect status transition: IN_PROGRESS -> ANALYZING (claim) -> IN_PROGRESS (revert on transaction throw)
        assert.deepStrictEqual(statusHistory, ["ANALYZING", "IN_PROGRESS"]);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.practiceSession.updateMany = originalUpdateMany;
        prisma.$transaction = originalTransaction;
      }
    });

    it("should recover stale ANALYZING claim (> 2 minutes) back to IN_PROGRESS and complete", async () => {
      const originalFindUniqueUser = prisma.user.findUnique;
      const originalFindFirstSession = prisma.practiceSession.findFirst;
      const originalUpdateMany = prisma.practiceSession.updateMany;
      const originalTransaction = prisma.$transaction;

      prisma.user.findUnique = (async () => {
        return {
          id: "user-cuid-1",
          firebaseUid: "firebase-uid-999",
          profile: {
            id: "profile-1",
            userId: "user-cuid-1",
            baselineScore: null,
            totalSpeakingSeconds: 0,
          },
        };
      }) as unknown as typeof prisma.user.findUnique;

      // Stale timestamp: 5 minutes ago
      const staleUpdatedAt = new Date(Date.now() - 5 * 60 * 1000);

      prisma.practiceSession.findFirst = (async () => {
        return {
          id: "session-stale-analyzing",
          userId: "user-cuid-1",
          status: "ANALYZING",
          updatedAt: staleUpdatedAt,
          type: "ASSESSMENT",
          utterances: [
            { id: "u1", sequence: 1, question: "Q1", transcript: "A1", audioDurationMs: 10000 },
            { id: "u2", sequence: 2, question: "Q2", transcript: "A2", audioDurationMs: 10000 },
            { id: "u3", sequence: 3, question: "Q3", transcript: "A3", audioDurationMs: 10000 },
          ],
        };
      }) as unknown as typeof prisma.practiceSession.findFirst;

      const statusHistory: string[] = [];
      prisma.practiceSession.updateMany = (async (args: { data: { status?: string } }) => {
        if (args.data.status) {
          statusHistory.push(args.data.status);
        }
        return { count: 1 };
      }) as unknown as typeof prisma.practiceSession.updateMany;

      prisma.$transaction = (async (cb: (tx: typeof prisma) => Promise<unknown>) => {
        const fakeTx = {
          utterance: { update: async () => ({}) },
          practiceSession: { update: async () => ({}) },
          profile: { upsert: async () => ({}) },
        };
        return cb(fakeTx as unknown as typeof prisma);
      }) as unknown as typeof prisma.$transaction;

      try {
        const app = createApp({ tokenVerifier: mockTokenVerifier, evaluator: mockEvaluator });
        const response = await request(app)
          .post("/api/v1/assessments/session-stale-analyzing/complete")
          .set("Authorization", "Bearer valid-firebase-token");

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.success, true);
        // Stale session was recovered (ANALYZING -> IN_PROGRESS) then re-claimed (IN_PROGRESS -> ANALYZING)
        assert.deepStrictEqual(statusHistory, ["IN_PROGRESS", "ANALYZING"]);
      } finally {
        prisma.user.findUnique = originalFindUniqueUser;
        prisma.practiceSession.findFirst = originalFindFirstSession;
        prisma.practiceSession.updateMany = originalUpdateMany;
        prisma.$transaction = originalTransaction;
      }
    });
  });
});
