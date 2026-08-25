import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getOrCreateAssessmentSession,
  getAssessmentSessionById,
  saveAssessmentResponse,
  completeAssessmentSession,
} from "./assessments.service.js";
import { TranscribeFunction } from "../../services/sarvam.service.js";
import { EvaluateAssessmentFunction } from "../../services/llm.service.js";

const StrictIntegerSchema = z
  .string()
  .regex(/^\d+$/)
  .transform((val) => parseInt(val, 10));

const ResponseBodySchema = z.object({
  sequence: z.union([
    z.number().int().min(1).max(3),
    StrictIntegerSchema.pipe(z.number().int().min(1).max(3)),
  ]),
  durationMs: z.union([
    z.number().int().min(1000).max(30000),
    StrictIntegerSchema.pipe(z.number().int().min(1000).max(30000)),
  ]),
});

export async function postAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      });
      return;
    }

    const { assessment, answeredSequences, isNew } = await getOrCreateAssessmentSession(req.auth);

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: {
        assessment,
        answeredSequences,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      });
      return;
    }

    const rawId = req.params.id;
    const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!sessionId || typeof sessionId !== "string") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Assessment session ID is required.",
        },
      });
      return;
    }

    const data = await getAssessmentSessionById(req.auth, sessionId);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export function createPostResponseHandler(transcriber?: TranscribeFunction) {
  return async function postResponse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
        });
        return;
      }

      const rawId = req.params.id;
      const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!sessionId || typeof sessionId !== "string") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Assessment session ID is required.",
          },
        });
        return;
      }

      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: "MISSING_AUDIO_FILE",
            message: "A non-empty audio recording file is required.",
          },
        });
        return;
      }

      const parsed = ResponseBodySchema.safeParse({
        sequence: req.body.sequence,
        durationMs: req.body.durationMs,
      });

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid sequence or durationMs in request body.",
            details: parsed.error.format(),
          },
        });
        return;
      }

      const utterance = await saveAssessmentResponse(
        req.auth,
        sessionId,
        parsed.data.sequence,
        parsed.data.durationMs,
        file.buffer,
        file.mimetype || "audio/m4a",
        transcriber
      );

      res.status(200).json({
        success: true,
        data: {
          utterance,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export function createCompleteAssessmentHandler(evaluator?: EvaluateAssessmentFunction) {
  return async function postComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
        });
        return;
      }

      const rawId = req.params.id;
      const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!sessionId || typeof sessionId !== "string") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Assessment session ID is required.",
          },
        });
        return;
      }

      const report = await completeAssessmentSession(req.auth, sessionId, evaluator);

      res.status(200).json({
        success: true,
        data: {
          report,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const postResponse = createPostResponseHandler();
export const postComplete = createCompleteAssessmentHandler();
