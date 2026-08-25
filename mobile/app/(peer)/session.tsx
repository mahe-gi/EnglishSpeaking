import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Modal,
  TextInput,
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

  // Private post-session reflection state
  const [showReflection, setShowReflection] = useState<boolean>(false);
  const [reflectionFeel, setReflectionFeel] = useState<string | null>(null);
  const [reflectionFocus, setReflectionFocus] = useState<string | null>(null);

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

        // 4. Connect to LiveKit Cloud
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
      // Clean up room and audio session on unmount
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

  // 2. Structured Session 15-Minute Timer
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

    // Call completeMatch if past match duration
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

    setShowReflection(true);
  }, [matchId]);

  const confirmLeave = () => {
    Alert.alert("Leave Practice Call?", "Are you sure you want to end this 1:1 speaking session?", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: handleLeaveSession },
    ]);
  };

  // 5. Moderation actions: Report and Block
  const handleReportPartner = async () => {
    if (!matchId) return;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const idToken = await currentUser.getIdToken();
      await reportPeerPartner(idToken, matchId, reportReason, reportDetails);
      setActionSuccessMessage("Report submitted. Thank you for keeping our community safe.");
      setTimeout(() => setActionSuccessMessage(null), 3000);
    } catch {
      Alert.alert("Error", "Could not submit report.");
    }
  };

  const handleBlockPartner = async () => {
    if (!matchId) return;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const idToken = await currentUser.getIdToken();
      await blockPeerPartner(idToken, matchId);
      Alert.alert("Partner Blocked", "You will never be matched with this learner again.", [
        { text: "OK", onPress: handleLeaveSession },
      ]);
    } catch {
      Alert.alert("Error", "Could not block partner.");
    }
  };

  // Format Elapsed Time
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Determine current structured stage
  // Stage 1: 00:00–01:00 (1 min)
  // Stage 2: 01:00–07:00 (6 min) -> Learner A answers
  // Stage 3: 07:00–13:00 (6 min) -> Learner B answers
  // Stage 4: 13:00–15:00 (2 min) -> Wrap-up
  const myRole = tokenData?.match.role || "A";
  let currentStageTitle = "Stage 1: Quick Introduction (1 min)";
  let currentSpeakerPrompt = "Say hello, introduce yourself briefly, and verify audio.";
  let isMyTurnToAnswer = false;

  if (elapsedSeconds >= 60 && elapsedSeconds < 420) {
    currentStageTitle = "Stage 2: Learner A Speaks (6 min)";
    if (myRole === "A") {
      isMyTurnToAnswer = true;
      currentSpeakerPrompt = "YOUR TURN: Answer the scenario interview question clearly.";
    } else {
      currentSpeakerPrompt = "INTERVIEWER TURN: Listen to Learner A and ask one relevant follow-up question.";
    }
  } else if (elapsedSeconds >= 420 && elapsedSeconds < 780) {
    currentStageTitle = "Stage 3: Learner B Speaks (6 min)";
    if (myRole === "B") {
      isMyTurnToAnswer = true;
      currentSpeakerPrompt = "YOUR TURN: Answer the scenario interview question clearly.";
    } else {
      currentSpeakerPrompt = "INTERVIEWER TURN: Listen to Learner B and ask one relevant follow-up question.";
    }
  } else if (elapsedSeconds >= 780) {
    currentStageTitle = "Stage 4: Wrap-up & Reflection (2 min)";
    currentSpeakerPrompt = "Share one positive observation and thank your practice partner!";
  }

  // --- RENDER POST-SESSION REFLECTION MODAL ---
  if (showReflection) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.reflectionHeading}>Practice Complete! 🎉</Text>
          <Text style={styles.reflectionSubheading}>
            Take a moment for private self-reflection. Your feedback is private and not shared with your partner.
          </Text>

          <View style={styles.reflectionCard}>
            <Text style={styles.reflectionQuestion}>How did that conversation feel?</Text>
            {["Easier than expected", "About right", "Challenging / Nervous"].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.reflectionOption, reflectionFeel === opt && styles.reflectionOptionSelected]}
                onPress={() => setReflectionFeel(opt)}
              >
                <Text style={[styles.reflectionOptionText, reflectionFeel === opt && styles.reflectionTextSelected]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.divider} />

            <Text style={styles.reflectionQuestion}>What should you practice next?</Text>
            {["Structuring answers", "Grammar & tenses", "Speaking pace / fluency", "Vocabulary"].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.reflectionOption, reflectionFocus === opt && styles.reflectionOptionSelected]}
                onPress={() => setReflectionFocus(opt)}
              >
                <Text style={[styles.reflectionOptionText, reflectionFocus === opt && styles.reflectionTextSelected]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.primaryButtonText}>Finish & Return to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- RENDER ERROR SCREEN ---
  if (connectionState === "error") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Peer Call Unavailable</Text>
          <Text style={styles.errorSubtitle}>{errorMessage || "Could not connect to peer room."}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/(peer)")}>
            <Text style={styles.primaryButtonText}>Return to Peer Slots</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Bar */}
        <View style={styles.topBarRow}>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                connectionState === "connected" ? styles.statusDotGreen : styles.statusDotYellow,
              ]}
            />
            <Text style={styles.statusText}>
              {connectionState === "connected"
                ? "Live Audio Call"
                : connectionState === "waitingForPartner"
                ? "Waiting for Partner..."
                : connectionState === "reconnecting"
                ? "Reconnecting..."
                : connectionState === "partnerDisconnected"
                ? "Partner Left Call"
                : "Connecting..."}
            </Text>
          </View>

          <TouchableOpacity style={styles.safetyButton} onPress={() => setShowSafetyModal(true)}>
            <Text style={styles.safetyButtonText}>🛡️ Safety</Text>
          </TouchableOpacity>
        </View>

        {/* 15-Min Timer & Stage Card */}
        <View style={styles.timerCard}>
          <Text style={styles.timerDigits}>{formatTime(elapsedSeconds)} / 15:00</Text>
          <Text style={styles.stageTitle}>{currentStageTitle}</Text>
          <View style={[styles.speakerPromptBox, isMyTurnToAnswer && styles.speakerPromptBoxActive]}>
            <Text style={styles.speakerPromptText}>{currentSpeakerPrompt}</Text>
          </View>
        </View>

        {/* Scenario & Interview Question */}
        {tokenData && (
          <View style={styles.scenarioCard}>
            <Text style={styles.scenarioCategory}>
              {tokenData.match.scenario.category} INTERVIEW SCENARIO
            </Text>
            <Text style={styles.scenarioTitle}>{tokenData.match.scenario.title}</Text>
            <View style={styles.divider} />
            <Text style={styles.questionLabel}>Interview Question:</Text>
            <Text style={styles.questionText}>{tokenData.match.scenario.initialQuestion}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                You are {myRole === "A" ? "Learner A (Answers in Stage 2)" : "Learner B (Answers in Stage 3)"}
              </Text>
            </View>
          </View>
        )}

        {/* Call Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.controlButtonMuted]}
            onPress={handleToggleMute}
          >
            <Text style={styles.controlIcon}>{isMuted ? "🔇" : "🎤"}</Text>
            <Text style={styles.controlText}>{isMuted ? "Unmute" : "Mute"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.leaveButton} onPress={confirmLeave}>
            <Text style={styles.controlIcon}>🚪</Text>
            <Text style={styles.leaveText}>Leave Call</Text>
          </TouchableOpacity>
        </View>

        {/* Safety / Moderation Modal */}
        <Modal visible={showSafetyModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Safety & Moderation</Text>
              <Text style={styles.modalSubtitle}>
                We prioritize a respectful, harassment-free environment for all learners.
              </Text>

              {actionSuccessMessage && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>{actionSuccessMessage}</Text>
                </View>
              )}

              <Text style={styles.reportLabel}>Report Partner for:</Text>
              {["HARASSMENT", "HATE_OR_ABUSE", "SEXUAL_CONTENT", "OTHER"].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reportOption, reportReason === r && styles.reportOptionSelected]}
                  onPress={() => setReportReason(r)}
                >
                  <Text style={[styles.reportOptionText, reportReason === r && styles.reportTextSelected]}>
                    {r.replace(/_/g, " ")}
                  </Text>
                </TouchableOpacity>
              ))}

              <TextInput
                style={styles.detailsInput}
                placeholder="Optional description..."
                value={reportDetails}
                onChangeText={setReportDetails}
                maxLength={300}
              />

              <TouchableOpacity style={styles.submitReportButton} onPress={handleReportPartner}>
                <Text style={styles.submitReportButtonText}>Submit Moderation Report</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.blockButton} onPress={handleBlockPartner}>
                <Text style={styles.blockButtonText}>🚫 Block Partner (Never Match Again)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowSafetyModal(false)}
              >
                <Text style={styles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  topBarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  safetyButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
  },
  safetyButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC2626",
  },
  timerCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    marginBottom: 16,
  },
  timerDigits: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  stageTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4F46E5",
    marginBottom: 12,
  },
  speakerPromptBox: {
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 10,
    width: "100%",
  },
  speakerPromptBoxActive: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  speakerPromptText: {
    fontSize: 13,
    color: "#1F2937",
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "500",
  },
  scenarioCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
  },
  scenarioCategory: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6366F1",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scenarioTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 14,
  },
  questionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  questionText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#1F2937",
    fontWeight: "600",
    marginBottom: 14,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4F46E5",
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 16,
    marginTop: 10,
  },
  controlButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  controlButtonMuted: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  controlIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  controlText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  leaveButton: {
    flex: 1,
    backgroundColor: "#DC2626",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  leaveText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  errorSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: "#4F46E5",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  reflectionHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 6,
  },
  reflectionSubheading: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  reflectionCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
  },
  reflectionQuestion: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  reflectionOption: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  reflectionOptionSelected: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4F46E5",
  },
  reflectionOptionText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  reflectionTextSelected: {
    color: "#4F46E5",
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 16,
  },
  successBox: {
    backgroundColor: "#ECFDF5",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  successText: {
    color: "#059669",
    fontSize: 12,
    fontWeight: "600",
  },
  reportLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
    marginBottom: 8,
  },
  reportOption: {
    backgroundColor: "#F9FAFB",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 6,
  },
  reportOptionSelected: {
    backgroundColor: "#FEE2E2",
    borderColor: "#DC2626",
  },
  reportOptionText: {
    fontSize: 13,
    color: "#374151",
  },
  reportTextSelected: {
    color: "#DC2626",
    fontWeight: "700",
  },
  detailsInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    marginVertical: 10,
    height: 60,
  },
  submitReportButton: {
    backgroundColor: "#DC2626",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  submitReportButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  blockButton: {
    backgroundColor: "#1F2937",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  blockButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  closeModalButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  closeModalButtonText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
  },
});
