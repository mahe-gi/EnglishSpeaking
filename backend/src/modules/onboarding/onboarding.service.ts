import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";
import { OnboardingInput } from "./onboarding.schema.js";
import { AppError } from "../../middleware/error.middleware.js";

export async function saveOnboardingProfile(auth: AuthContext, input: OnboardingInput) {
  const user = await prisma.user.findUnique({
    where: {
      firebaseUid: auth.uid,
    },
  });

  if (!user) {
    const error: AppError = new Error("User record not found. Please initialize your account first.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const profile = await prisma.profile.upsert({
    where: {
      userId: user.id,
    },
    update: {
      careerStatus: input.careerStatus,
      goal: input.goal,
      nativeLanguage: input.nativeLanguage,
      confidence: input.confidence,
    },
    create: {
      userId: user.id,
      careerStatus: input.careerStatus,
      goal: input.goal,
      nativeLanguage: input.nativeLanguage,
      confidence: input.confidence,
    },
  });

  return profile;
}
