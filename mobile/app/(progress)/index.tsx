import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { auth } from "../../lib/firebase";
import { getUserProgress, ProgressData } from "../../lib/api";

export default function ProgressScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<ProgressData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProgress() {
      try {
        setLoading(true);
        setErrorMessage(null);

        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Authentication required. Please sign in again.");
        }

        const idToken = await currentUser.getIdToken();
        const data = await getUserProgress(idToken);

        if (isMounted) {
          setProgressData(data);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Failed to load progress statistics.";
          setErrorMessage(msg);
          setLoading(false);
        }
      }
    }

    loadProgress();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading your speaking progress...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage || !progressData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Could Not Load Progress</Text>
          <Text style={styles.errorSubtitle}>{errorMessage || "Progress data is currently unavailable."}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/")}>
            <Text style={styles.primaryButtonText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { baseline, practice, focusAreas, recentSessions } = progressData;

  const totalFocusCount = Object.values(focusAreas).reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Dashboard</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Speaking Progress</Text>
          <View style={{ width: 70 }} />
        </View>

        {/* Top Summary Cards */}
        <View style={styles.topCardsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{practice.speakingMinutes}m</Text>
            <Text style={styles.statLabel}>Speaking Time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{practice.completedSessions}</Text>
            <Text style={styles.statLabel}>Daily Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{baseline?.score ?? "--"}</Text>
            <Text style={styles.statLabel}>Baseline Score</Text>
          </View>
        </View>

        {/* Fluency & Pace Comparison Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>Fluency & Pace Comparison</Text>
          <Text style={styles.sectionSubheading}>
            Comparing your Day 1 baseline assessment with your recent daily practice answers.
          </Text>

          <View style={styles.comparisonItem}>
            <View style={styles.comparisonHeaderRow}>
              <Text style={styles.comparisonMetricTitle}>Speaking Rate</Text>
              <Text style={styles.idealBadge}>Target: 110–150 WPM</Text>
            </View>
            <View style={styles.comparisonPillsRow}>
              <View style={styles.comparisonPill}>
                <Text style={styles.comparisonPillLabel}>Baseline</Text>
                <Text style={styles.comparisonPillValue}>
                  {baseline?.wpm != null ? `${baseline.wpm} WPM` : "--"}
                </Text>
              </View>
              <Text style={styles.arrowText}>→</Text>
              <View style={[styles.comparisonPill, styles.activeComparisonPill]}>
                <Text style={styles.comparisonPillLabel}>Recent Practice</Text>
                <Text style={styles.comparisonPillValue}>
                  {practice.recentWpm != null ? `${practice.recentWpm} WPM` : "--"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.comparisonItem}>
            <View style={styles.comparisonHeaderRow}>
              <Text style={styles.comparisonMetricTitle}>Filler Word Rate</Text>
              <Text style={styles.idealBadge}>Lower is better</Text>
            </View>
            <View style={styles.comparisonPillsRow}>
              <View style={styles.comparisonPill}>
                <Text style={styles.comparisonPillLabel}>Baseline</Text>
                <Text style={styles.comparisonPillValue}>
                  {baseline?.fillerPercentage != null ? `${baseline.fillerPercentage}%` : "--"}
                </Text>
              </View>
              <Text style={styles.arrowText}>→</Text>
              <View style={[styles.comparisonPill, styles.activeComparisonPill]}>
                <Text style={styles.comparisonPillLabel}>Recent Practice</Text>
                <Text style={styles.comparisonPillValue}>
                  {practice.recentFillerPercentage != null ? `${practice.recentFillerPercentage}%` : "--"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Recent Practice Coaching Focus Areas */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>Recent Coaching Focus Areas</Text>
          <Text style={styles.sectionSubheading}>
            Distribution of AI coaching tips across your completed speaking turns.
          </Text>

          {totalFocusCount === 0 ? (
            <Text style={styles.emptyText}>Complete your first daily practice session to see coaching focus trends.</Text>
          ) : (
            <View style={styles.focusGrid}>
              {Object.entries(focusAreas).map(([area, count]) => {
                if (count === 0) return null;
                const percentage = Math.round((count / totalFocusCount) * 100);
                return (
                  <View key={area} style={styles.focusItem}>
                    <View style={styles.focusLabelRow}>
                      <Text style={styles.focusName}>{area}</Text>
                      <Text style={styles.focusCount}>{count} tips ({percentage}%)</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Baseline Weaknesses Card */}
        {baseline && baseline.weaknesses && baseline.weaknesses.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Key Improvement Goals</Text>
            <Text style={styles.sectionSubheading}>Identified during your baseline assessment:</Text>
            {baseline.weaknesses.map((w, idx) => (
              <View key={idx} style={styles.weaknessItem}>
                <Text style={styles.weaknessBullet}>•</Text>
                <Text style={styles.weaknessText}>{w}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent Practice History */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>Recent Practice History</Text>
          <Text style={styles.sectionSubheading}>Your latest completed 3-turn interview sessions.</Text>

          {recentSessions.length === 0 ? (
            <View style={styles.emptyHistoryBox}>
              <Text style={styles.emptyText}>No daily practice sessions completed yet.</Text>
              <TouchableOpacity
                style={styles.startPracticeButton}
                onPress={() => router.push("/(practice)")}
                accessibilityRole="button"
                accessibilityLabel="Start today's practice"
              >
                <Text style={styles.startPracticeButtonText}>Start Today&apos;s Practice</Text>
              </TouchableOpacity>
            </View>
          ) : (
            recentSessions.map((session) => {
              const formattedDate = session.completedAt
                ? new Date(session.completedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "—";
              return (
                <View key={session.id} style={styles.historyCard}>
                  <View style={styles.historyTopRow}>
                    <View style={styles.historyCategoryPill}>
                      <Text style={styles.historyCategoryText}>{session.scenarioCategory}</Text>
                    </View>
                    <Text style={styles.historyDate}>{formattedDate}</Text>
                  </View>

                  <Text style={styles.historyTitle}>{session.scenarioTitle}</Text>

                  <View style={styles.historyStatsRow}>
                    <Text style={styles.historyStatText}>{session.speakingSeconds}s speaking</Text>
                    <Text style={styles.historyStatDot}>•</Text>
                    <Text style={styles.historyStatText}>{session.wpm} WPM</Text>
                    <Text style={styles.historyStatDot}>•</Text>
                    {session.primaryFocusArea ? (
                      <View style={styles.historyFocusBadge}>
                        <Text style={styles.historyFocusText}>{session.primaryFocusArea}</Text>
                      </View>
                    ) : (
                      <Text style={styles.historyStatText}>No focus recorded</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Return Button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.primaryButtonText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#4B5563",
    fontWeight: "500",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4F46E5",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  topCardsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: "#4F46E5",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sectionSubheading: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 16,
    lineHeight: 18,
  },
  comparisonItem: {
    marginVertical: 4,
  },
  comparisonHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  comparisonMetricTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  idealBadge: {
    fontSize: 11,
    color: "#059669",
    fontWeight: "600",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  comparisonPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  comparisonPill: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  activeComparisonPill: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
    borderWidth: 1,
  },
  comparisonPillLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  comparisonPillValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
  },
  arrowText: {
    fontSize: 18,
    color: "#9CA3AF",
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 16,
  },
  focusGrid: {
    gap: 12,
  },
  focusItem: {
    gap: 6,
  },
  focusLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  focusName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  focusCount: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4F46E5",
    borderRadius: 4,
  },
  weaknessItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8,
  },
  weaknessBullet: {
    fontSize: 16,
    color: "#EF4444",
    fontWeight: "700",
  },
  weaknessText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 12,
  },
  emptyHistoryBox: {
    alignItems: "center",
    paddingVertical: 12,
  },
  startPracticeButton: {
    marginTop: 10,
    backgroundColor: "#4F46E5",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  startPracticeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  historyCard: {
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  historyTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  historyCategoryPill: {
    backgroundColor: "#E0E7FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyCategoryText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4338CA",
  },
  historyDate: {
    fontSize: 12,
    color: "#6B7280",
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  historyStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyStatText: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "500",
  },
  historyStatDot: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  historyFocusBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyFocusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#92400E",
  },
  primaryButton: {
    backgroundColor: "#4F46E5",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  errorSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
});
