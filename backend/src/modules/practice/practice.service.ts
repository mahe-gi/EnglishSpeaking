import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";
import { AppError } from "../../middleware/error.middleware.js";
import { transcribeWithSarvam, TranscribeFunction } from "../../services/sarvam.service.js";
import { calculateUtteranceMetrics } from "../../services/metrics.service.js";
import {
  evaluatePracticeTurnWithSarvam,
  EvaluatePracticeTurnFunction,
} from "../../services/practice-llm.service.js";
import {
  PRACTICE_SCENARIOS,
  getScenarioById,
  selectScenarioForUser,
} from "./practice-scenarios.js";
import {
  PracticeTurnFeedback,
  PersistedPracticeFeedbackSchema,
  PersistedPracticeFeedback,
  PRACTICE_VERSIONS,
} from "./practice.schema.js";

export async function finalizePracticeSessionExactlyOnce(
  tx: {
    practiceSession: { updateMany: typeof prisma.practiceSession.updateMany };
    profile: { update: typeof prisma.profile.update };
  },
  sessionId: string,
  userId: string,
  totalSpeakingSeconds: number
): Promise<boolean> {
  const claimed = await tx.practiceSession.updateMany({
    where: {
      id: sessionId,
      userId,
      type: "AI_PRACTICE",
      status: "IN_PROGRESS",
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  if (claimed.count === 1) {
    await tx.profile.update({
      where: { userId },
      data: {
        totalSpeakingSeconds: {
          increment: totalSpeakingSeconds,
        },
      },
    });
    return true;
  }

  return false;
}

export async function startPracticeSession(auth: AuthContext) {
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

  // 1. Onboarding check
  const hasCompleteProfile = !!(
    user.profile &&
    user.profile.careerStatus &&
    user.profile.goal &&
    user.profile.nativeLanguage &&
    user.profile.confidence
  );

  if (!hasCompleteProfile) {
    const error: AppError = new Error("Complete onboarding before starting daily practice.");
    error.statusCode = 409;
    error.code = "ONBOARDING_REQUIRED";
    throw error;
  }

  // 2. Baseline assessment check: authoritatively require a COMPLETED assessment session
  const completedAssessment = await prisma.practiceSession.findFirst({
    where: {
      userId: user.id,
      type: "ASSESSMENT",
      status: "COMPLETED",
    },
  });

  if (!completedAssessment) {
    const error: AppError = new Error("Complete your baseline speaking assessment before starting daily practice.");
    error.statusCode = 409;
    error.code = "ASSESSMENT_REQUIRED";
    throw error;
  }

  // 3. Check for existing active AI_PRACTICE session
  const activeSession = await prisma.practiceSession.findFirst({
    where: {
      userId: user.id,
      type: "AI_PRACTICE",
      status: "IN_PROGRESS",
    },
    include: {
      utterances: {
        orderBy: {
          sequence: "asc",
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  if (activeSession) {
    const scenario = getScenarioById(activeSession.scenario || "") || PRACTICE_SCENARIOS[0]!;
    const completedUtterances: Array<{
      sequence: number;
      question: string;
      durationMs: number;
      feedback: PersistedPracticeFeedback;
    }> = [];
    const pendingUtterances = new Map<number, { sequence: number; question: string; durationMs: number; transcript: string }>();

    for (const u of activeSession.utterances) {
      const metricsObj = u.metrics as Record<string, unknown> | null;
      if (u.transcript && metricsObj && metricsObj.practiceFeedback) {
        const parsed = PersistedPracticeFeedbackSchema.safeParse(metricsObj.practiceFeedback);
        if (parsed.success) {
          completedUtterances.push({
            sequence: u.sequence,
            question: u.question,
            durationMs: u.audioDurationMs || 0,
            feedback: parsed.data,
          });
          continue;
        }
      }
      if (u.transcript && u.transcript.trim().length > 0) {
        pendingUtterances.set(u.sequence, {
          sequence: u.sequence,
          question: u.question,
          durationMs: u.audioDurationMs || 0,
          transcript: u.transcript,
        });
      }
    }

    const answeredSequences = completedUtterances.map((u) => u.sequence);
    let nextTurn: {
      sequence: number;
      question: string;
      feedbackPending?: boolean;
      durationMs?: number;
    } | null = null;

    if (answeredSequences.length === 0) {
      const pending1 = pendingUtterances.get(1);
      nextTurn = {
        sequence: 1,
        question: scenario.initialQuestion,
        feedbackPending: !!pending1,
        durationMs: pending1?.durationMs,
      };
    } else if (answeredSequences.length === 1) {
      const turn1Feedback = completedUtterances.find((u) => u.sequence === 1)?.feedback;
      const turn2Question = turn1Feedback?.followUpQuestion || scenario.initialQuestion;
      const pending2 = pendingUtterances.get(2);
      nextTurn = {
        sequence: 2,
        question: turn2Question,
        feedbackPending: !!pending2,
        durationMs: pending2?.durationMs,
      };
    } else if (answeredSequences.length === 2) {
      const turn2Feedback = completedUtterances.find((u) => u.sequence === 2)?.feedback;
      const turn3Question = turn2Feedback?.followUpQuestion || scenario.initialQuestion;
      const pending3 = pendingUtterances.get(3);
      nextTurn = {
        sequence: 3,
        question: turn3Question,
        feedbackPending: !!pending3,
        durationMs: pending3?.durationMs,
      };
    } else {
      // 3 completed turns: self-heal finalize session exactly once with speaking time
      const totalSpeakingSeconds = Math.round(
        completedUtterances.reduce((acc, u) => acc + (u.durationMs || 0), 0) / 1000
      );
      await prisma.$transaction(async (tx) => {
        await finalizePracticeSessionExactlyOnce(tx, activeSession.id, user.id, totalSpeakingSeconds);
      });
      nextTurn = null;
    }

    return {
      session: {
        id: activeSession.id,
        status: answeredSequences.length >= 3 ? "COMPLETED" : activeSession.status,
      },
      scenario: {
        id: scenario.id,
        title: scenario.title,
        difficulty: scenario.difficulty,
        category: scenario.category,
      },
      answeredSequences,
      nextTurn,
      isNew: false,
    };
  }

  // 4. Create fresh AI_PRACTICE session
  const recentCompletedSession = await prisma.practiceSession.findFirst({
    where: {
      userId: user.id,
      type: "AI_PRACTICE",
      status: "COMPLETED",
    },
    orderBy: {
      completedAt: "desc",
    },
  });

  const scenario = selectScenarioForUser(
    user.profile?.careerStatus,
    recentCompletedSession?.scenario
  );

  const newSession = await prisma.practiceSession.create({
    data: {
      userId: user.id,
      type: "AI_PRACTICE",
      status: "IN_PROGRESS",
      scenario: scenario.id,
      startedAt: new Date(),
    },
  });

  return {
    session: {
      id: newSession.id,
      status: newSession.status,
    },
    scenario: {
      id: scenario.id,
      title: scenario.title,
      difficulty: scenario.difficulty,
      category: scenario.category,
    },
    answeredSequences: [],
    nextTurn: {
      sequence: 1,
      question: scenario.initialQuestion,
    },
    isNew: true,
  };
}

export async function recordPracticeResponse(
  auth: AuthContext,
  sessionId: string,
  sequence: number,
  durationMs: number,
  audioBuffer?: Buffer | null,
  audioMimeType?: string | null,
  transcriber: TranscribeFunction = transcribeWithSarvam,
  evaluator: EvaluatePracticeTurnFunction = evaluatePracticeTurnWithSarvam
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
    const error: AppError = new Error("Practice session not found.");
    error.statusCode = 404;
    error.code = "PRACTICE_SESSION_NOT_FOUND";
    throw error;
  }

  if (session.type !== "AI_PRACTICE") {
    const error: AppError = new Error("Invalid session type.");
    error.statusCode = 409;
    error.code = "INVALID_SESSION_TYPE";
    throw error;
  }

  const scenario = getScenarioById(session.scenario || "") || PRACTICE_SCENARIOS[0]!;

  // Build map of existing completed turns with validated feedback
  const completedTurns = new Map<
    number,
    {
      utteranceId: string;
      sequence: number;
      question: string;
      transcript: string;
      durationMs: number;
      wordsPerMinute: number;
      fillerCount: number;
      wordCount: number;
      feedback: PersistedPracticeFeedback;
    }
  >();

  for (const u of session.utterances) {
    const metricsObj = u.metrics as Record<string, unknown> | null;
    if (u.transcript && metricsObj && metricsObj.practiceFeedback) {
      const parsed = PersistedPracticeFeedbackSchema.safeParse(metricsObj.practiceFeedback);
      if (parsed.success) {
        completedTurns.set(u.sequence, {
          utteranceId: u.id,
          sequence: u.sequence,
          question: u.question,
          transcript: u.transcript,
          durationMs: u.audioDurationMs || 0,
          wordsPerMinute: u.wordsPerMinute || 0,
          fillerCount: u.fillerCount || 0,
          wordCount: u.wordCount || 0,
          feedback: parsed.data,
        });
      }
    }
  }

  // --- STAGE A: FULL IDEMPOTENCY CHECK ---
  // If this exact sequence was already fully transcribed and evaluated, return stored response immediately
  if (completedTurns.has(sequence)) {
    const existing = completedTurns.get(sequence)!;
    const isTurn3 = sequence === 3;

    // If turn 3 is being retried and session is not yet COMPLETED, finalize it exactly once
    if (isTurn3 && session.status === "IN_PROGRESS") {
      const totalSpeakingSeconds = Math.round(
        Array.from(completedTurns.values()).reduce((acc, t) => acc + t.durationMs, 0) / 1000
      );
      await prisma.$transaction(async (tx) => {
        await finalizePracticeSessionExactlyOnce(tx, session.id, user.id, totalSpeakingSeconds);
      });
    }

    let summary = null;
    if (isTurn3) {
      const allTurns = Array.from(completedTurns.values());
      const totalSpeakingSeconds = Math.round(allTurns.reduce((acc, t) => acc + t.durationMs, 0) / 1000);
      const avgWpm = Math.round(
        allTurns.reduce((acc, t) => acc + t.wordsPerMinute, 0) / (allTurns.length || 1)
      );
      const totalFillers = allTurns.reduce((acc, t) => acc + t.fillerCount, 0);

      summary = {
        speakingSeconds: totalSpeakingSeconds,
        averageWpm: avgWpm,
        fillerCount: totalFillers,
        primaryFocusArea: existing.feedback.focusArea,
        strength: existing.feedback.sessionSummary?.strength || existing.feedback.summary,
        nextPracticeSuggestion:
          existing.feedback.sessionSummary?.nextPracticeSuggestion ||
          "Continue daily speaking practice with varied interview scenarios.",
      };
    }

    return {
      utterance: {
        sequence: existing.sequence,
        question: existing.question,
        transcript: existing.transcript,
        metrics: {
          wordCount: existing.wordCount,
          wordsPerMinute: existing.wordsPerMinute,
          fillerCount: existing.fillerCount,
        },
      },
      feedback: {
        summary: existing.feedback.summary,
        grammarIssues: existing.feedback.grammarIssues,
        betterVersion: existing.feedback.betterVersion,
        focusArea: existing.feedback.focusArea,
        encouragement: existing.feedback.encouragement,
      },
      nextTurn:
        !isTurn3 && existing.feedback.followUpQuestion
          ? { sequence: sequence + 1, question: existing.feedback.followUpQuestion }
          : null,
      sessionCompleted: isTurn3,
      summary,
    };
  }

  // If session is already completed and this is not an existing completed turn, reject
  if (session.status !== "IN_PROGRESS") {
    const error: AppError = new Error("Practice session is already completed.");
    error.statusCode = 409;
    error.code = "PRACTICE_SESSION_NOT_ACTIVE";
    throw error;
  }

  // --- 1. SERVER-OWNED SEQUENCE ORDERING VALIDATION ---
  if (sequence === 2 && !completedTurns.has(1)) {
    const error: AppError = new Error("Turn 1 must be completed before answering Turn 2.");
    error.statusCode = 409;
    error.code = "INVALID_PRACTICE_SEQUENCE";
    throw error;
  }

  if (sequence === 3 && (!completedTurns.has(1) || !completedTurns.has(2))) {
    const error: AppError = new Error("Turns 1 and 2 must be completed before answering Turn 3.");
    error.statusCode = 409;
    error.code = "INVALID_PRACTICE_SEQUENCE";
    throw error;
  }

  // --- 2. SERVER-OWNED QUESTION RESOLUTION ---
  let questionText = "";
  if (sequence === 1) {
    questionText = scenario.initialQuestion;
  } else if (sequence === 2) {
    const turn1 = completedTurns.get(1);
    if (!turn1?.feedback.followUpQuestion) {
      const error: AppError = new Error("Internal consistency error: Missing turn 1 follow-up question.");
      error.statusCode = 500;
      error.code = "PRACTICE_STATE_INVALID";
      throw error;
    }
    questionText = turn1.feedback.followUpQuestion;
  } else if (sequence === 3) {
    const turn2 = completedTurns.get(2);
    if (!turn2?.feedback.followUpQuestion) {
      const error: AppError = new Error("Internal consistency error: Missing turn 2 follow-up question.");
      error.statusCode = 500;
      error.code = "PRACTICE_STATE_INVALID";
      throw error;
    }
    questionText = turn2.feedback.followUpQuestion;
  }

  // --- 3. STAGED IDEMPOTENCY: TRANSCRIPTION & DETERMINISTIC METRICS ---
  const existingUtterance = session.utterances.find((u) => u.sequence === sequence);
  let transcript = "";
  let wordCount = 0;
  let wordsPerMinute = 0;
  let fillerCount = 0;
  let durationSeconds = Math.round(durationMs / 1000);

  if (existingUtterance && existingUtterance.transcript && existingUtterance.transcript.trim().length > 0) {
    // Stage B: STT already succeeded in a prior attempt, skip STT call
    transcript = existingUtterance.transcript.trim();
    durationSeconds = Math.round((existingUtterance.audioDurationMs || durationMs) / 1000);
    const m = calculateUtteranceMetrics(transcript, (existingUtterance.audioDurationMs || durationMs));
    wordCount = m.wordCount;
    wordsPerMinute = m.wordsPerMinute;
    fillerCount = m.fillerCount;
  } else {
    // Stage C: Fresh transcription via Saaras STT
    if (!audioBuffer || audioBuffer.length === 0) {
      const error: AppError = new Error("Audio recording file is required.");
      error.statusCode = 400;
      error.code = "AUDIO_REQUIRED";
      throw error;
    }

    const { transcript: rawTranscript } = await transcriber(audioBuffer, audioMimeType || "audio/m4a");
    transcript = rawTranscript ? rawTranscript.trim() : "";

    if (!transcript) {
      const error: AppError = new Error("No speech could be recognized in the audio. Please try speaking clearly.");
      error.statusCode = 422;
      error.code = "TRANSCRIPT_EMPTY";
      throw error;
    }

    const m = calculateUtteranceMetrics(transcript, durationMs);
    wordCount = m.wordCount;
    wordsPerMinute = m.wordsPerMinute;
    fillerCount = m.fillerCount;

    // Persist transcript and deterministic metrics FIRST to guard against LLM failure
    await prisma.utterance.upsert({
      where: {
        sessionId_sequence: {
          sessionId: session.id,
          sequence,
        },
      },
      update: {
        question: questionText,
        transcript,
        audioDurationMs: durationMs,
        wordCount,
        wordsPerMinute,
        fillerCount,
        metrics: {
          durationSeconds,
          fillerPercentage: m.fillerPercentage,
        },
      },
      create: {
        sessionId: session.id,
        sequence,
        question: questionText,
        transcript,
        audioDurationMs: durationMs,
        wordCount,
        wordsPerMinute,
        fillerCount,
        metrics: {
          durationSeconds,
          fillerPercentage: m.fillerPercentage,
        },
      },
    });
  }

  // --- 4. CALL PRACTICE LLM (ONE STRUCTURED CALL) ---
  const previousTurnsList: Array<{ sequence: number; question: string; transcript: string; summary?: string }> = [];
  if (sequence >= 2 && completedTurns.has(1)) {
    const t1 = completedTurns.get(1)!;
    previousTurnsList.push({
      sequence: 1,
      question: t1.question,
      transcript: t1.transcript,
      summary: t1.feedback.summary,
    });
  }
  if (sequence === 3 && completedTurns.has(2)) {
    const t2 = completedTurns.get(2)!;
    previousTurnsList.push({
      sequence: 2,
      question: t2.question,
      transcript: t2.transcript,
      summary: t2.feedback.summary,
    });
  }

  const learnerWeaknesses = Array.isArray(user.profile?.weaknesses)
    ? (user.profile.weaknesses as string[])
    : null;

  const llmFeedback: PracticeTurnFeedback = await evaluator({
    scenario: {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      category: scenario.category,
    },
    learner: {
      careerStatus: user.profile?.careerStatus,
      goal: user.profile?.goal,
      weaknesses: learnerWeaknesses,
    },
    currentTurn: {
      sequence,
      question: questionText,
      transcript,
      durationSeconds,
      wordsPerMinute,
      fillerCount,
    },
    previousTurns: previousTurnsList,
  });

  const persistedFeedback: PersistedPracticeFeedback = {
    summary: llmFeedback.summary,
    grammarIssues: llmFeedback.grammarIssues,
    betterVersion: llmFeedback.betterVersion,
    focusArea: llmFeedback.focusArea,
    encouragement: llmFeedback.encouragement,
    followUpQuestion: sequence === 3 ? null : llmFeedback.followUpQuestion,
    sessionSummary: sequence === 3 ? llmFeedback.sessionSummary : null,
    versionMetadata: PRACTICE_VERSIONS,
  };

  // --- 5. PERSIST PRACTICE FEEDBACK ON UTTERANCE ---
  await prisma.utterance.update({
    where: {
      sessionId_sequence: {
        sessionId: session.id,
        sequence,
      },
    },
    data: {
      metrics: {
        durationSeconds,
        practiceFeedback: persistedFeedback,
      },
    },
  });

  // --- 6. SESSION FINALIZATION FOR TURN 3 ---
  const isTurn3 = sequence === 3;
  let summary = null;

  if (isTurn3) {
    // Add current turn 3 to completed set to compute session aggregate metrics
    const allSessionTurns = [
      ...Array.from(completedTurns.values()),
      {
        durationMs,
        wordsPerMinute,
        fillerCount,
      },
    ];

    const totalSpeakingSeconds = Math.round(allSessionTurns.reduce((acc, t) => acc + t.durationMs, 0) / 1000);
    const averageWpm = Math.round(
      allSessionTurns.reduce((acc, t) => acc + t.wordsPerMinute, 0) / (allSessionTurns.length || 1)
    );
    const totalFillerCount = allSessionTurns.reduce((acc, t) => acc + t.fillerCount, 0);

    await prisma.$transaction(async (tx) => {
      await finalizePracticeSessionExactlyOnce(tx, session.id, user.id, totalSpeakingSeconds);
    });

    summary = {
      speakingSeconds: totalSpeakingSeconds,
      averageWpm,
      fillerCount: totalFillerCount,
      primaryFocusArea: persistedFeedback.focusArea,
      strength: persistedFeedback.sessionSummary?.strength || persistedFeedback.summary,
      nextPracticeSuggestion:
        persistedFeedback.sessionSummary?.nextPracticeSuggestion ||
        "Continue daily speaking practice with varied interview scenarios.",
    };
  }

  return {
    utterance: {
      sequence,
      question: questionText,
      transcript,
      metrics: {
        wordCount,
        wordsPerMinute,
        fillerCount,
      },
    },
    feedback: {
      summary: persistedFeedback.summary,
      grammarIssues: persistedFeedback.grammarIssues,
      betterVersion: persistedFeedback.betterVersion,
      focusArea: persistedFeedback.focusArea,
      encouragement: persistedFeedback.encouragement,
    },
    nextTurn:
      !isTurn3 && persistedFeedback.followUpQuestion
        ? {
            sequence: sequence + 1,
            question: persistedFeedback.followUpQuestion,
          }
        : null,
    sessionCompleted: isTurn3,
    summary,
  };
}
