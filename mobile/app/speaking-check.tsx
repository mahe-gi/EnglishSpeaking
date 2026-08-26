import React, { useState } from "react";
import { View, StyleSheet, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import AssessmentScreen from "./(assessment)/index";
import { colors, radius, spacing, shadows } from "../theme";

export default function SpeakingCheckRoute() {
  const router = useRouter();
  const { isAnonymous, signInWithGoogle, isLoading } = useAuth();
  const [showGoogleModal, setShowGoogleModal] = useState(isAnonymous);

  if (isAnonymous) {
    return (
      <Screen>
        <Modal visible={showGoogleModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="stats-chart" size={32} color={colors.accent} />
              </View>
              <AppText variant="title" align="center" color={colors.textPrimary}>
                Sign in for Speaking Check
              </AppText>
              <AppText variant="body" align="center" color={colors.textSecondary} style={styles.modalBody}>
                Sign in with Google to evaluate your communication baseline and save your speaking snapshot.
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
                onPress={() => {
                  setShowGoogleModal(false);
                  router.replace("/(tabs)" as any);
                }}
                style={styles.modalCancelButton}
              />
            </View>
          </View>
        </Modal>
      </Screen>
    );
  }

  return <AssessmentScreen />;
}

const styles = StyleSheet.create({
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

