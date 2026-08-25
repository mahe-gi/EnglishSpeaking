import { Request, Response, NextFunction } from "express";
import { bootstrapUser } from "./users.service.js";

export async function putMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      });
      return;
    }

    const { user, onboardingCompleted, assessmentCompleted, baselineAssessmentId } =
      await bootstrapUser(req.auth);

    res.status(200).json({
      success: true,
      data: {
        user,
        onboardingCompleted,
        assessmentCompleted,
        baselineAssessmentId,
      },
    });
  } catch (error) {
    next(error);
  }
}
