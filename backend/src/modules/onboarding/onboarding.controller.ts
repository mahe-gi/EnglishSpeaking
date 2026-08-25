import { Request, Response, NextFunction } from "express";
import { OnboardingInputSchema } from "./onboarding.schema.js";
import { saveOnboardingProfile } from "./onboarding.service.js";

export async function putOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const parsed = OnboardingInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid onboarding payload.",
        },
      });
      return;
    }

    const profile = await saveOnboardingProfile(req.auth, parsed.data);

    res.status(200).json({
      success: true,
      data: {
        profile,
      },
    });
  } catch (error) {
    next(error);
  }
}
