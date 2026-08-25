import { Router } from "express";
import { createProgressController } from "./progress.controller.js";
import { authMiddleware, TokenVerifier, createAuthMiddleware } from "../../middleware/auth.middleware.js";

export function createProgressRouter(tokenVerifier?: TokenVerifier): Router {
  const router = Router();
  const auth = tokenVerifier ? createAuthMiddleware(tokenVerifier) : authMiddleware;
  const controller = createProgressController();

  router.get("/progress", auth, controller.getProgress);

  return router;
}

export const progressRouter = createProgressRouter();
