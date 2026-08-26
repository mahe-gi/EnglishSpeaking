import { User, VoiceSession, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ENTITLEMENT_LIMITS } from "../../config/entitlements.config.js";
import { getTimezoneBoundaries, getActiveReservationFilter } from "../users/entitlement.service.js";
import { isValidInstallationId } from "../../lib/validation.js";
import { AppError } from "../../middleware/error.middleware.js";
import { generateVoiceRoomToken, LiveKitTokenResult } from "../../services/livekit.service.js";

export interface CreateVoiceSessionResult {
  session: VoiceSession;
  tokenInfo: LiveKitTokenResult;
  remainingAiSecondsAfterReservation: number;
}

export type TerminalVoiceOutcome = "COMPLETED" | "CANCELLED" | "FAILED";

export class VoiceSessionService {
  /**
   * Concurrency-safe atomic creation and reservation for a VoiceSession.
   */
  static async createVoiceSession(
    user: User,
    installationId?: string | null,
    idempotencyKey?: string | null
  ): Promise<CreateVoiceSessionResult> {
    const isAnonymous = user.identityType === "ANONYMOUS";

    if (isAnonymous) {
      if (!installationId || !isValidInstallationId(installationId)) {
        const error: AppError = new Error(
          "A valid installation ID (x-installation-id header) is required for guest trial entitlement."
        );
        error.statusCode = 400;
        error.code = "INVALID_INSTALLATION_ID";
        throw error;
      }
    }

    // Check idempotency replay and ownership
    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      const trimmedKey = idempotencyKey.trim();
      const existing = await prisma.voiceSession.findUnique({
        where: { idempotencyKey: trimmedKey },
      });

      if (existing) {
        // Enforce ownership: session must belong to the same caller
        const isOwner = isAnonymous
          ? existing.installationId === installationId
          : existing.userId === user.id;

        if (!isOwner) {
          const error: AppError = new Error(
            "Idempotency key collision detected for another user or installation."
          );
          error.statusCode = 409;
          error.code = "IDEMPOTENCY_KEY_CONFLICT";
          throw error;
        }

        const now = new Date();
        const isLive =
          ["CREATED", "CONNECTING", "ACTIVE"].includes(existing.status) &&
          existing.reservationExpiresAt !== null &&
          existing.reservationExpiresAt > now;

        if (isLive) {
          const tokenInfo = await generateVoiceRoomToken({
            sessionId: existing.id,
            allowedSeconds: existing.allowedSeconds,
          });

          return {
            session: existing,
            tokenInfo,
            remainingAiSecondsAfterReservation: 0,
          };
        }

        const error: AppError = new Error(
          "Cannot reuse idempotency key for a finished or expired voice session."
        );
        error.statusCode = 409;
        error.code = "IDEMPOTENCY_KEY_CONFLICT";
        throw error;
      }
    }

    // Execute atomic reservation inside SERIALIZABLE transaction with retry
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const now = new Date();
            const activeReservationFilter = getActiveReservationFilter(now);

            let remainingAiSeconds = 0;
            let sessionMaxSeconds: number = ENTITLEMENT_LIMITS.VOICE_SESSION_MAX_SECONDS;

