import React, { useState } from "react";
import { View, StyleSheet, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../components/Screen";
import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import AssessmentScreen from "./(assessment)/index";

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
              <View style={styles.modalBadge}>
                <AppText variant="caption" weight="medium" color="#1D4ED8">
                  📊 Speaking Check
                </AppText>
              </View>
              <AppText variant="title" weight="semibold" style={styles.modalTitle}>
                Sign in for Speaking Check
              </AppText>
              <AppText variant="body" color="#4B5563" style={styles.modalBody}>
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
                variant="outline"
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
