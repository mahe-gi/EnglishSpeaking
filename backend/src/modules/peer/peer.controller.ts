import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../middleware/error.middleware.js";
import { PeerService } from "./peer.service.js";
import { GeneratePeerTokenFunction } from "../../services/livekit.service.js";

const ReportSchema = z.object({
  reason: z.enum([
    "HARASSMENT",
    "HATE_OR_ABUSE",
    "SEXUAL_CONTENT",
    "PERSONAL_INFORMATION",
    "SPAM",
    "AUDIO_QUALITY",
    "INAPPROPRIATE_BEHAVIOR",
    "OTHER",
  ]),
  details: z.string().max(500).optional(),
});

export function createPeerController(tokenGenerator?: GeneratePeerTokenFunction) {
  return {
    async joinQueue(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const data = await PeerService.joinQueue(req.auth);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async getQueueStatus(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const data = await PeerService.getQueueStatus(req.auth);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async leaveQueue(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const data = await PeerService.leaveQueue(req.auth);
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
        const data = await PeerService.getMatchToken(req.auth, matchId, tokenGenerator);
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
        const data = await PeerService.completeMatch(req.auth, matchId);
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

        const data = await PeerService.reportPartner(
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
        const data = await PeerService.blockPartner(req.auth, matchId);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async handleLiveKitWebhook(req: Request, res: Response, next: NextFunction) {
      try {
        const rawBody = Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);

        const authHeader = req.headers.authorization;
        const result = await PeerService.handleLiveKitWebhook(rawBody, authHeader);
        res.status(200).json({
          success: true,
          result,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

