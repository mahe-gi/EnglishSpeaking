import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../middleware/error.middleware.js";
import {
  getSlots,
  bookAvailability,
  cancelAvailability,
  getUpcomingMatch,
  getMatchToken,
  completeMatch,
  reportPartner,
  blockPartner,
} from "./peer.service.js";
import { GeneratePeerTokenFunction } from "../../services/livekit.service.js";

const BookSlotSchema = z.object({
  startAt: z.string().datetime(),
});

const ReportSchema = z.object({
  reason: z.enum([
    "HARASSMENT",
    "HATE_OR_ABUSE",
    "SEXUAL_CONTENT",
    "PERSONAL_INFORMATION",
    "SPAM",
    "OTHER",
  ]),
  details: z.string().max(500).optional(),
});

export function createPeerController(tokenGenerator?: GeneratePeerTokenFunction) {
  return {
    async getSlots(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const data = await getSlots(req.auth);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async bookAvailability(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const parsed = BookSlotSchema.safeParse(req.body);
        if (!parsed.success) {
          const error: AppError = new Error("Valid startAt ISO date-time is required.");
          error.statusCode = 400;
          error.code = "INVALID_SLOT_FORMAT";
          throw error;
        }

        const data = await bookAvailability(req.auth, parsed.data.startAt);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async cancelAvailability(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const availabilityId = req.params.id as string;
        const data = await cancelAvailability(req.auth, availabilityId);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async getUpcomingMatch(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const data = await getUpcomingMatch(req.auth);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async getMatchToken(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const matchId = req.params.id as string;
        const data = await getMatchToken(req.auth, matchId, tokenGenerator);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async completeMatch(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const matchId = req.params.id as string;
        const data = await completeMatch(req.auth, matchId);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async reportPartner(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const matchId = req.params.id as string;
        const parsed = ReportSchema.safeParse(req.body);
        if (!parsed.success) {
          const error: AppError = new Error("Valid reason is required for safety report.");
          error.statusCode = 400;
          error.code = "INVALID_REPORT_INPUT";
          throw error;
        }

        const data = await reportPartner(
          req.auth,
          matchId,
          parsed.data.reason,
          parsed.data.details
        );
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async blockPartner(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const matchId = req.params.id as string;
        const data = await blockPartner(req.auth, matchId);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
