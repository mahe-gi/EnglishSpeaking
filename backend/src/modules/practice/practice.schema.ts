import { z } from "zod";

export const GrammarIssueSchema = z.object({
  original: z.string(),
  correction: z.string(),
  explanation: z.string(),
});

export const SessionSummarySchema = z.object({
  strength: z.string().min(1),
  nextPracticeSuggestion: z.string().min(1),
});

export const PracticeFocusAreaSchema = z.enum([
  "GRAMMAR",
  "STRUCTURE",
  "VOCABULARY",
  "CLARITY",
  "DELIVERY",
  "RELEVANCE",
]);

export const PracticeTurnFeedbackSchema = z.object({
  summary: z.string().min(1),
  grammarIssues: z.array(GrammarIssueSchema).max(3),
  betterVersion: z.string().min(1),
  focusArea: PracticeFocusAreaSchema,
  encouragement: z.string().min(1),
  followUpQuestion: z.string().nullable(),
  sessionSummary: SessionSummarySchema.nullable(),
});

export type PracticeTurnFeedback = z.infer<typeof PracticeTurnFeedbackSchema>;

export const PRACTICE_VERSIONS = {
  practicePromptVersion: "practice-turn-v1",
  metricsVersion: "speech-metrics-v1",
  sttModel: "saaras:v4",
  llmModel: "sarvam-105b",
} as const;

export const PersistedPracticeFeedbackSchema = z.object({
  summary: z.string().min(1),
  grammarIssues: z.array(GrammarIssueSchema).max(3),
  betterVersion: z.string().min(1),
  focusArea: PracticeFocusAreaSchema,
  encouragement: z.string().min(1),
  followUpQuestion: z.string().nullable(),
  sessionSummary: SessionSummarySchema.nullable(),
  versionMetadata: z.object({
    practicePromptVersion: z.string().min(1),
    metricsVersion: z.string().min(1),
    sttModel: z.string().min(1),
    llmModel: z.string().min(1),
  }),
});

export type PersistedPracticeFeedback = z.infer<typeof PersistedPracticeFeedbackSchema>;
