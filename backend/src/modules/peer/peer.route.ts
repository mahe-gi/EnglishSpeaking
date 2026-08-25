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

  router.get("/peer/slots", auth, controller.getSlots);
  router.post("/peer/availability", auth, controller.bookAvailability);
  router.delete("/peer/availability/:id", auth, controller.cancelAvailability);
  router.get("/peer/matches/upcoming", auth, controller.getUpcomingMatch);
  router.post("/peer/matches/:id/token", auth, controller.getMatchToken);
  router.post("/peer/matches/:id/complete", auth, controller.completeMatch);
  router.post("/peer/matches/:id/report", auth, controller.reportPartner);
  router.post("/peer/matches/:id/block", auth, controller.blockPartner);

  return router;
}

export const peerRouter = createPeerRouter();
