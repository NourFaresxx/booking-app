// Minimal IANA-timezone arithmetic built on Intl, so opening hours can be
// stored as wall-clock times ("Mondays 09:00") without pulling in a date
// library. Node ships full ICU, so every IANA zone is available.

const partsFormatterCache = new Map();

function getFormatter(timeZone) {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock calendar/time fields for `date` as seen in `timeZone`. */
function getZonedParts(date, timeZone) {
  const fields = {};
  for (const part of getFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') fields[part.type] = part.value;
  }
  return {
    year: Number(fields.year),
    month: Number(fields.month),
    day: Number(fields.day),
    hour: Number(fields.hour) % 24, // h23 still renders midnight as 24 on some ICU builds
    minute: Number(fields.minute),
    second: Number(fields.second),
    dayOfWeek: WEEKDAY_INDEX[fields.weekday],
  };
}

/** Offset of `timeZone` from UTC, in ms, at the instant `date`. */
function getOffsetMs(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second precision on both sides so the difference is a clean offset.
  return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Converts a wall-clock time in `timeZone` to the UTC instant it refers to.
 *
 * Needs two passes: the offset itself depends on the instant we're solving
 * for, so the first guess can land on the wrong side of a DST transition.
 * Re-reading the offset at the corrected instant fixes that.
 */
function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = getOffsetMs(new Date(wallClockAsUtc), timeZone);
  const firstGuess = wallClockAsUtc - firstOffset;
  const secondOffset = getOffsetMs(new Date(firstGuess), timeZone);
  return new Date(secondOffset === firstOffset ? firstGuess : wallClockAsUtc - secondOffset);
}

/** Parses "HH:MM" into minutes since midnight, or null if malformed. */
function parseTimeOfDay(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

module.exports = {
  isValidTimeZone,
  getZonedParts,
  getOffsetMs,
  zonedTimeToUtc,
  parseTimeOfDay,
};
