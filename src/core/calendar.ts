import { PRNG } from './rng';
import { HumanProfile } from './types';

export interface LocalTimeWindow {
  windowStartMs: number;
  windowEndMs: number;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0 = Sun, 6 = Sat
}

/**
 * Extracts date/time parts for a timestamp in the given IANA timezone (or host local time).
 */
export function getZonedParts(timestampMs: number, timeZone?: string): ZonedParts {
  if (!timeZone) {
    const d = new Date(timestampMs);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      second: d.getSeconds(),
      dayOfWeek: d.getDay()
    };
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false
  });

  const parts = dtf.formatToParts(new Date(timestampMs));
  const mapping: Record<string, string> = {};
  for (const p of parts) mapping[p.type] = p.value;

  let hour = parseInt(mapping.hour || '0', 10);
  if (hour === 24) hour = 0;

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
  };

  return {
    year: parseInt(mapping.year || '0', 10),
    month: parseInt(mapping.month || '0', 10),
    day: parseInt(mapping.day || '0', 10),
    hour,
    minute: parseInt(mapping.minute || '0', 10),
    second: parseInt(mapping.second || '0', 10),
    dayOfWeek: weekdayMap[mapping.weekday || 'Sun'] ?? 0
  };
}

/**
 * Converts a specific local date/time in an IANA timezone into its exact UTC epoch milliseconds.
 * Iteratively adjusts for timezone offset to remain exact across DST transitions.
 */
export function zonedTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
  timeZone?: string
): number {
  if (!timeZone) {
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  }

  // Initial UTC guess
  let guessMs = Date.UTC(year, month - 1, day, hour, minute, second);

  // Iterative alignment against Intl formatted time
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(guessMs, timeZone);
    const targetMinutes = (day * 24 + hour) * 60 + minute;
    const guessMinutes = (parts.day * 24 + parts.hour) * 60 + parts.minute;
    const diffMinutes = targetMinutes - guessMinutes;
    if (diffMinutes === 0) break;
    guessMs += diffMinutes * 60 * 1000;
  }

  return guessMs;
}

/**
 * Parses "HH:mm" local string into hours and minutes.
 */
export function parseLocalTime(hhmm: string): { hours: number; minutes: number } {
  const parts = hhmm.split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  return { hours, minutes };
}

/**
 * Checks if a given timestamp (ms) falls on a weekend in the target timezone.
 */
export function isLocalWeekend(timestampMs: number, timeZone?: string): boolean {
  const parts = getZonedParts(timestampMs, timeZone);
  return parts.dayOfWeek === 0 || parts.dayOfWeek === 6;
}

/**
 * Computes the active window for the date containing `timestampMs` in the target timezone.
 * Handles windows that wrap past midnight (e.g. 09:00 to 02:00) and daylight saving transitions.
 */
export function computeActiveWindow(
  timestampMs: number,
  profile: HumanProfile,
  rng?: PRNG,
  timeZone?: string
): LocalTimeWindow | null {
  if (!profile.activeWindow) {
    return null;
  }

  const { start, end, edgeJitterMin } = profile.activeWindow;
  const startTime = parseLocalTime(start);
  const endTime = parseLocalTime(end);

  const parts = getZonedParts(timestampMs, timeZone);

  // Candidate window on this calendar day
  let startMs = zonedTimeToUtcMs(
    parts.year,
    parts.month,
    parts.day,
    startTime.hours,
    startTime.minutes,
    0,
    timeZone
  );

  let endMs: number;
  const wrapsMidnight =
    endTime.hours < startTime.hours ||
    (endTime.hours === startTime.hours && endTime.minutes <= startTime.minutes);

  if (wrapsMidnight) {
    // Window ends on the following calendar day in this timezone
    // Add 24h to guess date parts of next day
    const nextDayParts = getZonedParts(startMs + 28 * 3600 * 1000, timeZone);
    endMs = zonedTimeToUtcMs(
      nextDayParts.year,
      nextDayParts.month,
      nextDayParts.day,
      endTime.hours,
      endTime.minutes,
      0,
      timeZone
    );
  } else {
    endMs = zonedTimeToUtcMs(
      parts.year,
      parts.month,
      parts.day,
      endTime.hours,
      endTime.minutes,
      0,
      timeZone
    );
  }

  // If timestamp is before this window's start, check if it fell into yesterday's wrapped window
  if (timestampMs < startMs && wrapsMidnight) {
    const prevDayParts = getZonedParts(startMs - 12 * 3600 * 1000, timeZone);
    const prevStartMs = zonedTimeToUtcMs(
      prevDayParts.year,
      prevDayParts.month,
      prevDayParts.day,
      startTime.hours,
      startTime.minutes,
      0,
      timeZone
    );
    const prevEndMs = zonedTimeToUtcMs(
      parts.year,
      parts.month,
      parts.day,
      endTime.hours,
      endTime.minutes,
      0,
      timeZone
    );

    const maxJitterMs = (profile.activeWindow?.edgeJitterMin ?? 0) * 60 * 1000;
    if (timestampMs >= prevStartMs - maxJitterMs && timestampMs <= prevEndMs + maxJitterMs) {
      startMs = prevStartMs;
      endMs = prevEndMs;
    }
  }

  // Apply edge jitter to both start and end if PRNG provided (Section 7.5)
  if (rng && edgeJitterMin > 0) {
    const startJitterSec = rng.nextInt(-edgeJitterMin * 60, edgeJitterMin * 60);
    const endJitterSec = rng.nextInt(-edgeJitterMin * 60, edgeJitterMin * 60);
    startMs += startJitterSec * 1000;
    endMs += endJitterSec * 1000;
  }

  return { windowStartMs: startMs, windowEndMs: endMs };
}

/**
 * Computes the timestamp of the next day boundary (default 05:00) in the target timezone.
 */
export function getNextDayBoundaryMs(
  timestampMs: number,
  boundaryHour = 5,
  boundaryMinute = 0,
  timeZone?: string
): number {
  const parts = getZonedParts(timestampMs, timeZone);
  const boundaryTodayMs = zonedTimeToUtcMs(
    parts.year,
    parts.month,
    parts.day,
    boundaryHour,
    boundaryMinute,
    0,
    timeZone
  );

  if (timestampMs < boundaryTodayMs) {
    return boundaryTodayMs;
  }

  // Find next calendar day
  const nextParts = getZonedParts(boundaryTodayMs + 28 * 3600 * 1000, timeZone);
  return zonedTimeToUtcMs(
    nextParts.year,
    nextParts.month,
    nextParts.day,
    boundaryHour,
    boundaryMinute,
    0,
    timeZone
  );
}
