import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { AudioSession } from "@livekit/react-native";
import { Room, RoomEvent, Participant, Track } from "livekit-client";
import { AppText } from "../components/AppText";
import { IconButton } from "../components/IconButton";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import { auth } from "../lib/firebase";
import { getInstallationId } from "../lib/installation";
import { createVoiceSession, VoiceSessionData } from "../lib/api";
import { colors, radius, spacing, shadows } from "../theme";

type VoiceUIState = "initializing" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";

export default function VoiceScreen() {
  const router = useRouter();
  const { productState } = useAuth();

  const [uiState, setUiState] = useState<VoiceUIState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<VoiceSessionData | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [agentPresent, setAgentPresent] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentPresentRef = useRef(false);
  const hasCleanedUp = useRef(false);

  const markAgentPresent = useCallback(() => {
    agentPresentRef.current = true;
    setAgentPresent(true);
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  // Reanimated shared values for organic, subtle breathing voice orb
  const orbScale = useSharedValue(1);
  const orbOpacity = useSharedValue(0.85);

  useEffect(() => {
    if (uiState === "speaking") {
      orbScale.value = withRepeat(
        withSequence(
          withTiming(1.18, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 750, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      orbOpacity.value = withRepeat(
        withSequence(
          withTiming(1.0, { duration: 750 }),
          withTiming(0.7, { duration: 750 })
        ),
        -1,
        true
      );
    } else if (uiState === "listening" && !isMuted) {
      orbScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      orbOpacity.value = withTiming(0.9, { duration: 300 });
    } else {
      cancelAnimation(orbScale);
      cancelAnimation(orbOpacity);
      orbScale.value = withTiming(1.0, { duration: 300 });
      orbOpacity.value = withTiming(0.8, { duration: 300 });
    }
  }, [uiState, isMuted, orbScale, orbOpacity]);

  const animatedOrbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
    opacity: orbOpacity.value,
  }));

  const cleanup = useCallback(async () => {
    if (hasCleanedUp.current) return;
    hasCleanedUp.current = true;

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

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

  const startSession = useCallback(async () => {
    hasCleanedUp.current = false;
    setErrorMessage(null);
    setElapsedSeconds(0);
    agentPresentRef.current = false;
    setAgentPresent(false);

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

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
      setSessionData(data);
      console.log(`[Voice] Session created: ${data.sessionId}, Room: ${data.roomName}`);

      await AudioSession.startAudioSession();
      setUiState("connecting");

      const room = new Room({
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      roomRef.current = room;

      // 18-second bounded connection safety timeout using imperative ref authority
      connectionTimeoutRef.current = setTimeout(() => {
        if (room.state === "connected" && !agentPresentRef.current) {
          console.warn("[Voice] Connection timeout: Agent did not respond in time.");
          setErrorMessage("The AI speaking partner took too long to connect. Please try again.");
          setUiState("error");
        }
      }, 18000);

      const isRemoteAgent = (p: Participant) => {
        if (p.identity === room.localParticipant.identity) return false;
        return (
          p.identity.toLowerCase().includes("agent") ||
          (p as any).kind === 2 ||
          (p as any).kind === "agent" ||
          (p as any).isAgent === true ||
          true // Single-occupant AI practice room: any remote participant is the agent
        );
      };

      room.on(RoomEvent.Connected, () => {
        console.log("[Voice] Connected to LiveKit room.");

        // Check if agent is already in room
        const hasAgent = Array.from(room.remoteParticipants.values()).some((p) =>
          isRemoteAgent(p)
        );
        if (hasAgent) {
          markAgentPresent();
          setUiState("listening");
        }

        if (!timerRef.current) {
          timerRef.current = setInterval(() => {
            setElapsedSeconds((prev) => prev + 1);
          }, 1000);
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant: Participant) => {
        console.log(`[Voice] Participant connected: ${participant.identity}`);
        if (isRemoteAgent(participant)) {
          markAgentPresent();
          setUiState("listening");
        }
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const agentSpeaking = speakers.some((p) => isRemoteAgent(p));
        const userSpeaking = speakers.some((p) => p.identity === room.localParticipant.identity);

        if (agentSpeaking) {
          setUiState("speaking");
        } else if (userSpeaking) {
          setUiState("listening");
        } else {
          setUiState((prev) => (prev === "speaking" ? "listening" : prev));
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio && isRemoteAgent(participant)) {
          console.log("[Voice] Subscribed to Agent audio track.");
          markAgentPresent();
          setUiState("speaking");
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log("[Voice] LiveKit room disconnected.");
        setUiState("ended");
        handleExit();
      });

      await room.connect(data.livekitUrl, data.participantToken);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err: unknown) {
      console.error("[Voice] Initialization failed:", err);
      const msg = err instanceof Error ? err.message : "Failed to connect to voice session.";
      setErrorMessage(msg);
      setUiState("error");
    }
  }, [handleExit, markAgentPresent]);

  useEffect(() => {
    startSession();
    return () => {
      cleanup();
    };
  }, []);

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
        return "Setting up practice...";
      case "connecting":
        return "Connecting with AI partner...";
      case "speaking":
        return "Ntalo is speaking...";
      case "thinking":
        return "Thinking...";
      case "listening":
        return isMuted ? "Microphone is muted" : "Listening to you...";
      case "ended":
        return "Conversation completed";
      case "error":
        return errorMessage || "Connection issue";
    }
  };

  const getOrbBackground = () => {
    if (uiState === "speaking") return colors.voiceSpeaking;
    if (uiState === "listening" && !isMuted) return colors.voiceListening;
    if (isMuted) return colors.voiceMuted;
    if (uiState === "error") return colors.textTertiary;
    return colors.brand;
  };

  const getOrbIcon = () => {
    if (uiState === "initializing" || uiState === "connecting") {
      return <ActivityIndicator color={colors.textInverse} size="small" />;
    }
    if (uiState === "speaking") {
      return <Ionicons name="volume-high" size={32} color={colors.textInverse} />;
    }
    if (isMuted) {
      return <Ionicons name="mic-off" size={32} color={colors.textInverse} />;
    }
    if (uiState === "error") {
      return <Ionicons name="alert-circle" size={32} color={colors.textInverse} />;
    }
    return <Ionicons name="mic" size={32} color={colors.textInverse} />;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top Header with Timer and Close Button */}
        <View style={styles.topHeader}>
          <IconButton
            icon={<Ionicons name="close" size={22} color={colors.textPrimary} />}
            accessibilityLabel="Exit conversation"
            onPress={handleExit}
            variant="surface"
            size={44}
          />

          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} style={styles.timerIcon} />
            <AppText variant="captionMedium" color={colors.textPrimary}>
              {formatTimer(elapsedSeconds)}
              {sessionData?.allowedSeconds ? ` / ${formatTimer(sessionData.allowedSeconds)}` : ""}
            </AppText>
          </View>

          <View style={styles.placeholderRight} />
        </View>

        {/* Center Orb & Visualizer */}
        <View style={styles.centerContainer}>
          <View style={styles.orbOuter}>
            <Animated.View
              style={[
                styles.orbInner,
                { backgroundColor: getOrbBackground() },
                animatedOrbStyle,
              ]}
            >
              {getOrbIcon()}
            </Animated.View>
          </View>

          <AppText variant="title" align="center" color={colors.textPrimary} style={styles.statusText}>
            {renderStatus()}
          </AppText>

          <AppText variant="caption" align="center" color={colors.textSecondary}>
            {productState === "GUEST"
              ? "Guest preview • 2 min session limit"
              : "Spoken conversation practice"}
          </AppText>

          {uiState === "error" && (
            <View style={styles.errorActionRow}>
              <Button
                title="Try Again"
                size="sm"
                onPress={startSession}
                style={styles.retryButton}
              />
              <Button
                title="Exit"
                variant="outline"
                size="sm"
                onPress={handleExit}
                style={styles.retryButton}
              />
            </View>
          )}
        </View>

        {/* Bottom Call Controls */}
        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={[styles.muteButton, isMuted && styles.mutedActive]}
            activeOpacity={0.8}
            onPress={toggleMute}
            accessibilityRole="button"
            accessibilityLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
            disabled={uiState === "initializing" || uiState === "connecting" || uiState === "error"}
          >
            <Ionicons
              name={isMuted ? "mic-off" : "mic"}
              size={20}
              color={isMuted ? colors.danger : colors.textPrimary}
            />
            <AppText
              variant="bodyMedium"
              color={isMuted ? colors.danger : colors.textPrimary}
              style={styles.muteButtonText}
            >
              {isMuted ? "Unmute" : "Mute"}
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endCallButton}
            activeOpacity={0.8}
            onPress={handleExit}
            accessibilityRole="button"
            accessibilityLabel="End practice session"
          >
            <Ionicons name="call" size={20} color={colors.textInverse} />
            <AppText variant="bodyMedium" color={colors.textInverse} style={styles.endCallText}>
              End Call
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
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    ...shadows.subtle,
  },
  timerIcon: {
    marginRight: 6,
  },
  placeholderRight: {
    width: 44,
  },
  centerContainer: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  orbOuter: {
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: colors.surfaceMuted,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  orbInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.medium,
  },
  statusText: {
    maxWidth: 280,
  },
  errorActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  retryButton: {
    minWidth: 110,
  },
  bottomControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  muteButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
    ...shadows.subtle,
  },
  mutedActive: {
    backgroundColor: colors.dangerSubtle,
    borderColor: "#FECACA",
  },
  muteButtonText: {
    marginLeft: spacing.xs,
  },
  endCallButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.full,
    minHeight: 48,
    ...shadows.subtle,
  },
  endCallText: {
    marginLeft: spacing.xs,
  },
});
