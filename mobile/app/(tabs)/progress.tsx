import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../hooks/useAuth";
import { colors, radius, spacing, shadows } from "../../theme";

export default function ProgressScreen() {
  const router = useRouter();
  const { isAnonymous, signInWithGoogle, isLoading, speakingCheckCompleted } = useAuth();
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const handleSpeakingCheckPress = () => {
    if (isAnonymous) {
      setShowGoogleModal(true);
      return;
    }

    if (speakingCheckCompleted) {
      router.push("/speaking-snapshot" as any);
    } else {
      router.push("/speaking-check" as any);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <AppText variant="display" color={colors.textPrimary}>
            Progress
          </AppText>
          <AppText variant="subtitle" color={colors.textSecondary} style={styles.tagline}>
            Your speaking practice and session history.
          </AppText>
        </View>

        {/* Today's Activity Card */}
        <View style={styles.card}>
          <AppText variant="micro" color={colors.textSecondary} style={styles.cardLabel}>
            TODAY'S PRACTICE
          </AppText>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <AppText variant="titleLarge" color={colors.textPrimary}>
                0 min
              </AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                Spoken Time
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AppText variant="titleLarge" color={colors.textPrimary}>
                0
              </AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                Conversations
              </AppText>
            </View>
          </View>
        </View>

        {/* Speaking Check Card */}
        <View style={[styles.card, styles.speakingCheckCard]}>
          <View style={styles.badgeContainer}>
            <StatusBadge
              label={speakingCheckCompleted ? "SNAPSHOT SAVED" : "SPEAKING BASELINE"}
              variant={speakingCheckCompleted ? "success" : "accent"}
            />
          </View>
          <AppText variant="title" color={colors.textPrimary} style={styles.checkTitle}>
            Speaking Check
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.checkDescription}>
            {speakingCheckCompleted
              ? "Your speaking baseline snapshot is saved. You can review your report or retake the check anytime."
              : "Take a quick 3-minute speaking check to understand your pace, clarity, and structural confidence."}
          </AppText>

          <Button
            title={speakingCheckCompleted ? "View Snapshot" : "Start Speaking Check"}
            variant={speakingCheckCompleted ? "outline" : "primary"}
            icon={<Ionicons name="stats-chart-outline" size={18} color={speakingCheckCompleted ? colors.textPrimary : colors.textInverse} />}
            onPress={handleSpeakingCheckPress}
            style={styles.checkButton}
          />
        </View>

        {/* Guest Progress Sync Banner */}
        {isAnonymous && (
          <View style={styles.guestSyncCard}>
            <View style={styles.guestSyncIconCircle}>
              <Ionicons name="cloud-upload-outline" size={24} color={colors.accent} />
            </View>
            <AppText variant="title" color={colors.textPrimary}>
              Save Your Practice
            </AppText>
            <AppText variant="caption" align="center" color={colors.textSecondary} style={styles.guestSyncText}>
              Sign in with Google to preserve your speaking progress, personal insights, and unlock 1-on-1 peer sessions.
            </AppText>
            <Button
              title="Continue with Google"
              loading={isLoading}
              onPress={signInWithGoogle}
              style={styles.syncButton}
            />
          </View>
        )}
      </ScrollView>

      {/* Google CTA Modal for Guests tapping Speaking Check */}
      <Modal visible={showGoogleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="stats-chart" size={32} color={colors.accent} />
            </View>
            <AppText variant="title" align="center" color={colors.textPrimary}>
              Save Baseline Snapshot
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary} style={styles.modalBody}>
              Sign in with Google to complete your speaking check and save your baseline progress report.
            </AppText>

            <Button
              title="Continue with Google"
              loading={isLoading}
              onPress={async () => {
                setShowGoogleModal(false);
                await signInWithGoogle();
              }}
              style={styles.modalButton}
            />

            <Button
              title="Not now"
              variant="ghost"
              onPress={() => setShowGoogleModal(false)}
              style={styles.modalCancelButton}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  tagline: {
    marginTop: spacing.xxs,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.subtle,
  },
  cardLabel: {
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  speakingCheckCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  badgeContainer: {
    marginBottom: spacing.xs,
  },
  checkTitle: {
    marginBottom: 4,
  },
  checkDescription: {
    lineHeight: 22,
  },
  checkButton: {
    marginTop: spacing.lg,
  },
  guestSyncCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.subtle,
  },
  guestSyncIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  guestSyncText: {
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  syncButton: {
    width: "100%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: spacing.md,
    ...shadows.medium,
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  modalBody: {
    marginBottom: spacing.xs,
  },
  modalButton: {
    width: "100%",
  },
  modalCancelButton: {
    width: "100%",
  },
});


