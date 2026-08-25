import { describe, it } from "node:test";
import assert from "node:assert";
import express, { Request, Response } from "express";
import request from "supertest";
import { createAuthMiddleware, TokenVerifier } from "../src/middleware/auth.middleware.js";

describe("Auth Middleware", () => {
  it("should return 401 if Authorization header is missing", async () => {
    const app = express();
    const middleware = createAuthMiddleware(async () => ({ uid: "test" }));
    app.get("/protected", middleware, (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app).get("/protected");
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, "UNAUTHORIZED");
  });

  it("should return 401 if Authorization header is not Bearer format", async () => {
    const app = express();
    const middleware = createAuthMiddleware(async () => ({ uid: "test" }));
    app.get("/protected", middleware, (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Basic invalid-format");

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  it("should return 401 if token verification fails", async () => {
    const failingVerifier: TokenVerifier = async () => {
      throw new Error("Invalid signature");
    };

    const app = express();
    const middleware = createAuthMiddleware(failingVerifier);
    app.get("/protected", middleware, (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer invalid-token");

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.message, "Invalid or expired authentication token.");
  });

  it("should attach auth context and proceed if token is valid", async () => {
    const validVerifier: TokenVerifier = async (token: string) => {
      if (token === "valid-token-123") {
        return {
          uid: "user-123",
          email: "user@example.com",
          name: "Test User",
        };
      }
      throw new Error("Invalid token");
    };

    const app = express();
    const middleware = createAuthMiddleware(validVerifier);
    app.get("/protected", middleware, (req: Request, res: Response) => {
      res.json({ ok: true, auth: req.auth });
    });

    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid-token-123");

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.auth.uid, "user-123");
    assert.strictEqual(res.body.auth.email, "user@example.com");
  });
});
