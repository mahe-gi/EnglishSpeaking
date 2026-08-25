import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";
import { AppError } from "../../middleware/error.middleware.js";
import { transcribeWithSarvam, TranscribeFunction } from "../../services/sarvam.service.js";
import {
  calculateUtteranceMetrics,
  calculateAggregateMetrics,
  AggregateMetrics,
  SCORING_VERSIONS,
} from "../../services/metrics.service.js";
import {
  evaluateAssessmentWithSarvam,
  EvaluateAssessmentFunction,
  LlmEvaluation,
} from "../../services/llm.service.js";

export const CANONICAL_ASSESSMENT_PROMPTS: Record<number, string> = {
  1: "Tell me about yourself.",
  2: "Tell me about a project or something you recently worked on.",
  3: "Imagine you missed a deadline. Explain the situation to your manager.",
};

// Stale claim timeout: If a session remains in ANALYZING for > 2 minutes (e.g. server crash), allow recovery
export const STALE_ANALYZING_THRESHOLD_MS = 2 * 60 * 1000;

export const PersistedSubScoresSchema = z.object({
  delivery: z.number(),
  grammar: z.number(),
  structure: z.number(),
  vocabulary: z.number(),
  communication: z.number(),
  relevance: z.number(),
});

export const PersistedFeedbackSchema = z.object({
  subScores: PersistedSubScoresSchema,
  strengths: z.array(z.string()).min(2),
  weaknesses: z.array(z.string()).length(3),
  feedback: z.string().min(1),
  rubricVersion: z.string().min(1),
  llmModel: z.string().min(1),
});

export const PersistedMetricsSchema = z.object({
  totalWordCount: z.number(),
  totalSpeakingSeconds: z.number(),
  averageWpm: z.number(),
  totalFillerCount: z.number(),
  aggregateFillerPercentage: z.number(),
  deliveryScore: z.number(),
  versionMetadata: z.object({
    scoringVersion: z.string().min(1),
    metricsVersion: z.string().min(1),
    rubricVersion: z.string().min(1),
    sttModel: z.string().min(1),
    llmModel: z.string().min(1),
  }),
});

export interface AssessmentReport {
  sessionId: string;
  overallScore: number;
  subScores: {
    delivery: number;
    grammar: number;
    structure: number;
    vocabulary: number;
    communication: number;
    relevance: number;
  };
  metrics: AggregateMetrics;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
  completedAt: Date;
}

