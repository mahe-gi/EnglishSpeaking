import dotenv from "dotenv";
dotenv.config();

import { defineAgent, JobContext, cli, WorkerOptions, voice, inference } from "@livekit/agents";
import * as sarvam from "@livekit/agents-plugin-sarvam";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { SYSTEM_PROMPT } from "./prompt.js";
import { BackendClient } from "./backend-client.js";

const backendUrl = process.env.NTALO_BACKEND_URL || "http://127.0.0.1:4000/api/v1";
const internalSecret = process.env.AGENT_INTERNAL_SECRET;
const sarvamKey = process.env.SARVAM_API_KEY;

if (!internalSecret) {
  console.error("❌ AGENT_INTERNAL_SECRET is required on startup.");
  process.exit(1);
}

if (!sarvamKey) {
  console.error("❌ SARVAM_API_KEY is required on startup.");
  process.exit(1);
}

// Lightweight HTTP server for container health checks (DigitalOcean / PaaS readiness probes)
const httpPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", worker: "ntalo-voice-poc", uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(httpPort, () => {
  console.log(`[Agent] Health check server listening on port ${httpPort}`);
});

const backendClient = new BackendClient({
  backendUrl,
  internalSecret,
});

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const roomName = ctx.room.name || "";
    console.log(`[Agent] Job received for room: ${roomName}`);

    // Parse job metadata
    let sessionId: string | null = null;
    let allowedSeconds = 120;

    if (ctx.job.metadata) {
      try {
        const parsed = JSON.parse(ctx.job.metadata);
        if (parsed.sessionId) sessionId = parsed.sessionId;
        if (parsed.allowedSeconds && typeof parsed.allowedSeconds === "number") {
          allowedSeconds = parsed.allowedSeconds;
        }
      } catch (err) {
        console.warn("[Agent] Failed to parse job metadata:", err);
      }
    }

    // Fallback session ID extraction from room name: voice_<sessionId>
    if (!sessionId && roomName.startsWith("voice_")) {
      sessionId = roomName.replace("voice_", "");
    }

    console.log(`[Agent] Session ID: ${sessionId}, Allowed Seconds: ${allowedSeconds}`);

    await ctx.connect();
    console.log(`[Agent] Connected to LiveKit room: ${roomName}`);

    // 1. Initialize Pipeline Plugins
    const vad = await silero.VAD.load();

    const stt = new sarvam.STT({
      model: "saaras:v3",
      languageCode: "en-IN",
      mode: "transcribe",
      streaming: true,
      apiKey: sarvamKey,
    });

    const llm = new openai.LLM({
      model: "sarvam-105b-conversations",
      baseURL: "https://api.sarvam.ai/v1",
      apiKey: sarvamKey,
    });

    const tts = new sarvam.TTS({
      model: "bulbul:v3",
      speaker: "shubh",
      targetLanguageCode: "en-IN",
      streaming: true,
      apiKey: sarvamKey,
    });

    // 2. Initialize Agent Session with TurnDetector
    const session = new voice.AgentSession({
      vad,
      stt,
      llm,
      tts,
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
      },
    });

    const agent = new voice.Agent({
      instructions: SYSTEM_PROMPT,
    });

    let isCompleted = false;
    let warningTimer: NodeJS.Timeout | null = null;
    let deadlineTimer: NodeJS.Timeout | null = null;

    const cleanup = async (outcome: "COMPLETED" | "CANCELLED" | "FAILED" = "COMPLETED") => {
      if (isCompleted) return;
      isCompleted = true;

      if (warningTimer) {
        clearTimeout(warningTimer);
        warningTimer = null;
      }

      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
        deadlineTimer = null;
      }

      console.log(`[Agent] Hard stop: Finalizing session ${sessionId} with outcome: ${outcome}`);
      try {
        session.interrupt();
      } catch (err) {
        console.warn("[Agent] Interrupt error during cleanup:", err);
      }

      // Close session and disconnect immediately to cut provider consumption
      const closePromise = session.close().catch((err) => console.warn("[Agent] Session close error:", err));
      const disconnectPromise = ctx.room.disconnect().catch((err) => console.warn("[Agent] Room disconnect error:", err));
      const backendPromise = sessionId
        ? backendClient.markComplete(sessionId, outcome)
        : Promise.resolve(true);

      await Promise.allSettled([closePromise, disconnectPromise, backendPromise]);
    };

    // Listen for room disconnects, errors, or user leaving
    ctx.room.on("disconnected", () => {
      console.log("[Agent] Room disconnected.");
      cleanup("COMPLETED").catch(console.error);
    });

    ctx.room.on("participantDisconnected", (participant) => {
      console.log(`[Agent] Participant disconnected: ${participant.identity}`);
      if (!participant.identity.includes("agent")) {
        cleanup("COMPLETED").catch(console.error);
      }
    });

    // 3. Start Agent Session in room
    await session.start({ agent, room: ctx.room });
    console.log("[Agent] Voice AgentSession started in room.");

    // 4. Mark ACTIVE on backend once user participant is present
    const checkAndActivate = async () => {
      const hasUser = Array.from(ctx.room.remoteParticipants.values()).some(
        (p) => !p.identity.includes("agent")
      );

      if (hasUser && sessionId) {
        console.log(`[Agent] User present in room. Activating session on backend...`);
        await backendClient.markActive(sessionId);

        // Pre-deadline warning (if allowedSeconds > 15s)
        if (allowedSeconds > 15) {
          warningTimer = setTimeout(async () => {
            if (isCompleted) return;
            try {
              console.log("[Agent] Speaking pre-expiry notice...");
              await session.say("We have a few seconds left in our practice session.");
            } catch (e) {
              console.warn("[Agent] Failed to deliver pre-expiry notice:", e);
            }
          }, (allowedSeconds - 8) * 1000);
        }

        // Exact Hard Session Deadline: cut immediately
        deadlineTimer = setTimeout(async () => {
          console.log(`[Agent] Exact hard deadline (${allowedSeconds}s) reached. Stopping immediately.`);
          await cleanup("COMPLETED");
        }, allowedSeconds * 1000);

        // Initial Greeting
        try {
          console.log("[Agent] Speaking initial opening greeting...");
          await session.say("Hi. What would you like to practice today?");
        } catch (e) {
          console.error("[Agent] Failed to speak initial greeting:", e);
        }
      }
    };

    // If user is already present, activate immediately; otherwise wait for participantJoined
    if (ctx.room.remoteParticipants.size > 0) {
      await checkAndActivate();
    } else {
      ctx.room.once("participantConnected", async () => {
        await checkAndActivate();
      });
    }
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "ntalo-voice-poc",
  })
);
