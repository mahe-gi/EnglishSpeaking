export const HIGH_CONFIDENCE_FILLERS = new Set([
  "um",
  "umm",
  "uh",
  "uhh",
  "er",
  "erm",
]);

export const SCORING_VERSIONS = {
  scoringVersion: "baseline-v1",
  metricsVersion: "speech-metrics-v1",
  rubricVersion: "assessment-rubric-v1",
  sttModel: "saaras:v4",
  llmModel: "sarvam-105b",
} as const;

export interface UtteranceMetrics {
  wordCount: number;
  durationSeconds: number;
  wordsPerMinute: number;
  fillerCount: number;
  fillerPercentage: number;
}

export interface AggregateMetrics {
  totalWordCount: number;
  totalSpeakingSeconds: number;
  averageWpm: number;
  totalFillerCount: number;
  aggregateFillerPercentage: number;
  deliveryScore: number; // 0 to 100
  versionMetadata?: typeof SCORING_VERSIONS;
}

export function tokenizeWords(transcript: string): string[] {
  if (!transcript || typeof transcript !== "string") {
    return [];
  }
  // Unicode-aware word tokenization that includes letters \p{L}, numbers \p{N}, combining marks \p{M} (Indic matras), and contractions
  return transcript.toLowerCase().match(/[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu) ?? [];
}

export function calculateUtteranceMetrics(
  transcript: string,
  audioDurationMs: number
): UtteranceMetrics {
  const words = tokenizeWords(transcript);
  const wordCount = words.length;
  const durationSeconds = Math.max(1, audioDurationMs / 1000);
  const wordsPerMinute = parseFloat(((wordCount / durationSeconds) * 60).toFixed(1));

  let fillerCount = 0;
  for (const word of words) {
    if (HIGH_CONFIDENCE_FILLERS.has(word)) {
      fillerCount++;
    }
  }

  const fillerPercentage =
    wordCount > 0 ? parseFloat(((fillerCount / wordCount) * 100).toFixed(1)) : 0;

  return {
    wordCount,
    durationSeconds: Math.round(durationSeconds),
    wordsPerMinute,
    fillerCount,
    fillerPercentage,
  };
}

export function calculateAggregateMetrics(
  utterances: Array<{ wordCount: number; durationSeconds: number; fillerCount: number }>
): AggregateMetrics {
  const totalWordCount = utterances.reduce((acc, u) => acc + u.wordCount, 0);
  const totalSpeakingSeconds = utterances.reduce((acc, u) => acc + u.durationSeconds, 0);
  const totalFillerCount = utterances.reduce((acc, u) => acc + u.fillerCount, 0);

  const averageWpm =
    totalSpeakingSeconds > 0
      ? parseFloat(((totalWordCount / totalSpeakingSeconds) * 60).toFixed(1))
      : 0;

  const aggregateFillerPercentage =
    totalWordCount > 0
      ? parseFloat(((totalFillerCount / totalWordCount) * 100).toFixed(1))
      : 0;

  // Delivery / Fluency Sub-Score (0-100 scale based on WPM & high-confidence filler penalty)
  let wpmBase = 70;
  if (averageWpm >= 110 && averageWpm <= 150) {
    wpmBase = 95;
  } else if ((averageWpm >= 90 && averageWpm < 110) || (averageWpm > 150 && averageWpm <= 170)) {
    wpmBase = 85;
  } else if ((averageWpm >= 70 && averageWpm < 90) || (averageWpm > 170 && averageWpm <= 190)) {
    wpmBase = 70;
  } else if (averageWpm >= 50 && averageWpm < 70) {
    wpmBase = 55;
  } else {
    wpmBase = 40;
  }

  let fillerPenalty = 0;
  if (aggregateFillerPercentage > 5) {
    fillerPenalty = 20;
  } else if (aggregateFillerPercentage > 3) {
    fillerPenalty = 10;
  } else if (aggregateFillerPercentage > 1.5) {
    fillerPenalty = 5;
  }

  const deliveryScore = Math.max(20, Math.min(100, Math.round(wpmBase - fillerPenalty)));

  return {
    totalWordCount,
    totalSpeakingSeconds,
    averageWpm,
    totalFillerCount,
    aggregateFillerPercentage,
    deliveryScore,
    versionMetadata: SCORING_VERSIONS,
  };
}
