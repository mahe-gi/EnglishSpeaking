import React, { useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../hooks/useAuth";
import { colors, radius, spacing, shadows } from "../../theme";

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
          <AppText variant="display" color={colors.textPrimary}>
            Profile
          </AppText>
        </View>

        {/* Account Info Card */}
        <View style={styles.accountCard}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={26} color={colors.textInverse} />
          </View>
          <View style={styles.accountDetails}>
            <AppText variant="title" color={colors.textPrimary}>
              {isAnonymous ? "Guest Learner" : user?.displayName || "Learner"}
            </AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {isAnonymous ? "Anonymous Device Preview" : user?.email || "Google Verified"}
            </AppText>
            <View style={styles.badgeContainer}>
              <StatusBadge
                label={productState === "PREMIUM" ? "PREMIUM" : productState === "FREE" ? "FREE ACCOUNT" : "GUEST PREVIEW"}
                variant={productState === "PREMIUM" ? "accent" : productState === "FREE" ? "success" : "neutral"}
              />
            </View>
          </View>
        </View>

        {/* Guest Upgrade CTA */}
        {isAnonymous && (
          <View style={styles.guestCtaCard}>
            <View style={styles.guestIconCircle}>
              <Ionicons name="sparkles" size={20} color={colors.accent} />
            </View>
            <AppText variant="title" color={colors.textPrimary}>
              Sign In with Google
            </AppText>
            <AppText variant="caption" align="center" color={colors.textSecondary} style={styles.guestCtaText}>
              Save your speaking history, personalize your topics, and unlock 1-on-1 peer practice.
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
            accessibilityRole="button"
            accessibilityLabel="Personalize my practice"
          >
            <View style={styles.optionIconContainer}>
              <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.optionTextContainer}>
              <AppText variant="bodyMedium" color={colors.textPrimary}>
                Personalize practice
              </AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                {profile?.careerStatus
                  ? `${profile.careerStatus.replace("_", " ")} • ${profile.goal?.replace("_", " ")}`
                  : "Target role, native language, and goals"}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={handleSnapshotPress}
            accessibilityRole="button"
            accessibilityLabel="Speaking baseline snapshot"
          >
            <View style={styles.optionIconContainer}>
              <Ionicons name="stats-chart-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.optionTextContainer}>
              <AppText variant="bodyMedium" color={colors.textPrimary}>
                Speaking Snapshot
              </AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                {speakingCheckCompleted ? "View speaking baseline report" : "Take 3-minute speaking check"}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Sign Out Button (for Registered Users) */}
        {!isAnonymous && (
          <View style={styles.footerContainer}>
            <Button
              title="Sign Out"
              variant="outline"
              icon={<Ionicons name="log-out-outline" size={18} color={colors.textPrimary} />}
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
            <View style={[styles.modalIconContainer, { backgroundColor: colors.dangerSubtle }]}>
              <Ionicons name="log-out-outline" size={32} color={colors.danger} />
            </View>
            <AppText variant="title" align="center" color={colors.textPrimary}>
              Sign out?
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary} style={styles.modalBody}>
              You will return to guest mode on this device.
            </AppText>

            <Button
              title="Sign out"
              variant="danger"
              onPress={handleConfirmSignOut}
              style={styles.modalButton}
            />

            <Button
              title="Cancel"
              variant="ghost"
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
            <View style={styles.modalIconContainer}>
              <Ionicons name="sparkles" size={32} color={colors.accent} />
            </View>
            <AppText variant="title" align="center" color={colors.textPrimary}>
              Sign in to personalize
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary} style={styles.modalBody}>
              Sign in with Google to save your career status, native language, and goals.
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
              variant="ghost"
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
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  accountCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadows.subtle,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  accountDetails: {
    flex: 1,
  },
  badgeContainer: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
  guestCtaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
    ...shadows.subtle,
  },
  guestIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  guestCtaText: {
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  signInButton: {
    width: "100%",
  },
  sectionContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.subtle,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
  },
  optionIconContainer: {
    marginRight: spacing.md,
  },
  optionTextContainer: {
    flex: 1,
    gap: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  footerContainer: {
    marginTop: spacing.sm,
  },
  signOutButton: {
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

