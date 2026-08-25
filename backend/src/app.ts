import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { healthRouter } from "./routes/health.route.js";
import { createUsersRouter } from "./modules/users/users.route.js";
import { createOnboardingRouter } from "./modules/onboarding/onboarding.route.js";
import { createAssessmentsRouter } from "./modules/assessments/assessments.route.js";
import { createPracticeRouter } from "./modules/practice/practice.route.js";
import { createProgressRouter } from "./modules/progress/progress.route.js";
import { createPeerRouter } from "./modules/peer/peer.route.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { TokenVerifier } from "./middleware/auth.middleware.js";
import { TranscribeFunction } from "./services/sarvam.service.js";
import { EvaluateAssessmentFunction } from "./services/llm.service.js";
import { EvaluatePracticeTurnFunction } from "./services/practice-llm.service.js";
import { GeneratePeerTokenFunction } from "./services/livekit.service.js";

export interface AppOptions {
  tokenVerifier?: TokenVerifier;
  transcriber?: TranscribeFunction;
  evaluator?: EvaluateAssessmentFunction;
  practiceEvaluator?: EvaluatePracticeTurnFunction;
  peerTokenGenerator?: GeneratePeerTokenFunction;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  // Core security and parsing middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use("/health", healthRouter);
  app.use("/api/v1", createUsersRouter(options.tokenVerifier));
  app.use("/api/v1", createOnboardingRouter(options.tokenVerifier));
  app.use(
    "/api/v1",
    createAssessmentsRouter({
      tokenVerifier: options.tokenVerifier,
      transcriber: options.transcriber,
      evaluator: options.evaluator,
    })
  );
  app.use(
    "/api/v1",
    createPracticeRouter({
      tokenVerifier: options.tokenVerifier,
      transcriber: options.transcriber,
      practiceEvaluator: options.practiceEvaluator,
    })
  );
  app.use("/api/v1", createProgressRouter(options.tokenVerifier));
  app.use(
    "/api/v1",
    createPeerRouter({
      tokenVerifier: options.tokenVerifier,
      tokenGenerator: options.peerTokenGenerator,
    })
  );

  // Global error handler (must be last)
  app.use(errorMiddleware);

  return app;
}
