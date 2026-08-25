import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../../lib/firebase";
import {
  getPeerSlots,
  bookPeerAvailability,
  cancelPeerAvailability,
  getUpcomingPeerMatch,
  PeerSlot,
  PeerMatchDetails,
  PeerAvailabilityData,
} from "../../lib/api";

export default function PeerPracticeHomeScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [slots, setSlots] = useState<PeerSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookingInProgress, setBookingInProgress] = useState<boolean>(false);

  const [upcomingMatch, setUpcomingMatch] = useState<PeerMatchDetails | null>(null);
  const [pendingAvailability, setPendingAvailability] = useState<PeerAvailabilityData | null>(null);
  const [isAdultConfirmed, setIsAdultConfirmed] = useState<boolean>(false);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);

  const loadData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required. Please sign in again.");
      }
      const idToken = await currentUser.getIdToken();

      const [availableSlots, matchData] = await Promise.all([
        getPeerSlots(idToken),
        getUpcomingPeerMatch(idToken),
      ]);

      setSlots(availableSlots);
      if (availableSlots.length > 0) {
        setSelectedSlot((prev) => prev || availableSlots[0]!.startAt);
      }

      setUpcomingMatch(matchData.match);
      setPendingAvailability(matchData.pendingAvailability);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load peer practice slots.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initialFetch() {
      if (isMounted) {
        setCurrentTimeMs(new Date().getTime());
        await loadData();
      }
    }

    initialFetch();

    const interval = setInterval(() => {
      if (isMounted) {
        setCurrentTimeMs(new Date().getTime());
      }
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    setCurrentTimeMs(new Date().getTime());
    loadData();
  };

  const handleBookSlot = async () => {
    if (!selectedSlot) return;

    try {
      setBookingInProgress(true);
      setErrorMessage(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required. Please sign in again.");
      }
      const idToken = await currentUser.getIdToken();

      const response = await bookPeerAvailability(idToken, selectedSlot);

      if (response.status === "MATCHED" && response.match) {
        setUpcomingMatch(response.match);
        setPendingAvailability(null);
      } else if (response.status === "WAITING" && response.availability) {
        setPendingAvailability(response.availability);
        setUpcomingMatch(null);
      }

      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to book peer practice slot.";
      setErrorMessage(msg);
    } finally {
      setBookingInProgress(false);
    }
  };

  const handleCancelAvailability = async () => {
    if (!pendingAvailability) return;

    try {
      setBookingInProgress(true);
      setErrorMessage(null);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required. Please sign in again.");
      }
      const idToken = await currentUser.getIdToken();

      await cancelPeerAvailability(idToken, pendingAvailability.id);
      setPendingAvailability(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel availability.";
      setErrorMessage(msg);
    } finally {
      setBookingInProgress(false);
    }
  };

  // Check join window status using tracked time
  const canJoinNow = (startAtISO: string) => {
    const startTime = new Date(startAtISO).getTime();
    const windowStart = startTime - 5 * 60 * 1000;
    const windowEnd = startTime + 15 * 60 * 1000;
    return currentTimeMs >= windowStart && currentTimeMs <= windowEnd;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading scheduled peer slots...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.replace("/")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Dashboard</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>1:1 Peer Practice</Text>
          <View style={{ width: 70 }} />
        </View>

        {/* Overview Banner */}
        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>Live 15-Minute Interview Practice</Text>
          <Text style={styles.bannerText}>
            Practice real workplace communication with another peer preparing for interviews. Audio-only, structured format, zero recording.
          </Text>
        </View>

        {errorMessage && (
          <View style={styles.errorAlert}>
            <Text style={styles.errorAlertText}>{errorMessage}</Text>
          </View>
        )}

        {/* MATCHED STATE */}
        {upcomingMatch ? (
          <View style={styles.matchCard}>
            <View style={styles.matchBadge}>
              <Text style={styles.matchBadgeText}>✓ PARTNER MATCHED</Text>
            </View>

            <Text style={styles.matchHeading}>Scheduled Practice Session</Text>

            <View style={styles.matchInfoBox}>
              <View style={styles.matchInfoRow}>
                <Text style={styles.matchInfoLabel}>Scheduled Time</Text>
                <Text style={styles.matchInfoValue}>
                  {new Date(upcomingMatch.startsAt).toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </View>

              <View style={styles.matchInfoRow}>
                <Text style={styles.matchInfoLabel}>Interview Scenario</Text>
                <Text style={styles.matchInfoValue}>{upcomingMatch.scenario.title}</Text>
              </View>

              <View style={styles.matchInfoRow}>
                <Text style={styles.matchInfoLabel}>Your Assigned Role</Text>
                <Text style={styles.matchInfoValue}>
                  {upcomingMatch.role === "A"
                    ? "Learner A (Answers First)"
                    : "Learner B (Interviews First)"}
                </Text>
              </View>

              <View style={styles.matchInfoRow}>
                <Text style={styles.matchInfoLabel}>Duration</Text>
                <Text style={styles.matchInfoValue}>15 Minutes Structured</Text>
              </View>
            </View>

            {canJoinNow(upcomingMatch.startsAt) ? (
              <TouchableOpacity
                style={styles.joinButton}
                onPress={() => router.push(`/(peer)/session?matchId=${upcomingMatch.id}` as never)}
              >
                <Text style={styles.joinButtonText}>🎙️ Join Practice Call Now</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.waitingWindowBox}>
                <Text style={styles.waitingWindowText}>
                  Join button opens 5 minutes before scheduled start time.
                </Text>
              </View>
            )}
          </View>
        ) : pendingAvailability ? (
          /* WAITING FOR MATCH STATE */
          <View style={styles.waitingCard}>
            <ActivityIndicator size="small" color="#4F46E5" style={{ marginBottom: 8 }} />
            <Text style={styles.waitingTitle}>Looking for a Practice Partner...</Text>
            <Text style={styles.waitingSubtitle}>
              You reserved the slot for:{"\n"}
              <Text style={{ fontWeight: "700", color: "#1F2937" }}>
                {new Date(pendingAvailability.startsAt).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            </Text>
            <Text style={styles.waitingHint}>
              We are pairing you with an available learner at a similar level. Pull down to refresh or check back closer to start time.
            </Text>

            <TouchableOpacity
              style={styles.cancelAvailabilityButton}
              onPress={handleCancelAvailability}
              disabled={bookingInProgress}
            >
              <Text style={styles.cancelAvailabilityText}>Cancel Reservation</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* SLOT SELECTION STATE */
          <View style={styles.bookingSection}>
            <Text style={styles.sectionHeading}>Select an Upcoming Practice Slot</Text>
            <Text style={styles.sectionSubheading}>
              Fixed 15-minute evening slots scheduled for closed-beta learners:
            </Text>

            <View style={styles.slotsGrid}>
              {slots.map((slot) => {
                const isSelected = selectedSlot === slot.startAt;
                const slotDate = new Date(slot.startAt);
                const formattedDay = slotDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                const formattedTime = slotDate.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                });

                return (
                  <TouchableOpacity
                    key={slot.startAt}
                    style={[styles.slotItem, isSelected && styles.slotItemSelected]}
                    onPress={() => setSelectedSlot(slot.startAt)}
                  >
                    <Text style={[styles.slotDay, isSelected && styles.slotTextSelected]}>
                      {formattedDay}
                    </Text>
                    <Text style={[styles.slotTime, isSelected && styles.slotTextSelected]}>
                      {formattedTime}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 18+ Eligibility Acknowledgement */}
            <TouchableOpacity
              style={styles.adultConfirmRow}
              onPress={() => setIsAdultConfirmed(!isAdultConfirmed)}
            >
              <Text style={styles.checkboxText}>{isAdultConfirmed ? "☑" : "☐"}</Text>
              <Text style={styles.adultConfirmText}>
                I confirm I am 18 years or older and agree to respectful peer conduct.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!selectedSlot || !isAdultConfirmed || bookingInProgress) && styles.disabledButton,
              ]}
              disabled={!selectedSlot || !isAdultConfirmed || bookingInProgress}
              onPress={handleBookSlot}
            >
              {bookingInProgress ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Reserve Practice Slot</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Structured Agenda Card */}
        <View style={styles.agendaCard}>
          <Text style={styles.agendaHeader}>15-Minute Session Structure</Text>
          <View style={styles.agendaItem}>
            <Text style={styles.agendaTime}>00:00–01:00</Text>
            <Text style={styles.agendaDesc}>Quick introductions and greeting (1 min)</Text>
          </View>
          <View style={styles.agendaItem}>
            <Text style={styles.agendaTime}>01:00–07:00</Text>
            <Text style={styles.agendaDesc}>Learner A answers; Learner B acts as interviewer (6 min)</Text>
          </View>
          <View style={styles.agendaItem}>
            <Text style={styles.agendaTime}>07:00–13:00</Text>
            <Text style={styles.agendaDesc}>Learner B answers; Learner A acts as interviewer (6 min)</Text>
          </View>
          <View style={styles.agendaItem}>
            <Text style={styles.agendaTime}>13:00–15:00</Text>
            <Text style={styles.agendaDesc}>Wrap-up and private self-reflection (2 min)</Text>
          </View>
        </View>
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
    marginBottom: 16,
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
  bannerCard: {
    backgroundColor: "#EEF2FF",
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#3730A3",
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4338CA",
  },
  errorAlert: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorAlertText: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "500",
  },
  matchCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    marginBottom: 20,
  },
  matchBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  matchBadgeText: {
    color: "#059669",
    fontWeight: "800",
    fontSize: 11,
  },
  matchHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
  },
  matchInfoBox: {
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 12,
    gap: 10,
    marginBottom: 16,
  },
  matchInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  matchInfoLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  matchInfoValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2937",
    maxWidth: "60%",
    textAlign: "right",
  },
  joinButton: {
    backgroundColor: "#059669",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  waitingWindowBox: {
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  waitingWindowText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  waitingCard: {
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    marginBottom: 20,
  },
  waitingTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  waitingSubtitle: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 10,
  },
  waitingHint: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 16,
  },
  cancelAvailabilityButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
  },
  cancelAvailabilityText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
  },
  bookingSection: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  sectionSubheading: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 14,
    lineHeight: 18,
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  slotItem: {
    width: "48%",
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  slotItemSelected: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4F46E5",
  },
  slotDay: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 2,
  },
  slotTime: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1F2937",
  },
  slotTextSelected: {
    color: "#4F46E5",
  },
  adultConfirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  checkboxText: {
    fontSize: 18,
    color: "#4F46E5",
  },
  adultConfirmText: {
    flex: 1,
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 16,
  },
  primaryButton: {
    backgroundColor: "#4F46E5",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  disabledButton: {
    backgroundColor: "#A5B4FC",
  },
  agendaCard: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  agendaHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  agendaItem: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  agendaTime: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4F46E5",
    width: 90,
  },
  agendaDesc: {
    flex: 1,
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 16,
  },
});
