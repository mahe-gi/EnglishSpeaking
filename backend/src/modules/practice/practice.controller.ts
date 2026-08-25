import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../../middleware/error.middleware.js";
import {
  startPracticeSession,
  recordPracticeResponse,
} from "./practice.service.js";
import { TranscribeFunction } from "../../services/sarvam.service.js";
import { EvaluatePracticeTurnFunction } from "../../services/practice-llm.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      "audio/m4a",
      "audio/mp4",
      "audio/aac",
      "audio/wav",
      "audio/x-m4a",
      "audio/mpeg",
      "audio/webm",
    ];

    if (allowedMimeTypes.includes(file.mimetype) || file.originalname.endsWith(".m4a")) {
      cb(null, true);
    } else {
      const err: AppError = new Error("Unsupported audio file format.");
      err.statusCode = 400;
      err.code = "INVALID_AUDIO_FORMAT";
      cb(err as unknown as null, false);
    }
  },
});

export const uploadPracticeAudioMiddleware = upload.single("audio");

const StrictIntegerSchema = z
  .string()
  .regex(/^[0-9]+$/, "Must be a positive integer")
  .transform((val) => parseInt(val, 10));

export function createPracticeController(
  transcriber?: TranscribeFunction,
  evaluator?: EvaluatePracticeTurnFunction
) {
  return {
    async startSession(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const data = await startPracticeSession(req.auth);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },

    async recordResponse(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const rawId = req.params.id;
        const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!sessionId || typeof sessionId !== "string") {
          const error: AppError = new Error("Session ID is required.");
          error.statusCode = 400;
          error.code = "INVALID_SESSION_ID";
          throw error;
        }

        const sequenceParse = StrictIntegerSchema.safeParse(req.body.sequence);
        if (!sequenceParse.success) {
          const error: AppError = new Error("Sequence must be an integer between 1 and 3.");
          error.statusCode = 400;
          error.code = "INVALID_SEQUENCE";
          throw error;
        }
        const sequence = sequenceParse.data;

        const durationParse = StrictIntegerSchema.safeParse(req.body.durationMs);
        if (!durationParse.success) {
          const error: AppError = new Error("durationMs must be an integer between 1000 and 30000.");
          error.statusCode = 400;
          error.code = "INVALID_DURATION";
          throw error;
        }
        const durationMs = durationParse.data;

        const audioBuffer = req.file?.buffer || null;
        const audioMimeType = req.file?.mimetype || "audio/m4a";

        const result = await recordPracticeResponse(
          req.auth,
          sessionId,
          sequence,
          durationMs,
          audioBuffer,
          audioMimeType,
          transcriber,
          evaluator
        );

        res.status(200).json({
          success: true,
          data: result,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
