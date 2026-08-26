import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../components/Screen";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";

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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <View style={styles.stateBadge}>
              <AppText variant="caption" weight="medium" color="#4B5563">
                {productState === "GUEST"
                  ? "Guest Mode"
                  : productState === "PREMIUM"
                  ? "⭐ Premium"
                  : "✓ Free Account"}
              </AppText>
            </View>
          </View>
          <AppText variant="title" weight="semibold" style={styles.title}>
            Ntalo
          </AppText>
          <AppText variant="subtitle" color="#6B7280" style={styles.tagline}>
            Speak more. Think less.
          </AppText>
        </View>

        {/* Section Heading */}
        <AppText variant="body" weight="semibold" color="#374151" style={styles.sectionTitle}>
          What do you want to practice?
        </AppText>

        {/* Primary Action: Talk with AI */}
        <TouchableOpacity
          style={[styles.actionCard, styles.aiCard]}
          activeOpacity={0.85}
          onPress={handleTalkWithAi}
        >
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <AppText variant="title" color="#FFFFFF">
                ◉
              </AppText>
            </View>
            <View style={styles.cardTextContent}>
              <AppText variant="title" weight="semibold" color="#111827">
                Talk with AI
              </AppText>
              <AppText variant="body" color="#4B5563" style={styles.cardSubtitle}>
                {productState === "GUEST"
                  ? `${Math.round((entitlements?.remainingAiSeconds || 0) / 60)} min free preview remaining`
                  : "Practice a real conversation"}
              </AppText>
            </View>
            <AppText variant="title" color="#9CA3AF" style={styles.cardArrow}>
              →
            </AppText>
          </View>
        </TouchableOpacity>

        {/* Secondary Action: Talk with a Person */}
        <TouchableOpacity
          style={[styles.actionCard, styles.peerCard]}
          activeOpacity={0.85}
          onPress={handleTalkWithPerson}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, styles.peerIconCircle]}>
              <AppText variant="title" color="#FFFFFF">
                🎙
              </AppText>
            </View>
            <View style={styles.cardTextContent}>
              <AppText variant="title" weight="semibold" color="#111827">
                Talk with a Person
              </AppText>
              <AppText variant="body" color="#4B5563" style={styles.cardSubtitle}>
                Practice with another learner
              </AppText>
            </View>
            <AppText variant="title" color="#9CA3AF" style={styles.cardArrow}>
              →
            </AppText>
          </View>
        </TouchableOpacity>

        {/* Weekly Summary */}
        <View style={styles.summaryCard}>
          <AppText variant="caption" weight="semibold" color="#6B7280" style={styles.summaryHeader}>
            THIS WEEK
          </AppText>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <AppText variant="title" weight="semibold" color="#111827">
                {Math.round((user ? 0 : 0) / 60)} min
              </AppText>
              <AppText variant="caption" color="#6B7280">
                speaking
              </AppText>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <AppText variant="title" weight="semibold" color="#111827">
                0
              </AppText>
              <AppText variant="caption" color="#6B7280">
                sessions
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Google Safety Modal for Guests tapping Talk with a Person */}
      <Modal visible={showGoogleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalBadge}>
              <AppText variant="caption" weight="medium" color="#1D4ED8">
                👥 Peer Safety
              </AppText>
            </View>
            <AppText variant="title" weight="semibold" style={styles.modalTitle}>
              Practice with real people
            </AppText>
            <AppText variant="body" color="#4B5563" style={styles.modalBody}>
              Sign in so we can keep peer conversations safe, respectful, and verified.
            </AppText>

            <Button
              title="Continue with Google"
              loading={isLoading}
              onPress={handleGoogleSignInFromModal}
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

      {/* 18+ Peer Confirmation Modal for Registered Users */}
      <Modal visible={showAgeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalBadge}>
              <AppText variant="caption" weight="medium" color="#047857">
                ✓ Eligibility
              </AppText>
            </View>
            <AppText variant="title" weight="semibold" style={styles.modalTitle}>
              Age Confirmation
            </AppText>
            <AppText variant="body" color="#4B5563" style={styles.modalBody}>
              Peer practice is currently available to people 18 and older.
            </AppText>

            <Button
              title="I am 18 or older"
              loading={isConfirmingAge}
              onPress={handleConfirmAge}
              style={styles.modalButton}
            />

            <Button
              title="Cancel"
              variant="outline"
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
    paddingVertical: 24,
    gap: 16,
  },
  header: {
    marginTop: 16,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  stateBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  title: {
    fontSize: 28,
  },
  tagline: {
    marginTop: 4,
    fontSize: 16,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 15,
  },
  actionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  aiCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#111827",
  },
  peerCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  peerIconCircle: {
    backgroundColor: "#2563EB",
  },
  cardTextContent: {
    flex: 1,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 14,
  },
  cardArrow: {
    fontSize: 20,
  },
  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  summaryHeader: {
    letterSpacing: 0.8,
    marginBottom: 12,
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
    backgroundColor: "#E5E7EB",
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
