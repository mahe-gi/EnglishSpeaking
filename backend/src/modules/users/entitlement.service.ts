import { User, VoiceSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ENTITLEMENT_LIMITS, ENTITLEMENT_TIMEZONE } from "../../config/entitlements.config.js";
import { isValidInstallationId } from "../../lib/validation.js";
import { AppError } from "../../middleware/error.middleware.js";

export type ProductState = "GUEST" | "FREE" | "PREMIUM";

export interface UserEntitlements {
  productState: ProductState;
  remainingAiSeconds: number;
  remainingPeerSeconds: number;
  dailyAiSecondsLimit: number;
  monthlyAiSecondsLimit: number;
  peerAllowed: boolean;
  isAgeConfirmed: boolean;
}

/**
 * Computes start of day and start of month in the configured timezone (e.g. Asia/Kolkata),
 * returning UTC Date instances suitable for Prisma queries.
 */
export function getTimezoneBoundaries(timezone: string = ENTITLEMENT_TIMEZONE, now: Date = new Date()) {
  // Format current date parts in target timezone
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const year = parseInt(map.year || "2026", 10);
  const month = parseInt(map.month || "1", 10);
  const day = parseInt(map.day || "1", 10);

  // Timezone offset calculation
  // Create a Date object representing the start of the day in target timezone
  const startOfDayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`;
  const startOfMonthStr = `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;

  // Use Intl to compute the UTC timestamp for midnight in target timezone
  const getUtcDateForLocalTime = (isoString: string): Date => {
    const targetLocal = new Date(`${isoString}Z`);
    const invdate = new Date(
      targetLocal.toLocaleString("en-US", { timeZone: "UTC" })
    );
    const tzDate = new Date(
      targetLocal.toLocaleString("en-US", { timeZone: timezone })
    );
    const diff = tzDate.getTime() - invdate.getTime();
    return new Date(targetLocal.getTime() - diff);
  };

  return {
    dayStart: getUtcDateForLocalTime(startOfDayStr),
    monthStart: getUtcDateForLocalTime(startOfMonthStr),
  };
}

export function getActiveReservationFilter(now: Date = new Date()): Prisma.VoiceSessionWhereInput {
  return {
    status: { in: ["CREATED", "CONNECTING", "ACTIVE", "ENDING"] as VoiceSessionStatus[] },
    reservationExpiresAt: { gt: now },
  };
}

