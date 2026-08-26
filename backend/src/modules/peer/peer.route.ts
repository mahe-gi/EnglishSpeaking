import { Router } from "express";
import { createPeerController } from "./peer.controller.js";
import { authMiddleware, TokenVerifier, createAuthMiddleware } from "../../middleware/auth.middleware.js";
import { GeneratePeerTokenFunction } from "../../services/livekit.service.js";

export interface PeerRouterOptions {
  tokenVerifier?: TokenVerifier;
  tokenGenerator?: GeneratePeerTokenFunction;
}

export function createPeerRouter(options: PeerRouterOptions = {}): Router {
  const router = Router();
  const auth = options.tokenVerifier ? createAuthMiddleware(options.tokenVerifier) : authMiddleware;
  const controller = createPeerController(options.tokenGenerator);

  // Matchmaking Queue
  router.post("/peer/matchmaking/join", auth, controller.joinQueue);
  router.get("/peer/matchmaking/status", auth, controller.getQueueStatus);
  router.delete("/peer/matchmaking/leave", auth, controller.leaveQueue);

  // Match Session
  router.post("/peer/matches/:id/token", auth, controller.getMatchToken);
  router.post("/peer/matches/:id/complete", auth, controller.completeMatch);
  router.post("/peer/matches/:id/report", auth, controller.reportPartner);
  router.post("/peer/matches/:id/block", auth, controller.blockPartner);

  return router;
}

export function createWebhookRouter(): Router {
  const router = Router();
  const controller = createPeerController();

  router.post("/", controller.handleLiveKitWebhook);

  return router;
}


export const peerRouter = createPeerRouter();
export const webhookRouter = createWebhookRouter();

