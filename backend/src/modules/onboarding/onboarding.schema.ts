import { z } from "zod";

export const OnboardingInputSchema = z
  .object({
    careerStatus: z.enum([
      "COLLEGE_STUDENT",
      "JOB_SEEKER",
      "WORKING_PROFESSIONAL",
    ]),
    goal: z.enum([
      "JOB_INTERVIEWS",
      "WORKPLACE_CONVERSATIONS",
      "SPEAKING_CONFIDENCE",
    ]),
    nativeLanguage: z.enum([
      "HINDI",
      "TELUGU",
      "TAMIL",
      "KANNADA",
      "MALAYALAM",
      "MARATHI",
      "BENGALI",
      "OTHER",
    ]),
    confidence: z.number().int().min(1).max(5),
  })
  .strict();

export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;
