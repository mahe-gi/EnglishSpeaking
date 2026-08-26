import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  AppState,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { File } from "expo-file-system";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";
import { auth } from "../../lib/firebase";
import {
  startPracticeSession,
  uploadPracticeResponse,
  PracticeStartData,
  PracticeFeedbackData,
  PracticeSessionSummary,
} from "../../lib/api";

type PracticeState =
  | "loading"
  | "ready"
  | "recording"
  | "recorded"
  | "processing"
  | "feedback"
  | "feedbackPendingError"
  | "completed"
  | "error"
  | "permissionRequired";

function deleteTemporaryRecording(uri: string | null) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    if (__DEV__) {
      console.warn("[AudioCleanup] Failed to delete temporary audio", error);
    }
  }
}

export default function DailyPracticeScreen() {
  const router = useRouter();

  // Session & Scenario state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<PracticeStartData["scenario"] | null>(null);
  const [currentSequence, setCurrentSequence] = useState<number>(1);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [pendingDurationMs, setPendingDurationMs] = useState<number>(15000);

  // Turn Feedback & Summary state
  const [turnFeedback, setTurnFeedback] = useState<PracticeFeedbackData | null>(null);
  const [lastMetrics, setLastMetrics] = useState<{ wordCount: number; wordsPerMinute: number; fillerCount: number } | null>(null);
  const [nextTurnData, setNextTurnData] = useState<{ sequence: number; question: string } | null>(null);
  const [sessionSummary, setSessionSummary] = useState<PracticeSessionSummary | null>(null);

  // UI & Recording state
  const [practiceState, setPracticeState] = useState<PracticeState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordedDurationMs, setRecordedDurationMs] = useState<number>(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const wasRecordingRef = useRef<boolean>(false);
  const isFinalizingRef = useRef<boolean>(false);
  const recordedUriRef = useRef<string | null>(null);

  useEffect(() => {
    recordedUriRef.current = recordedUri;
  }, [recordedUri]);

  // Clean up any unsent audio recording take on unmount
  useEffect(() => {
    return () => {
      deleteTemporaryRecording(recordedUriRef.current);
    };
  }, []);

  // Reusable retry helper for turns with persisted transcripts
  const retryPendingFeedback = useCallback(
    async (
      sid: string,
      seq: number,
      durationMs: number
    ) => {
      try {
        setPracticeState("processing");
        setErrorMessage(null);

        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Authentication required. Please sign in again.");
        }

        const idToken = await currentUser.getIdToken();
        const result = await uploadPracticeResponse(
          idToken,
          sid,
          seq,
          durationMs,
          null // No new audio; backend reuses stored transcript
        );

        setTurnFeedback(result.feedback);
        setLastMetrics(result.utterance.metrics);
        setNextTurnData(result.nextTurn);
        if (result.sessionCompleted) {
          setSessionSummary(result.summary);
        }
        setPracticeState("feedback");
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to generate coaching feedback. Please retry.";
        setErrorMessage(msg);
        setPracticeState("feedbackPendingError");
      }
    },
    []
  );

  // Initialize Practice Session
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        setPracticeState("loading");
        setErrorMessage(null);

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        const permission = await AudioModule.getRecordingPermissionsAsync();
        if (isMounted) {
          setPermissionGranted(permission.granted);
          if (!permission.granted) {
            setPracticeState("permissionRequired");
            return;
          }
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Authentication required. Please sign in again.");
        }

        const idToken = await currentUser.getIdToken();
        const startData = await startPracticeSession(idToken);

        if (isMounted) {
          setSessionId(startData.session.id);
          setScenario(startData.scenario);

          if (startData.nextTurn) {
            setCurrentSequence(startData.nextTurn.sequence);
            setCurrentQuestion(startData.nextTurn.question);

            // If an earlier answer was transcribed but LLM feedback failed before restart:
            if (startData.nextTurn.feedbackPending) {
              const pendingDuration = startData.nextTurn.durationMs || 15000;
              setPendingDurationMs(pendingDuration);
              await retryPendingFeedback(
                startData.session.id,
                startData.nextTurn.sequence,
                pendingDuration
              );
            } else {
              setPracticeState("ready");
            }
          } else {
            // All 3 turns were already finished
            setPracticeState("completed");
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Failed to initialize daily practice.";
          setErrorMessage(msg);
          setPracticeState("error");
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
      Speech.stop();
    };
  }, [retryPendingFeedback]);

  // Finalize stopped recording
  const finalizeStoppedRecording = useCallback((overrideDurationMs?: number) => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;

    try {
      const durationMs = overrideDurationMs ?? recorderState.durationMillis ?? 0;
      if (durationMs < 1000) {
        setErrorMessage("Answer too short. Please speak for at least 3 seconds.");
        setPracticeState("ready");
        return;
      }

      const uri = recorder.uri;
      if (!uri || uri.trim() === "") {
        setErrorMessage("Recording artifact was missing. Please record again.");
        setPracticeState("ready");
        return;
      }

      // Delete any prior unsubmitted take
      if (recordedUri && recordedUri !== uri) {
        deleteTemporaryRecording(recordedUri);
      }

      setRecordedDurationMs(durationMs);
      setRecordedUri(uri);
      setPracticeState("recorded");
      setErrorMessage(null);
    } finally {
      isFinalizingRef.current = false;
    }
  }, [recorder.uri, recorderState.durationMillis, recordedUri]);

  // Handle manual stop button press
  const handleStopRecordingManually = useCallback(async () => {
    try {
      const currentDuration = recorderState.durationMillis || 0;
      if (recorderState.isRecording) {
        await recorder.stop();
      }
      finalizeStoppedRecording(currentDuration);
    } catch {
      finalizeStoppedRecording();
    }
  }, [recorder, recorderState.durationMillis, recorderState.isRecording, finalizeStoppedRecording]);

  // Handle native 30s auto-stop transition
  useEffect(() => {
    if (wasRecordingRef.current && !recorderState.isRecording && practiceState === "recording") {
      finalizeStoppedRecording(30000);
    }
    wasRecordingRef.current = recorderState.isRecording;
  }, [recorderState.isRecording, practiceState, finalizeStoppedRecording]);

  // Handle backgrounding
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState === "background" && recorder.isRecording) {
        try {
          await recorder.stop();
          if (recorder.uri) {
            deleteTemporaryRecording(recorder.uri);
          }
        } catch {
          // ignore stop error
        }
        setPracticeState("ready");
        setErrorMessage("Recording was interrupted when app went to background. Please record again.");
      }
    });

    return () => subscription.remove();
  }, [recorder]);

  const requestPermission = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    setPermissionGranted(perm.granted);
    if (perm.granted) {
      setPracticeState("ready");
    }
  };

  const handlePlayTTS = async () => {
    try {
      if (isSpeakingTTS) {
        await Speech.stop();
        setIsSpeakingTTS(false);
        return;
      }

      setIsSpeakingTTS(true);
      Speech.speak(currentQuestion, {
        onDone: () => setIsSpeakingTTS(false),
        onStopped: () => setIsSpeakingTTS(false),
        onError: () => setIsSpeakingTTS(false),
      });
    } catch {
      setIsSpeakingTTS(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      setErrorMessage(null);
      isFinalizingRef.current = false;

      await Speech.stop();
      setIsSpeakingTTS(false);

      if (!permissionGranted) {
        await requestPermission();
        return;
      }

      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 30 });
      setPracticeState("recording");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start recording.";
      setErrorMessage(msg);
      setPracticeState("error");
    }
  };

  const handleRecordAgain = () => {
    // Delete discarded take immediately
    deleteTemporaryRecording(recordedUri);
    setRecordedUri(null);
    setRecordedDurationMs(0);
    setPracticeState("ready");
    setErrorMessage(null);
  };

  const handleSubmitTurn = async () => {
    if (!recordedUri || !sessionId) return;

    try {
      setPracticeState("processing");
      setErrorMessage(null);
      await Speech.stop();
      setIsSpeakingTTS(false);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required. Please sign in again.");
      }

      const idToken = await currentUser.getIdToken();

      const result = await uploadPracticeResponse(
        idToken,
        sessionId,
        currentSequence,
        recordedDurationMs,
        recordedUri
      );

      // Zero-Retention: Delete local audio file immediately on server success
      deleteTemporaryRecording(recordedUri);
      setRecordedUri(null);

      setTurnFeedback(result.feedback);
      setLastMetrics(result.utterance.metrics);
      setNextTurnData(result.nextTurn);

      if (result.sessionCompleted) {
        setSessionSummary(result.summary);
      }

      setPracticeState("feedback");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process practice answer. Please retry.";
      setErrorMessage(msg);
      setPracticeState("recorded"); // Keep recorded take so user can retry submission
    }
  };

  const handleAdvanceToNextTurn = () => {
    if (nextTurnData) {
      setCurrentSequence(nextTurnData.sequence);
      setCurrentQuestion(nextTurnData.question);
      setRecordedUri(null);
      setRecordedDurationMs(0);
      setTurnFeedback(null);
      setLastMetrics(null);
      setNextTurnData(null);
      setPracticeState("ready");
    } else {
      // Third turn finished -> show session summary
      setPracticeState("completed");
    }
  };

  // --- RENDER PERMISSION SCREEN ---
  if (practiceState === "permissionRequired") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Microphone Access Required</Text>
          <Text style={styles.errorSubtitle}>
            Daily speaking practice requires microphone permission to record and analyze your interview answers.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant Microphone Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- RENDER LOADING SCREEN ---
  if (practiceState === "loading") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Setting up your daily interview practice...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- RENDER FEEDBACK PENDING ERROR SCREEN ---
  if (practiceState === "feedbackPendingError") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.replace("/")} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.turnBadge}>
              <Text style={styles.turnBadgeText}>Turn {currentSequence} of 3</Text>
            </View>
          </View>

          {scenario && (
            <View style={styles.scenarioCard}>
              <Text style={styles.scenarioCategory}>{scenario.category} INTERVIEW</Text>
              <Text style={styles.scenarioTitle}>{scenario.title}</Text>
            </View>
          )}

          <View style={styles.questionCard}>
            <Text style={styles.questionLabel}>Interviewer Question:</Text>
            <Text style={styles.questionText}>{currentQuestion}</Text>
          </View>

          <View style={styles.pendingCard}>
            <Text style={styles.pendingBadge}>✓ ANSWER SAVED</Text>
            <Text style={styles.pendingTitle}>Feedback Generation Incomplete</Text>
            <Text style={styles.pendingBody}>
              Your spoken answer was saved, but generating your coaching feedback was interrupted. Tap below to finish your feedback.
            </Text>
          </View>

          {errorMessage && (
            <View style={styles.errorAlert}>
              <Text style={styles.errorAlertText}>{errorMessage}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              if (!sessionId) return;
              retryPendingFeedback(
                sessionId,
                currentSequence,
                pendingDurationMs
              );
            }}
          >
            <Text style={styles.primaryButtonText}>Retry Feedback</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.secondaryButtonText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- RENDER COMPLETED SUMMARY SCREEN ---
  if (practiceState === "completed") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.summaryBadge}>
            <Text style={styles.summaryBadgeText}>SESSION COMPLETE</Text>
          </View>

          <Text style={styles.completedHeading}>Daily Practice Finished</Text>
          <Text style={styles.completedSubheading}>
            You completed 3 interview speaking turns today.
          </Text>

          {sessionSummary && (
            <View style={styles.summaryCard}>
              <Text style={styles.cardHeader}>{"Today's Speaking Stats"}</Text>
              <View style={styles.metricsRow}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>{sessionSummary.speakingSeconds}s</Text>
                  <Text style={styles.metricLabel}>Speaking Time</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>{sessionSummary.averageWpm}</Text>
                  <Text style={styles.metricLabel}>Avg WPM</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>{sessionSummary.fillerCount}</Text>
                  <Text style={styles.metricLabel}>Filler Words</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.feedbackSectionTitle}>Standout Strength</Text>
              <Text style={styles.summaryBodyText}>{sessionSummary.strength}</Text>

              <Text style={styles.feedbackSectionTitle}>Next Practice Focus</Text>
              <Text style={styles.summaryBodyText}>{sessionSummary.nextPracticeSuggestion}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.primaryButtonText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- RENDER FEEDBACK SCREEN ---
  if (practiceState === "feedback" && turnFeedback) {
    const isFinalTurn = currentSequence === 3;

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.turnHeaderRow}>
            <View style={styles.turnPill}>
              <Text style={styles.turnPillText}>Turn {currentSequence} of 3 Feedback</Text>
            </View>
            <View style={styles.focusPill}>
              <Text style={styles.focusPillText}>{turnFeedback.focusArea}</Text>
            </View>
          </View>

          {/* Quick Metrics */}
          {lastMetrics && (
            <View style={styles.miniMetricsRow}>
              <Text style={styles.miniMetricText}>{lastMetrics.wordsPerMinute} WPM</Text>
              <Text style={styles.miniMetricText}>•</Text>
              <Text style={styles.miniMetricText}>
                {lastMetrics.fillerCount === 0 ? "0 Fillers" : `${lastMetrics.fillerCount} Fillers`}
              </Text>
              <Text style={styles.miniMetricText}>•</Text>
              <Text style={styles.miniMetricText}>{lastMetrics.wordCount} words</Text>
            </View>
          )}

          {/* Summary & Encouragement */}
          <View style={styles.feedbackCard}>
            <Text style={styles.cardHeader}>Coach Observation</Text>
            <Text style={styles.summaryText}>{turnFeedback.summary}</Text>
            <Text style={styles.encouragementText}>{turnFeedback.encouragement}</Text>
          </View>

          {/* Grammar Corrections */}
          {turnFeedback.grammarIssues.length > 0 && (
            <View style={styles.feedbackCard}>
              <Text style={styles.cardHeader}>Grammar & Phrasing Tips</Text>
              {turnFeedback.grammarIssues.map((issue, idx) => (
                <View key={idx} style={styles.grammarItem}>
                  <Text style={styles.grammarOriginal}>{`Original: "${issue.original}"`}</Text>
                  <Text style={styles.grammarCorrection}>{`Suggested: "${issue.correction}"`}</Text>
                  <Text style={styles.grammarExplanation}>{issue.explanation}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Better Version */}
          <View style={[styles.feedbackCard, styles.betterVersionCard]}>
            <Text style={styles.betterVersionTag}>MODEL ANSWER SUGGESTION</Text>
            <Text style={styles.betterVersionTitle}>Better Version</Text>
            <Text style={styles.betterVersionText}>{turnFeedback.betterVersion}</Text>
          </View>

          {/* Advance CTA */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAdvanceToNextTurn}
          >
            <Text style={styles.primaryButtonText}>
              {isFinalTurn ? "View Practice Summary" : "Answer Follow-up Question →"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- RENDER QUESTION & RECORDING SCREEN ---
  const durationSec = Math.round(recorderState.durationMillis / 1000);
  const isRecording = practiceState === "recording";
  const isRecorded = practiceState === "recorded";
  const isProcessing = practiceState === "processing";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.replace("/")} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.turnBadge}>
            <Text style={styles.turnBadgeText}>Turn {currentSequence} of 3</Text>
          </View>
        </View>

        {/* Scenario Info */}
        {scenario && (
          <View style={styles.scenarioCard}>
            <Text style={styles.scenarioCategory}>{scenario.category} INTERVIEW</Text>
            <Text style={styles.scenarioTitle}>{scenario.title}</Text>
          </View>
        )}

        {/* Question Card */}
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>Interviewer Question:</Text>
          <Text style={styles.questionText}>{currentQuestion}</Text>

          <TouchableOpacity
            style={[styles.ttsButton, isSpeakingTTS && styles.ttsButtonActive]}
            onPress={handlePlayTTS}
            accessibilityRole="button"
            accessibilityLabel={isSpeakingTTS ? "Stop reading question" : "Listen to question"}
          >
            <Ionicons
              name={isSpeakingTTS ? "stop-circle-outline" : "volume-high-outline"}
              size={16}
              color={isSpeakingTTS ? "#DC2626" : "#4F46E5"}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.ttsButtonText}>
              {isSpeakingTTS ? "Stop" : "Listen"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Error Alert */}
        {errorMessage && (
          <View style={styles.errorAlert}>
            <Text style={styles.errorAlertText}>{errorMessage}</Text>
          </View>
        )}

        {/* Processing State */}
        {isProcessing && (
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.processingTitle}>Analyzing Your Answer...</Text>
            <Text style={styles.processingSubtitle}>
              Generating targeted coaching feedback and dynamic follow-up.
            </Text>
          </View>
        )}

        {/* Recording Controls */}
        {!isProcessing && (
          <View style={styles.recordingSection}>
            {isRecording ? (
              <View style={styles.recordingActiveContainer}>
                <View style={styles.pulseIndicator} />
                <Text style={styles.recordingTimer}>{durationSec}s / 30s</Text>
                <Text style={styles.recordingHint}>Speak your answer clearly...</Text>
                <TouchableOpacity
                  style={styles.stopButton}
                  onPress={handleStopRecordingManually}
                  accessibilityRole="button"
                  accessibilityLabel="Finish speaking"
                >
                  <Text style={styles.stopButtonText}>Done Speaking</Text>
                </TouchableOpacity>
              </View>
            ) : isRecorded ? (
              <View style={styles.recordedContainer}>
                <Text style={styles.recordedSuccessText}>
                  ✓ Answer Recorded ({Math.round(recordedDurationMs / 1000)}s)
                </Text>
                <View style={styles.recordedActionsRow}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleRecordAgain}
                  >
                    <Text style={styles.secondaryButtonText}>Record Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.submitButton}
                    onPress={handleSubmitTurn}
                  >
                    <Text style={styles.submitButtonText}>Submit Answer →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.readyContainer}>
                <TouchableOpacity
                  style={styles.recordButton}
                  onPress={handleStartRecording}
                >
                  <View style={styles.recordButtonInner} />
                </TouchableOpacity>
                <Text style={styles.readyHint}>Tap to record your 20–30 second answer</Text>
              </View>
            )}
          </View>
        )}
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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#4B5563",
    fontWeight: "500",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: "#6B7280",
    fontWeight: "600",
  },
  turnBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  turnBadgeText: {
    color: "#4F46E5",
    fontWeight: "700",
    fontSize: 13,
  },
  scenarioCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  scenarioCategory: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6366F1",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scenarioTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  questionCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0E7FF",
    marginBottom: 20,
  },
  questionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  questionText: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 16,
  },
  pendingCard: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
  },
  pendingBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2563EB",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pendingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E40AF",
    marginBottom: 6,
  },
  pendingBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#1E3A8A",
  },
  ttsButton: {
    alignSelf: "flex-start",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  ttsButtonActive: {
    backgroundColor: "#E0E7FF",
  },
  ttsButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4F46E5",
  },
  errorAlert: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorAlertText: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "500",
  },
  recordingSection: {
    marginTop: 10,
    alignItems: "center",
  },
  readyContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#DC2626",
  },
  readyHint: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  recordingActiveContainer: {
    alignItems: "center",
    paddingVertical: 16,
    width: "100%",
  },
  pulseIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    marginBottom: 10,
  },
  recordingTimer: {
    fontSize: 28,
    fontWeight: "800",
    color: "#DC2626",
    marginBottom: 6,
  },
  recordingHint: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20,
  },
  stopButton: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: "80%",
    alignItems: "center",
  },
  stopButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  recordedContainer: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 10,
  },
  recordedSuccessText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#059669",
    marginBottom: 16,
  },
  recordedActionsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  secondaryButton: {
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "600",
  },
  submitButton: {
    flex: 1,
    backgroundColor: "#4F46E5",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  processingCard: {
    backgroundColor: "#FFFFFF",
    padding: 30,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  processingTitle: {
    marginTop: 16,
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  processingSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },
  turnHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  turnPill: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  turnPillText: {
    color: "#4F46E5",
    fontWeight: "700",
    fontSize: 13,
  },
  focusPill: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  focusPillText: {
    color: "#B45309",
    fontWeight: "700",
    fontSize: 12,
  },
  miniMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  miniMetricText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
  },
  feedbackCard: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 14,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#1F2937",
    marginBottom: 8,
  },
  encouragementText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#059669",
  },
  grammarItem: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  grammarOriginal: {
    fontSize: 14,
    color: "#DC2626",
    fontWeight: "500",
    marginBottom: 2,
  },
  grammarCorrection: {
    fontSize: 14,
    color: "#059669",
    fontWeight: "600",
    marginBottom: 4,
  },
  grammarExplanation: {
    fontSize: 12,
    color: "#6B7280",
  },
  betterVersionCard: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  betterVersionTag: {
    fontSize: 10,
    fontWeight: "800",
    color: "#16A34A",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  betterVersionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#15803D",
    marginBottom: 6,
  },
  betterVersionText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#166534",
    fontStyle: "italic",
  },
  primaryButton: {
    backgroundColor: "#4F46E5",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  summaryBadge: {
    alignSelf: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  summaryBadgeText: {
    color: "#059669",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  completedHeading: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 6,
  },
  completedSubheading: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 12,
  },
  metricBox: {
    alignItems: "center",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  metricLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  feedbackSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4B5563",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryBodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#1F2937",
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  errorSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
});