            if (isAnonymous) {
              sessionMaxSeconds = ENTITLEMENT_LIMITS.GUEST_AI_TRIAL_SECONDS;

              const [ledgerUsage, activeSessions] = await Promise.all([
                tx.usageLedger.aggregate({
                  _sum: { billableSeconds: true },
                  where: {
                    installationId: installationId!,
                    type: "AI",
                  },
                }),
                tx.voiceSession.aggregate({
                  _sum: { reservedSeconds: true },
                  where: {
                    installationId: installationId!,
                    ...activeReservationFilter,
                  },
                }),
              ]);

              const totalUsedAi =
                (ledgerUsage._sum?.billableSeconds || 0) +
                (activeSessions._sum?.reservedSeconds || 0);

              remainingAiSeconds = Math.max(
                0,
                ENTITLEMENT_LIMITS.GUEST_AI_TRIAL_SECONDS - totalUsedAi
              );
            } else {
              // Registered user (FREE or PREMIUM)
              const isPremium = user.plan === "PREMIUM";
              const { dayStart, monthStart } = getTimezoneBoundaries();

              if (isPremium) {
                const [monthlyAiUsage, activeAiSessions] = await Promise.all([
                  tx.usageLedger.aggregate({
                    _sum: { billableSeconds: true },
                    where: {
                      userId: user.id,
                      type: "AI",
                      startedAt: { gte: monthStart },
                    },
                  }),
                  tx.voiceSession.aggregate({
                    _sum: { reservedSeconds: true },
                    where: {
                      userId: user.id,
                      ...activeReservationFilter,
                    },
                  }),
                ]);

                const usedMonthlyAi =
                  (monthlyAiUsage._sum?.billableSeconds || 0) +
                  (activeAiSessions._sum?.reservedSeconds || 0);

                remainingAiSeconds = Math.max(
                  0,
                  ENTITLEMENT_LIMITS.PREMIUM_AI_MONTHLY_SECONDS - usedMonthlyAi
                );
              } else {
                // Free registered user
                const [dailyAiUsage, monthlyAiUsage, activeAiSessions] =
                  await Promise.all([
                    tx.usageLedger.aggregate({
                      _sum: { billableSeconds: true },
                      where: {
                        userId: user.id,
                        type: "AI",
                        startedAt: { gte: dayStart },
                      },
                    }),
                    tx.usageLedger.aggregate({
                      _sum: { billableSeconds: true },
                      where: {
                        userId: user.id,
                        type: "AI",
                        startedAt: { gte: monthStart },
                      },
                    }),
                    tx.voiceSession.aggregate({
                      _sum: { reservedSeconds: true },
                      where: {
                        userId: user.id,
                        ...activeReservationFilter,
                      },
                    }),
                  ]);

                const activeReservedAi = activeAiSessions._sum?.reservedSeconds || 0;
                const usedDailyAi = (dailyAiUsage._sum?.billableSeconds || 0) + activeReservedAi;
                const usedMonthlyAi = (monthlyAiUsage._sum?.billableSeconds || 0) + activeReservedAi;

                const remainingDailyAi = Math.max(
                  0,
                  ENTITLEMENT_LIMITS.FREE_AI_DAILY_SECONDS - usedDailyAi
                );
                const remainingMonthlyAi = Math.max(
                  0,
                  ENTITLEMENT_LIMITS.FREE_AI_MONTHLY_SECONDS - usedMonthlyAi
                );

                remainingAiSeconds = Math.min(remainingDailyAi, remainingMonthlyAi);
              }
            }

            if (remainingAiSeconds <= 0) {
              const error: AppError = new Error(
                "Your AI voice practice quota has been exhausted."
              );
              error.statusCode = 403;
              error.code = "ENTITLEMENT_EXHAUSTED";
              throw error;
            }

            const allowedSeconds = Math.min(remainingAiSeconds, sessionMaxSeconds);
            const reservationExpiresAt = new Date(Date.now() + 120_000); // 120s connect reservation TTL

            const newSession = await tx.voiceSession.create({
              data: {
                firebaseUid: user.firebaseUid,
                userId: isAnonymous ? null : user.id,
                installationId: isAnonymous ? installationId : null,
                status: "CREATED",
                allowedSeconds,
                reservedSeconds: allowedSeconds,
                actualSeconds: 0,
                reservationExpiresAt,
                idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
              },
            });

            const roomName = `voice_${newSession.id}`;
            const updatedSession = await tx.voiceSession.update({
              where: { id: newSession.id },
              data: { roomName },
            });

