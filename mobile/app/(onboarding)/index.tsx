import React, { useState, useCallback } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { auth } from "../../lib/firebase";
import { submitOnboarding, OnboardingInput } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

type CareerStatus = OnboardingInput["careerStatus"];
type Goal = OnboardingInput["goal"];
type NativeLanguage = OnboardingInput["nativeLanguage"];

interface Option<T> {
  value: T;
  label: string;
}

const CAREER_OPTIONS: Option<CareerStatus>[] = [
  { value: "COLLEGE_STUDENT", label: "College student" },
  { value: "JOB_SEEKER", label: "Job seeker" },
  { value: "WORKING_PROFESSIONAL", label: "Working professional" },
];

const GOAL_OPTIONS: Option<Goal>[] = [
  { value: "JOB_INTERVIEWS", label: "Job interviews" },
  { value: "WORKPLACE_CONVERSATIONS", label: "Workplace conversations" },
  { value: "SPEAKING_CONFIDENCE", label: "Speaking confidence" },
];

const LANGUAGE_OPTIONS: Option<NativeLanguage>[] = [
  { value: "HINDI", label: "Hindi" },
  { value: "TELUGU", label: "Telugu" },
  { value: "TAMIL", label: "Tamil" },
  { value: "KANNADA", label: "Kannada" },
  { value: "MALAYALAM", label: "Malayalam" },
  { value: "MARATHI", label: "Marathi" },
  { value: "BENGALI", label: "Bengali" },
  { value: "OTHER", label: "Other" },
];

const CONFIDENCE_LEVELS = [1, 2, 3, 4, 5];

export default function OnboardingScreen() {
  const router = useRouter();
  const { refreshBootstrap } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [careerStatus, setCareerStatus] = useState<CareerStatus | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [nativeLanguage, setNativeLanguage] = useState<NativeLanguage | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isStepValid = useCallback(() => {
    switch (step) {
      case 1:
        return careerStatus !== null;
      case 2:
        return goal !== null;
      case 3:
        return nativeLanguage !== null;
      case 4:
        return confidence !== null;
      default:
        return false;
    }
  }, [step, careerStatus, goal, nativeLanguage, confidence]);

  const handleNext = () => {
    if (!isStepValid() || isSubmitting) return;

    if (step < 4) {
      setStep((prev) => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1 && !isSubmitting) {
      setStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!careerStatus || !goal || !nativeLanguage || !confidence) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Session expired. Please sign in again.");
      }

      const idToken = await currentUser.getIdToken();

      await submitOnboarding(idToken, {
        careerStatus,
        goal,
        nativeLanguage,
        confidence,
      });

      await refreshBootstrap();

      // Return to main tabs
      router.replace("/(tabs)" as any);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save profile. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        {/* Top Navigation & Progress */}
        <View style={styles.topBar}>
          {step > 1 ? (
            <TouchableOpacity
              onPress={handleBack}
              disabled={isSubmitting}
              style={styles.backButton}
            >
              <AppText variant="caption" weight="medium" color="#4B5563">
                ← Back
              </AppText>
            </TouchableOpacity>
          ) : (
            <View style={styles.backPlaceholder} />
          )}

          <AppText variant="caption" weight="medium" color="#9CA3AF">
            {step} / 4
          </AppText>
        </View>

        {/* Progress Bar Indicator */}
        <View style={styles.progressBarBackground}>
          <View
            style={[styles.progressBarFill, { width: `${(step / 4) * 100}%` }]}
          />
        </View>

        {/* Main Step Content */}
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <View style={styles.stepBox}>
              <AppText variant="title" weight="semibold" style={styles.question}>
                What describes you?
              </AppText>
              <View style={styles.optionsList}>
                {CAREER_OPTIONS.map((item) => {
                  const isSelected = careerStatus === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      activeOpacity={0.8}
                      onPress={() => setCareerStatus(item.value)}
                      style={[
                        styles.optionCard,
                        isSelected && styles.optionCardSelected,
                      ]}
                    >
                      <AppText
                        variant="body"
                        weight={isSelected ? "semibold" : "regular"}
                        color={isSelected ? "#111827" : "#374151"}
                      >
                        {item.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepBox}>
              <AppText variant="title" weight="semibold" style={styles.question}>
                What do you want to improve?
              </AppText>
              <View style={styles.optionsList}>
                {GOAL_OPTIONS.map((item) => {
                  const isSelected = goal === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      activeOpacity={0.8}
                      onPress={() => setGoal(item.value)}
                      style={[
                        styles.optionCard,
                        isSelected && styles.optionCardSelected,
                      ]}
                    >
                      <AppText
                        variant="body"
                        weight={isSelected ? "semibold" : "regular"}
                        color={isSelected ? "#111827" : "#374151"}
                      >
                        {item.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepBox}>
              <AppText variant="title" weight="semibold" style={styles.question}>
                What&apos;s your native language?
              </AppText>
              <View style={styles.optionsList}>
                {LANGUAGE_OPTIONS.map((item) => {
                  const isSelected = nativeLanguage === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      activeOpacity={0.8}
                      onPress={() => setNativeLanguage(item.value)}
                      style={[
                        styles.optionCard,
                        isSelected && styles.optionCardSelected,
                      ]}
                    >
                      <AppText
                        variant="body"
                        weight={isSelected ? "semibold" : "regular"}
                        color={isSelected ? "#111827" : "#374151"}
                      >
                        {item.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {step === 4 && (
            <View style={styles.stepBox}>
              <AppText variant="title" weight="semibold" style={styles.question}>
                How confident are you speaking English?
              </AppText>
              <View style={styles.confidenceRow}>
                {CONFIDENCE_LEVELS.map((level) => {
                  const isSelected = confidence === level;
                  return (
                    <TouchableOpacity
                      key={level}
                      activeOpacity={0.8}
                      onPress={() => setConfidence(level)}
                      style={[
                        styles.confidenceCircle,
                        isSelected && styles.confidenceCircleSelected,
                      ]}
                    >
                      <AppText
                        variant="body"
                        weight={isSelected ? "semibold" : "medium"}
                        color={isSelected ? "#FFFFFF" : "#374151"}
                      >
                        {level}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.confidenceLabels}>
                <AppText variant="caption" color="#9CA3AF">
                  Low
                </AppText>
                <AppText variant="caption" color="#9CA3AF">
                  High
                </AppText>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer CTA & Error Box */}
        <View style={styles.footer}>
          {error && (
            <View style={styles.errorBox}>
              <AppText variant="body" color="#B91C1C" style={styles.errorText}>
                {error}
              </AppText>
            </View>
          )}

          <Button
            title={error !== null ? "Retry" : "Continue"}
            disabled={!isStepValid() || isSubmitting}
            loading={isSubmitting}
            onPress={handleNext}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 20,
    justifyContent: "space-between",
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
  backPlaceholder: {
    width: 40,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 2,
    marginBottom: 32,
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
  stepBox: {
    flex: 1,
  },
  question: {
    marginBottom: 24,
  },
  optionsList: {
    gap: 12,
  },
  optionCard: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  optionCardSelected: {
    borderColor: "#111827",
    backgroundColor: "#F9FAFB",
  },
  confidenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  confidenceCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  confidenceCircleSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  confidenceLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 8,
  },
  footer: {
    paddingTop: 16,
    gap: 12,
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
});
