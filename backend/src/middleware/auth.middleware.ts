import { Request, Response, NextFunction, RequestHandler } from "express";
import { AuthContext } from "../types/express.js";
import { verifyFirebaseToken } from "../services/firebase.service.js";

export type TokenVerifier = (idToken: string) => Promise<AuthContext>;

export function createAuthMiddleware(verifier: TokenVerifier = verifyFirebaseToken): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      });
      return;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid authorization header format. Expected 'Bearer <token>'.",
        },
      });
      return;
    }

    const token = parts[1];

    try {
      const authContext = await verifier(token);
      req.auth = authContext;
      next();
    } catch {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired authentication token.",
        },
      });
    }
  };
}

export const authMiddleware = createAuthMiddleware();
