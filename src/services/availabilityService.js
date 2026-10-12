const { getZonedParts, zonedTimeToUtc, parseTimeOfDay } = require('../utils/timezone');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 62;

/**
 * Expands a resource's recurring weekly opening hours into concrete bookable
 * slots between `from` (inclusive) and `to` (exclusive).
 *
 * A resource with no `openingHours` is treated as open around the clock, so
 * availability is still enumerable and any slot start stays bookable.
 *
 * Slot starts are resolved per-day from wall-clock time in the resource's own
 * timezone, which is what makes "Mondays 09:00" keep meaning 09:00 locally
 * across a DST change rather than drifting to 08:00 or 10:00.
 */
function generateSlots(resource, from, to) {
  const durationMs = resource.durationMinutes * 60_000;
  const timeZone = resource.timezone || 'UTC';
  const windows = normalizeOpeningHours(resource.openingHours);

  const slots = [];
  const firstDay = getZonedParts(from, timeZone);

  // UTC midnight of each civil date, used purely as a calendar counter — UTC
  // has no DST, so adding 24h always lands on the next calendar day.
  let calendarCursor = Date.UTC(firstDay.year, firstDay.month - 1, firstDay.day);
  const dayLimit = Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY) + 2;

  for (let dayIndex = 0; dayIndex < dayLimit; dayIndex += 1) {
    const cursor = new Date(calendarCursor);
    const civilDate = {
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
    };
    const dayOfWeek = cursor.getUTCDay();

    for (const window of windows) {
      if (window.dayOfWeek !== dayOfWeek) continue;

      for (let minute = window.startMinute; minute + resource.durationMinutes <= window.endMinute; minute += resource.durationMinutes) {
        const start = zonedTimeToUtc(
          { ...civilDate, hour: Math.floor(minute / 60), minute: minute % 60 },
          timeZone
        );
        if (start < from || start >= to) continue;
        slots.push({ start, end: new Date(start.getTime() + durationMs) });
      }
    }

    calendarCursor += MS_PER_DAY;
  }

  slots.sort((a, b) => a.start - b.start);
  return slots;
}

/**
 * True if `date` is the start of one of the resource's bookable slots.
 * Resources without opening hours accept any start time.
 */
function isBookableSlotStart(resource, date) {
  if (!resource.openingHours || resource.openingHours.length === 0) return true;

  // One slot-length window on either side is enough to catch the candidate.
  const padding = resource.durationMinutes * 60_000;
  const from = new Date(date.getTime() - padding);
  const to = new Date(date.getTime() + padding);

  return generateSlots(resource, from, to).some((slot) => slot.start.getTime() === date.getTime());
}

/** Drops malformed or empty windows and converts "HH:MM" to minutes. */
function normalizeOpeningHours(openingHours) {
  if (!openingHours || openingHours.length === 0) {
    // Open 24/7.
    return Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      startMinute: 0,
      endMinute: 24 * 60,
    }));
  }

  return openingHours
    .map((window) => ({
      dayOfWeek: window.dayOfWeek,
      startMinute: parseTimeOfDay(window.start),
      endMinute: parseTimeOfDay(window.end),
    }))
    .filter(
      (window) =>
        window.startMinute !== null &&
        window.endMinute !== null &&
        // Windows that don't advance (or wrap past midnight) have no slots;
        // an overnight window should be stored as two same-day windows.
        window.endMinute > window.startMinute
    );
}

module.exports = { generateSlots, isBookableSlotStart, MAX_RANGE_DAYS };
