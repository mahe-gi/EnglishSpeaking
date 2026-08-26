import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";
import { AppError } from "../../middleware/error.middleware.js";
import { calculateEntitlements } from "./entitlement.service.js";
import { isValidInstallationId } from "../../lib/validation.js";

export const MERGE_INTENT_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export async function createMergeIntent(auth: AuthContext, installationId?: string | null) {
  // P0-1: createMergeIntent must require auth.isAnonymous === true
  if (!auth.isAnonymous) {
    const error: AppError = new Error(
      "Only anonymous guest accounts can initiate an account merge intent."
    );
    error.statusCode = 403;
    error.code = "ANONYMOUS_IDENTITY_REQUIRED";
    throw error;
  }

  // P1-3: Require valid installationId
  if (!installationId || !isValidInstallationId(installationId)) {
    const error: AppError = new Error(
      "A valid installation ID (x-installation-id header) is required."
    );
    error.statusCode = 400;
    error.code = "INVALID_INSTALLATION_ID";
    throw error;
  }

  // Find or create the source user record
  const sourceUser = await prisma.user.upsert({
    where: { firebaseUid: auth.uid },
    update: {},
    create: {
      firebaseUid: auth.uid,
      email: null,
      displayName: auth.name || null,
      identityType: "ANONYMOUS",
      plan: "FREE",
    },
  });

  const expiresAt = new Date(Date.now() + MERGE_INTENT_EXPIRY_MS);

  const intent = await prisma.mergeIntent.create({
    data: {
      sourceFirebaseUid: auth.uid,
      sourceUserId: sourceUser.id,
      installationId,
      expiresAt,
    },
  });

  return {
    mergeIntentId: intent.id,
    expiresAt: intent.expiresAt.toISOString(),
  };
}

export async function completeMerge(
  auth: AuthContext,
  mergeIntentId: string,
  installationId?: string | null
) {
  // P0-1: completeMerge must require verified Google registered identity
  if (auth.isAnonymous || auth.signInProvider !== "google.com") {
    const error: AppError = new Error(
      "A verified non-anonymous Google account is required to complete merge."
    );
    error.statusCode = 403;
    error.code = "REGISTERED_IDENTITY_REQUIRED";
    throw error;
  }

  if (!mergeIntentId || typeof mergeIntentId !== "string") {
    const error: AppError = new Error("A valid mergeIntentId is required.");
    error.statusCode = 400;
    error.code = "INVALID_MERGE_INTENT";
    throw error;
  }

  // P1-1: Execute target resolution, atomic claim, and record reassignment inside ONE transaction
  const { targetUser, alreadyMerged } = await prisma.$transaction(async (tx) => {
    const intent = await tx.mergeIntent.findUnique({
      where: { id: mergeIntentId },
    });

    if (!intent) {
      const error: AppError = new Error("Merge intent not found.");
      error.statusCode = 404;
      error.code = "MERGE_INTENT_NOT_FOUND";
      throw error;
    }

    // P0-1: Case B requires intent.sourceFirebaseUid !== auth.uid
    if (intent.sourceFirebaseUid === auth.uid) {
      const error: AppError = new Error(
        "Account already linked with same UID (Case A); completeMerge is not applicable."
      );
      error.statusCode = 400;
      error.code = "INVALID_CASE_B_MERGE";
      throw error;
    }

    // Resolve canonical target registered user from VERIFIED Google claims
    const target = await tx.user.upsert({
      where: { firebaseUid: auth.uid },
      update: {
        email: auth.email || undefined,
        displayName: auth.name || undefined,
        avatarUrl: auth.picture || undefined,
        identityType: "REGISTERED",
      },
      create: {
        firebaseUid: auth.uid,
        email: auth.email || null,
        displayName: auth.name || null,
        avatarUrl: auth.picture || null,
        identityType: "REGISTERED",
        plan: "FREE",
      },
      include: { profile: true },
    });

    const now = new Date();

    // Atomic claim of unexpired, unused intent
    const claim = await tx.mergeIntent.updateMany({
      where: {
        id: intent.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
        targetUserId: target.id,
      },
    });

    if (claim.count === 0) {
      // Intent was not claimed in this attempt — inspect current status
      const currentIntent = await tx.mergeIntent.findUnique({
        where: { id: intent.id },
      });

      if (currentIntent && currentIntent.targetUserId === target.id) {
        // Idempotent replay: already merged by this exact canonical target
        return { targetUser: target, alreadyMerged: true };
      }

      if (currentIntent && currentIntent.expiresAt <= now) {
        const error: AppError = new Error(
          "Merge intent has expired. Please retry signing in."
        );
        error.statusCode = 410;
        error.code = "MERGE_INTENT_EXPIRED";
        throw error;
      }

      const error: AppError = new Error("Merge intent has already been used.");
      error.statusCode = 409;
      error.code = "MERGE_INTENT_ALREADY_USED";
      throw error;
    }

    // Claim succeeded: reassign records from source to canonical target
    // 1. Reassign UsageLedger records
    await tx.usageLedger.updateMany({
      where: {
        OR: [
          { userId: intent.sourceUserId || undefined },
          { firebaseUid: intent.sourceFirebaseUid },
        ],
      },
      data: {
        userId: target.id,
      },
    });

    // 2. Reassign VoiceSession records
    await tx.voiceSession.updateMany({
      where: {
        OR: [
          { userId: intent.sourceUserId || undefined },
          { firebaseUid: intent.sourceFirebaseUid },
        ],
      },
      data: {
        userId: target.id,
      },
    });

    // P1-2: DO NOT delete source anonymous user. Keep as inert/tombstone row.
    return { targetUser: target, alreadyMerged: false };
  });

  const refreshedTarget = (await prisma.user.findUnique({
    where: { id: targetUser.id },
    include: { profile: true },
  })) || targetUser;

  const entitlements = await calculateEntitlements(refreshedTarget, installationId);

  return {
    success: true,
    alreadyMerged,
    user: refreshedTarget,
    entitlements,
  };
}