export async function getOrCreateAssessmentSession(auth: AuthContext) {
  const user = await prisma.user.findUnique({
    where: {
      firebaseUid: auth.uid,
    },
    include: {
      profile: true,
    },
  });

  if (!user) {
    const error: AppError = new Error("User record not found. Please initialize your account first.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const hasCompleteProfile = !!(
    user.profile &&
    user.profile.careerStatus &&
    user.profile.goal &&
    user.profile.nativeLanguage &&
    user.profile.confidence
  );

  if (!hasCompleteProfile) {
    const error: AppError = new Error("Complete onboarding before starting the assessment.");
    error.statusCode = 409;
    error.code = "ONBOARDING_REQUIRED";
    throw error;
  }

  // Find existing active assessment (IN_PROGRESS or ANALYZING)
  const existingAssessment = await prisma.practiceSession.findFirst({
    where: {
      userId: user.id,
      type: "ASSESSMENT",
      status: {
        in: ["IN_PROGRESS", "ANALYZING"],
      },
    },
    include: {
      utterances: {
        select: {
          sequence: true,
          transcript: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  if (existingAssessment) {
    // If ANALYZING is stale (> 2 minutes), automatically recover to IN_PROGRESS
    if (
      existingAssessment.status === "ANALYZING" &&
      existingAssessment.updatedAt &&
      Date.now() - new Date(existingAssessment.updatedAt).getTime() > STALE_ANALYZING_THRESHOLD_MS
    ) {
      await prisma.practiceSession.updateMany({
        where: { id: existingAssessment.id, status: "ANALYZING" },
        data: { status: "IN_PROGRESS" },
      });
      existingAssessment.status = "IN_PROGRESS";
    }

    const answeredSequences = existingAssessment.utterances
      .filter((u) => u.transcript && u.transcript.trim().length > 0)
      .map((u) => u.sequence)
      .sort((a, b) => a - b);

    return {
      assessment: {
        id: existingAssessment.id,
        status: existingAssessment.status,
        startedAt: existingAssessment.startedAt,
      },
      answeredSequences,
      isNew: false,
    };
  }

  const newAssessment = await prisma.practiceSession.create({
    data: {
      userId: user.id,
      type: "ASSESSMENT",
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });

  return {
    assessment: {
      id: newAssessment.id,
      status: newAssessment.status,
      startedAt: newAssessment.startedAt,
    },
    answeredSequences: [],
    isNew: true,
  };
}

export async function getAssessmentSessionById(auth: AuthContext, sessionId: string) {
  const user = await prisma.user.findUnique({
    where: {
      firebaseUid: auth.uid,
    },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const session = await prisma.practiceSession.findFirst({
    where: {
      id: sessionId,
      userId: user.id,
      type: "ASSESSMENT",
    },
    include: {
      utterances: {
        select: {
          sequence: true,
          transcript: true,
          question: true,
          audioDurationMs: true,
        },
        orderBy: {
          sequence: "asc",
        },
      },
    },
  });

  if (!session) {
    const error: AppError = new Error("Assessment session not found.");
    error.statusCode = 404;
    error.code = "ASSESSMENT_NOT_FOUND";
    throw error;
  }

  // Stale check for ANALYZING session
  if (
    session.status === "ANALYZING" &&
    session.updatedAt &&
    Date.now() - new Date(session.updatedAt).getTime() > STALE_ANALYZING_THRESHOLD_MS
  ) {
    await prisma.practiceSession.updateMany({
      where: { id: session.id, status: "ANALYZING" },
      data: { status: "IN_PROGRESS" },
    });
    session.status = "IN_PROGRESS";
  }

  const answeredSequences = session.utterances
    .filter((u) => u.transcript && u.transcript.trim().length > 0)
    .map((u) => u.sequence)
    .sort((a, b) => a - b);

  return {
    assessment: {
      id: session.id,
      status: session.status,
      overallScore: session.overallScore,
      metrics: session.metrics,
      feedback: session.feedback,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    answeredSequences,
    utterances: session.utterances,
  };
}

export async function saveAssessmentResponse(
  auth: AuthContext,
  sessionId: string,
  sequence: number,
  durationMs: number,
  audioBuffer: Buffer,
  audioMimeType: string,
  transcriber: TranscribeFunction = transcribeWithSarvam
) {
  if (![1, 2, 3].includes(sequence)) {
    const error: AppError = new Error("Sequence must be 1, 2, or 3.");
    error.statusCode = 400;
    error.code = "INVALID_SEQUENCE";
    throw error;
  }

  if (
    typeof durationMs !== "number" ||
    !Number.isInteger(durationMs) ||
    durationMs < 1000 ||
    durationMs > 30000
  ) {
    const error: AppError = new Error("durationMs must be an integer between 1000 and 30000.");
    error.statusCode = 400;
    error.code = "INVALID_DURATION";
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: {
      firebaseUid: auth.uid,
    },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const session = await prisma.practiceSession.findFirst({
    where: {
      id: sessionId,
      userId: user.id,
      type: "ASSESSMENT",
    },
  });

  if (!session) {
    const error: AppError = new Error("Assessment session not found.");
    error.statusCode = 404;
    error.code = "ASSESSMENT_NOT_FOUND";
    throw error;
  }

  if (session.status !== "IN_PROGRESS") {
    const error: AppError = new Error("Assessment session is not in progress.");
    error.statusCode = 409;
    error.code = "ASSESSMENT_NOT_ACTIVE";
    throw error;
  }

  // Idempotent retry check: If an Utterance for (sessionId, sequence) already exists with a transcript, return it
  const existingUtterance = await prisma.utterance.findUnique({
    where: {
      sessionId_sequence: {
        sessionId,
        sequence,
      },
    },
  });

  if (existingUtterance && existingUtterance.transcript && existingUtterance.transcript.trim()) {
    return existingUtterance;
  }

  // Transcribe audio using Sarvam
  const { transcript } = await transcriber(audioBuffer, audioMimeType);
  const trimmedTranscript = transcript ? transcript.trim() : "";

  if (!trimmedTranscript) {
    const error: AppError = new Error("No speech could be recognized in the audio.");
    error.statusCode = 422;
    error.code = "TRANSCRIPT_EMPTY";
    throw error;
  }

  const question = CANONICAL_ASSESSMENT_PROMPTS[sequence] || "Speaking prompt";

  const utterance = await prisma.utterance.upsert({
    where: {
      sessionId_sequence: {
        sessionId,
        sequence,
      },
    },
    update: {
      question,
      transcript: trimmedTranscript,
      audioDurationMs: durationMs,
    },
    create: {
      sessionId,
      sequence,
      question,
      transcript: trimmedTranscript,
      audioDurationMs: durationMs,
    },
  });

  return utterance;
}

function parseAndValidateStoredReport(
  session: {
    id: string;
    overallScore: number | null;
    metrics: unknown;
    feedback: unknown;
    completedAt: Date | null;
  }
): AssessmentReport {
  if (session.overallScore === null || !session.completedAt) {
    const error: AppError = new Error("Stored assessment report is missing score or completion timestamp.");
    error.statusCode = 500;
    error.code = "ASSESSMENT_REPORT_INVALID";
    throw error;
  }

  const parsedMetrics = PersistedMetricsSchema.safeParse(session.metrics);
  if (!parsedMetrics.success) {
    const error: AppError = new Error("Stored assessment report metrics are invalid or corrupt.");
    error.statusCode = 500;
    error.code = "ASSESSMENT_REPORT_INVALID";
    throw error;
  }

  const parsedFeedback = PersistedFeedbackSchema.safeParse(session.feedback);
  if (!parsedFeedback.success) {
    const error: AppError = new Error("Stored assessment report feedback is invalid or corrupt.");
    error.statusCode = 500;
    error.code = "ASSESSMENT_REPORT_INVALID";
    throw error;
  }

  return {
    sessionId: session.id,
    overallScore: session.overallScore,
    subScores: parsedFeedback.data.subScores,
    metrics: parsedMetrics.data as AggregateMetrics,
    strengths: parsedFeedback.data.strengths,
    weaknesses: parsedFeedback.data.weaknesses,
    feedback: parsedFeedback.data.feedback,
    completedAt: session.completedAt,
  };
}

export async function completeAssessmentSession(
  auth: AuthContext,
  sessionId: string,
  evaluator: EvaluateAssessmentFunction = evaluateAssessmentWithSarvam
): Promise<AssessmentReport> {
  const user = await prisma.user.findUnique({
    where: {
      firebaseUid: auth.uid,
    },
    include: {
      profile: true,
    },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const session = await prisma.practiceSession.findFirst({
    where: {
      id: sessionId,
      userId: user.id,
      type: "ASSESSMENT",
    },
    include: {
      utterances: {
        orderBy: {
          sequence: "asc",
        },
      },
    },
  });

  if (!session) {
    const error: AppError = new Error("Assessment session not found.");
    error.statusCode = 404;
    error.code = "ASSESSMENT_NOT_FOUND";
    throw error;
  }

  // Idempotency check 1: If already COMPLETED, validate and return stored report directly without re-evaluating
  if (session.status === "COMPLETED") {
    return parseAndValidateStoredReport(session);
  }

  // Concurrency & Stale Check: If ANALYZING, check if stale (> 2 minutes)
  if (session.status === "ANALYZING") {
    const isStale =
      session.updatedAt &&
      Date.now() - new Date(session.updatedAt).getTime() > STALE_ANALYZING_THRESHOLD_MS;

    if (isStale) {
      // Revert stale ANALYZING to IN_PROGRESS so it can be reclaimed
      await prisma.practiceSession.updateMany({
        where: { id: session.id, status: "ANALYZING" },
        data: { status: "IN_PROGRESS" },
      });
      session.status = "IN_PROGRESS";
    } else {
      const error: AppError = new Error("Assessment evaluation is already in progress.");
      error.statusCode = 409;
      error.code = "ASSESSMENT_ANALYSIS_IN_PROGRESS";
      throw error;
    }
  }

  if (session.status !== "IN_PROGRESS") {
    const error: AppError = new Error("Assessment session is not in progress.");
    error.statusCode = 409;
    error.code = "ASSESSMENT_NOT_ACTIVE";
    throw error;
  }

  // Completeness check: all 3 prompts must be transcribed
  const utterances = session.utterances;
  const validUtterances = utterances.filter(
    (u) => u.transcript && u.transcript.trim().length > 0 && u.audioDurationMs !== null
  );

  const sequences = new Set(validUtterances.map((u) => u.sequence));
  if (!sequences.has(1) || !sequences.has(2) || !sequences.has(3) || validUtterances.length < 3) {
    const error: AppError = new Error(
      "All 3 speaking prompts must be recorded and transcribed before completing the assessment."
    );
    error.statusCode = 409;
    error.code = "ASSESSMENT_INCOMPLETE";
    throw error;
  }

  // Atomically claim IN_PROGRESS -> ANALYZING
  const claimResult = await prisma.practiceSession.updateMany({
    where: {
      id: session.id,
      userId: user.id,
      status: "IN_PROGRESS",
    },
    data: {
      status: "ANALYZING",
    },
  });

  if (claimResult.count === 0) {
    const refreshed = await prisma.practiceSession.findUnique({
      where: { id: session.id },
    });
    if (refreshed?.status === "COMPLETED") {
      return parseAndValidateStoredReport(refreshed);
    }
    const error: AppError = new Error("Assessment evaluation is already in progress.");
    error.statusCode = 409;
    error.code = "ASSESSMENT_ANALYSIS_IN_PROGRESS";
    throw error;
  }

  // Wrap ENTIRE remaining pipeline in recovery block so any exception cleanly rolls status back to IN_PROGRESS
  try {
    // 1. Calculate deterministic metrics for each utterance
    const calculatedUtteranceMetrics = validUtterances.map((u) => {
      const m = calculateUtteranceMetrics(u.transcript || "", u.audioDurationMs || 0);
      return {
        utteranceId: u.id,
        sequence: u.sequence,
        question: u.question,
        transcript: u.transcript || "",
        durationSeconds: m.durationSeconds,
        metrics: m,
      };
    });

    const aggregateMetrics = calculateAggregateMetrics(
      calculatedUtteranceMetrics.map((item) => ({
        wordCount: item.metrics.wordCount,
        durationSeconds: item.metrics.durationSeconds,
        fillerCount: item.metrics.fillerCount,
      }))
    );

    // 2. Call Sarvam 105B LLM for rubric evaluation across all 3 prompts
    const llmEvaluation: LlmEvaluation = await evaluator(
      calculatedUtteranceMetrics.map((item) => ({
        sequence: item.sequence,
        question: item.question,
        transcript: item.transcript,
        durationSeconds: item.durationSeconds,
      }))
    );

    // 3. Compute backend-owned weighted score
    const deliverySubScore = aggregateMetrics.deliveryScore; // 0-100 (25%)
    const grammarSubScore = Math.round((llmEvaluation.grammarScore / 5) * 100); // 20%
    const structureSubScore = Math.round((llmEvaluation.structureScore / 5) * 100); // 20%
    const vocabularySubScore = Math.round((llmEvaluation.vocabularyScore / 5) * 100); // 15%
    const communicationSubScore = Math.round((llmEvaluation.communicationScore / 5) * 100); // 15%
    const relevanceSubScore = Math.round((llmEvaluation.relevanceScore / 5) * 100); // 5%

    const overallScore = Math.max(
      1,
      Math.min(
        100,
        Math.round(
          deliverySubScore * 0.25 +
            grammarSubScore * 0.2 +
            structureSubScore * 0.2 +
            vocabularySubScore * 0.15 +
            communicationSubScore * 0.15 +
            relevanceSubScore * 0.05
        )
      )
    );

    const subScores = {
      delivery: deliverySubScore,
      grammar: grammarSubScore,
      structure: structureSubScore,
      vocabulary: vocabularySubScore,
      communication: communicationSubScore,
      relevance: relevanceSubScore,
    };

    const completedAt = new Date();

    // 4. Atomic database transaction updating Utterances, PracticeSession, and Profile
    await prisma.$transaction(async (tx) => {
      // Update each Utterance with deterministic metrics
      for (const item of calculatedUtteranceMetrics) {
        await tx.utterance.update({
          where: { id: item.utteranceId },
          data: {
            wordCount: item.metrics.wordCount,
            wordsPerMinute: item.metrics.wordsPerMinute,
            fillerCount: item.metrics.fillerCount,
            metrics: {
              fillerPercentage: item.metrics.fillerPercentage,
              durationSeconds: item.metrics.durationSeconds,
            },
          },
        });
      }

      // Finalize PracticeSession with full required version metadata
      await tx.practiceSession.update({
        where: { id: session.id },
        data: {
          status: "COMPLETED",
          overallScore,
          metrics: aggregateMetrics as unknown as object,
          feedback: {
            subScores,
            strengths: llmEvaluation.strengths,
            weaknesses: llmEvaluation.weaknesses,
            feedback: llmEvaluation.feedback,
            rubricVersion: SCORING_VERSIONS.rubricVersion,
            llmModel: SCORING_VERSIONS.llmModel,
          },
          completedAt,
        },
      });

      // Update Profile (Preserving baselineScore if already exists, and atomic increment for speaking seconds)
      const currentBaselineScore = user.profile?.baselineScore ?? overallScore;

      await tx.profile.upsert({
        where: { userId: user.id },
        update: {
          baselineScore: currentBaselineScore,
          currentScore: overallScore,
          weaknesses: llmEvaluation.weaknesses,
          totalSpeakingSeconds: {
            increment: aggregateMetrics.totalSpeakingSeconds,
          },
        },
        create: {
          userId: user.id,
          baselineScore: overallScore,
          currentScore: overallScore,
          weaknesses: llmEvaluation.weaknesses,
          totalSpeakingSeconds: aggregateMetrics.totalSpeakingSeconds,
        },
      });
    });

    return {
      sessionId: session.id,
      overallScore,
      subScores,
      metrics: aggregateMetrics,
      strengths: llmEvaluation.strengths,
      weaknesses: llmEvaluation.weaknesses,
      feedback: llmEvaluation.feedback,
      completedAt,
    };
  } catch (error) {
    // If any step fails (evaluator, score calculation, or DB transaction), revert ANALYZING -> IN_PROGRESS
    await prisma.practiceSession.updateMany({
      where: {
        id: session.id,
        status: "ANALYZING",
      },
      data: {
        status: "IN_PROGRESS",
      },
    });
    throw error;
  }
}
