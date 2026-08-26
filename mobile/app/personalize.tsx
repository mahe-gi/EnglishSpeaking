import React, { useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../components/Screen";
import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import { submitOnboarding } from "../lib/api";

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
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <AppText variant="body" weight="medium" color="#4B5563">
            ✕ Close
          </AppText>
        </TouchableOpacity>
        <AppText variant="subtitle" weight="semibold">
          Personalize Practice
        </AppText>
        <View style={styles.placeholderRight} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.errorCard}>
            <AppText variant="body" color="#B91C1C">
              {error}
            </AppText>
          </View>
        )}

        {/* Section 1: Career Status */}
        <View style={styles.section}>
          <AppText variant="body" weight="semibold" style={styles.sectionTitle}>
            Current Stage
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
              >
                <AppText
                  variant="body"
                  weight={careerStatus === opt.value ? "semibold" : "regular"}
                  color={careerStatus === opt.value ? "#111827" : "#4B5563"}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 2: Speaking Goal */}
        <View style={styles.section}>
          <AppText variant="body" weight="semibold" style={styles.sectionTitle}>
            Primary Speaking Goal
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
              >
                <AppText
                  variant="body"
                  weight={goal === opt.value ? "semibold" : "regular"}
                  color={goal === opt.value ? "#111827" : "#4B5563"}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 3: Native Language */}
        <View style={styles.section}>
          <AppText variant="body" weight="semibold" style={styles.sectionTitle}>
            Native Language
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
              >
                <AppText
                  variant="caption"
                  weight={nativeLanguage === opt.value ? "semibold" : "regular"}
                  color={nativeLanguage === opt.value ? "#111827" : "#4B5563"}
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
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  placeholderRight: {
    width: 48,
  },
  container: {
    paddingVertical: 16,
    gap: 20,
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
  },
  optionList: {
    gap: 8,
  },
  optionButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
  },
  optionSelected: {
    borderColor: "#111827",
    backgroundColor: "#F9FAFB",
  },
  languageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  languageChip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  languageChipSelected: {
    borderColor: "#111827",
    backgroundColor: "#F9FAFB",
  },
  saveButton: {
    marginTop: 12,
    marginBottom: 32,
  },
});
