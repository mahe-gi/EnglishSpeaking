import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { auth } from "../../lib/firebase";
import { AppText } from "../../components/AppText";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import {
  joinPeerQueue,
  getPeerQueueStatus,
  leavePeerQueue,
  PeerMatchDetails,
} from "../../lib/api";
import { colors, radius, spacing, shadows } from "../../theme";

type QueueScreenState = "INITIALIZING" | "SEARCHING" | "MATCHED" | "TIMEOUT" | "ERROR";

export default function PeerMatchmakingScreen() {
  const router = useRouter();

  const [screenState, setScreenState] = useState<QueueScreenState>("INITIALIZING");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pulseAnim] = useState(() => new Animated.Value(1));

  const isPollingRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Pulse animation for radar effect
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Clean polling loop
  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleMatchFound = useCallback((match: PeerMatchDetails) => {
    if (!isMountedRef.current) return;
    stopPolling();
    setScreenState("MATCHED");
    router.replace(`/(peer)/session?matchId=${match.id}`);
  }, [router, stopPolling]);

  const pollQueueStatus = useCallback(async () => {
    if (isPollingRef.current || !isMountedRef.current) return;
    isPollingRef.current = true;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const idToken = await currentUser.getIdToken();

      const statusRes = await getPeerQueueStatus(idToken);
      if (!isMountedRef.current) return;

      if (statusRes.status === "MATCHED" && statusRes.match) {
        handleMatchFound(statusRes.match);
      } else if (statusRes.status === "TIMEOUT") {
        stopPolling();
        setScreenState("TIMEOUT");
      }
    } catch {
      // Bounded poll failure: continue polling
    } finally {
      isPollingRef.current = false;
    }
  }, [handleMatchFound, stopPolling]);

  const enterQueue = useCallback(async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required. Please sign in again.");
      }
      const idToken = await currentUser.getIdToken();

      const joinRes = await joinPeerQueue(idToken);
      if (!isMountedRef.current) return;

      if (joinRes.status === "MATCHED" && joinRes.match) {
        handleMatchFound(joinRes.match);
        return;
      }

      setScreenState("SEARCHING");

      // Start short polling every 1.5s
      stopPolling();
      timerRef.current = setInterval(pollQueueStatus, 1500);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      stopPolling();
      const msg = err instanceof Error ? err.message : "Failed to enter matchmaking queue.";
      setErrorMessage(msg);
      setScreenState("ERROR");
    }
  }, [handleMatchFound, pollQueueStatus, stopPolling]);

  const handleRetry = () => {
    setErrorMessage(null);
    setScreenState("INITIALIZING");
    void enterQueue();
  };

  useEffect(() => {
    isMountedRef.current = true;

    async function initQueue() {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Authentication required. Please sign in again.");
        }
        const idToken = await currentUser.getIdToken();

        const joinRes = await joinPeerQueue(idToken);
        if (!isMountedRef.current) return;

        if (joinRes.status === "MATCHED" && joinRes.match) {
          handleMatchFound(joinRes.match);
          return;
        }

        setScreenState("SEARCHING");

        stopPolling();
        timerRef.current = setInterval(pollQueueStatus, 1500);
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        stopPolling();
        const msg = err instanceof Error ? err.message : "Failed to enter matchmaking queue.";
        setErrorMessage(msg);
        setScreenState("ERROR");
      }
    }

    void initQueue();

    return () => {
      isMountedRef.current = false;
      stopPolling();
      // Leave queue on screen unmount
      const currentUser = auth.currentUser;
      if (currentUser) {
        currentUser.getIdToken().then((token) => leavePeerQueue(token)).catch(() => {});
      }
    };
  }, [handleMatchFound, pollQueueStatus, stopPolling]);

  const handleCancel = async () => {
    stopPolling();
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken();
        await leavePeerQueue(token);
      }
    } catch {
      // ignore
    }
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <IconButton
          icon={<Ionicons name="close" size={22} color={colors.textPrimary} />}
          accessibilityLabel="Cancel matchmaking"
          onPress={handleCancel}
          variant="surface"
          size={40}
        />
        <AppText variant="subtitle" color={colors.textPrimary}>
          Peer Practice
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>
        {screenState === "INITIALIZING" && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.brand} />
            <AppText variant="title" color={colors.textPrimary} style={styles.statusTitle}>
              Connecting to matchmaking...
            </AppText>
          </View>
        )}

        {screenState === "SEARCHING" && (
          <View style={styles.centerContainer}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <View style={styles.avatarCircle}>
                <Ionicons name="people" size={36} color={colors.accent} />
              </View>
            </Animated.View>

            <AppText variant="titleLarge" align="center" color={colors.textPrimary} style={styles.statusTitle}>
              Finding someone to practice with
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary} style={styles.statusSubtitle}>
              Matching you with another English learner for 1-on-1 spoken practice.
            </AppText>

            <Button
              title="Cancel"
              variant="secondary"
              onPress={handleCancel}
              style={styles.cancelButton}
            />
          </View>
        )}

        {screenState === "MATCHED" && (
          <View style={styles.centerContainer}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.successSubtle }]}>
              <Ionicons name="checkmark" size={40} color={colors.success} />
            </View>
            <AppText variant="titleLarge" align="center" color={colors.textPrimary} style={styles.statusTitle}>
              Partner Found
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary}>
              Connecting to private audio room...
            </AppText>
          </View>
        )}

        {screenState === "TIMEOUT" && (
          <View style={styles.centerContainer}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.surfaceMuted }]}>
              <Ionicons name="time-outline" size={40} color={colors.textSecondary} />
            </View>
            <AppText variant="titleLarge" align="center" color={colors.textPrimary} style={styles.statusTitle}>
              No partner found just now
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary} style={styles.statusSubtitle}>
              No other learners joined the queue in the last minute. You can search again or practice with AI.
            </AppText>

            <View style={styles.buttonStack}>
              <Button
                title="Search Again"
                onPress={handleRetry}
                style={styles.fullWidthButton}
              />
              <Button
                title="Talk with AI instead"
                variant="secondary"
                onPress={() => router.replace("/voice")}
                style={styles.fullWidthButton}
              />
            </View>
          </View>
        )}

        {screenState === "ERROR" && (
          <View style={styles.centerContainer}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.dangerSubtle }]}>
              <Ionicons name="alert-circle" size={40} color={colors.danger} />
            </View>
            <AppText variant="titleLarge" align="center" color={colors.textPrimary} style={styles.statusTitle}>
              Unable to Match
            </AppText>
            <AppText variant="body" align="center" color={colors.textSecondary} style={styles.statusSubtitle}>
              {errorMessage || "An unexpected network error occurred."}
            </AppText>

            <View style={styles.buttonStack}>
              <Button
                title="Try Again"
                onPress={handleRetry}
                style={styles.fullWidthButton}
              />
              <Button
                title="Back to Home"
                variant="outline"
                onPress={handleCancel}
                style={styles.fullWidthButton}
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  pulseRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.subtle,
  },
  statusTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  statusSubtitle: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xxl,
  },
  cancelButton: {
    minWidth: 140,
  },
  buttonStack: {
    width: "100%",
    gap: spacing.sm,
  },
  fullWidthButton: {
    width: "100%",
  },
});


