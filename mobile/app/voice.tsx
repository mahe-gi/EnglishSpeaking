import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { AudioSession } from "@livekit/react-native";
import { Room, RoomEvent, Participant, Track } from "livekit-client";
import { AppText } from "../components/AppText";
import { useAuth } from "../hooks/useAuth";
import { auth } from "../lib/firebase";
import { getInstallationId } from "../lib/installation";
import { createVoiceSession, VoiceSessionData } from "../lib/api";

type VoiceUIState = "initializing" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";

export default function VoiceScreen() {
  const router = useRouter();
  const { productState } = useAuth();

  const [uiState, setUiState] = useState<VoiceUIState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<VoiceSessionData | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasCleanedUp = useRef(false);

  const cleanup = useCallback(async () => {
    if (hasCleanedUp.current) return;
    hasCleanedUp.current = true;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (err) {
        console.warn("[Voice] Error disconnecting room:", err);
      }
      roomRef.current = null;
    }

    try {
      await AudioSession.stopAudioSession();
    } catch (err) {
      console.warn("[Voice] Error stopping AudioSession:", err);
    }
  }, []);

  const handleExit = useCallback(async () => {
    await cleanup();
    router.replace("/(tabs)" as any);
  }, [cleanup, router]);

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        setUiState("initializing");
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Authentication required. Please sign in.");
        }

        const idToken = await currentUser.getIdToken();
        const installationId = await getInstallationId();
        const idempotencyKey = `mob_voice_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        console.log("[Voice] Creating voice session on backend...");
        const data = await createVoiceSession(idToken, installationId, idempotencyKey);
        if (!isMounted) return;

        setSessionData(data);
        console.log(`[Voice] Session created: ${data.sessionId}, Room: ${data.roomName}`);

        // Start native audio session
        await AudioSession.startAudioSession();
        if (!isMounted) return;

        setUiState("connecting");

        // Initialize LiveKit Room
        const room = new Room({
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        roomRef.current = room;

        // Room event listeners
        room.on(RoomEvent.Connected, () => {
          if (!isMounted) return;
          console.log("[Voice] Connected to LiveKit room.");
          setUiState("listening");

          // Start elapsed timer
          if (!timerRef.current) {
            timerRef.current = setInterval(() => {
              setElapsedSeconds((prev) => prev + 1);
            }, 1000);
          }
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          if (!isMounted) return;
          const agentSpeaking = speakers.some((p) => p.identity.includes("agent"));
          const userSpeaking = speakers.some((p) => p.identity === room.localParticipant.identity);

          if (agentSpeaking) {
            setUiState("speaking");
          } else if (userSpeaking) {
            setUiState("listening");
          } else {
            // Default to listening when idle
            setUiState((prev) => (prev === "speaking" ? "listening" : prev));
          }
        });

        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (!isMounted) return;
          if (track.kind === Track.Kind.Audio && participant.identity.includes("agent")) {
            console.log("[Voice] Subscribed to Agent audio track.");
            setUiState("speaking");
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          if (!isMounted) return;
          console.log("[Voice] LiveKit room disconnected.");
          setUiState("ended");
          handleExit();
        });

        // Connect and publish microphone
        await room.connect(data.livekitUrl, data.participantToken);
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err: unknown) {
        if (!isMounted) return;
        console.error("[Voice] Initialization failed:", err);
        const msg = err instanceof Error ? err.message : "Failed to connect to voice session.";
        setErrorMessage(msg);
        setUiState("error");
      }
    }

    initSession();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [cleanup, handleExit]);

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    await roomRef.current.localParticipant.setMicrophoneEnabled(!nextMuted);
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const renderStatus = () => {
    switch (uiState) {
      case "initializing":
        return "Preparing conversation...";
      case "connecting":
        return "Connecting to AI partner...";
      case "speaking":
        return "Ntalo is speaking...";
      case "thinking":
        return "Thinking...";
      case "listening":
        return isMuted ? "Microphone muted" : "Listening to you...";
      case "ended":
        return "Conversation ended";
      case "error":
        return errorMessage || "Connection error";
    }
  };

  const getOrbBackground = () => {
    if (uiState === "speaking") return "#2563EB"; // Blue active
    if (uiState === "listening" && !isMuted) return "#059669"; // Emerald listening
    if (isMuted) return "#DC2626"; // Red muted
    if (uiState === "error") return "#9CA3AF";
    return "#111827"; // Neutral dark
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top Header with Timer and X button */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.exitButton}
            activeOpacity={0.7}
            onPress={handleExit}
          >
            <AppText variant="title" color="#4B5563" style={styles.exitText}>
              ✕
            </AppText>
          </TouchableOpacity>

          <View style={styles.timerBadge}>
            <AppText variant="caption" weight="semibold" color="#111827">
              {formatTimer(elapsedSeconds)}
              {sessionData?.allowedSeconds ? ` / ${formatTimer(sessionData.allowedSeconds)}` : ""}
            </AppText>
          </View>

          <View style={styles.placeholderRight} />
        </View>

        {/* Center Orb & Status */}
        <View style={styles.centerContainer}>
          <View style={styles.orbOuter}>
            <View style={[styles.orbInner, { backgroundColor: getOrbBackground() }]}>
              {uiState === "initializing" || uiState === "connecting" ? (
                <ActivityIndicator color="#FFFFFF" size="large" />
              ) : (
                <AppText variant="title" color="#FFFFFF" style={styles.orbIcon}>
                  {uiState === "speaking" ? "🔊" : isMuted ? "🔇" : "🎙"}
                </AppText>
              )}
            </View>
          </View>

          <AppText variant="subtitle" weight="semibold" color="#111827" style={styles.statusText}>
            {renderStatus()}
          </AppText>

          <AppText variant="caption" color="#6B7280" style={styles.subStatusText}>
            {productState === "GUEST"
              ? "Free Guest Preview (120s limit)"
              : "Daily Speaking Practice"}
          </AppText>
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={[styles.muteButton, isMuted && styles.mutedActive]}
            activeOpacity={0.8}
            onPress={toggleMute}
            disabled={uiState === "initializing" || uiState === "connecting" || uiState === "error"}
          >
            <AppText variant="body" weight="medium" color={isMuted ? "#B91C1C" : "#111827"}>
              {isMuted ? "🔇 Unmute Mic" : "🎙 Mute Mic"}
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
  },
  exitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  exitText: {
    fontSize: 18,
    lineHeight: 20,
  },
  timerBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  placeholderRight: {
    width: 40,
  },
  centerContainer: {
    alignItems: "center",
    gap: 16,
  },
  orbOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  orbInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  orbIcon: {
    fontSize: 32,
  },
  statusText: {
    fontSize: 18,
    textAlign: "center",
  },
  subStatusText: {
    textAlign: "center",
  },
  bottomControls: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
  },
  muteButton: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  mutedActive: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
});

