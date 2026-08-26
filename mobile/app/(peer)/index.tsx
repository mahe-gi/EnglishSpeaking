import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../../lib/firebase";
import {
  joinPeerQueue,
  getPeerQueueStatus,
  leavePeerQueue,
  PeerMatchDetails,
} from "../../lib/api";

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
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleCancel}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Peer Practice</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>
        {screenState === "INITIALIZING" && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.statusTitle}>Connecting to matchmaking...</Text>
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
                <Text style={styles.avatarIcon}>🎙️</Text>
              </View>
            </Animated.View>

            <Text style={styles.statusTitle}>Finding a practice partner...</Text>
            <Text style={styles.statusSubtitle}>
              Matching you with another English learner for 1-on-1 speaking.
            </Text>

            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {screenState === "MATCHED" && (
          <View style={styles.centerContainer}>
            <View style={[styles.avatarCircle, { backgroundColor: "#10B981" }]}>
              <Text style={styles.avatarIcon}>✓</Text>
            </View>
            <Text style={styles.statusTitle}>Partner Found!</Text>
            <Text style={styles.statusSubtitle}>Connecting to private voice room...</Text>
          </View>
        )}

        {screenState === "TIMEOUT" && (
          <View style={styles.centerContainer}>
            <View style={[styles.avatarCircle, { backgroundColor: "#F3F4F6" }]}>
              <Text style={styles.avatarIcon}>⏳</Text>
            </View>
            <Text style={styles.statusTitle}>Still looking for someone.</Text>
            <Text style={styles.statusSubtitle}>
              No other learners joined the queue just now. You can keep searching or practice with AI.
            </Text>

            <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
              <Text style={styles.primaryButtonText}>Keep searching</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.replace("/voice")}
            >
              <Text style={styles.secondaryButtonText}>Talk with AI instead</Text>
            </TouchableOpacity>
          </View>
        )}

        {screenState === "ERROR" && (
          <View style={styles.centerContainer}>
            <View style={[styles.avatarCircle, { backgroundColor: "#FEE2E2" }]}>
              <Text style={styles.avatarIcon}>⚠️</Text>
            </View>
            <Text style={styles.errorTitle}>Unable to Match</Text>
            <Text style={styles.errorSubtitle}>{errorMessage || "An unexpected error occurred."}</Text>

            <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleCancel}>
              <Text style={styles.secondaryButtonText}>Back to Home</Text>
            </TouchableOpacity>

          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4B5563",
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
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
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarIcon: {
    fontSize: 40,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  statusSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
    marginBottom: 36,
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4B5563",
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#10B981",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryButton: {
    width: "100%",
    backgroundColor: "#F3F4F6",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#DC2626",
    textAlign: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
});

