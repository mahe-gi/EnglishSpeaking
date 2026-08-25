import { Router } from "express";
import {
  createPracticeController,
  uploadPracticeAudioMiddleware,
} from "./practice.controller.js";
import { authMiddleware, TokenVerifier, createAuthMiddleware } from "../../middleware/auth.middleware.js";
import { TranscribeFunction } from "../../services/sarvam.service.js";
import { EvaluatePracticeTurnFunction } from "../../services/practice-llm.service.js";

export interface PracticeRouterOptions {
  tokenVerifier?: TokenVerifier;
  transcriber?: TranscribeFunction;
  practiceEvaluator?: EvaluatePracticeTurnFunction;
}

export function createPracticeRouter(options: PracticeRouterOptions = {}): Router {
  const router = Router();
  const auth = options.tokenVerifier
    ? createAuthMiddleware(options.tokenVerifier)
    : authMiddleware;

  const controller = createPracticeController(options.transcriber, options.practiceEvaluator);

  router.post("/practice/sessions", auth, controller.startSession);
  router.post("/practice/sessions/:id/responses", auth, uploadPracticeAudioMiddleware, controller.recordResponse);

  return router;
}

export const practiceRouter = createPracticeRouter();
