import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";
import { AudioSession } from "@livekit/react-native";
import { Room, RoomEvent } from "livekit-client";
import { auth } from "../../lib/firebase";
import {
  getPeerMatchToken,
  completePeerMatch,
  reportPeerPartner,
  blockPeerPartner,
  PeerTokenData,
} from "../../lib/api";

type PeerConnectionState =
  | "initializing"
  | "connecting"
  | "waitingForPartner"
  | "connected"
  | "reconnecting"
  | "partnerDisconnected"
  | "ended"
  | "error";

export default function PeerSessionScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();

  const [connectionState, setConnectionState] = useState<PeerConnectionState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [tokenData, setTokenData] = useState<PeerTokenData | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Safety & Moderation modal
  const [showSafetyModal, setShowSafetyModal] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>("HARASSMENT");
  const [reportDetails, setReportDetails] = useState<string>("");
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [isSubmittingModeration, setIsSubmittingModeration] = useState<boolean>(false);

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Initialize and Connect Room
  useEffect(() => {
    let isMounted = true;

    async function initCall() {
      if (!matchId) {
        setErrorMessage("Match ID is missing.");
        setConnectionState("error");
        return;
      }

      try {
        setConnectionState("initializing");
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Authentication required. Please sign in again.");
        }
        const idToken = await currentUser.getIdToken();

        // 1. Request token from backend
        const tokenResult = await getPeerMatchToken(idToken, matchId);
        if (!isMounted) return;
        setTokenData(tokenResult);

        // 2. Start LiveKit native AudioSession
        await AudioSession.startAudioSession();

        // 3. Create and configure LiveKit Room
        setConnectionState("connecting");
        const room = new Room({
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        roomRef.current = room;

        // Attach event listeners
        room.on(RoomEvent.Connected, () => {
          if (!isMounted) return;
          if (room.remoteParticipants.size > 0) {
            setConnectionState("connected");
          } else {
            setConnectionState("waitingForPartner");
          }
        });

        room.on(RoomEvent.ParticipantConnected, () => {
          if (!isMounted) return;
          setConnectionState("connected");
        });

        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (!isMounted) return;
          if (room.remoteParticipants.size === 0) {
            setConnectionState("partnerDisconnected");
          }
        });

        room.on(RoomEvent.Reconnecting, () => {
          if (!isMounted) return;
          setConnectionState("reconnecting");
        });

        room.on(RoomEvent.Reconnected, () => {
          if (!isMounted) return;
          setConnectionState(room.remoteParticipants.size > 0 ? "connected" : "waitingForPartner");
        });

        room.on(RoomEvent.Disconnected, () => {
          if (!isMounted) return;
          setConnectionState("ended");
        });

        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          if (!isMounted) return;
          console.log(`[PeerSession] 🎧 Subscribed to remote track kind=${track.kind} from ${participant.identity}`);
        });


        // 4. Connect to LiveKit
        await room.connect(tokenResult.serverUrl, tokenResult.participantToken);

        // 5. Enable microphone only
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to connect to peer practice session.";
        setErrorMessage(msg);
        setConnectionState("error");
      }
    }

    initCall();

    return () => {
      isMounted = false;
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      AudioSession.stopAudioSession();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [matchId]);

  // 2. In-call Elapsed Timer
  useEffect(() => {
    if (connectionState === "connected") {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [connectionState]);

  // 3. Toggle Mute
  const handleToggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    try {
      const nextMuteState = !isMuted;
      await room.localParticipant.setMicrophoneEnabled(!nextMuteState);
      setIsMuted(nextMuteState);
    } catch {
      // ignore
    }
  }, [isMuted]);

  // 4. Leave Session
  const handleLeaveSession = useCallback(async () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    await AudioSession.stopAudioSession();

    // Call completeMatch (best-effort UX signal)
    if (matchId) {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const idToken = await currentUser.getIdToken();
          await completePeerMatch(idToken, matchId);
        }
      } catch {
        // ignore
      }
    }

    router.replace("/(tabs)");
  }, [matchId, router]);

  const confirmLeave = () => {
    Alert.alert("End Call?", "Are you sure you want to leave this peer practice conversation?", [
      { text: "Cancel", style: "cancel" },
      { text: "End Call", style: "destructive", onPress: handleLeaveSession },
    ]);
  };

  // 5. Moderation actions: Report and Block
  const handleReportPartner = async () => {
    if (!matchId) return;
    try {
      setIsSubmittingModeration(true);
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const idToken = await currentUser.getIdToken();
      await reportPeerPartner(idToken, matchId, reportReason, reportDetails || undefined);
      setActionSuccessMessage("Report submitted. Thank you for helping keep our community safe.");
      setTimeout(() => {
        setActionSuccessMessage(null);
        setShowSafetyModal(false);
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not submit report.";
      Alert.alert("Error", msg);
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleBlockPartner = async () => {
    if (!matchId) return;
    Alert.alert(
      "Block Partner?",
      "You will immediately disconnect and never be matched with this user again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              const currentUser = auth.currentUser;
              if (currentUser) {
                const idToken = await currentUser.getIdToken();
                await blockPeerPartner(idToken, matchId);
              }
            } catch {
              // ignore
            }
            setShowSafetyModal(false);
            handleLeaveSession();
          },
        },
      ]
    );
  };

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const maxAllowedSecs = tokenData?.allowedSeconds || 900;

  if (connectionState === "error") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Unable to Connect</Text>
          <Text style={styles.errorSubtitle}>{errorMessage || "Failed to join peer call."}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.primaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              connectionState === "connected"
                ? styles.statusDotGreen
                : styles.statusDotYellow,
            ]}
          />
          <Text style={styles.statusText}>
            {connectionState === "connected"
              ? "Live Call"
              : connectionState === "waitingForPartner"
              ? "Waiting for partner..."
              : connectionState === "reconnecting"
              ? "Reconnecting..."
              : connectionState === "partnerDisconnected"
              ? "Partner disconnected"
              : "Connecting..."}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.safetyButton}
          onPress={() => setShowSafetyModal(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.safetyButtonText}>🛡️ Safety</Text>
        </TouchableOpacity>
      </View>

      {/* Center Call Info */}
      <View style={styles.centerContent}>
        <View style={styles.partnerAvatar}>
          <Text style={styles.partnerAvatarText}>👤</Text>
        </View>
        <Text style={styles.partnerName}>Practice Partner</Text>
        <Text style={styles.subtext}>English Conversation Practice</Text>

        <View style={styles.timerBadge}>
          <Text style={styles.timerText}>
            {formatTime(elapsedSeconds)} / {formatTime(maxAllowedSecs)}
          </Text>
        </View>
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonMuted]}
          onPress={handleToggleMute}
        >
          <Text style={styles.controlIcon}>{isMuted ? "🔇" : "🎙️"}</Text>
          <Text style={styles.controlLabel}>{isMuted ? "Unmute" : "Mute"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endCallButton} onPress={confirmLeave}>
          <Text style={styles.endCallIcon}>✕</Text>
          <Text style={styles.endCallLabel}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Moderation Modal */}
      <Modal visible={showSafetyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Safety & Moderation</Text>
            <Text style={styles.modalSubtitle}>
              Help us maintain a respectful practice environment.
            </Text>

            {actionSuccessMessage && (
              <View style={styles.successBanner}>
                <Text style={styles.successBannerText}>{actionSuccessMessage}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Reason for Report</Text>
            {[
              { id: "HARASSMENT", label: "Harassment or bullying" },
              { id: "INAPPROPRIATE_BEHAVIOR", label: "Inappropriate behavior" },
              { id: "AUDIO_QUALITY", label: "Audio quality / Noise" },
              { id: "OTHER", label: "Other issue" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.optionRow,
                  reportReason === opt.id && styles.optionRowSelected,
                ]}
                onPress={() => setReportReason(opt.id)}
              >
                <Text
                  style={[
                    styles.optionText,
                    reportReason === opt.id && styles.optionTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TextInput
              style={styles.textInput}
              placeholder="Optional details (max 300 characters)"
              value={reportDetails}
              onChangeText={setReportDetails}
              maxLength={300}
              multiline
            />

            <TouchableOpacity
              style={styles.submitReportButton}
              onPress={handleReportPartner}
              disabled={isSubmittingModeration}
            >
              {isSubmittingModeration ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitReportText}>Submit Report</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.blockPartnerButton} onPress={handleBlockPartner}>
              <Text style={styles.blockPartnerText}>🚫 Block Partner</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelModalButton}
              onPress={() => setShowSafetyModal(false)}
            >
              <Text style={styles.cancelModalText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 14,
    paddingBottom: 14,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusDotGreen: {
    backgroundColor: "#10B981",
  },
  statusDotYellow: {
    backgroundColor: "#F59E0B",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F3F4F6",
  },
  safetyButton: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  safetyButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#F87171",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  partnerAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  partnerAvatarText: {
    fontSize: 54,
  },
  partnerName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  subtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 28,
  },
  timerBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  timerText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#10B981",
    fontVariant: ["tabular-nums"],
  },
  bottomControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 36,
    paddingBottom: 48,
  },
  controlButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonMuted: {
    backgroundColor: "#EF4444",
  },
  controlIcon: {
    fontSize: 26,
    color: "#FFFFFF",
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#E5E7EB",
    marginTop: 2,
  },
  endCallButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
  },
  endCallIcon: {
    fontSize: 26,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  endCallLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  errorSubtitle: {
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: "#10B981",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#1F2937",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    marginBottom: 20,
  },
  successBanner: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  successBannerText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  optionRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginBottom: 8,
  },
  optionRowSelected: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  optionText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  optionTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  textInput: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 10,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 16,
    minHeight: 64,
    textAlignVertical: "top",
  },
  submitReportButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  submitReportText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  blockPartnerButton: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  blockPartnerText: {
    color: "#F87171",
    fontSize: 15,
    fontWeight: "700",
  },
  cancelModalButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelModalText: {
    color: "#9CA3AF",
    fontSize: 15,
    fontWeight: "600",
  },
});

