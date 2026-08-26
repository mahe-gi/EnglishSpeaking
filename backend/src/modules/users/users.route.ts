import { Router } from "express";
import {
  putMe,
  postConfirmAge,
  postCreateMergeIntent,
  postCompleteMerge,
} from "./users.controller.js";
import { authMiddleware, TokenVerifier, createAuthMiddleware } from "../../middleware/auth.middleware.js";

export function createUsersRouter(tokenVerifier?: TokenVerifier): Router {
  const router = Router();
  const auth = tokenVerifier ? createAuthMiddleware(tokenVerifier) : authMiddleware;

  router.put("/me", auth, putMe);
  router.post("/confirm-age", auth, postConfirmAge);
  router.post("/users/confirm-age", auth, postConfirmAge);

  router.post("/merge-intents", auth, postCreateMergeIntent);
  router.post("/account/merge-intents", auth, postCreateMergeIntent);

  router.post("/complete-merge", auth, postCompleteMerge);
  router.post("/account/complete-merge", auth, postCompleteMerge);

  return router;
}

export const usersRouter = createUsersRouter();


