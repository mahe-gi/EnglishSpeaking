import dotenv from "dotenv";
dotenv.config();

import * as agents from "@livekit/agents";
import * as sarvam from "@livekit/agents-plugin-sarvam";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";

agents.initializeLogger({ pretty: true });

async function runSanity() {
  console.log("🔍 Starting Real Provider Sanity Checks...");

  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!sarvamKey) {
    console.error("❌ SARVAM_API_KEY is missing in agent/.env");
    process.exit(1);
  }

  // 1. Silero VAD load
  console.log("⏳ Checking Silero VAD load...");
  const vad = await silero.VAD.load();
  console.log("✅ Silero VAD loaded successfully:", !!vad);

  // 2. Sarvam LLM via OpenAI adapter (sarvam-105b-conversations)
  console.log("⏳ Testing Sarvam-105B LLM stream...");
  const customLlm = new openai.LLM({
    model: "sarvam-105b-conversations",
    baseURL: "https://api.sarvam.ai/v1",
    apiKey: sarvamKey,
  });

  const chatCtx = new agents.llm.ChatContext();
  chatCtx.addMessage({
    role: "system",
    content: "You are an English speaking partner. Give a 1-sentence reply.",
  });
  chatCtx.addMessage({
    role: "user",
    content: "Hello, I am practicing English.",
  });

  const stream = customLlm.chat({ chatCtx });
  let fullLlmText = "";
  for await (const chunk of stream) {
    if (chunk.delta?.content) {
      fullLlmText += chunk.delta.content;
    }
  }
  console.log("✅ Sarvam-105B LLM Stream output:", fullLlmText.trim());

  // 3. Sarvam TTS via Bulbul v3
  console.log("⏳ Testing Sarvam Bulbul:v3 TTS stream...");
  const tts = new sarvam.TTS({
    model: "bulbul:v3",
    speaker: "shubh",
    targetLanguageCode: "en-IN",
    streaming: true,
  });

  const ttsStream = tts.synthesize("Hello, welcome to practice.");
  let audioChunkCount = 0;
  for await (const audioFrame of ttsStream) {
    if (audioFrame) {
      audioChunkCount++;
      break; // Received first streaming chunk
    }
  }
  console.log(`✅ Sarvam Bulbul:v3 TTS streamed first audio frame successfully (chunk count: ${audioChunkCount})`);

  // 4. Sarvam STT plugin initialization
  console.log("⏳ Testing Sarvam Saaras:v3 STT initialization...");
  const stt = new sarvam.STT({
    model: "saaras:v3",
    languageCode: "en-IN",
    mode: "transcribe",
  });
  console.log("✅ Sarvam Saaras:v3 STT initialized successfully:", !!stt);

  console.log("🎉 ALL REAL PROVIDER SANITY TESTS PASSED!");
}

runSanity().catch((err) => {
  console.error("❌ Sanity test failed:", err);
  process.exit(1);
});
