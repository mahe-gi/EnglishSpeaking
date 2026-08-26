import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";

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
          <AppText variant="title" weight="semibold">
            Progress
          </AppText>
          <AppText variant="caption" color="#6B7280" style={styles.tagline}>
            Your speaking practice and fluency overview
          </AppText>
        </View>

        {/* Today's Activity Card */}
        <View style={styles.card}>
          <AppText variant="caption" weight="semibold" color="#6B7280" style={styles.cardLabel}>
            TODAY
          </AppText>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <AppText variant="title" weight="semibold" color="#111827">
                0 min
              </AppText>
              <AppText variant="caption" color="#6B7280">
                speaking
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AppText variant="title" weight="semibold" color="#111827">
                0
              </AppText>
              <AppText variant="caption" color="#6B7280">
                conversations
              </AppText>
            </View>
          </View>
        </View>

        {/* Speaking Check Card */}
        <View style={[styles.card, styles.speakingCheckCard]}>
          <View style={styles.speakingCheckBadge}>
            <AppText variant="caption" weight="medium" color={speakingCheckCompleted ? "#047857" : "#1D4ED8"}>
              {speakingCheckCompleted ? "✓ Snapshot Saved" : "Optional Assessment"}
            </AppText>
          </View>
          <AppText variant="subtitle" weight="semibold" color="#111827" style={styles.checkTitle}>
            Speaking Check
          </AppText>
          <AppText variant="body" color="#4B5563" style={styles.checkDescription}>
            {speakingCheckCompleted
              ? "Your speaking snapshot is saved. You can view your report or retake it anytime."
              : "Want a clearer picture of your speaking clarity, pace, and structure? Take a 3-minute speaking check."}
          </AppText>

          <Button
            title={speakingCheckCompleted ? "View Snapshot" : "Start Speaking Check"}
            variant={speakingCheckCompleted ? "outline" : "primary"}
            onPress={handleSpeakingCheckPress}
            style={styles.checkButton}
          />
        </View>

        {/* Guest Progress Sync Banner */}
        {isAnonymous && (
          <View style={styles.guestSyncCard}>
            <AppText variant="body" weight="semibold" color="#111827">
              Keep your progress
            </AppText>
            <AppText variant="caption" color="#4B5563" style={styles.guestSyncText}>
              Sign in with Google to save your practice history and access peer practice.
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
            <View style={styles.modalBadge}>
              <AppText variant="caption" weight="medium" color="#1D4ED8">
                📊 Speaking Check
              </AppText>
            </View>
            <AppText variant="title" weight="semibold" style={styles.modalTitle}>
              Sign in for Speaking Check
            </AppText>
            <AppText variant="body" color="#4B5563" style={styles.modalBody}>
              Sign in with Google to take the 3-minute speaking check and save your baseline report.
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
              variant="outline"
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
    paddingVertical: 24,
    gap: 16,
  },
  header: {
    marginTop: 16,
    marginBottom: 8,
  },
  tagline: {
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  cardLabel: {
    letterSpacing: 0.8,
    marginBottom: 12,
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
    height: 32,
    backgroundColor: "#E5E7EB",
  },
  speakingCheckCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#D1D5DB",
  },
  speakingCheckBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  checkTitle: {
    fontSize: 18,
  },
  checkDescription: {
    marginTop: 6,
    lineHeight: 20,
    fontSize: 14,
  },
  checkButton: {
    marginTop: 16,
  },
  guestSyncCard: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  guestSyncText: {
    textAlign: "center",
    marginBottom: 8,
  },
  syncButton: {
    width: "100%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 12,
  },
  modalBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalTitle: {
    textAlign: "center",
  },
  modalBody: {
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  modalButton: {
    width: "100%",
  },
  modalCancelButton: {
    width: "100%",
  },
});

