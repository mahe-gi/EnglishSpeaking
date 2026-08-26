import { AccessToken, TrackSource, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.middleware.js";

export interface GeneratePeerTokenParams {
  matchId: string;
  role: "A" | "B";
  roomName?: string;
  ttlSeconds?: number;
}

export interface LiveKitTokenResult {
  serverUrl: string;
  participantToken: string;
  roomName: string;
  participantIdentity: string;
}

export type GeneratePeerTokenFunction = (
  params: GeneratePeerTokenParams
) => Promise<LiveKitTokenResult>;

export async function generatePeerRoomToken(
  params: GeneratePeerTokenParams
): Promise<LiveKitTokenResult> {
  const url = env.LIVEKIT_URL;
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    const error: AppError = new Error("LiveKit Cloud credentials are not configured on the server.");
    error.statusCode = 500;
    error.code = "PROVIDER_CONFIG_ERROR";
    throw error;
  }

  // Match-scoped opaque identifiers (zero PII)
  const roomName = params.roomName || `peer_${params.matchId}`;
  const participantIdentity = `peer_${params.matchId}_${params.role.toLowerCase()}`;
  const ttl = params.ttlSeconds || 20 * 60; // 20 minutes


  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: "Practice Partner",
    ttl,
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE],
  });

  const participantToken = await at.toJwt();

  return {
    serverUrl: url,
    participantToken,
    roomName,
    participantIdentity,
  };
}

export interface GenerateVoiceTokenParams {
  sessionId: string;
  allowedSeconds: number;
  agentName?: string;
  ttlSeconds?: number;
}

export type GenerateVoiceTokenFunction = (
  params: GenerateVoiceTokenParams
) => Promise<LiveKitTokenResult>;

export async function generateVoiceRoomToken(
  params: GenerateVoiceTokenParams
): Promise<LiveKitTokenResult> {
  const url = env.LIVEKIT_URL;
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    const error: AppError = new Error("LiveKit Cloud credentials are not configured on the server.");
    error.statusCode = 500;
    error.code = "PROVIDER_CONFIG_ERROR";
    throw error;
  }

  // Session-scoped opaque identifiers (zero PII)
  const roomName = `voice_${params.sessionId}`;
  const participantIdentity = `voice_${params.sessionId}_user`;
  const ttl = params.ttlSeconds || params.allowedSeconds + 120; // Room duration + 2 min buffer

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: "Learner",
    ttl,
  });

  const agentName = params.agentName || "ntalo-voice-poc";
  const metadata = JSON.stringify({
    sessionId: params.sessionId,
    allowedSeconds: params.allowedSeconds,
  });

  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName,
        metadata,
      }),
    ],
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE],
  });

  const participantToken = await at.toJwt();

  return {
    serverUrl: url,
    participantToken,
    roomName,
    participantIdentity,
  };
}

