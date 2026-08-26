import { env } from "../config/env.js";
import { AppError } from "../middleware/error.middleware.js";

export type TranscribeFunction = (
  audioBuffer: Buffer,
  mimeType: string,
  filename?: string
) => Promise<{ transcript: string; languageCode?: string }>;

export async function transcribeWithSarvam(
  audioBuffer: Buffer,
  mimeType: string,
  filename = "recording.m4a"
): Promise<{ transcript: string; languageCode?: string }> {
  const apiKey = env.SARVAM_API_KEY;

  if (!apiKey) {
    const error: AppError = new Error("Sarvam API key is not configured on the server.");
    error.statusCode = 500;
    error.code = "PROVIDER_CONFIG_ERROR";
    throw error;
  }

  // Normalize MIME types for Sarvam API compatibility (Sarvam expects audio/x-m4a or audio/mp4 instead of audio/m4a)
  const normalizedMimeType = mimeType === "audio/m4a" ? "audio/x-m4a" : mimeType;

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: normalizedMimeType });
  formData.append("file", blob, filename);
  formData.append("model", "saaras:v4");
  formData.append("mode", "verbatim");
  formData.append("language_code", "unknown");

  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    response = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const error: AppError = new Error(
      isTimeout
        ? "Speech-to-text provider request timed out."
        : "Speech-to-text provider connection failed."
    );
    error.statusCode = isTimeout ? 504 : 502;
    error.code = isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR";
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Sarvam STT Error] Status: ${response.status}, Body: ${errorBody}`);
    const error: AppError = new Error("Speech-to-text provider failed to process audio.");
    error.statusCode = response.status >= 500 ? 502 : 422;
    error.code = "PROVIDER_ERROR";
    throw error;
  }

  const json = (await response.json()) as { transcript?: string; language_code?: string };

  const transcript = json.transcript?.trim() || "";

  if (!transcript) {
    const error: AppError = new Error("No speech could be recognized in the audio.");
    error.statusCode = 422;
    error.code = "TRANSCRIPT_EMPTY";
    throw error;
  }

  return {
    transcript,
    languageCode: json.language_code,
  };
}
