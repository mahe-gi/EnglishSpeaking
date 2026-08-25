import { Router } from "express";
import multer from "multer";
import {
  postAssessment,
  getAssessment,
  createPostResponseHandler,
  createCompleteAssessmentHandler,
} from "./assessments.controller.js";
import { authMiddleware, TokenVerifier, createAuthMiddleware } from "../../middleware/auth.middleware.js";
import { TranscribeFunction } from "../../services/sarvam.service.js";
import { EvaluateAssessmentFunction } from "../../services/llm.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.startsWith("audio/") ||
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "video/mp4"
    ) {
      cb(null, true);
    } else {
      cb(new Error("UNSUPPORTED_MEDIA_TYPE"));
    }
  },
});

export interface AssessmentRouterOptions {
  tokenVerifier?: TokenVerifier;
  transcriber?: TranscribeFunction;
  evaluator?: EvaluateAssessmentFunction;
}

export function createAssessmentsRouter(options: AssessmentRouterOptions = {}): Router {
  const router = Router();
  const auth = options.tokenVerifier
    ? createAuthMiddleware(options.tokenVerifier)
    : authMiddleware;

  const handlePostResponse = createPostResponseHandler(options.transcriber);
  const handlePostComplete = createCompleteAssessmentHandler(options.evaluator);

  router.post("/assessments", auth, postAssessment);
  router.get("/assessments/:id", auth, getAssessment);
  router.post("/assessments/:id/complete", auth, handlePostComplete);
  router.post(
    "/assessments/:id/responses",
    auth,
    (req, res, next) => {
      upload.single("audio")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          res.status(400).json({
            success: false,
            error: {
              code: "UPLOAD_ERROR",
              message: err.message,
            },
          });
          return;
        }
        if (err instanceof Error) {
          res.status(400).json({
            success: false,
            error: {
              code: err.message === "UNSUPPORTED_MEDIA_TYPE" ? "UNSUPPORTED_MEDIA_TYPE" : "INVALID_FILE",
              message: "Unsupported audio format or file.",
            },
          });
          return;
        }
        next();
      });
    },
    handlePostResponse
  );

  return router;
}

export const assessmentsRouter = createAssessmentsRouter();
