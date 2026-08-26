import React, { useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";

export default function ProfileScreen() {
  const router = useRouter();
  const {
    user,
    isAnonymous,
    productState,
    profile,
    signInWithGoogle,
    signOut,
    isLoading,
    speakingCheckCompleted,
  } = useAuth();

  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showPersonalizeModal, setShowPersonalizeModal] = useState(false);

  const handleSignOutPress = () => {
    setShowSignOutModal(true);
  };

  const handleConfirmSignOut = async () => {
    setShowSignOutModal(false);
    await signOut();
    router.replace("/(tabs)" as any);
  };

  const handlePersonalizePress = () => {
    if (isAnonymous) {
      setShowPersonalizeModal(true);
    } else {
      router.push("/personalize" as any);
    }
  };

  const handleSnapshotPress = () => {
    if (isAnonymous) {
      setShowPersonalizeModal(true);
    } else if (speakingCheckCompleted) {
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
            Profile
          </AppText>
        </View>

        {/* Account Info Card */}
        <View style={styles.accountCard}>
          <View style={styles.avatarCircle}>
            <AppText variant="title" color="#FFFFFF">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : isAnonymous ? "G" : "U"}
            </AppText>
          </View>
          <View style={styles.accountDetails}>
            <AppText variant="subtitle" weight="semibold" color="#111827">
              {isAnonymous ? "Guest Learner" : user?.displayName || "Learner"}
            </AppText>
            <AppText variant="caption" color="#6B7280">
              {isAnonymous ? "Anonymous Preview" : user?.email || "Google Account"}
            </AppText>
            <View style={styles.badgeContainer}>
              <View style={styles.planBadge}>
                <AppText variant="caption" weight="medium" color="#4B5563">
                  {productState === "GUEST"
                    ? "Guest Mode"
                    : productState === "PREMIUM"
                    ? "⭐ Premium"
                    : "✓ Free Account"}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* Guest Upgrade CTA */}
        {isAnonymous && (
          <View style={styles.guestCtaCard}>
            <AppText variant="body" weight="semibold" color="#111827">
              Create an account
            </AppText>
            <AppText variant="caption" color="#4B5563" style={styles.guestCtaText}>
              Sign in with Google to save your history, personalize your topics, and unlock peer practice.
            </AppText>
            <Button
              title="Continue with Google"
              loading={isLoading}
              onPress={signInWithGoogle}
              style={styles.signInButton}
            />
          </View>
        )}

        {/* Options List */}
        <View style={styles.sectionContainer}>
          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={handlePersonalizePress}
          >
            <View style={styles.optionTextContainer}>
              <AppText variant="body" weight="medium" color="#111827">
                Personalize my practice
              </AppText>
              <AppText variant="caption" color="#6B7280">
                {profile?.careerStatus
                  ? `${profile.careerStatus.replace("_", " ")} · ${profile.goal?.replace("_", " ")}`
                  : "Target role, native language, and goals"}
              </AppText>
            </View>
            <AppText variant="body" color="#9CA3AF">
              →
            </AppText>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={handleSnapshotPress}
          >
            <View style={styles.optionTextContainer}>
              <AppText variant="body" weight="medium" color="#111827">
                Speaking Snapshot
              </AppText>
              <AppText variant="caption" color="#6B7280">
                {speakingCheckCompleted ? "View speaking snapshot report" : "Take optional speaking check"}
              </AppText>
            </View>
            <AppText variant="body" color="#9CA3AF">
              →
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Sign Out Button (for Registered Users) */}
        {!isAnonymous && (
          <View style={styles.footerContainer}>
            <Button
              title="Sign Out"
              variant="outline"
              onPress={handleSignOutPress}
              style={styles.signOutButton}
            />
          </View>
        )}
      </ScrollView>

      {/* Sign Out Confirmation Modal */}
      <Modal visible={showSignOutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AppText variant="title" weight="semibold" style={styles.modalTitle}>
              Sign out?
            </AppText>
            <AppText variant="body" color="#4B5563" style={styles.modalBody}>
              You&apos;ll return to guest mode on this device.
            </AppText>

            <Button
              title="Sign out"
              variant="primary"
              onPress={handleConfirmSignOut}
              style={styles.modalButton}
            />

            <Button
              title="Cancel"
              variant="outline"
              onPress={() => setShowSignOutModal(false)}
              style={styles.modalCancelButton}
            />
          </View>
        </View>
      </Modal>

      {/* Personalize Google CTA Modal for Guests */}
      <Modal visible={showPersonalizeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AppText variant="title" weight="semibold" style={styles.modalTitle}>
              Sign in to personalize
            </AppText>
            <AppText variant="body" color="#4B5563" style={styles.modalBody}>
              Sign in with Google to save your career status, native language, and interview goals.
            </AppText>

            <Button
              title="Continue with Google"
              loading={isLoading}
              onPress={() => {
                setShowPersonalizeModal(false);
                signInWithGoogle();
              }}
              style={styles.modalButton}
            />

            <Button
              title="Not now"
              variant="outline"
              onPress={() => setShowPersonalizeModal(false)}
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
  accountCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  accountDetails: {
    flex: 1,
  },
  badgeContainer: {
    flexDirection: "row",
    marginTop: 6,
  },
  planBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  guestCtaCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  guestCtaText: {
    lineHeight: 18,
    marginBottom: 8,
  },
  signInButton: {
    width: "100%",
  },
  sectionContainer: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    justifyContent: "space-between",
  },
  optionTextContainer: {
    flex: 1,
    gap: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  footerContainer: {
    marginTop: 16,
  },
  signOutButton: {
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
