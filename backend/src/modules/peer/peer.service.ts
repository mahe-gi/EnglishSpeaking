import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";
import { AppError } from "../../middleware/error.middleware.js";
import { getUpcomingPeerSlots, isValidPeerSlot } from "./peer-slots.js";
import { PRACTICE_SCENARIOS } from "../practice/practice-scenarios.js";
import { generatePeerRoomToken, GeneratePeerTokenFunction } from "../../services/livekit.service.js";

// Deterministic scenario selection based on match ID
function getScenarioForMatch(matchId: string) {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = (hash << 5) - hash + matchId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PRACTICE_SCENARIOS.length;
  const s = PRACTICE_SCENARIOS[index]!;
  return {
    id: s.id,
    title: s.title,
    category: s.category,
    initialQuestion: s.initialQuestion,
  };
}

function formatMatchResult(match: { id: string; userAId: string; userBId: string; startsAt: Date; status: string; livekitRoom: string }, currentUserId: string) {
  const role: "A" | "B" = match.userAId === currentUserId ? "A" : "B";
  const scenario = getScenarioForMatch(match.id);

  return {
    status: "MATCHED" as const,
    match: {
      id: match.id,
      startsAt: match.startsAt.toISOString(),
      durationMinutes: 15,
      status: match.status,
      role,
      scenario,
      partner: {
        label: "Practice Partner",
      },
    },
  };
}

export async function getSlots(auth: AuthContext) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
    include: { profile: true },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const slots = getUpcomingPeerSlots();
  return { slots };
}

