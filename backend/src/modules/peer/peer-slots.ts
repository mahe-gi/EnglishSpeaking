export interface PeerSlot {
  startAt: string;
  durationMinutes: number;
}

// Fixed IST evening slot hours: 18:00, 19:00, 20:00, 21:00 IST
// In UTC offsets (IST is UTC+5:30):
// 18:00 IST -> 12:30 UTC
// 19:00 IST -> 13:30 UTC
// 20:00 IST -> 14:30 UTC
// 21:00 IST -> 15:30 UTC
const IST_SLOT_HOURS_MINUTES = [
  { hour: 18, minute: 0 },
  { hour: 19, minute: 0 },
  { hour: 20, minute: 0 },
  { hour: 21, minute: 0 },
];

export function getUpcomingPeerSlots(now: Date = new Date()): PeerSlot[] {
  const slots: PeerSlot[] = [];

  // Generate slots for today and the next 3 days
  for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
    // Current IST date base
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    istDate.setDate(istDate.getDate() + dayOffset);

    const year = istDate.getUTCFullYear();
    const month = istDate.getUTCMonth();
    const date = istDate.getUTCDate();

    for (const { hour, minute } of IST_SLOT_HOURS_MINUTES) {
      // Create slot in UTC by converting from IST (subtract 5.5 hours)
      const slotUtc = new Date(Date.UTC(year, month, date, hour - 5, minute - 30, 0, 0));

      if (slotUtc.getTime() > now.getTime()) {
        slots.push({
          startAt: slotUtc.toISOString(),
          durationMinutes: 15,
        });
      }
    }
  }

  return slots;
}

export function isValidPeerSlot(startAtISO: string, now: Date = new Date()): boolean {
  const parsed = new Date(startAtISO);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return getUpcomingPeerSlots(now).some(
    (slot) => slot.startAt === parsed.toISOString()
  );
}
