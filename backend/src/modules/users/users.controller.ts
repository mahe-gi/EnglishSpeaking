import { Request, Response, NextFunction } from "express";
import { bootstrapUser, confirmPeerAge } from "./users.service.js";
import { createMergeIntent, completeMerge } from "./account-merge.service.js";

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

    const installationId = req.headers["x-installation-id"] as string | undefined;

    const result = await bootstrapUser(req.auth, installationId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function postConfirmAge(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const result = await confirmPeerAge(req.auth);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function postCreateMergeIntent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const installationId = req.headers["x-installation-id"] as string | undefined;

    const result = await createMergeIntent(req.auth, installationId);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function postCompleteMerge(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const { mergeIntentId } = req.body || {};
    const installationId = req.headers["x-installation-id"] as string | undefined;

    const result = await completeMerge(req.auth, mergeIntentId, installationId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
