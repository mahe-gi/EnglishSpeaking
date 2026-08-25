import { Request, Response, NextFunction } from "express";
import { AppError } from "../../middleware/error.middleware.js";
import { getUserProgress } from "./progress.service.js";

export function createProgressController() {
  return {
    async getProgress(req: Request, res: Response, next: NextFunction) {
      try {
        if (!req.auth) {
          const error: AppError = new Error("Authentication required.");
          error.statusCode = 401;
          error.code = "UNAUTHORIZED";
          throw error;
        }

        const data = await getUserProgress(req.auth);
        res.status(200).json({
          success: true,
          data,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
