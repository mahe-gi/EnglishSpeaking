import { Router } from "express";
import { putMe } from "./users.controller.js";
import { authMiddleware, TokenVerifier, createAuthMiddleware } from "../../middleware/auth.middleware.js";

export function createUsersRouter(tokenVerifier?: TokenVerifier): Router {
  const router = Router();
  const auth = tokenVerifier ? createAuthMiddleware(tokenVerifier) : authMiddleware;

  router.put("/me", auth, putMe);

  return router;
}

export const usersRouter = createUsersRouter();