export async function bookAvailability(auth: AuthContext, startAtISO: string) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
    include: { profile: true },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  if (!user.profile || user.profile.baselineScore === null) {
    const error: AppError = new Error("Baseline speaking assessment must be completed before booking peer practice.");
    error.statusCode = 409;
    error.code = "ASSESSMENT_REQUIRED";
    throw error;
  }

  if (user.profile.goal !== "JOB_INTERVIEWS") {
    const error: AppError = new Error("Peer practice is currently available for Job Interview preparation.");
    error.statusCode = 409;
    error.code = "INELIGIBLE_GOAL";
    throw error;
  }

  if (!isValidPeerSlot(startAtISO)) {
    const error: AppError = new Error("Invalid or expired scheduled slot.");
    error.statusCode = 400;
    error.code = "INVALID_SLOT";
    throw error;
  }

  const slotDate = new Date(startAtISO);
  const userScore = user.profile.baselineScore;
  const userCareer = user.profile.careerStatus || "JOB_SEEKER";

  // Check if user already has an active match for this slot
  const existingActiveMatch = await prisma.peerMatch.findFirst({
    where: {
      startsAt: slotDate,
      status: { in: ["SCHEDULED", "ACTIVE"] },
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
  });

  if (existingActiveMatch) {
    return formatMatchResult(existingActiveMatch, user.id);
  }

  // Attempt matching inside a Serializable transaction with bounded retries
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Check existing availability for this slot
          const existingAvail = await tx.peerAvailability.findUnique({
            where: {
              userId_startsAt: {
                userId: user.id,
                startsAt: slotDate,
              },
            },
          });

          if (existingAvail && existingAvail.status === "MATCHED") {
            const match = await tx.peerMatch.findFirst({
              where: {
                startsAt: slotDate,
                status: { in: ["SCHEDULED", "ACTIVE"] },
                OR: [{ userAId: user.id }, { userBId: user.id }],
              },
            });
            if (match) {
              return formatMatchResult(match, user.id);
            }
          }

          if (existingAvail && existingAvail.status === "AVAILABLE") {
            return {
              status: "WAITING" as const,
              availability: {
                id: existingAvail.id,
                startsAt: existingAvail.startsAt.toISOString(),
                status: existingAvail.status,
              },
            };
          }

          // Search for candidate availabilities
          const candidates = await tx.peerAvailability.findMany({
            where: {
              startsAt: slotDate,
              status: "AVAILABLE",
              userId: { not: user.id },
              user: {
                profile: {
                  baselineScore: { not: null },
                  goal: "JOB_INTERVIEWS",
                },
              },
            },
            include: {
              user: {
                include: { profile: true },
              },
            },
          });

          // Bidirectional block filter
          const eligibleCandidates = [];
          for (const cand of candidates) {
            const blocked = await tx.block.findFirst({
              where: {
                OR: [
                  { blockerId: user.id, blockedUserId: cand.userId },
                  { blockerId: cand.userId, blockedUserId: user.id },
                ],
              },
            });
            if (!blocked) {
              eligibleCandidates.push(cand);
            }
          }

          if (eligibleCandidates.length > 0) {
            // Rank candidates: 1. same careerStatus, 2. closest baselineScore, 3. oldest availability
            eligibleCandidates.sort((a, b) => {
              const aCareerMatch = a.user.profile?.careerStatus === userCareer ? 0 : 1;
              const bCareerMatch = b.user.profile?.careerStatus === userCareer ? 0 : 1;
              if (aCareerMatch !== bCareerMatch) return aCareerMatch - bCareerMatch;

              const aScoreDiff = Math.abs((a.user.profile?.baselineScore || 50) - userScore);
              const bScoreDiff = Math.abs((b.user.profile?.baselineScore || 50) - userScore);
              if (aScoreDiff !== bScoreDiff) return aScoreDiff - bScoreDiff;

              return a.createdAt.getTime() - b.createdAt.getTime();
            });

            const bestCandidate = eligibleCandidates[0]!;

            // Claim candidate availability
            const claimCandidate = await tx.peerAvailability.updateMany({
              where: {
                id: bestCandidate.id,
                status: "AVAILABLE",
              },
              data: {
                status: "MATCHED",
              },
            });

            if (claimCandidate.count !== 1) {
              throw new Error("CANDIDATE_CLAIM_CONFLICT");
            }

            // Create/update own availability to MATCHED
            await tx.peerAvailability.upsert({
              where: {
                userId_startsAt: {
                  userId: user.id,
                  startsAt: slotDate,
                },
              },
              create: {
                userId: user.id,
                startsAt: slotDate,
                goal: "JOB_INTERVIEWS",
                level: String(userScore),
                status: "MATCHED",
              },
              update: {
                status: "MATCHED",
              },
            });

            // Create PeerMatch
            const uniqueRoom = `peer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const match = await tx.peerMatch.create({
              data: {
                userAId: bestCandidate.userId, // older availability is Learner A
                userBId: user.id,              // new joiner is Learner B
                startsAt: slotDate,
                status: "SCHEDULED",
                livekitRoom: uniqueRoom,
              },
            });

            return formatMatchResult(match, user.id);
          }

          // No candidate available -> create own AVAILABLE slot
          const availability = await tx.peerAvailability.upsert({
            where: {
              userId_startsAt: {
                userId: user.id,
                startsAt: slotDate,
              },
            },
            create: {
              userId: user.id,
              startsAt: slotDate,
              goal: "JOB_INTERVIEWS",
              level: String(userScore),
              status: "AVAILABLE",
            },
            update: {
              status: "AVAILABLE",
            },
          });

          return {
            status: "WAITING" as const,
            availability: {
              id: availability.id,
              startsAt: availability.startsAt.toISOString(),
              status: availability.status,
            },
          };
        },
        { isolationLevel: "Serializable" }
      );

      return result;
    } catch (err: unknown) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }

  throw new Error("Failed to book slot after retries.");
}

export async function cancelAvailability(auth: AuthContext, availabilityId: string) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  // Atomically cancel if currently AVAILABLE
  const cancelled = await prisma.peerAvailability.updateMany({
    where: {
      id: availabilityId,
      userId: user.id,
      status: "AVAILABLE",
    },
    data: {
      status: "CANCELLED",
    },
  });

  if (cancelled.count === 1) {
    return { success: true };
  }

  // If count === 0, inspect current state to return accurate error or idempotent success
  const current = await prisma.peerAvailability.findUnique({
    where: { id: availabilityId },
  });

  if (!current || current.userId !== user.id) {
    const error: AppError = new Error("Availability slot not found.");
    error.statusCode = 404;
    error.code = "AVAILABILITY_NOT_FOUND";
    throw error;
  }

  if (current.status === "MATCHED") {
    const error: AppError = new Error("Cannot cancel availability once matched with a partner.");
    error.statusCode = 409;
    error.code = "MATCHED_CANNOT_CANCEL_AVAILABILITY";
    throw error;
  }

  if (current.status === "CANCELLED") {
    return { success: true }; // Idempotent success
  }

  const error: AppError = new Error(`Cannot cancel availability with status ${current.status}.`);
  error.statusCode = 409;
  error.code = "INVALID_SLOT_STATE";
  throw error;
}

export async function getUpcomingMatch(auth: AuthContext) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const match = await prisma.peerMatch.findFirst({
    where: {
      status: { in: ["SCHEDULED", "ACTIVE"] },
      startsAt: { gte: fifteenMinutesAgo },
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  if (!match) {
    // Check if user has an active pending availability
    const pendingAvail = await prisma.peerAvailability.findFirst({
      where: {
        userId: user.id,
        status: "AVAILABLE",
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: "asc" },
    });

    return {
      match: null,
      pendingAvailability: pendingAvail
        ? {
            id: pendingAvail.id,
            startsAt: pendingAvail.startsAt.toISOString(),
            status: pendingAvail.status,
          }
        : null,
    };
  }

  return {
    ...formatMatchResult(match, user.id),
    pendingAvailability: null,
  };
}

export async function getMatchToken(
  auth: AuthContext,
  matchId: string,
  tokenGenerator: GeneratePeerTokenFunction = generatePeerRoomToken
) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const match = await prisma.peerMatch.findUnique({
    where: { id: matchId },
  });

  if (!match || (match.userAId !== user.id && match.userBId !== user.id)) {
    const error: AppError = new Error("Peer match not found.");
    error.statusCode = 404;
    error.code = "MATCH_NOT_FOUND";
    throw error;
  }

  if (match.status === "CANCELLED" || match.status === "MISSED") {
    const error: AppError = new Error("This peer match is no longer active.");
    error.statusCode = 409;
    error.code = "MATCH_INACTIVE";
    throw error;
  }

  const partnerId = match.userAId === user.id ? match.userBId : match.userAId;

  // Bidirectional block check
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedUserId: partnerId },
        { blockerId: partnerId, blockedUserId: user.id },
      ],
    },
  });

  if (block) {
    const error: AppError = new Error("Cannot join peer call due to safety block.");
    error.statusCode = 403;
    error.code = "PARTNER_BLOCKED";
    throw error;
  }

  // Join window: 5 minutes before scheduled start through 10 minutes after scheduled start
  const now = Date.now();
  const startTime = match.startsAt.getTime();
  const windowStart = startTime - 5 * 60 * 1000;
  const windowEnd = startTime + 10 * 60 * 1000;

  if (now < windowStart || now > windowEnd) {
    const error: AppError = new Error("Join window is currently closed. You can join from 5 minutes before start time.");
    error.statusCode = 409;
    error.code = "PEER_JOIN_WINDOW_CLOSED";
    throw error;
  }

  const role: "A" | "B" = match.userAId === user.id ? "A" : "B";

  const tokenResult = await tokenGenerator({
    matchId: match.id,
    role,
  });

  return {
    serverUrl: tokenResult.serverUrl,
    participantToken: tokenResult.participantToken,
    match: {
      id: match.id,
      role,
      durationMinutes: 15,
      scenario: getScenarioForMatch(match.id),
    },
  };
}

export async function completeMatch(auth: AuthContext, matchId: string) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const match = await prisma.peerMatch.findUnique({
    where: { id: matchId },
  });

  if (!match || (match.userAId !== user.id && match.userBId !== user.id)) {
    const error: AppError = new Error("Peer match not found.");
    error.statusCode = 404;
    error.code = "MATCH_NOT_FOUND";
    throw error;
  }

  const sessionEndTime = match.startsAt.getTime() + 15 * 60 * 1000;
  const now = Date.now();

  // If user leaves early before session end time, do NOT terminate the shared match for the other partner
  if (now < sessionEndTime) {
    return {
      matchId: match.id,
      status: match.status,
      message: "Device disconnected from peer call.",
    };
  }

  // At or after scheduled session end, idempotently finalize the shared match
  const updated = await prisma.peerMatch.update({
    where: { id: matchId },
    data: {
      status: "COMPLETED",
      completedAt: match.completedAt || new Date(),
    },
  });

  return {
    matchId: updated.id,
    status: updated.status,
  };
}

export async function reportPartner(
  auth: AuthContext,
  matchId: string,
  reason: string,
  details?: string
) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const match = await prisma.peerMatch.findUnique({
    where: { id: matchId },
  });

  if (!match || (match.userAId !== user.id && match.userBId !== user.id)) {
    const error: AppError = new Error("Peer match not found.");
    error.statusCode = 404;
    error.code = "MATCH_NOT_FOUND";
    throw error;
  }

  const reportedUserId = match.userAId === user.id ? match.userBId : match.userAId;

  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      reportedUserId,
      peerMatchId: match.id,
      reason,
      details: details || null,
    },
  });

  return {
    reportId: report.id,
    success: true,
  };
}

export async function blockPartner(auth: AuthContext, matchId: string) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: auth.uid },
  });

  if (!user) {
    const error: AppError = new Error("User record not found.");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const match = await prisma.peerMatch.findUnique({
    where: { id: matchId },
  });

  if (!match || (match.userAId !== user.id && match.userBId !== user.id)) {
    const error: AppError = new Error("Peer match not found.");
    error.statusCode = 404;
    error.code = "MATCH_NOT_FOUND";
    throw error;
  }

  const blockedUserId = match.userAId === user.id ? match.userBId : match.userAId;

  await prisma.block.upsert({
    where: {
      blockerId_blockedUserId: {
        blockerId: user.id,
        blockedUserId,
      },
    },
    create: {
      blockerId: user.id,
      blockedUserId,
    },
    update: {},
  });

  return {
    success: true,
  };
}
