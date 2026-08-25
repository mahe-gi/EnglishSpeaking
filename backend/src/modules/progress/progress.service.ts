import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";
import { AppError } from "../../middleware/error.middleware.js";
import { getScenarioById, PRACTICE_SCENARIOS } from "../practice/practice-scenarios.js";
import { PersistedPracticeFeedbackSchema, PracticeFocusAreaSchema } from "../practice/practice.schema.js";
import { PersistedFeedbackSchema, PersistedMetricsSchema } from "../assessments/assessments.service.js";

export async function getUserProgress(auth: AuthContext) {
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

  // 1. Fetch completed Baseline Assessment
  const baselineSession = await prisma.practiceSession.findFirst({
    where: {
      userId: user.id,
      type: "ASSESSMENT",
      status: "COMPLETED",
    },
    include: {
      utterances: {
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: {
      completedAt: "desc",
    },
  });

  let baselineData = null;

  if (baselineSession) {
    // Validate stored baseline feedback with Phase 2 Zod schema
    const parsedFeedback = PersistedFeedbackSchema.safeParse(baselineSession.feedback);
    const parsedMetrics = PersistedMetricsSchema.safeParse(baselineSession.metrics);

    let dimensions = null;
    let weaknesses: string[] = [];

    if (parsedFeedback.success) {
      dimensions = parsedFeedback.data.subScores;
      weaknesses = parsedFeedback.data.weaknesses;
    } else if (Array.isArray(user.profile?.weaknesses)) {
      weaknesses = user.profile.weaknesses as string[];
    }

    let baselineWpm: number | null = null;
    let baselineFillerPercentage: number | null = null;

    if (parsedMetrics.success) {
      baselineWpm = parsedMetrics.data.averageWpm;
      baselineFillerPercentage = parsedMetrics.data.aggregateFillerPercentage;
    } else if (baselineSession.utterances.length > 0) {
      let baselineWords = 0;
      let baselineDurationMs = 0;
      let baselineFillers = 0;

      for (const u of baselineSession.utterances) {
        baselineWords += u.wordCount || 0;
        baselineDurationMs += u.audioDurationMs || 0;
        baselineFillers += u.fillerCount || 0;
      }

      const baselineDurationMinutes = baselineDurationMs / 60000;
      baselineWpm = baselineDurationMinutes > 0 ? Math.round(baselineWords / baselineDurationMinutes) : null;
      baselineFillerPercentage =
        baselineWords > 0 ? parseFloat(((baselineFillers / baselineWords) * 100).toFixed(1)) : null;
    }

    baselineData = {
      score: user.profile?.baselineScore ?? null,
      assessedAt: baselineSession.completedAt ? baselineSession.completedAt.toISOString() : null,
      dimensions,
      wpm: baselineWpm,
      fillerPercentage: baselineFillerPercentage,
      weaknesses,
    };
  }

  // 2. Count total completed AI practice sessions
  const completedPracticeSessions = await prisma.practiceSession.count({
    where: {
      userId: user.id,
      type: "AI_PRACTICE",
      status: "COMPLETED",
    },
  });

  // 3. Calculate lifetime practice speaking duration across ALL completed practice sessions
  const practiceDurationAggregate = await prisma.utterance.aggregate({
    where: {
      practiceSession: {
        userId: user.id,
        type: "AI_PRACTICE",
        status: "COMPLETED",
      },
    },
    _sum: {
      audioDurationMs: true,
    },
  });

  const totalPracticeSpeakingSeconds = Math.round(
    (practiceDurationAggregate._sum.audioDurationMs || 0) / 1000
  );
  const totalPracticeSpeakingMinutes = parseFloat((totalPracticeSpeakingSeconds / 60).toFixed(1));

  // 4. Fetch recent completed AI practice sessions for recent metrics (20) and history (10)
  const recentAiSessions = await prisma.practiceSession.findMany({
    where: {
      userId: user.id,
      type: "AI_PRACTICE",
      status: "COMPLETED",
    },
    include: {
      utterances: {
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: {
      completedAt: "desc",
    },
    take: 20,
  });

  let totalRecentWords = 0;
  let totalRecentDurationMs = 0;
  let totalRecentFillers = 0;

  const focusAreaCounts: Record<string, number> = {
    GRAMMAR: 0,
    STRUCTURE: 0,
    VOCABULARY: 0,
    CLARITY: 0,
    DELIVERY: 0,
    RELEVANCE: 0,
  };

  const recentHistoryList: Array<{
    id: string;
    scenarioId: string;
    scenarioTitle: string;
    scenarioCategory: string;
    completedAt: string | null;
    speakingSeconds: number;
    wpm: number;
    fillerCount: number;
    primaryFocusArea: string | null;
  }> = [];

  for (let i = 0; i < recentAiSessions.length; i++) {
    const s = recentAiSessions[i]!;
    const scenario = getScenarioById(s.scenario || "") || PRACTICE_SCENARIOS[0]!;

    let sessionSpeakingDurationMs = 0;
    let sessionWords = 0;
    let sessionFillers = 0;
    const sessionFocusAreas: string[] = [];

    for (const u of s.utterances) {
      const dur = u.audioDurationMs || 0;
      const words = u.wordCount || 0;
      const fillers = u.fillerCount || 0;

      sessionSpeakingDurationMs += dur;
      sessionWords += words;
      sessionFillers += fillers;

      // Extract focus area safely with Zod validation
      const metricsObj = u.metrics as Record<string, unknown> | null;
      if (metricsObj && metricsObj.practiceFeedback) {
        const parsed = PersistedPracticeFeedbackSchema.safeParse(metricsObj.practiceFeedback);
        if (parsed.success && parsed.data.focusArea) {
          const area = parsed.data.focusArea;
          if (PracticeFocusAreaSchema.safeParse(area).success) {
            focusAreaCounts[area] = (focusAreaCounts[area] || 0) + 1;
            sessionFocusAreas.push(area);
          }
        }
      }
    }

    const sessionSpeakingSeconds = Math.round(sessionSpeakingDurationMs / 1000);

    totalRecentWords += sessionWords;
    totalRecentDurationMs += sessionSpeakingDurationMs;
    totalRecentFillers += sessionFillers;

    // Determine primary focus area for this session (null if no valid focus recorded)
    const primaryFocusArea =
      sessionFocusAreas.length > 0 ? sessionFocusAreas[sessionFocusAreas.length - 1]! : null;

    const sessionMinutes = sessionSpeakingDurationMs / 60000;
    const sessionWpm = sessionMinutes > 0 ? Math.round(sessionWords / sessionMinutes) : 0;

    if (i < 10) {
      recentHistoryList.push({
        id: s.id,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        scenarioCategory: scenario.category,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        speakingSeconds: sessionSpeakingSeconds,
        wpm: sessionWpm,
        fillerCount: sessionFillers,
        primaryFocusArea,
      });
    }
  }

  // Calculate aggregated recent WPM and filler percentage
  const totalRecentMinutes = totalRecentDurationMs / 60000;
  const recentWpm =
    totalRecentMinutes > 0 && totalRecentWords > 0 ? Math.round(totalRecentWords / totalRecentMinutes) : null;
  const recentFillerPercentage =
    totalRecentWords > 0 ? parseFloat(((totalRecentFillers / totalRecentWords) * 100).toFixed(1)) : null;

  return {
    baseline: baselineData,
    practice: {
      completedSessions: completedPracticeSessions,
      speakingSeconds: totalPracticeSpeakingSeconds,
      speakingMinutes: totalPracticeSpeakingMinutes,
      recentWpm,
      recentFillerPercentage,
    },
    focusAreas: focusAreaCounts,
    recentSessions: recentHistoryList,
  };
}
