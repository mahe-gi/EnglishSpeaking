import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";
import { AppError } from "../../middleware/error.middleware.js";
import { calculateEntitlements } from "./entitlement.service.js";
import { isValidInstallationId } from "../../lib/validation.js";

export async function bootstrapUser(auth: AuthContext, installationId?: string | null) {
  // Determine verified identity from Firebase claims
  const isAnonymous = auth.isAnonymous || auth.signInProvider === "anonymous" || !auth.email;
  const identityType = isAnonymous ? "ANONYMOUS" : "REGISTERED";

  if (isAnonymous) {
    if (!installationId || !isValidInstallationId(installationId)) {
      const error: AppError = new Error(
        "A valid installation ID (x-installation-id header) is required for guest access."
      );
      error.statusCode = 400;
      error.code = "INVALID_INSTALLATION_ID";
      throw error;
    }
  }

  const user = await prisma.user.upsert({
    where: {
      firebaseUid: auth.uid,
    },
    update: {
      // If user was previously anonymous and now provides Google claims (same UID), upgrade identity
      ...(isAnonymous
        ? {}
        : {
            identityType: "REGISTERED",
            email: auth.email || undefined,
            displayName: auth.name || undefined,
            avatarUrl: auth.picture || undefined,
          }),
    },
    create: {
      firebaseUid: auth.uid,
      email: auth.email || null,
      displayName: auth.name || null,
      avatarUrl: auth.picture || null,
      identityType,
      plan: "FREE",
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

  const entitlements = await calculateEntitlements(user, installationId);

  const completedSession = user.practiceSessions[0];
  const speakingCheckCompleted = !!(
    (user.profile && user.profile.baselineScore !== null) ||
    completedSession
  );

  const baselineAssessmentId = completedSession ? completedSession.id : null;

  return {
    user: {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      identityType: user.identityType,
      plan: user.plan,
      peerAgeConfirmedAt: user.peerAgeConfirmedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    entitlements,
    profile: user.profile,
    speakingCheckCompleted,
    baselineAssessmentId,
    // Deprecated backward-compatible fields
    onboardingCompleted: true,
    assessmentCompleted: speakingCheckCompleted,
  };
}

export async function confirmPeerAge(auth: AuthContext) {
  if (auth.isAnonymous || !auth.email) {
    const error: AppError = new Error("Peer practice requires a registered Google account for safety.");
    error.statusCode = 403;
    error.code = "GUEST_PEER_NOT_ALLOWED";
    throw error;
  }

  const updatedUser = await prisma.user.upsert({
    where: { firebaseUid: auth.uid },
    update: {
      peerAgeConfirmedAt: new Date(),
      identityType: "REGISTERED",
    },
    create: {
      firebaseUid: auth.uid,
      email: auth.email,
      displayName: auth.name || null,
      avatarUrl: auth.picture || null,
      identityType: "REGISTERED",
      plan: "FREE",
      peerAgeConfirmedAt: new Date(),
    },
  });

  return {
    success: true,
    peerAgeConfirmedAt: updatedUser.peerAgeConfirmedAt,
  };
}