            return {
              session: updatedSession,
              allowedSeconds,
              remainingAfter: Math.max(0, remainingAiSeconds - allowedSeconds),
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          }
        );

        const tokenInfo = await generateVoiceRoomToken({
          sessionId: result.session.id,
          allowedSeconds: result.allowedSeconds,
        });

        return {
          session: result.session,
          tokenInfo,
          remainingAiSecondsAfterReservation: result.remainingAfter,
        };
      } catch (err: unknown) {
        // Check for Prisma serialization conflict code (P2034)
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "P2034" &&
          attempt < maxRetries
        ) {
          // Bounded jittered backoff
          await new Promise((res) => setTimeout(res, 20 + Math.random() * 30));
          continue;
        }
        throw err;
      }
    }

    throw new Error("Failed to create voice session due to persistent concurrency conflict.");
  }

  /**
   * Internal worker endpoint: Marks VoiceSession ACTIVE once agent and user are present.
   */
  static async markSessionActive(sessionId: string): Promise<VoiceSession> {
    const session = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      const error: AppError = new Error("Voice session not found.");
      error.statusCode = 404;
      error.code = "SESSION_NOT_FOUND";
      throw error;
    }

    if (session.status === "ACTIVE") {
      return session; // Idempotent
    }

    if (["COMPLETED", "CANCELLED", "FAILED"].includes(session.status)) {
      const error: AppError = new Error(
        `Cannot activate terminal voice session in status ${session.status}.`
      );
      error.statusCode = 409;
      error.code = "SESSION_ALREADY_TERMINAL";
      throw error;
    }

    const startedAt = session.startedAt || new Date();
    const reservationExpiresAt = new Date(
      startedAt.getTime() + session.allowedSeconds * 1000 + 60_000
    );

    return prisma.voiceSession.update({
      where: { id: sessionId },
      data: {
        status: "ACTIVE",
        startedAt,
        reservationExpiresAt,
      },
    });
  }

  /**
   * Internal worker endpoint: Finalizes VoiceSession and records UsageLedger exactly once.
   */
  static async markSessionComplete(
    sessionId: string,
    outcome: TerminalVoiceOutcome = "COMPLETED"
  ): Promise<VoiceSession> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.voiceSession.findUnique({
        where: { id: sessionId },
      });

      if (!current) {
        const error: AppError = new Error("Voice session not found.");
        error.statusCode = 404;
        error.code = "SESSION_NOT_FOUND";
        throw error;
      }

      if (["COMPLETED", "CANCELLED", "FAILED"].includes(current.status)) {
        return current; // Idempotent return for completed session
      }

      const now = new Date();
      let actualSeconds = 0;

      if (current.startedAt) {
        const elapsed = Math.round((now.getTime() - current.startedAt.getTime()) / 1000);
        actualSeconds = Math.max(0, Math.min(elapsed, current.allowedSeconds));
      }

      const updated = await tx.voiceSession.update({
        where: { id: sessionId },
        data: {
          status: outcome,
          endedAt: now,
          actualSeconds,
          reservedSeconds: 0,
          reservationExpiresAt: null,
        },
      });

      if (actualSeconds > 0) {
        let planAtTime: "FREE" | "PREMIUM" = "FREE";
        if (current.userId) {
          const user = await tx.user.findUnique({
            where: { id: current.userId },
            select: { plan: true },
          });
          if (user?.plan) {
            planAtTime = user.plan;
          }
        }

        const idempotencyKey = `voice:${current.id}`;

        await tx.usageLedger.upsert({
          where: { idempotencyKey },
          update: {}, // Safe no-op on concurrent replay
          create: {
            firebaseUid: current.firebaseUid,
            userId: current.userId,
            installationId: current.installationId,
            type: "AI",
            sessionId: current.id,
            billableSeconds: actualSeconds,
            planAtTime,
            startedAt: current.startedAt || now,
            endedAt: now,
            idempotencyKey,
          },
        });
      }

      return updated;
    });
  }
}

