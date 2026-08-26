import { WebhookReceiver, RoomServiceClient } from "livekit-server-sdk";
import { prisma } from "../../lib/prisma.js";
import { AuthContext } from "../../types/express.js";

import { AppError } from "../../middleware/error.middleware.js";
import { calculateEntitlements } from "../users/entitlement.service.js";
import { ENTITLEMENT_LIMITS } from "../../config/entitlements.config.js";
import { generatePeerRoomToken, GeneratePeerTokenFunction } from "../../services/livekit.service.js";
import { env } from "../../config/env.js";

function formatMatchResult(
  match: {
    id: string;
    userAId: string;
    userBId: string;
    status: string;
    livekitRoom: string;
    allowedSeconds: number;
    matchedAt: Date;
    startedAt: Date | null;
  },
  currentUserId: string
) {
  const role: "A" | "B" = match.userAId === currentUserId ? "A" : "B";

  return {
    status: "MATCHED" as const,
    match: {
      id: match.id,
      livekitRoom: match.livekitRoom,
      allowedSeconds: match.allowedSeconds,
      status: match.status,
      role,
      partner: {
        label: "Practice Partner",
      },
    },
  };
}

export class PeerService {
  /**
   * Enters the instant matchmaking queue or immediately pairs with a waiting candidate.
   */
  static async joinQueue(auth: AuthContext) {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: auth.uid },
    });

    if (!user) {
      const error: AppError = new Error("User record not found.");
      error.statusCode = 404;
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    // Safety Invariant: strictly REGISTERED users only
    if (user.identityType !== "REGISTERED") {
      const error: AppError = new Error("Google sign-in is required for peer practice.");
      error.statusCode = 403;
      error.code = "REGISTERED_IDENTITY_REQUIRED";
      throw error;
    }

    // Safety Invariant: 18+ age confirmed
    if (!user.peerAgeConfirmedAt) {
      const error: AppError = new Error("18+ age confirmation is required before entering peer practice.");
      error.statusCode = 403;
      error.code = "AGE_CONFIRMATION_REQUIRED";
      throw error;
    }

    // Entitlement verification
    const entitlements = await calculateEntitlements(user);
    if (entitlements.remainingPeerSeconds <= 0) {
      const error: AppError = new Error("Your daily peer practice allowance has been exhausted.");
      error.statusCode = 403;
      error.code = "ENTITLEMENT_EXHAUSTED";
      throw error;
    }

    // Check if user is already in an active non-terminal match
    const existingActiveMatch = await prisma.peerMatch.findFirst({
      where: {
        status: { in: ["MATCHED", "ACTIVE"] },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
    });

    if (existingActiveMatch) {
      return formatMatchResult(existingActiveMatch, user.id);
    }

    // Matchmaking inside SERIALIZABLE transaction with retry loop
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const now = new Date();

            // Check caller's remaining peer seconds inside the transaction
            const callerEntitlements = await calculateEntitlements(user, null, tx);
            if (callerEntitlements.remainingPeerSeconds <= 0) {
              const error: AppError = new Error("Your daily peer practice allowance has been exhausted.");
              error.statusCode = 403;
              error.code = "ENTITLEMENT_EXHAUSTED";
              throw error;
            }

            // 1. Check if user already has an active WAITING queue entry
            const existingQueue = await tx.peerQueueEntry.findUnique({
              where: { userId: user.id },
            });

            if (
              existingQueue &&
              existingQueue.status === "WAITING" &&
              existingQueue.expiresAt > now
            ) {
              return {
                status: "SEARCHING" as const,
                queueEntryId: existingQueue.id,
                expiresAt: existingQueue.expiresAt.toISOString(),
              };
            }

            // 2. Query potential candidates in queue (WAITING, not expired, not self)
            const candidateEntries = await tx.peerQueueEntry.findMany({
              where: {
                status: "WAITING",
                expiresAt: { gt: now },
                userId: { not: user.id },
                user: {
                  identityType: "REGISTERED",
                  peerAgeConfirmedAt: { not: null },
                },
              },
              include: {
                user: true,
              },
              orderBy: {
                createdAt: "asc", // FIFO candidate ordering
              },
            });

            // 3. Filter candidates for mutual blocks, active matches, and valid remaining quota
            for (const cand of candidateEntries) {
              // Check active match on candidate
              const candActiveMatch = await tx.peerMatch.findFirst({
                where: {
                  status: { in: ["MATCHED", "ACTIVE"] },
                  OR: [{ userAId: cand.userId }, { userBId: cand.userId }],
                },
              });
              if (candActiveMatch) continue;

              // Check bidirectional block
              const block = await tx.block.findFirst({
                where: {
                  OR: [
                    { blockerId: user.id, blockedUserId: cand.userId },
                    { blockerId: cand.userId, blockedUserId: user.id },
                  ],
                },
              });
              if (block) continue;

              // Compute candidate entitlement inside tx
              const candEntitlements = await calculateEntitlements(cand.user, null, tx);
              if (candEntitlements.remainingPeerSeconds <= 0) {
                continue;
              }

              // Compute allowedSeconds = min(remainingA, remainingB, PEER_SESSION_MAX_SECONDS)
              const allowedSeconds = Math.min(
                callerEntitlements.remainingPeerSeconds,
                candEntitlements.remainingPeerSeconds,
                ENTITLEMENT_LIMITS.PEER_SESSION_MAX_SECONDS
              );

              if (allowedSeconds <= 0) {
                continue;
              }

              // Candidate is eligible! Attempt conditional claim
              const claim = await tx.peerQueueEntry.updateMany({
                where: {
                  id: cand.id,
                  status: "WAITING",
                  expiresAt: { gt: now },
                },
                data: {
                  status: "MATCHED",
                },
              });

              if (claim.count !== 1) {
                // Contention: candidate claimed by another transaction -> retry loop
                throw new Error("CANDIDATE_CLAIM_CONTENTION");
              }

              // Generate unique room identifier
              const livekitRoom = `peer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

              // Create PeerMatch with explicit server-calculated allowedSeconds
              const match = await tx.peerMatch.create({
                data: {
                  userAId: cand.userId, // older joiner
                  userBId: user.id,     // newer joiner
                  status: "MATCHED",
                  livekitRoom,
                  allowedSeconds,
                  actualSeconds: 0,
                  matchedAt: now,
                },
              });


              // Update candidate queue entry with matchId
              await tx.peerQueueEntry.update({
                where: { id: cand.id },
                data: { matchId: match.id },
              });

              // Upsert caller's queue entry to MATCHED
              await tx.peerQueueEntry.upsert({
                where: { userId: user.id },
                create: {
                  userId: user.id,
                  status: "MATCHED",
                  matchId: match.id,
                  expiresAt: new Date(now.getTime() + 60_000),
                },
                update: {
                  status: "MATCHED",
                  matchId: match.id,
                  expiresAt: new Date(now.getTime() + 60_000),
                },
              });

              return formatMatchResult(match, user.id);
            }

            // 4. No candidate available -> create/upsert caller's own WAITING queue entry (45s TTL)
            const expiresAt = new Date(now.getTime() + 45_000);
            const queueEntry = await tx.peerQueueEntry.upsert({
              where: { userId: user.id },
              create: {
                userId: user.id,
                status: "WAITING",
                expiresAt,
                matchId: null,
              },
              update: {
                status: "WAITING",
                expiresAt,
                matchId: null,
              },
            });

            return {
              status: "SEARCHING" as const,
              queueEntryId: queueEntry.id,
              expiresAt: expiresAt.toISOString(),
            };
          },
          { isolationLevel: "Serializable" }
        );

        return result;
      } catch (err: unknown) {
        if (attempt >= maxRetries) {
          console.error("[PeerService] Matchmaking contention retries exhausted:", err);
          throw err;
        }
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.random() * 20));
      }
    }

    throw new Error("Matchmaking failed after retries.");
  }

  /**
   * Bounded short-polling endpoint while in matchmaking queue.
   */
  static async getQueueStatus(auth: AuthContext) {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: auth.uid },
    });

    if (!user) {
      const error: AppError = new Error("User record not found.");
      error.statusCode = 404;
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    const now = new Date();

    // 1. Check for active non-terminal match
    const activeMatch = await prisma.peerMatch.findFirst({
      where: {
        status: { in: ["MATCHED", "ACTIVE"] },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
    });

    if (activeMatch) {
      return formatMatchResult(activeMatch, user.id);
    }

    // 2. Check queue entry
    const queueEntry = await prisma.peerQueueEntry.findUnique({
      where: { userId: user.id },
    });

    if (!queueEntry) {
      return { status: "TIMEOUT" as const };
    }

    if (queueEntry.status === "MATCHED" && queueEntry.matchId) {
      const match = await prisma.peerMatch.findUnique({
        where: { id: queueEntry.matchId },
      });
      if (match && ["MATCHED", "ACTIVE"].includes(match.status)) {
        return formatMatchResult(match, user.id);
      }
    }

    if (queueEntry.status === "WAITING" && queueEntry.expiresAt > now) {
      return {
        status: "SEARCHING" as const,
        expiresAt: queueEntry.expiresAt.toISOString(),
      };
    }

    return { status: "TIMEOUT" as const };
  }

  /**
   * Cancels search and removes caller from matchmaking queue.
   */
  static async leaveQueue(auth: AuthContext) {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: auth.uid },
    });

    if (!user) {
      return { success: true };
    }

    await prisma.peerQueueEntry.updateMany({
      where: { userId: user.id, status: "WAITING" },
      data: { status: "CANCELLED" },
    });

    return { success: true };

  }

  /**
   * Generates LiveKit participant token with strict token ownership verification.
   */
  static async getMatchToken(
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

    if (!match) {
      const error: AppError = new Error("Peer match not found.");
      error.statusCode = 404;
      error.code = "MATCH_NOT_FOUND";
      throw error;
    }

    // Token Ownership: caller MUST be userAId or userBId
    const isUserA = match.userAId === user.id;
    const isUserB = match.userBId === user.id;

    if (!isUserA && !isUserB) {
      const error: AppError = new Error("You are not a participant in this peer match.");
      error.statusCode = 403;
      error.code = "MATCH_ACCESS_DENIED";
      throw error;
    }

    // Match status validation
    if (["COMPLETED", "CANCELLED", "EXPIRED", "MISSED"].includes(match.status)) {
      const error: AppError = new Error("Cannot join a completed or expired peer match.");
      error.statusCode = 409;
      error.code = "MATCH_NOT_ACTIVE";
      throw error;
    }

    const role: "A" | "B" = isUserA ? "A" : "B";
    const tokenResult = await tokenGenerator({
      matchId: match.id,
      role,
      roomName: match.livekitRoom,
      ttlSeconds: match.allowedSeconds + 180,
    });


    return {
      ...tokenResult,
      allowedSeconds: match.allowedSeconds,
      status: match.status,
    };
  }

  /**
   * Transactional and conflict-safe finalizer for a PeerMatch.
   * Records UsageLedger for both users exactly once.
   */
  static async finalizeMatchInternal(
    matchId: string,
    outcome: "COMPLETED" | "CANCELLED" | "EXPIRED" = "COMPLETED"
  ) {
    return prisma.$transaction(async (tx) => {
      const match = await tx.peerMatch.findUnique({
        where: { id: matchId },
      });

      if (!match) return null;

      if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(match.status)) {
        return match; // Idempotent
      }

      const now = new Date();
      let actualSeconds = 0;

      // Billing only occurs if match reached ACTIVE status (both connected)
      if (match.status === "ACTIVE" && match.startedAt) {
        const elapsed = Math.round((now.getTime() - match.startedAt.getTime()) / 1000);
        actualSeconds = Math.max(0, Math.min(elapsed, match.allowedSeconds));
      }

      const updated = await tx.peerMatch.update({
        where: { id: matchId },
        data: {
          status: match.status === "ACTIVE" ? outcome : "CANCELLED",
          endedAt: now,
          actualSeconds,
        },
      });

      if (actualSeconds > 0) {
        const [userA, userB] = await Promise.all([
          tx.user.findUnique({ where: { id: match.userAId }, select: { plan: true, firebaseUid: true } }),
          tx.user.findUnique({ where: { id: match.userBId }, select: { plan: true, firebaseUid: true } }),
        ]);

        const keyA = `peer:${match.id}:${match.userAId}`;
        const keyB = `peer:${match.id}:${match.userBId}`;

        // Upsert UsageLedger for User A
        await tx.usageLedger.upsert({
          where: { idempotencyKey: keyA },
          update: {},
          create: {
            firebaseUid: userA?.firebaseUid || "unknown",
            userId: match.userAId,
            type: "PEER",
            sessionId: match.id,
            billableSeconds: actualSeconds,
            planAtTime: userA?.plan || "FREE",
            startedAt: match.startedAt || now,
            endedAt: now,
            idempotencyKey: keyA,
          },
        });

        // Upsert UsageLedger for User B
        await tx.usageLedger.upsert({
          where: { idempotencyKey: keyB },
          update: {},
          create: {
            firebaseUid: userB?.firebaseUid || "unknown",
            userId: match.userBId,
            type: "PEER",
            sessionId: match.id,
            billableSeconds: actualSeconds,
            planAtTime: userB?.plan || "FREE",
            startedAt: match.startedAt || now,
            endedAt: now,
            idempotencyKey: keyB,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Processes verified LiveKit webhook events.
   */
  static async handleLiveKitWebhook(rawBody: string, authHeader?: string) {
    const apiKey = env.LIVEKIT_API_KEY;
    const apiSecret = env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error("[LiveKitWebhook] Missing LiveKit credentials.");
      return { processed: false, error: "CREDENTIALS_MISSING" };
    }

    const receiver = new WebhookReceiver(apiKey, apiSecret);
    let event;

    try {
      event = await receiver.receive(rawBody, authHeader);
    } catch (err) {
      console.error("[LiveKitWebhook] Signature verification failed:", err);
      const error: AppError = new Error("Invalid LiveKit webhook signature.");
      error.statusCode = 401;
      error.code = "INVALID_WEBHOOK_SIGNATURE";
      throw error;
    }

    const serverTimestamp = new Date().toISOString();
    console.log(
      `[LiveKitWebhook] event=${event.event} room=${event.room?.name || "none"} participant=${event.participant?.identity || "none"} server_timestamp=${serverTimestamp}`
    );

    const roomName = event.room?.name;

    if (!roomName || !roomName.startsWith("peer_")) {
      return { processed: false, reason: "IGNORED_NON_PEER_ROOM" };
    }

    const match = await prisma.peerMatch.findUnique({
      where: { livekitRoom: roomName },
    });

    if (!match) {
      return { processed: false, reason: "MATCH_NOT_FOUND" };
    }

    const now = new Date();

    switch (event.event) {
      case "participant_joined": {
        const expectedA = `peer_${match.id}_a`;
        const expectedB = `peer_${match.id}_b`;

        let bothConnected = false;

        if (env.LIVEKIT_URL && apiKey && apiSecret) {
          try {
            const host = env.LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://");
            const roomService = new RoomServiceClient(host, apiKey, apiSecret);
            const participants = await roomService.listParticipants(roomName);
            if (participants && participants.length > 0) {
              const identities = new Set(participants.map((p) => p.identity));
              bothConnected = identities.has(expectedA) && identities.has(expectedB);
            } else {
              bothConnected = (event.room?.numParticipants || 0) >= 2;
            }
          } catch {
            const numParticipants = event.room?.numParticipants || 0;
            bothConnected = numParticipants >= 2;
          }
        } else {
          const numParticipants = event.room?.numParticipants || 0;
          bothConnected = numParticipants >= 2;
        }

        if (bothConnected) {
          const updated = await prisma.peerMatch.updateMany({
            where: { id: match.id, status: "MATCHED" },
            data: {
              status: "ACTIVE",
              startedAt: now,
              deadlineAt: new Date(now.getTime() + match.allowedSeconds * 1000),
            },
          });
          if (updated.count > 0) {
            console.log(
              `[LiveKitWebhook] Both expected participants (${expectedA}, ${expectedB}) connected to ${roomName}. Transitioned to ACTIVE.`
            );
          }
        }
        break;
      }




      case "participant_left":
      case "participant_connection_aborted":
      case "room_finished": {
        console.log(`[LiveKitWebhook] Event ${event.event} for room ${roomName}. Finalizing match.`);
        await PeerService.finalizeMatchInternal(match.id, "COMPLETED");
        break;
      }

      default:
        break;
    }

    return { processed: true, event: event.event };
  }

  /**
   * Mobile complete call (best-effort UX signal).
   */
  static async completeMatch(auth: AuthContext, matchId: string) {
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
      const error: AppError = new Error("Match not found or access denied.");
      error.statusCode = 403;
      error.code = "MATCH_ACCESS_DENIED";
      throw error;
    }

    const updated = await PeerService.finalizeMatchInternal(matchId, "COMPLETED");
    return { success: true, match: updated };
  }

  /**
   * Records a moderation report against the practice partner.
   */
  static async reportPartner(
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
      const error: AppError = new Error("Match not found or access denied.");
      error.statusCode = 403;
      error.code = "MATCH_ACCESS_DENIED";
      throw error;
    }

    const reportedUserId = user.id === match.userAId ? match.userBId : match.userAId;

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        reportedUserId,
        peerMatchId: match.id,
        reason: reason.trim().slice(0, 100),
        details: details ? details.trim().slice(0, 500) : null,
      },
    });

    return { success: true, reportId: report.id };
  }

  /**
   * Records a directional block against the partner and ends the current match.
   */
  static async blockPartner(auth: AuthContext, matchId: string) {
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
      const error: AppError = new Error("Match not found or access denied.");
      error.statusCode = 403;
      error.code = "MATCH_ACCESS_DENIED";
      throw error;
    }

    const partnerId = user.id === match.userAId ? match.userBId : match.userAId;

    // Upsert directional block
    await prisma.block.upsert({
      where: {
        blockerId_blockedUserId: {
          blockerId: user.id,
          blockedUserId: partnerId,
        },
      },
      create: {
        blockerId: user.id,
        blockedUserId: partnerId,
      },
      update: {},
    });

    // Finalize match immediately
    await PeerService.finalizeMatchInternal(matchId, "COMPLETED");

    return { success: true, blockedUserId: partnerId };
  }
}

