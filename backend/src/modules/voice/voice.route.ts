import { Router } from "express";
import { authMiddleware, createAuthMiddleware, requireInternalAuth, TokenVerifier } from "../../middleware/auth.middleware.js";
import { VoiceController } from "./voice.controller.js";

export function createVoiceRouter(tokenVerifier?: TokenVerifier): Router {
  const router = Router();
  const auth = tokenVerifier ? createAuthMiddleware(tokenVerifier) : authMiddleware;

  // Client Voice Session Endpoint (Firebase Authenticated)
  router.post("/voice/sessions", auth, VoiceController.createSession);

  return router;
}

export function createInternalRouter(): Router {
  const router = Router();

  // Internal Worker Endpoints (AGENT_INTERNAL_SECRET Authenticated)
  router.post("/internal/voice-sessions/:id/active", requireInternalAuth, VoiceController.markActive);
  router.post("/internal/voice-sessions/:id/complete", requireInternalAuth, VoiceController.markComplete);

  return router;
}
