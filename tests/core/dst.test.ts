import { describe, it, expect } from 'vitest';
import { BUILTIN_PROFILES } from '../../src/core/profiles';
import { computeActiveWindow, getZonedParts } from '../../src/core/calendar';

describe('DST Resilience with Explicit IANA Timezones', () => {
  const profile = BUILTIN_PROFILES['regular']!; // active window 09:00 to 02:00

  it('correctly calculates active window in Europe/Berlin on spring-forward day (2026-03-29)', () => {
    const tz = 'Europe/Berlin';

    // 2026-03-29 09:30:00 local time in Berlin
    // On this day at 02:00 clocks jump to 03:00 (UTC+1 -> UTC+2).
    // Local 09:00 Berlin is 07:00 UTC.
    const morningMs = Date.UTC(2026, 2, 29, 7, 30, 0); // 09:30 Berlin

    const parts = getZonedParts(morningMs, tz);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(3);
    expect(parts.day).toBe(29);
    expect(parts.hour).toBe(9);
    expect(parts.minute).toBe(30);

    const win = computeActiveWindow(morningMs, profile, undefined, tz);
    expect(win).not.toBeNull();

    // Start must be exactly 09:00:00 in Berlin (07:00 UTC)
    const startParts = getZonedParts(win!.windowStartMs, tz);
    expect(startParts.hour).toBe(9);
    expect(startParts.minute).toBe(0);
    expect(win!.windowStartMs).toBe(Date.UTC(2026, 2, 29, 7, 0, 0));

    // End must be exactly 02:00:00 next day (2026-03-30) in Berlin (00:00 UTC)
    const endParts = getZonedParts(win!.windowEndMs, tz);
    expect(endParts.day).toBe(30);
    expect(endParts.hour).toBe(2);
    expect(endParts.minute).toBe(0);
    expect(win!.windowEndMs).toBe(Date.UTC(2026, 2, 30, 0, 0, 0));

    // CONFIRM NAIVE LOGIC FAILS:
    // Naive addition of 24h to previous day's start (2026-03-28 09:00 Berlin was 08:00 UTC):
    const prevDayStartMs = Date.UTC(2026, 2, 28, 8, 0, 0);
    const naiveNextDayStartMs = prevDayStartMs + 24 * 3600 * 1000; // 08:00 UTC on March 29
    // In Berlin, 08:00 UTC is 10:00:00 CEST (1 hour late!)
    const naiveParts = getZonedParts(naiveNextDayStartMs, tz);
    expect(naiveParts.hour).toBe(10); // Demonstrates naive arithmetic failure
    expect(win!.windowStartMs).not.toBe(naiveNextDayStartMs);
    expect(naiveNextDayStartMs - win!.windowStartMs).toBe(3600 * 1000); // exactly 1 hour error
  });

  it('correctly calculates active window in Europe/Berlin on fall-back day (2026-10-25)', () => {
    const tz = 'Europe/Berlin';

    // 2026-10-25 (clocks jump back from 03:00 to 02:00, UTC+2 -> UTC+1).
    // Local 09:00 Berlin is 08:00 UTC.
    const morningMs = Date.UTC(2026, 9, 25, 8, 0, 0);

    const win = computeActiveWindow(morningMs, profile, undefined, tz);
    expect(win).not.toBeNull();

    const startParts = getZonedParts(win!.windowStartMs, tz);
    expect(startParts.hour).toBe(9);
    expect(startParts.minute).toBe(0);
    expect(win!.windowStartMs).toBe(Date.UTC(2026, 9, 25, 8, 0, 0));

    // Confirm naive 24h addition to previous day (Oct 24 09:00 CEST was 07:00 UTC) fails:
    const prevDayStartMs = Date.UTC(2026, 9, 24, 7, 0, 0);
    const naiveNextDayStartMs = prevDayStartMs + 24 * 3600 * 1000; // 07:00 UTC on Oct 25
    // In Berlin, 07:00 UTC is 08:00 CET (1 hour too early!)
    const naiveParts = getZonedParts(naiveNextDayStartMs, tz);
    expect(naiveParts.hour).toBe(8);
    expect(win!.windowStartMs).not.toBe(naiveNextDayStartMs);
    expect(win!.windowStartMs - naiveNextDayStartMs).toBe(3600 * 1000);
  });

  it('correctly calculates active window in America/New_York on spring-forward (2026-03-08) and fall-back (2026-11-01)', () => {
    const tz = 'America/New_York';

    // Spring forward: 2026-03-08 (UTC-5 -> UTC-4). 09:00 NY is 13:00 UTC.
    const springMs = Date.UTC(2026, 2, 8, 14, 0, 0);
    const springWin = computeActiveWindow(springMs, profile, undefined, tz);
    expect(springWin).not.toBeNull();
    const springParts = getZonedParts(springWin!.windowStartMs, tz);
    expect(springParts.hour).toBe(9);
    expect(springParts.minute).toBe(0);
    expect(springWin!.windowStartMs).toBe(Date.UTC(2026, 2, 8, 13, 0, 0));

    // Fall back: 2026-11-01 (UTC-4 -> UTC-5). 09:00 NY is 14:00 UTC.
    const fallMs = Date.UTC(2026, 10, 1, 15, 0, 0);
    const fallWin = computeActiveWindow(fallMs, profile, undefined, tz);
    expect(fallWin).not.toBeNull();
    const fallParts = getZonedParts(fallWin!.windowStartMs, tz);
    expect(fallParts.hour).toBe(9);
    expect(fallParts.minute).toBe(0);
    expect(fallWin!.windowStartMs).toBe(Date.UTC(2026, 10, 1, 14, 0, 0));
  });
});

