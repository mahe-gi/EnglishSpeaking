import React, { useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../components/Screen";
import { AppText } from "../components/AppText";
import { useAuth } from "../hooks/useAuth";

export default function RootIndexScreen() {
  const router = useRouter();
  const { status, error, retryBackendInit } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/(tabs)" as any);
    }
  }, [status, router]);

  if (status === "error") {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <AppText variant="title" weight="semibold" style={styles.title}>
            Ntalo
          </AppText>
          <View style={styles.errorCard}>
            <AppText variant="body" color="#B91C1C" style={styles.errorText}>
              {error || "Could not initialize practice session."}
            </AppText>
          </View>
          <TouchableOpacity onPress={retryBackendInit} activeOpacity={0.7} style={styles.retryLink}>
            <AppText variant="body" color="#2563EB" weight="semibold">
              Tap to Retry
            </AppText>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.centerContainer}>
        <AppText variant="title" weight="semibold" style={styles.title}>
          Ntalo
        </AppText>
        <AppText variant="caption" color="#6B7280" style={styles.tagline}>
          Speak more. Think less.
        </AppText>
        <ActivityIndicator size="small" color="#111827" style={styles.spinner} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 32,
  },
  tagline: {
    fontSize: 16,
    marginBottom: 16,
  },
  spinner: {
    marginTop: 8,
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    width: "100%",
  },
  errorText: {
    textAlign: "center",
  },
  retryLink: {
    marginTop: 8,
  },
});

