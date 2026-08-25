import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("should return 200 with status ok", async () => {
    const app = createApp();
    const response = await request(app).get("/health");

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, { status: "ok" });
  });
});
