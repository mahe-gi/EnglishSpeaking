import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";
import { AppError } from "../../middleware/error.middleware.js";

export async function bootstrapUser(auth: AuthContext) {
  if (!auth.email) {
    const error: AppError = new Error("Email claim is required from authentication provider.");
    error.statusCode = 400;
    error.code = "EMAIL_REQUIRED";
    throw error;
  }

  const user = await prisma.user.upsert({
    where: {
      firebaseUid: auth.uid,
    },
    update: {
      // Idempotent: preserve existing user records without overwriting user changes
    },
    create: {
      firebaseUid: auth.uid,
      email: auth.email,
      name: auth.name || null,
      avatarUrl: auth.picture || null,
    },
    include: {
      profile: true,
      practiceSessions: {
        where: {
          type: "ASSESSMENT",
          status: "COMPLETED",
        },
        orderBy: {
          completedAt: "desc",
        },
        take: 1,
      },
    },
  });

  const onboardingCompleted = !!(
    user.profile &&
    user.profile.careerStatus &&
    user.profile.goal &&
    user.profile.nativeLanguage &&
    user.profile.confidence
  );

  const completedSession = user.practiceSessions[0];
  const assessmentCompleted = !!(
    (user.profile && user.profile.baselineScore !== null) ||
    completedSession
  );

  const baselineAssessmentId = completedSession ? completedSession.id : null;

  return {
    user: {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    onboardingCompleted,
    assessmentCompleted,
    baselineAssessmentId,
  };
}
