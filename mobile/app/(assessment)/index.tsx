import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  AppState,
  ScrollView,
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
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { auth } from "../../lib/firebase";
import {
  startAssessment,
  uploadAssessmentResponse,
  completeAssessment,
  AssessmentReport,
} from "../../lib/api";

interface PromptItem {
  id: number;
  text: string;
  targetDuration: string;
}

const ASSESSMENT_PROMPTS: PromptItem[] = [
  {
    id: 1,
    text: "Tell me about yourself.",
    targetDuration: "20–30 seconds",
  },
  {
    id: 2,
    text: "Tell me about a project or something you recently worked on.",
    targetDuration: "20–30 seconds",
  },
  {
    id: 3,
    text: "Imagine you missed a deadline. Explain the situation to your manager.",
    targetDuration: "20–30 seconds",
  },
];

type RecordingState =
  | "permissionRequired"
  | "ready"
  | "recording"
  | "recorded"
  | "uploading"
  | "completing"
  | "locked"
  | "error";

interface RecordingTake {
  uri: string;
  durationMs: number;
}

export default function AssessmentScreen() {
  const router = useRouter();
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [currentPromptIndex, setCurrentPromptIndex] = useState<number>(0);
  const [answeredSequences, setAnsweredSequences] = useState<number[]>([]);
  const [recordings, setRecordings] = useState<Record<number, RecordingTake>>({});
  const [transcripts, setTranscripts] = useState<Record<number, string>>({});
  const [recordingState, setRecordingState] = useState<RecordingState>("ready");
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [canAskPermissionAgain, setCanAskPermissionAgain] = useState<boolean>(true);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState<boolean>(false);
  const [report, setReport] = useState<AssessmentReport | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const wasRecordingRef = useRef<boolean>(false);
  const isFinalizingRef = useRef<boolean>(false);

  // Initialize session, check audio permissions, and resolve resume state
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        setIsInitializing(true);
        setErrorMessage(null);

        // Configure audio mode for recording without background audio
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        // Check microphone permission
        const permission = await AudioModule.getRecordingPermissionsAsync();
        if (isMounted) {
          setPermissionGranted(permission.granted);
          setCanAskPermissionAgain(permission.canAskAgain);
          if (!permission.granted) {
            setRecordingState("permissionRequired");
          }
        }

        // Initialize / retrieve assessment session on backend
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Authentication required. Please sign in again.");
        }

        const idToken = await currentUser.getIdToken();
        const startData = await startAssessment(idToken);

        if (isMounted) {
          setAssessmentId(startData.assessment.id);
          setAnsweredSequences(startData.answeredSequences);

          // Resume at the first unanswered prompt
          const answeredSet = new Set(startData.answeredSequences);
          let firstUnansweredIndex = 0;
          while (
            firstUnansweredIndex < ASSESSMENT_PROMPTS.length &&
            answeredSet.has(firstUnansweredIndex + 1)
          ) {
            firstUnansweredIndex++;
          }

          if (startData.assessment.status === "ANALYZING") {
            setRecordingState("completing");
            try {
              const completedReport = await completeAssessment(
                idToken,
                startData.assessment.id
              );
              setReport(completedReport);
              setRecordingState("ready");
            } catch (evalErr: unknown) {
              const msg =
                evalErr instanceof Error
                  ? evalErr.message
                  : "Assessment evaluation in progress. Please retry in a few moments.";
              setErrorMessage(msg);
              setRecordingState("ready");
            }
          } else if (firstUnansweredIndex >= ASSESSMENT_PROMPTS.length) {
            // All 3 answered -> complete assessment and load report
            setRecordingState("completing");
            try {
              const completedReport = await completeAssessment(
                idToken,
                startData.assessment.id
              );
              setReport(completedReport);
            } catch (evalErr: unknown) {
              const msg =
                evalErr instanceof Error
                  ? evalErr.message
                  : "Failed to load baseline report.";
              setErrorMessage(msg);
            } finally {
              setRecordingState("ready");
            }
          } else {
            setCurrentPromptIndex(firstUnansweredIndex);
            setRecordingState(
              answeredSet.has(firstUnansweredIndex + 1) ? "locked" : "ready"
            );
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Failed to initialize assessment.";
          setErrorMessage(msg);
          setRecordingState("error");
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
      Speech.stop();
    };
  }, []);

  // Finalize stopped recording (Separated from manual stop to prevent double-stop races)
  const finalizeStoppedRecording = useCallback((overrideDurationMs?: number) => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;

    try {
      const durationMs = overrideDurationMs ?? recorderState.durationMillis ?? 0;

      // Minimum duration rule: reject recordings under 1 second
      if (durationMs < 1000) {
        setErrorMessage("Speak for a little longer.");
        setRecordingState("ready");
        return;
      }

      const uri = recorder.uri;
      if (!uri || uri.trim() === "") {
        setErrorMessage("Recording artifact was missing. Please record again.");
        setRecordingState("ready");
        return;
      }

      setRecordings((prev) => ({
        ...prev,
        [currentPromptIndex]: { uri, durationMs },
      }));

      setRecordingState("recorded");
      setErrorMessage(null);
    } finally {
      isFinalizingRef.current = false;
    }
  }, [recorder.uri, recorderState.durationMillis, currentPromptIndex]);

  // Handle manual stop button press
  const stopRecordingManually = useCallback(async () => {
    try {
      const currentDuration = recorderState.durationMillis || 0;
      await recorder.stop();
      finalizeStoppedRecording(currentDuration);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to stop recording.";
      setErrorMessage(msg);
      setRecordingState("error");
    }
  }, [recorder, recorderState.durationMillis, finalizeStoppedRecording]);

  // Handle app backgrounding lifecycle
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState === "background" && recorder.isRecording) {
        try {
          await recorder.stop();
        } catch {
          // Ignore stop error
        }
        setRecordingState("ready");
        setErrorMessage("Recording was interrupted when app went to background. Please record again.");
      }
    });

    return () => subscription.remove();
  }, [recorder]);

  // Handle native 30s auto-stop transition (Call finalize ONLY, never recorder.stop() again!)
  useEffect(() => {
    if (wasRecordingRef.current && !recorderState.isRecording && recordingState === "recording") {
      finalizeStoppedRecording(30000);
    }
    wasRecordingRef.current = recorderState.isRecording;
  }, [recorderState.isRecording, recordingState, finalizeStoppedRecording]);

  const requestPermission = async () => {
    try {
      const result = await AudioModule.requestRecordingPermissionsAsync();
      setPermissionGranted(result.granted);
      setCanAskPermissionAgain(result.canAskAgain);

      if (result.granted) {
        setRecordingState(recordings[currentPromptIndex] ? "recorded" : "ready");
        setErrorMessage(null);
      } else {
        setRecordingState("permissionRequired");
      }
      return result.granted;
    } catch {
      setErrorMessage("Failed to request microphone permission.");
      return false;
    }
  };

  const handleListenTTS = async () => {
    try {
      if (isSpeakingTTS) {
        await Speech.stop();
        setIsSpeakingTTS(false);
        return;
      }

      setIsSpeakingTTS(true);
      const text = ASSESSMENT_PROMPTS[currentPromptIndex]?.text || "";
      Speech.speak(text, {
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

      // Stop any ongoing TTS before recording starts
      await Speech.stop();
      setIsSpeakingTTS(false);

      let isGranted = permissionGranted;
      if (!isGranted) {
        isGranted = await requestPermission();
        if (!isGranted) return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 30 });
      setRecordingState("recording");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start recording.";
      setErrorMessage(msg);
      setRecordingState("error");
    }
  };

  const handleRecordAgain = () => {
    setRecordingState("ready");
    setErrorMessage(null);
  };

  // Upload recorded answer, delete zero-retention local cache file, and lock answer
  const handleUploadAndAdvance = async () => {
    const currentTake = recordings[currentPromptIndex];
    if (!currentTake || !assessmentId) return;

    try {
      setRecordingState("uploading");
      setErrorMessage(null);
      await Speech.stop();
      setIsSpeakingTTS(false);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required. Please sign in again.");
      }

      const idToken = await currentUser.getIdToken();
      const sequence = currentPromptIndex + 1;

      const utterance = await uploadAssessmentResponse(
        idToken,
        assessmentId,
        sequence,
        currentTake.durationMs,
        currentTake.uri
      );

      // Phase 2B/2C Zero-Retention: Delete local audio file from device cache immediately
      try {
        const file = new File(currentTake.uri);
        if (file.exists) {
          file.delete();
        }
      } catch (cleanupErr) {
        if (__DEV__) {
          console.warn("[ZeroRetention] Failed to delete local audio cache file:", cleanupErr);
        }
      }

      // Clear take from pending recording state
      setRecordings((prev) => {
        const next = { ...prev };
        delete next[currentPromptIndex];
        return next;
      });

      if (utterance.transcript) {
        setTranscripts((prev) => ({
          ...prev,
          [currentPromptIndex]: utterance.transcript || "",
        }));
      }

      setAnsweredSequences((prev) => (prev.includes(sequence) ? prev : [...prev, sequence]));

      if (currentPromptIndex < ASSESSMENT_PROMPTS.length - 1) {
        const nextIndex = currentPromptIndex + 1;
        setCurrentPromptIndex(nextIndex);
        setRecordingState(
          answeredSequences.includes(nextIndex + 1) || sequence === nextIndex + 1
            ? "locked"
            : "ready"
        );
      } else {
        // Complete the assessment & fetch the full report
        setRecordingState("completing");
        try {
          const completedReport = await completeAssessment(idToken, assessmentId);
          setReport(completedReport);
          setRecordingState("ready");
        } catch (completeErr: unknown) {
          const msg =
            completeErr instanceof Error
              ? completeErr.message
              : "Evaluation is taking longer than expected. Tap View Baseline Report to load score.";
          setErrorMessage(msg);
          setRecordingState("locked");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload recording. Please retry.";
      setErrorMessage(msg);
      setRecordingState("recorded"); // Preserve take for retry
    }
  };

  const handlePreviousPrompt = () => {
    Speech.stop();
    setIsSpeakingTTS(false);

    if (currentPromptIndex > 0) {
      const prevIndex = currentPromptIndex - 1;
      setCurrentPromptIndex(prevIndex);
      const isPrevAnswered = answeredSequences.includes(prevIndex + 1);
      setRecordingState(isPrevAnswered ? "locked" : recordings[prevIndex] ? "recorded" : "ready");
      setErrorMessage(null);
    }
  };

  const handleNextPrompt = () => {
    Speech.stop();
    setIsSpeakingTTS(false);

    if (currentPromptIndex < ASSESSMENT_PROMPTS.length - 1) {
      const nextIndex = currentPromptIndex + 1;
      setCurrentPromptIndex(nextIndex);
      const isNextAnswered = answeredSequences.includes(nextIndex + 1);
      setRecordingState(isNextAnswered ? "locked" : recordings[nextIndex] ? "recorded" : "ready");
      setErrorMessage(null);
    }
  };

  const currentPrompt = ASSESSMENT_PROMPTS[currentPromptIndex];
  const currentRecording = recordings[currentPromptIndex];
  const isCurrentPromptAnswered = answeredSequences.includes(currentPromptIndex + 1);
  const elapsedSeconds = Math.min(
    30,
    Math.round((recorderState.durationMillis || 0) / 1000)
  );

  // Phase 2C Baseline Assessment Report View (Render report as soon as available)
  if (report) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.reportScroll} showsVerticalScrollIndicator={false}>
          {/* Header Badge */}
          <View style={styles.reportHeader}>
            <View style={styles.badge}>
              <AppText variant="caption" weight="medium" color="#047857">
                ✓ Speaking Check Complete
              </AppText>
            </View>
            <AppText variant="title" weight="semibold" style={styles.reportTitle}>
              Your Speaking Snapshot
            </AppText>
            <AppText variant="body" color="#6B7280">
              Evaluated across 3 speaking prompts for clarity, pacing, and structure.
            </AppText>
          </View>

          {/* Overall Score Card */}
          <View style={styles.overallScoreCard}>
            <AppText variant="caption" weight="semibold" color="#4B5563">
              OVERALL SPEAKING SCORE
            </AppText>
            <View style={styles.scoreRow}>
              <AppText variant="title" weight="semibold" color="#111827" style={styles.largeScore}>
                {report.overallScore}
              </AppText>
              <AppText variant="title" color="#9CA3AF" style={styles.scoreMax}>
                / 100
              </AppText>
            </View>
            <AppText variant="body" color="#374151" style={styles.scoreFeedback}>
              {report.feedback}
            </AppText>
          </View>

          {/* Sub-scores Breakdown Grid */}
          <View style={styles.subScoresContainer}>
            <AppText variant="body" weight="semibold" color="#111827" style={styles.sectionHeading}>
              Skill Dimension Breakdown
            </AppText>
            <View style={styles.grid}>
              <View style={styles.gridCard}>
                <AppText variant="caption" color="#6B7280">
                  Delivery / Fluency (25%)
                </AppText>
                <AppText variant="title" weight="semibold" color="#111827">
                  {report.subScores.delivery}/100
                </AppText>
              </View>
              <View style={styles.gridCard}>
                <AppText variant="caption" color="#6B7280">
                  Grammar (20%)
                </AppText>
                <AppText variant="title" weight="semibold" color="#111827">
                  {report.subScores.grammar}/100
                </AppText>
              </View>
              <View style={styles.gridCard}>
                <AppText variant="caption" color="#6B7280">
                  Structure (20%)
                </AppText>
                <AppText variant="title" weight="semibold" color="#111827">
                  {report.subScores.structure}/100
                </AppText>
              </View>
              <View style={styles.gridCard}>
                <AppText variant="caption" color="#6B7280">
                  Vocabulary (15%)
                </AppText>
                <AppText variant="title" weight="semibold" color="#111827">
                  {report.subScores.vocabulary}/100
                </AppText>
              </View>
              <View style={styles.gridCard}>
                <AppText variant="caption" color="#6B7280">
                  Communication (15%)
                </AppText>
                <AppText variant="title" weight="semibold" color="#111827">
                  {report.subScores.communication}/100
                </AppText>
              </View>
              <View style={styles.gridCard}>
                <AppText variant="caption" color="#6B7280">
                  Relevance (5%)
                </AppText>
                <AppText variant="title" weight="semibold" color="#111827">
                  {report.subScores.relevance}/100
                </AppText>
              </View>
            </View>
          </View>

          {/* Speech Metrics Banner */}
          <View style={styles.metricsBanner}>
            <View style={styles.metricItem}>
              <AppText variant="caption" color="#6B7280">
                Pacing
              </AppText>
              <AppText variant="body" weight="semibold" color="#111827">
                {report.metrics.averageWpm} WPM
              </AppText>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <AppText variant="caption" color="#6B7280">
                Filler Words
              </AppText>
              <AppText variant="body" weight="semibold" color="#111827">
                {report.metrics.totalFillerCount} ({report.metrics.aggregateFillerPercentage}%)
              </AppText>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <AppText variant="caption" color="#6B7280">
                Total Speaking
              </AppText>
              <AppText variant="body" weight="semibold" color="#111827">
                {report.metrics.totalSpeakingSeconds}s
              </AppText>
            </View>
          </View>

          {/* Strengths */}
          <View style={styles.insightsCard}>
            <AppText variant="body" weight="semibold" color="#047857" style={styles.insightTitle}>
              Key Strengths
            </AppText>
            {report.strengths.map((str: string, idx: number) => (
              <View key={idx} style={styles.bulletRow}>
                <AppText variant="body" color="#047857">
                  •
                </AppText>
                <AppText variant="caption" color="#374151" style={styles.bulletText}>
                  {str}
                </AppText>
              </View>
            ))}
          </View>

          {/* Actionable Weaknesses */}
          <View style={styles.insightsCard}>
            <AppText variant="body" weight="semibold" color="#B45309" style={styles.insightTitle}>
              Priority Improvement Areas
            </AppText>
            {report.weaknesses.map((weakness: string, idx: number) => (
              <View key={idx} style={styles.bulletRow}>
                <AppText variant="body" color="#B45309">
                  {idx + 1}.
                </AppText>
                <AppText variant="caption" color="#374151" style={styles.bulletText}>
                  {weakness}
                </AppText>
              </View>
            ))}
          </View>

          {/* Footer Action */}
          <View style={styles.reportFooter}>
            <Button
              title="Continue to Home"
              onPress={() => router.replace("/(tabs)" as any)}
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (isInitializing || recordingState === "completing") {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#111827" />
          <AppText variant="title" weight="semibold" style={styles.loadingHeading}>
            {recordingState === "completing"
              ? "Generating Speaking Snapshot..."
              : "Preparing speaking check..."}
          </AppText>
          <AppText variant="caption" color="#4B5563" style={styles.loadingText}>
            {recordingState === "completing"
              ? "Analyzing your clarity, pacing, and speaking structure..."
              : "Connecting and preparing audio session."}
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {/* Top Progress Bar & Back Navigation */}
        <View style={styles.topBar}>
          {currentPromptIndex > 0 && recordingState !== "recording" && recordingState !== "uploading" ? (
            <TouchableOpacity onPress={handlePreviousPrompt} style={styles.backButton}>
              <AppText variant="caption" weight="medium" color="#4B5563">
                ← Previous
              </AppText>
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholder} />
          )}

          <AppText variant="caption" weight="medium" color="#9CA3AF">
            Prompt {currentPromptIndex + 1} of {ASSESSMENT_PROMPTS.length}
          </AppText>

          {isCurrentPromptAnswered && currentPromptIndex < ASSESSMENT_PROMPTS.length - 1 ? (
            <TouchableOpacity onPress={handleNextPrompt} style={styles.forwardButton}>
              <AppText variant="caption" weight="medium" color="#4B5563">
                Next →
              </AppText>
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${((currentPromptIndex + 1) / ASSESSMENT_PROMPTS.length) * 100}%`,
              },
            ]}
          />
        </View>

        {/* Prompt Card */}
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.promptBox}>
            <View style={styles.promptHeader}>
              <AppText variant="caption" weight="medium" color="#6B7280">
                QUESTION {currentPromptIndex + 1}
              </AppText>
              <TouchableOpacity
                onPress={handleListenTTS}
                disabled={recordingState === "recording" || recordingState === "uploading"}
                style={styles.listenButton}
                accessibilityRole="button"
                accessibilityLabel={isSpeakingTTS ? "Stop prompt audio" : "Listen to prompt audio"}
              >
                <Ionicons
                  name={isSpeakingTTS ? "stop-circle-outline" : "volume-high-outline"}
                  size={16}
                  color="#111827"
                  style={{ marginRight: 4 }}
                />
                <AppText variant="caption" weight="medium" color="#111827">
                  {isSpeakingTTS ? "Stop" : "Listen"}
                </AppText>
              </TouchableOpacity>
            </View>

            <AppText variant="title" weight="semibold" style={styles.promptText}>
              {currentPrompt?.text}
            </AppText>

            <AppText variant="caption" color="#9CA3AF" style={styles.targetHint}>
              Target: {currentPrompt?.targetDuration} (Max: 30s)
            </AppText>
          </View>

          {/* Recording / Upload / Locked Status Area */}
          <View style={styles.recordingArea}>
            {recordingState === "permissionRequired" && (
              <View style={styles.permissionCard}>
                <AppText variant="body" color="#374151" style={styles.permissionText}>
                  Microphone access is required to complete the speaking assessment.
                </AppText>
                {canAskPermissionAgain ? (
                  <Button
                    title="Grant Permission"
                    onPress={requestPermission}
                    style={styles.permissionBtn}
                  />
                ) : (
                  <Button
                    title="Open Settings"
                    variant="outline"
                    onPress={() => Linking.openSettings()}
                    style={styles.permissionBtn}
                  />
                )}
              </View>
            )}

            {recordingState === "recording" && (
              <View style={styles.recordingActiveBox}>
                <View style={styles.pulsingDot} />
                <AppText variant="title" weight="semibold" color="#DC2626">
                  00:{elapsedSeconds < 10 ? `0${elapsedSeconds}` : elapsedSeconds}
                </AppText>
                <AppText variant="caption" color="#6B7280">
                  Recording... Auto-stops at 30s
                </AppText>
              </View>
            )}

            {recordingState === "recorded" && currentRecording && (
              <View style={styles.recordedBox}>
                <View style={styles.recordedBadge}>
                  <AppText variant="caption" weight="semibold" color="#047857">
                    ✓ Recorded ({Math.round(currentRecording.durationMs / 1000)}s)
                  </AppText>
                </View>
                <AppText variant="caption" color="#6B7280" style={styles.recordedHint}>
                  Ready to transcribe and proceed.
                </AppText>
              </View>
            )}

            {recordingState === "uploading" && (
              <View style={styles.recordingActiveBox}>
                <ActivityIndicator size="small" color="#111827" />
                <AppText variant="body" weight="medium" color="#111827">
                  Transcribing response...
                </AppText>
                <AppText variant="caption" color="#6B7280">
                  Processing audio with Sarvam Saaras STT
                </AppText>
              </View>
            )}

            {isCurrentPromptAnswered && (
              <View style={styles.lockedBox}>
                <View style={styles.lockedBadge}>
                  <AppText variant="caption" weight="semibold" color="#047857">
                    ✓ Response Submitted & Transcribed
                  </AppText>
                </View>
                <AppText variant="caption" color="#6B7280" style={styles.lockedHint}>
                  Answer is locked for baseline evaluation.
                </AppText>
                {transcripts[currentPromptIndex] && (
                  <AppText variant="caption" color="#374151" style={styles.transcriptLocked}>
                    &ldquo;{transcripts[currentPromptIndex]}&rdquo;
                  </AppText>
                )}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Footer Actions & Error Alerts */}
        <View style={styles.footer}>
          {errorMessage && (
            <View style={styles.errorBox}>
              <AppText variant="body" color="#B91C1C" style={styles.errorText}>
                {errorMessage}
              </AppText>
            </View>
          )}

          {!isCurrentPromptAnswered && (recordingState === "ready" || recordingState === "permissionRequired") && (
            <Button
              title="Start Recording"
              onPress={handleStartRecording}
            />
          )}

          {recordingState === "recording" && (
            <Button
              title="Stop Recording"
              variant="secondary"
              onPress={stopRecordingManually}
            />
          )}

          {recordingState === "recorded" && (
            <View style={styles.actionRow}>
              <Button
                title="Record again"
                variant="outline"
                onPress={handleRecordAgain}
                style={styles.halfButton}
              />
              <Button
                title={
                  errorMessage !== null
                    ? "Retry Upload"
                    : currentPromptIndex === ASSESSMENT_PROMPTS.length - 1
                    ? "Finish Assessment"
                    : "Next Question"
                }
                onPress={handleUploadAndAdvance}
                style={styles.halfButton}
              />
            </View>
          )}

          {recordingState === "uploading" && (
            <Button
              title="Transcribing..."
              disabled={true}
              loading={true}
            />
          )}

          {isCurrentPromptAnswered && currentPromptIndex < ASSESSMENT_PROMPTS.length - 1 && (
            <Button
              title="Continue to Next Question →"
              onPress={handleNextPrompt}
            />
          )}

          {isCurrentPromptAnswered && currentPromptIndex === ASSESSMENT_PROMPTS.length - 1 && !report && (
            <Button
              title="View Baseline Report"
              onPress={async () => {
                const currentUser = auth.currentUser;
                if (!currentUser || !assessmentId) return;
                setRecordingState("completing");
                const idToken = await currentUser.getIdToken();
                const completedReport = await completeAssessment(idToken, assessmentId);
                setReport(completedReport);
              }}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  loadingHeading: {
    textAlign: "center",
    marginTop: 12,
  },
  loadingText: {
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 40,
    marginBottom: 8,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  forwardButton: {
    paddingVertical: 8,
    paddingLeft: 16,
  },
  placeholder: {
    width: 60,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 2,
    marginBottom: 24,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#111827",
    borderRadius: 2,
  },
  contentContainer: {
    flexGrow: 1,
  },
  promptBox: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  promptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listenButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 6,
  },
  promptText: {
    lineHeight: 28,
  },
  targetHint: {
    marginTop: 4,
  },
  recordingArea: {
    marginTop: 32,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  permissionCard: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 12,
    width: "100%",
    alignItems: "center",
  },
  permissionText: {
    textAlign: "center",
  },
  permissionBtn: {
    width: "100%",
  },
  recordingActiveBox: {
    alignItems: "center",
    gap: 8,
  },
  pulsingDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    marginBottom: 4,
  },
  recordedBox: {
    alignItems: "center",
    gap: 8,
  },
  recordedBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  recordedHint: {
    marginTop: 4,
  },
  lockedBox: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  lockedBadge: {
    backgroundColor: "#E0E7FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  lockedHint: {
    marginTop: 4,
  },
  transcriptLocked: {
    marginTop: 8,
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 20,
  },
  footer: {
    paddingTop: 16,
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  halfButton: {
    flex: 1,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    textAlign: "center",
    fontSize: 14,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reportScroll: {
    paddingVertical: 20,
    gap: 20,
  },
  reportHeader: {
    gap: 6,
  },
  reportTitle: {
    marginTop: 4,
  },
  overallScoreCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  largeScore: {
    fontSize: 56,
    lineHeight: 64,
  },
  scoreMax: {
    fontSize: 24,
  },
  scoreFeedback: {
    textAlign: "center",
    lineHeight: 22,
    marginTop: 8,
  },
  subScoresContainer: {
    gap: 12,
  },
  sectionHeading: {
    marginBottom: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  metricsBanner: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  metricItem: {
    alignItems: "center",
    gap: 4,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#D1D5DB",
  },
  insightsCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  insightTitle: {
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  bulletText: {
    flex: 1,
    lineHeight: 20,
  },
  reportFooter: {
    marginTop: 12,
    marginBottom: 32,
  },
});
