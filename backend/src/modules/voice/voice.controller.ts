import { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma.js";
import { VoiceSessionService, TerminalVoiceOutcome } from "./voice.service.js";
import { AppError } from "../../middleware/error.middleware.js";

export class VoiceController {
  static async createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const auth = req.auth;
      if (!auth) {
        const error: AppError = new Error("Authentication required.");
        error.statusCode = 401;
        error.code = "UNAUTHORIZED";
        throw error;
      }

      const user = await prisma.user.findUnique({
        where: { firebaseUid: auth.uid },
      });

      if (!user) {
        const error: AppError = new Error("User record not found. Please initialize first.");
        error.statusCode = 404;
        error.code = "USER_NOT_FOUND";
        throw error;
      }

      const installationIdHeader = req.headers["x-installation-id"];
      const installationId = Array.isArray(installationIdHeader)
        ? installationIdHeader[0]
        : installationIdHeader || null;

      const idempotencyHeader = req.headers["idempotency-key"];
      const idempotencyKey = Array.isArray(idempotencyHeader)
        ? idempotencyHeader[0]
        : idempotencyHeader || null;

      const result = await VoiceSessionService.createVoiceSession(
        user,
        installationId,
        idempotencyKey
      );

      res.status(201).json({
        success: true,
        data: {
          sessionId: result.session.id,
          roomName: result.session.roomName,
          livekitUrl: result.tokenInfo.serverUrl,
          participantToken: result.tokenInfo.participantToken,
          allowedSeconds: result.session.allowedSeconds,
          remainingAiSecondsAfterReservation: result.remainingAiSecondsAfterReservation,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async markActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      const sessionId = Array.isArray(idParam) ? idParam[0] : idParam;
      if (!sessionId) {
        const error: AppError = new Error("Session ID is required.");
        error.statusCode = 400;
        error.code = "BAD_REQUEST";
        throw error;
      }

      const session = await VoiceSessionService.markSessionActive(sessionId);

      res.status(200).json({
        success: true,
        data: { session },
      });
    } catch (err) {
      next(err);
    }
  }

  static async markComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      const sessionId = Array.isArray(idParam) ? idParam[0] : idParam;
      if (!sessionId) {
        const error: AppError = new Error("Session ID is required.");
        error.statusCode = 400;
        error.code = "BAD_REQUEST";
        throw error;
      }

      const validOutcomes: TerminalVoiceOutcome[] = ["COMPLETED", "CANCELLED", "FAILED"];
      const rawOutcome = req.body?.outcome;
      const outcome: TerminalVoiceOutcome = validOutcomes.includes(rawOutcome)
        ? rawOutcome
        : "COMPLETED";

      const session = await VoiceSessionService.markSessionComplete(sessionId, outcome);

      res.status(200).json({
        success: true,
        data: { session },
      });
    } catch (err) {
      next(err);
    }
  }
}
