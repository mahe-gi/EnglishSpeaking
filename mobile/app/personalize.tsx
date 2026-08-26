import React, { useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { IconButton } from "../components/IconButton";
import { useAuth } from "../hooks/useAuth";
import { submitOnboarding } from "../lib/api";
import { colors, radius, spacing, shadows } from "../theme";

type CareerStatus = "COLLEGE_STUDENT" | "JOB_SEEKER" | "WORKING_PROFESSIONAL";
type Goal = "JOB_INTERVIEWS" | "WORKPLACE_CONVERSATIONS" | "SPEAKING_CONFIDENCE";
type NativeLanguage =
  | "HINDI"
  | "TELUGU"
  | "TAMIL"
  | "KANNADA"
  | "MALAYALAM"
  | "MARATHI"
  | "BENGALI"
  | "OTHER";

const CAREER_OPTIONS: { value: CareerStatus; label: string }[] = [
  { value: "COLLEGE_STUDENT", label: "College Student" },
  { value: "JOB_SEEKER", label: "Job Seeker" },
  { value: "WORKING_PROFESSIONAL", label: "Working Professional" },
];

const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: "JOB_INTERVIEWS", label: "Job Interviews" },
  { value: "WORKPLACE_CONVERSATIONS", label: "Workplace Conversations" },
  { value: "SPEAKING_CONFIDENCE", label: "General Speaking Confidence" },
];

const LANGUAGE_OPTIONS: { value: NativeLanguage; label: string }[] = [
  { value: "HINDI", label: "Hindi" },
  { value: "TELUGU", label: "Telugu" },
  { value: "TAMIL", label: "Tamil" },
  { value: "KANNADA", label: "Kannada" },
  { value: "MALAYALAM", label: "Malayalam" },
  { value: "MARATHI", label: "Marathi" },
  { value: "BENGALI", label: "Bengali" },
  { value: "OTHER", label: "Other" },
];

export default function PersonalizeScreen() {
  const router = useRouter();
  const { firebaseUser, profile, refreshBootstrap } = useAuth();

  const [careerStatus, setCareerStatus] = useState<CareerStatus>(
    (profile?.careerStatus as CareerStatus) || "JOB_SEEKER"
  );
  const [goal, setGoal] = useState<Goal>((profile?.goal as Goal) || "JOB_INTERVIEWS");
  const [nativeLanguage, setNativeLanguage] = useState<NativeLanguage>(
    (profile?.nativeLanguage as NativeLanguage) || "OTHER"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!firebaseUser) return;
    try {
      setIsSaving(true);
      setError(null);
      const token = await firebaseUser.getIdToken();
      await submitOnboarding(token, {
        careerStatus,
        goal,
        nativeLanguage,
        confidence: profile?.confidence || 3,
      });
      await refreshBootstrap();
      router.replace("/(tabs)" as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save personalization.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    router.replace("/(tabs)" as any);
  };

  return (
    <Screen>
      <View style={styles.topHeader}>
        <IconButton
          icon={<Ionicons name="close" size={22} color={colors.textPrimary} />}
          accessibilityLabel="Close personalization"
          onPress={handleClose}
          variant="surface"
          size={40}
        />
        <AppText variant="subtitle" color={colors.textPrimary}>
          Personalize Practice
        </AppText>
        <View style={styles.placeholderRight} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <AppText variant="caption" color={colors.danger} style={styles.errorText}>
              {error}
            </AppText>
          </View>
        )}

        {/* Section 1: Career Status */}
        <View style={styles.section}>
          <AppText variant="micro" color={colors.textSecondary} style={styles.sectionTitle}>
            CURRENT STAGE
          </AppText>
          <View style={styles.optionList}>
            {CAREER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionButton,
                  careerStatus === opt.value && styles.optionSelected,
                ]}
                onPress={() => setCareerStatus(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: careerStatus === opt.value }}
              >
                <Ionicons
                  name={careerStatus === opt.value ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={careerStatus === opt.value ? colors.accent : colors.textTertiary}
                  style={styles.radioIcon}
                />
                <AppText
                  variant="bodyMedium"
                  color={careerStatus === opt.value ? colors.textPrimary : colors.textSecondary}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 2: Speaking Goal */}
        <View style={styles.section}>
          <AppText variant="micro" color={colors.textSecondary} style={styles.sectionTitle}>
            PRIMARY SPEAKING GOAL
          </AppText>
          <View style={styles.optionList}>
            {GOAL_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionButton,
                  goal === opt.value && styles.optionSelected,
                ]}
                onPress={() => setGoal(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: goal === opt.value }}
              >
                <Ionicons
                  name={goal === opt.value ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={goal === opt.value ? colors.accent : colors.textTertiary}
                  style={styles.radioIcon}
                />
                <AppText
                  variant="bodyMedium"
                  color={goal === opt.value ? colors.textPrimary : colors.textSecondary}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 3: Native Language */}
        <View style={styles.section}>
          <AppText variant="micro" color={colors.textSecondary} style={styles.sectionTitle}>
            NATIVE LANGUAGE
          </AppText>
          <View style={styles.languageGrid}>
            {LANGUAGE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.languageChip,
                  nativeLanguage === opt.value && styles.languageChipSelected,
                ]}
                onPress={() => setNativeLanguage(opt.value)}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <AppText
                  variant="captionMedium"
                  color={nativeLanguage === opt.value ? colors.textPrimary : colors.textSecondary}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save Button */}
        <Button
          title="Save Changes"
          loading={isSaving}
          onPress={handleSave}
          style={styles.saveButton}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  placeholderRight: {
    width: 40,
  },
  container: {
    paddingVertical: spacing.lg,
    gap: spacing.xl,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerSubtle,
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    marginLeft: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xxs,
  },
  optionList: {
    gap: spacing.xs,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadows.subtle,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  radioIcon: {
    marginRight: spacing.sm,
  },
  languageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  languageChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    ...shadows.subtle,
  },
  languageChipSelected: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
});

