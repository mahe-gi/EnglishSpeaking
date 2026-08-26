import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../components/Screen";
import { AppText } from "../components/AppText";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import { getUserProgress, ProgressData } from "../lib/api";

export default function SpeakingSnapshotScreen() {
  const router = useRouter();
  const { firebaseUser, isAnonymous } = useAuth();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSnapshot() {
      if (!firebaseUser || isAnonymous) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const token = await firebaseUser.getIdToken();
        const data = await getUserProgress(token);
        setProgress(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load snapshot.");
      } finally {
        setLoading(false);
      }
    }
    loadSnapshot();
  }, [firebaseUser, isAnonymous]);

  const handleClose = () => {
    router.replace("/(tabs)" as any);
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#111827" />
          <AppText variant="caption" color="#6B7280" style={styles.loadingText}>
            Loading Speaking Snapshot...
          </AppText>
        </View>
      </Screen>
    );
  }

  const baseline = progress?.baseline;

  return (
    <Screen>
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <AppText variant="body" weight="medium" color="#4B5563">
            ✕ Close
          </AppText>
        </TouchableOpacity>
        <AppText variant="subtitle" weight="semibold">
          Speaking Snapshot
        </AppText>
        <View style={styles.placeholderRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.errorCard}>
            <AppText variant="body" color="#B91C1C">
              {error}
            </AppText>
          </View>
        )}
        {!baseline || baseline.score === null ? (
          <View style={styles.emptyCard}>
            <AppText variant="title" weight="semibold">
              No Snapshot Yet
            </AppText>
            <AppText variant="body" color="#4B5563" style={styles.emptyText}>
              Take a 3-minute Speaking Check to evaluate your fluency, clarity, and structure.
            </AppText>
            <Button
              title="Start Speaking Check"
              onPress={() => router.push("/speaking-check" as any)}
              style={styles.actionBtn}
            />
          </View>
        ) : (
          <>
            {/* Overall Score Card */}
            <View style={styles.scoreCard}>
              <AppText variant="caption" weight="semibold" color="#4B5563">
                OVERALL SPEAKING SCORE
              </AppText>
              <View style={styles.scoreRow}>
                <AppText variant="title" weight="semibold" style={styles.largeScore}>
                  {baseline.score}
                </AppText>
                <AppText variant="title" color="#9CA3AF" style={styles.scoreMax}>
                  / 100
                </AppText>
              </View>
              {baseline.assessedAt && (
                <AppText variant="caption" color="#6B7280">
                  Evaluated on {new Date(baseline.assessedAt).toLocaleDateString()}
                </AppText>
              )}
            </View>

            {/* Metrics Breakdown */}
            {baseline.dimensions && (
              <View style={styles.sectionCard}>
                <AppText variant="body" weight="semibold" style={styles.sectionHeading}>
                  Skill Breakdown
                </AppText>
                <View style={styles.grid}>
                  <View style={styles.gridItem}>
                    <AppText variant="caption" color="#6B7280">
                      Delivery & Fluency
                    </AppText>
                    <AppText variant="subtitle" weight="semibold">
                      {baseline.dimensions.delivery}/100
                    </AppText>
                  </View>
                  <View style={styles.gridItem}>
                    <AppText variant="caption" color="#6B7280">
                      Grammar & Syntax
                    </AppText>
                    <AppText variant="subtitle" weight="semibold">
                      {baseline.dimensions.grammar}/100
                    </AppText>
                  </View>
                  <View style={styles.gridItem}>
                    <AppText variant="caption" color="#6B7280">
                      Structure & Clarity
                    </AppText>
                    <AppText variant="subtitle" weight="semibold">
                      {baseline.dimensions.structure}/100
                    </AppText>
                  </View>
                  <View style={styles.gridItem}>
                    <AppText variant="caption" color="#6B7280">
                      Vocabulary
                    </AppText>
                    <AppText variant="subtitle" weight="semibold">
                      {baseline.dimensions.vocabulary}/100
                    </AppText>
                  </View>
                </View>
              </View>
            )}

            {/* Priority Areas */}
            {baseline.weaknesses && baseline.weaknesses.length > 0 && (
              <View style={styles.sectionCard}>
                <AppText variant="body" weight="semibold" color="#B45309" style={styles.sectionHeading}>
                  Priority Focus Areas
                </AppText>
                {baseline.weaknesses.map((item, idx) => (
                  <View key={idx} style={styles.bulletRow}>
                    <AppText variant="body" color="#B45309">
                      {idx + 1}.
                    </AppText>
                    <AppText variant="body" color="#374151" style={styles.bulletText}>
                      {item}
                    </AppText>
                  </View>
                ))}
              </View>
            )}

            {/* Retake Action */}
            <Button
              title="Retake Speaking Check"
              variant="outline"
              onPress={() => router.push("/speaking-check" as any)}
              style={styles.retakeBtn}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  placeholderRight: {
    width: 48,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
  },
  scrollContainer: {
    paddingVertical: 16,
    gap: 16,
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  emptyCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginTop: 40,
  },
  emptyText: {
    textAlign: "center",
    lineHeight: 20,
  },
  actionBtn: {
    width: "100%",
    marginTop: 8,
  },
  scoreCard: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  largeScore: {
    fontSize: 48,
    lineHeight: 56,
  },
  scoreMax: {
    fontSize: 20,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridItem: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 12,
    gap: 4,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  bulletText: {
    flex: 1,
    lineHeight: 20,
    fontSize: 14,
  },
  retakeBtn: {
    marginTop: 8,
    marginBottom: 24,
  },
});