export async function calculateEntitlements(
  user: User,
  installationId?: string | null
): Promise<UserEntitlements> {
  const isAnonymous = user.identityType === "ANONYMOUS";
  const isAgeConfirmed = !!user.peerAgeConfirmedAt;
  const now = new Date();
  const activeReservationFilter = getActiveReservationFilter(now);

  if (isAnonymous) {
    // Guest Entitlement: scoped strictly to valid installationId
    if (!installationId || !isValidInstallationId(installationId)) {
      const error: AppError = new Error(
        "A valid installation ID (x-installation-id header) is required for guest trial entitlement."
      );
      error.statusCode = 400;
      error.code = "INVALID_INSTALLATION_ID";
      throw error;
    }

    const [ledgerUsage, activeSessions] = await Promise.all([
      prisma.usageLedger.aggregate({
        _sum: { billableSeconds: true },
        where: {
          installationId,
          type: "AI",
        },
      }),
      prisma.voiceSession.aggregate({
        _sum: { reservedSeconds: true },
        where: {
          installationId,
          ...activeReservationFilter,
        },
      }),
    ]);

    const totalUsedAi =
      (ledgerUsage._sum?.billableSeconds || 0) +
      (activeSessions._sum?.reservedSeconds || 0);

    const remainingAiSeconds = Math.max(
      0,
      ENTITLEMENT_LIMITS.GUEST_AI_TRIAL_SECONDS - totalUsedAi
    );

    return {
      productState: "GUEST",
      remainingAiSeconds,
      remainingPeerSeconds: 0,
      dailyAiSecondsLimit: ENTITLEMENT_LIMITS.GUEST_AI_TRIAL_SECONDS,
      monthlyAiSecondsLimit: ENTITLEMENT_LIMITS.GUEST_AI_TRIAL_SECONDS,
      peerAllowed: false,
      isAgeConfirmed: false,
    };
  }

  // Registered User Entitlements (FREE or PREMIUM) - uses canonical userId ONLY
  const isPremium = user.plan === "PREMIUM";
  const productState: ProductState = isPremium ? "PREMIUM" : "FREE";
  const { dayStart, monthStart } = getTimezoneBoundaries();

  if (isPremium) {
    const [monthlyAiUsage, dailyPeerUsage, activeAiSessions] = await Promise.all([
      prisma.usageLedger.aggregate({
        _sum: { billableSeconds: true },
        where: {
          userId: user.id,
          type: "AI",
          startedAt: { gte: monthStart },
        },
      }),
      prisma.usageLedger.aggregate({
        _sum: { billableSeconds: true },
        where: {
          userId: user.id,
          type: "PEER",
          startedAt: { gte: dayStart },
        },
      }),
      prisma.voiceSession.aggregate({
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
    const usedDailyPeer = dailyPeerUsage._sum?.billableSeconds || 0;

    const remainingAiSeconds = Math.max(
      0,
      ENTITLEMENT_LIMITS.PREMIUM_AI_MONTHLY_SECONDS - usedMonthlyAi
    );
    const remainingPeerSeconds = Math.max(
      0,
      ENTITLEMENT_LIMITS.PREMIUM_PEER_DAILY_SECONDS - usedDailyPeer
    );

    return {
      productState,
      remainingAiSeconds,
      remainingPeerSeconds,
      dailyAiSecondsLimit: ENTITLEMENT_LIMITS.PREMIUM_AI_MONTHLY_SECONDS,
      monthlyAiSecondsLimit: ENTITLEMENT_LIMITS.PREMIUM_AI_MONTHLY_SECONDS,
      peerAllowed: true,
      isAgeConfirmed,
    };
  }

  // Registered Free User Entitlements - uses canonical userId ONLY
  const [dailyAiUsage, monthlyAiUsage, dailyPeerUsage, activeAiSessions] =
    await Promise.all([
      prisma.usageLedger.aggregate({
        _sum: { billableSeconds: true },
        where: {
          userId: user.id,
          type: "AI",
          startedAt: { gte: dayStart },
        },
      }),
      prisma.usageLedger.aggregate({
        _sum: { billableSeconds: true },
        where: {
          userId: user.id,
          type: "AI",
          startedAt: { gte: monthStart },
        },
      }),
      prisma.usageLedger.aggregate({
        _sum: { billableSeconds: true },
        where: {
          userId: user.id,
          type: "PEER",
          startedAt: { gte: dayStart },
        },
      }),
      prisma.voiceSession.aggregate({
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
  const usedDailyPeer = dailyPeerUsage._sum?.billableSeconds || 0;

  const remainingDailyAi = Math.max(
    0,
    ENTITLEMENT_LIMITS.FREE_AI_DAILY_SECONDS - usedDailyAi
  );
  const remainingMonthlyAi = Math.max(
    0,
    ENTITLEMENT_LIMITS.FREE_AI_MONTHLY_SECONDS - usedMonthlyAi
  );

  const remainingAiSeconds = Math.min(remainingDailyAi, remainingMonthlyAi);
  const remainingPeerSeconds = Math.max(
    0,
    ENTITLEMENT_LIMITS.FREE_PEER_DAILY_SECONDS - usedDailyPeer
  );

  return {
    productState,
    remainingAiSeconds,
    remainingPeerSeconds,
    dailyAiSecondsLimit: ENTITLEMENT_LIMITS.FREE_AI_DAILY_SECONDS,
    monthlyAiSecondsLimit: ENTITLEMENT_LIMITS.FREE_AI_MONTHLY_SECONDS,
    peerAllowed: true,
    isAgeConfirmed,
  };
}

