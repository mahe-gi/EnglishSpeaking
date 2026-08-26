import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../hooks/useAuth";
import { colors, radius, spacing, shadows } from "../../theme";

export default function HomeScreen() {
  const router = useRouter();
  const {
    user,
    isAnonymous,
    isAgeConfirmed,
    signInWithGoogle,
    confirmAge,
    isLoading,
    productState,
    entitlements,
  } = useAuth();

  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [isConfirmingAge, setIsConfirmingAge] = useState(false);

  const handleTalkWithAi = () => {
    router.push("/voice" as any);
  };

  const handleTalkWithPerson = () => {
    if (isAnonymous) {
      setShowGoogleModal(true);
      return;
    }

    if (!isAgeConfirmed) {
      setShowAgeModal(true);
      return;
    }

    router.push("/(peer)" as any);
  };

  const handleConfirmAge = async () => {
    try {
      setIsConfirmingAge(true);
      const success = await confirmAge();
      if (success) {
        setShowAgeModal(false);
        router.push("/(peer)" as any);
      }
    } finally {
      setIsConfirmingAge(false);
    }
  };

  const handleGoogleSignInFromModal = async () => {
    setShowGoogleModal(false);
    await signInWithGoogle();
  };

  const getProductBadgeVariant = () => {
    if (productState === "PREMIUM") return "accent";
    if (productState === "FREE") return "success";
    return "neutral";
  };

  const getProductBadgeLabel = () => {
    if (productState === "PREMIUM") return "PREMIUM";
    if (productState === "FREE") return "FREE ACCOUNT";
    return "GUEST PREVIEW";
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <StatusBadge
              label={getProductBadgeLabel()}
              variant={getProductBadgeVariant()}
            />
          </View>
          <AppText variant="display" color={colors.textPrimary}>
            Ntalo
          </AppText>
          <AppText variant="subtitle" color={colors.textSecondary} style={styles.tagline}>
            Practice speaking English in real conversations.
          </AppText>
        </View>

        {/* Action Cards */}
        <View style={styles.actionsContainer}>
          {/* Primary Action: Talk with AI */}
          <TouchableOpacity
            style={[styles.actionCard, styles.aiCard]}
            activeOpacity={0.8}
            onPress={handleTalkWithAi}
            accessibilityRole="button"
            accessibilityLabel="Talk with AI"
          >
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Ionicons name="sparkles" size={22} color={colors.textInverse} />
              </View>
              <View style={styles.cardTextContent}>
                <AppText variant="title" color={colors.textPrimary}>
                  Talk with AI
                </AppText>
                <AppText variant="body" color={colors.textSecondary} style={styles.cardSubtitle}>
                  {productState === "GUEST"
                    ? `${Math.round((entitlements?.remainingAiSeconds || 0) / 60)} min free preview remaining`
                    : "Practice with an AI speaking partner"}
                </AppText>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>

          {/* Secondary Action: Talk with a Person */}
          <TouchableOpacity
            style={[styles.actionCard, styles.peerCard]}
            activeOpacity={0.8}
            onPress={handleTalkWithPerson}
            accessibilityRole="button"
            accessibilityLabel="Talk with a Person"
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconCircle, styles.peerIconCircle]}>
                <Ionicons name="people" size={22} color={colors.textInverse} />
              </View>
              <View style={styles.cardTextContent}>
                <AppText variant="title" color={colors.textPrimary}>
                  Talk with a Person
                </AppText>
                <AppText variant="body" color={colors.textSecondary} style={styles.cardSubtitle}>
                  Instant 1-on-1 practice with another learner
                </AppText>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Practice Overview */}
        <View style={styles.summaryCard}>
          <AppText variant="micro" color={colors.textSecondary} style={styles.summaryHeader}>
            PRACTICE SUMMARY
          </AppText>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <AppText variant="title" color={colors.textPrimary}>
                {Math.round((user ? 0 : 0) / 60)} min
              </AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                Total Speaking
              </AppText>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <AppText variant="title" color={colors.textPrimary}>
                0
              </AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                Sessions
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Google Safety Modal for Guests tapping Talk with a Person */}
      <Modal visible={showGoogleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="shield-checkmark" size={32} color={colors.accent} />
            </View>
            <AppText variant="title" align="center" color={colors.textPrimary}>
              Verified Peer Practice
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary} style={styles.modalBody}>
              Sign in with Google to keep peer conversations respectful, authentic, and verified.
            </AppText>

            <Button
              title="Continue with Google"
              loading={isLoading}
              onPress={handleGoogleSignInFromModal}
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

      {/* 18+ Peer Confirmation Modal for Registered Users */}
      <Modal visible={showAgeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIconContainer, { backgroundColor: colors.successSubtle }]}>
              <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            </View>
            <AppText variant="title" align="center" color={colors.textPrimary}>
              Age Confirmation
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary} style={styles.modalBody}>
              Peer practice is currently available for adults 18 and older.
            </AppText>

            <Button
              title="I am 18 or older"
              loading={isConfirmingAge}
              onPress={handleConfirmAge}
              style={styles.modalButton}
            />

            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setShowAgeModal(false)}
              style={styles.modalCancelButton}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  badgeRow: {
    marginBottom: spacing.sm,
  },
  tagline: {
    marginTop: spacing.xxs,
  },
  actionsContainer: {
    gap: spacing.md,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.subtle,
  },
  aiCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  peerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  peerIconCircle: {
    backgroundColor: colors.accent,
  },
  cardTextContent: {
    flex: 1,
  },
  cardSubtitle: {
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xs,
  },
  summaryHeader: {
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
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

