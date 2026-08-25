import { AccessToken, TrackSource } from "livekit-server-sdk";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.middleware.js";

export interface GeneratePeerTokenParams {
  matchId: string;
  role: "A" | "B";
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
  const roomName = `peer_${params.matchId}`;
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
