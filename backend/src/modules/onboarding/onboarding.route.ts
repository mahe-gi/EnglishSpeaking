import { Router } from "express";
import { putOnboarding } from "./onboarding.controller.js";
import { authMiddleware, TokenVerifier, createAuthMiddleware } from "../../middleware/auth.middleware.js";

export function createOnboardingRouter(tokenVerifier?: TokenVerifier): Router {
  const router = Router();
  const auth = tokenVerifier ? createAuthMiddleware(tokenVerifier) : authMiddleware;

  router.put("/onboarding", auth, putOnboarding);

  return router;
}

export const onboardingRouter = createOnboardingRouter();
