import React, { useEffect } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../components/Screen";
import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";

export default function IndexScreen() {
  const router = useRouter();
  const {
    status,
    user,
    onboardingCompleted,
    assessmentCompleted,
    error,
    signIn,
    signOut,
    retryBackendInit,
    isLoading,
    isAuthenticated,
  } = useAuth();

  useEffect(() => {
    if (isAuthenticated && !onboardingCompleted) {
      router.replace("/(onboarding)");
    }
  }, [isAuthenticated, onboardingCompleted, router]);

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <AppText variant="title" weight="semibold">
            Ntalo
          </AppText>
          <AppText variant="subtitle" color="#6B7280" style={styles.tagline}>
            Speak. Connect. Grow.
          </AppText>
        </View>

        {isAuthenticated && user && onboardingCompleted ? (
          <View style={styles.verifiedContainer}>
            <View style={styles.badge}>
              <AppText
                variant="caption"
                weight="medium"
                color={assessmentCompleted ? "#047857" : "#1D4ED8"}
              >
                {assessmentCompleted
                  ? "✓ Baseline Assessment Complete"
                  : "✓ Profile Ready"}
              </AppText>
            </View>
            <AppText variant="subtitle" weight="medium" style={styles.welcomeText}>
              Welcome back, {user.name || user.email}
            </AppText>
            <AppText variant="caption" color="#6B7280" style={styles.userMeta}>
              {assessmentCompleted
                ? "Your baseline speech score is saved. Practice daily interview scenarios."
                : "Complete your 3-question speaking baseline assessment."}
            </AppText>

            {assessmentCompleted ? (
              <>
                <Button
                  title="🎙️ Start Daily Practice"
                  onPress={() => router.push("/(practice)")}
                  style={styles.actionButton}
                />
                <Button
                  title="👥 1:1 Peer Practice"
                  variant="secondary"
                  onPress={() => router.push("/(peer)")}
                  style={styles.secondaryActionButton}
                />
                <Button
                  title="📈 View Progress & Fluency"
                  variant="outline"
                  onPress={() => router.push("/(progress)")}
                  style={styles.secondaryActionButton}
                />
                <Button
                  title="View Assessment Report"
                  variant="outline"
                  onPress={() => router.push("/(assessment)")}
                  style={styles.secondaryActionButton}
                />
              </>
            ) : (
              <Button
                title="Start Speaking Assessment"
                onPress={() => router.push("/(assessment)")}
                style={styles.actionButton}
              />
            )}

            <Button
              title="Sign Out"
              variant="outline"
              onPress={signOut}
              style={styles.signOutButton}
            />
          </View>
        ) : (
          <View style={styles.footer}>
            {status === "initializingBackend" && (
              <View style={styles.statusBox}>
                <ActivityIndicator size="small" color="#111827" />
                <AppText variant="caption" color="#4B5563">
                  Connecting to account server...
                </AppText>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <AppText variant="body" color="#B91C1C" style={styles.errorText}>
                  {error}
                </AppText>
                <Button
                  title="Retry"
                  variant="secondary"
                  onPress={retryBackendInit}
                  style={styles.retryButton}
                />
              </View>
            )}

            <Button
              title="Continue with Google"
              loading={isLoading}
              disabled={isLoading}
              onPress={signIn}
            />

            <AppText variant="caption" color="#9CA3AF" style={styles.hint}>
              Baseline Speaking Assessment Ready
            </AppText>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 40,
  },
  header: {
    marginTop: 60,
  },
  tagline: {
    marginTop: 8,
  },
  footer: {
    gap: 16,
    alignItems: "stretch",
  },
  hint: {
    textAlign: "center",
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  errorText: {
    textAlign: "center",
    fontSize: 14,
  },
  retryButton: {
    height: 38,
  },
  verifiedContainer: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  badge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  welcomeText: {
    textAlign: "center",
  },
  userMeta: {
    textAlign: "center",
  },
  actionButton: {
    marginTop: 16,
    width: "100%",
  },
  secondaryActionButton: {
    marginTop: 8,
    width: "100%",
  },
  signOutButton: {
    marginTop: 8,
    width: "100%",
  },
});
