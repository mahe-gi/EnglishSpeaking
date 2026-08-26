import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
  Platform,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AudioSession } from "@livekit/react-native";
import { Room, RoomEvent } from "livekit-client";
import { auth } from "../../lib/firebase";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import {
  getPeerMatchToken,
  completePeerMatch,
  reportPeerPartner,
  blockPeerPartner,
  PeerTokenData,
} from "../../lib/api";
import { colors, radius, spacing, shadows } from "../../theme";

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

        room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
          if (!isMounted) return;
          console.log(`[PeerSession] Subscribed to remote track kind=${track.kind} from ${participant.identity}`);
        });

        // 4. Connect to LiveKit
        await room.connect(tokenResult.serverUrl, tokenResult.participantToken);

        // 5. Enable microphone
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

  const renderStatus = () => {
    switch (connectionState) {
      case "connected":
        return "Live Call";
      case "waitingForPartner":
        return "Waiting for partner...";
      case "reconnecting":
        return "Reconnecting...";
      case "partnerDisconnected":
        return "Partner disconnected";
      default:
        return "Connecting...";
    }
  };

  if (connectionState === "error") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.danger} />
          <AppText variant="titleLarge" color={colors.textPrimary} style={styles.errorTitle}>
            Unable to Connect
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.errorSubtitle}>
            {errorMessage || "Failed to join peer call."}
          </AppText>
          <Button title="Back to Home" onPress={() => router.replace("/(tabs)")} />
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
          <AppText variant="captionMedium" color={colors.textPrimary}>
            {renderStatus()}
          </AppText>
        </View>

        <TouchableOpacity
          style={styles.safetyButton}
          onPress={() => setShowSafetyModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Open safety options"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.danger} />
          <AppText variant="captionMedium" color={colors.danger} style={styles.safetyButtonText}>
            Safety
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Center Call Info */}
      <View style={styles.centerContent}>
        <View style={styles.partnerAvatar}>
          <Ionicons name="person" size={54} color={colors.textSecondary} />
        </View>
        <AppText variant="titleLarge" color={colors.textPrimary} style={styles.partnerName}>
          Practice Partner
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.subtext}>
          1-on-1 English Conversation Practice
        </AppText>

        <View style={styles.timerBadge}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} style={styles.timerIcon} />
          <AppText variant="title" color={colors.textPrimary}>
            {formatTime(elapsedSeconds)} / {formatTime(maxAllowedSecs)}
          </AppText>
        </View>
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonMuted]}
          onPress={handleToggleMute}
          accessibilityRole="button"
          accessibilityLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={24}
            color={isMuted ? colors.danger : colors.textPrimary}
          />
          <AppText
            variant="micro"
            color={isMuted ? colors.danger : colors.textPrimary}
            style={styles.controlLabel}
          >
            {isMuted ? "Unmute" : "Mute"}
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endCallButton}
          onPress={confirmLeave}
          accessibilityRole="button"
          accessibilityLabel="End peer call"
        >
          <Ionicons name="call" size={24} color={colors.textInverse} />
          <AppText variant="micro" color={colors.textInverse} style={styles.endCallLabel}>
            End Call
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Moderation & Safety Modal */}
      <Modal visible={showSafetyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AppText variant="title" color={colors.textPrimary}>
              Safety & Moderation
            </AppText>
            <AppText variant="caption" color={colors.textSecondary} style={styles.modalSubtitle}>
              Help us maintain a respectful and safe practice environment.
            </AppText>

            {actionSuccessMessage && (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <AppText variant="captionMedium" color={colors.success} style={styles.successBannerText}>
                  {actionSuccessMessage}
                </AppText>
              </View>
            )}

            <AppText variant="micro" color={colors.textSecondary} style={styles.inputLabel}>
              REASON FOR REPORT
            </AppText>
            {[
              { id: "HARASSMENT", label: "Harassment or bullying" },
              { id: "INAPPROPRIATE_BEHAVIOR", label: "Inappropriate behavior" },
              { id: "AUDIO_QUALITY", label: "Audio quality or excessive noise" },
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
                <Ionicons
                  name={reportReason === opt.id ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={reportReason === opt.id ? colors.accent : colors.textTertiary}
                  style={styles.radioIcon}
                />
                <AppText
                  variant="body"
                  color={reportReason === opt.id ? colors.textPrimary : colors.textSecondary}
                  style={reportReason === opt.id ? styles.optionTextSelected : undefined}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}

            <TextInput
              style={styles.textInput}
              placeholder="Optional details (max 300 characters)"
              placeholderTextColor={colors.textTertiary}
              value={reportDetails}
              onChangeText={setReportDetails}
              maxLength={300}
              multiline
            />

            <Button
              title="Submit Report"
              variant="danger"
              loading={isSubmittingModeration}
              onPress={handleReportPartner}
              style={styles.submitReportButton}
            />

            <Button
              title="Block Partner"
              variant="secondary"
              icon={<Ionicons name="ban" size={18} color={colors.danger} />}
              onPress={handleBlockPartner}
              style={styles.blockPartnerButton}
            />

            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setShowSafetyModal(false)}
              style={styles.cancelModalButton}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : spacing.md,
    paddingBottom: spacing.md,
  },
  statusPill: {
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
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusDotGreen: {
    backgroundColor: colors.success,
  },
  statusDotYellow: {
    backgroundColor: colors.warning,
  },
  safetyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  safetyButtonText: {
    marginLeft: 4,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  partnerAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surfaceMuted,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partnerName: {
    marginBottom: 4,
  },
  subtext: {
    marginBottom: spacing.xl,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    ...shadows.subtle,
  },
  timerIcon: {
    marginRight: spacing.xs,
  },
  bottomControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  controlButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.subtle,
  },
  controlButtonMuted: {
    backgroundColor: colors.dangerSubtle,
    borderColor: "#FECACA",
  },
  controlLabel: {
    marginTop: 2,
  },
  endCallButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.medium,
  },
  endCallLabel: {
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  errorTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  errorSubtitle: {
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.medium,
  },
  modalSubtitle: {
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successSubtle,
    borderColor: "#A7F3D0",
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  successBannerText: {
    marginLeft: spacing.xs,
  },
  inputLabel: {
    marginBottom: spacing.xs,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.xs,
  },
  optionRowSelected: {
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  radioIcon: {
    marginRight: spacing.sm,
  },
  optionTextSelected: {
    fontWeight: "600",
  },
  textInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    minHeight: 64,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.border,
  },
  submitReportButton: {
    width: "100%",
    marginBottom: spacing.xs,
  },
  blockPartnerButton: {
    width: "100%",
    marginBottom: spacing.xs,
  },
  cancelModalButton: {
    width: "100%",
  },
});
