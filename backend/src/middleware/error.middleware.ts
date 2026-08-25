import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorMiddleware(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? "Internal Server Error" : err.message;
  const code = err.code || "INTERNAL_ERROR";

  // Safe client response (never leak stack traces or internals)
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}
