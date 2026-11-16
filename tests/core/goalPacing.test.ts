import { describe, it, expect } from 'vitest';
import { BUILTIN_PROFILES } from '../../src/core/profiles';
import {
  calculateEffectiveHours,
  calculateRemainingHours,
  shouldResetBaseline,
  calculateGoalPacing,
  countCalendarDaysBetween,
  addCalendarDays
} from '../../src/core/goalPacing';
import { CatchUpGoal } from '../../src/shared/models';
import { getZonedParts } from '../../src/core/calendar';

describe('Goal Pacing Engine (Clarifications 1, 2, 4)', () => {
  const regularProfile = BUILTIN_PROFILES['regular']!; // 12h cap
  const casualProfile = BUILTIN_PROFILES['casual']!;   // 4h cap
  const grinderProfile = BUILTIN_PROFILES['grinder']!; // 16h cap
  const allProfiles = [regularProfile, casualProfile, grinderProfile];

  const nowMs = Date.UTC(2026, 10, 14, 12, 0, 0); // 2026-11-14 12:00:00 UTC

  it('calculates effective hours and remaining correctly with API key and without API key', () => {
    // 1. With Steam Web API sync
    const goalWithSteam: CatchUpGoal = {
      id: 'g1',
      appId: 3513350,
      targetHours: 100,
      targetDate: '2026-11-20',
      createdAtUtc: nowMs,
      lastSyncedSteamHours: 40.0,
      lastSyncUtc: nowMs,
      status: 'ACTIVE'
    };

    // 2 hours (7200 seconds) credited since last sync
    const effective1 = calculateEffectiveHours(goalWithSteam, 7200);
    expect(effective1).toBe(42.0);

    const remaining1 = calculateRemainingHours(goalWithSteam, 7200);
    expect(remaining1).toBe(58.0); // 100 - (40 + 2) = 58

    // 2. Without API key (manual starting hours)
    const goalManual: CatchUpGoal = {
      id: 'g2',
      appId: 3513350,
      targetHours: 100,
      targetDate: '2026-11-20',
      createdAtUtc: nowMs,
      manualStartingHours: 50.0,
      status: 'ACTIVE'
    };

    // 5.5 hours (19800 seconds) credited since creation
    const effective2 = calculateEffectiveHours(goalManual, 19800);
    expect(effective2).toBe(55.5);

    const remaining2 = calculateRemainingHours(goalManual, 19800);
    expect(remaining2).toBe(44.5);
  });

  describe('Clarification 1: Steam Reading Lag, Jump-up, and Offline Tests', () => {
    it('handles a Steam reading that lags: HF credited hours count, remaining decreases smoothly without jumping', () => {
      const goal: CatchUpGoal = {
        id: 'g-lag',
        appId: 3513350,
        targetHours: 100,
        targetDate: '2026-11-20',
        createdAtUtc: nowMs,
        lastSyncedSteamHours: 20.0,
        lastSyncUtc: nowMs,
        status: 'ACTIVE'
      };

      // User plays 3 hours in HourForge. Session finishes 10 minutes ago.
      const sessionEndUtc = nowMs + 3 * 3600 * 1000;
      const checkTimeUtc = sessionEndUtc + 10 * 60 * 1000; // only 10m idle (< 30m)

      // Baseline should NOT reset because track has been idle < 30 minutes!
      const canReset = shouldResetBaseline(sessionEndUtc, false, checkTimeUtc);
      expect(canReset).toBe(false);

      // Steam still reports old 20.0 hours (lagging).
      // HF credited hours = 3.0h (10800s).
      const remainingDuringLag = calculateRemainingHours(goal, 10800);
      expect(remainingDuringLag).toBe(77.0); // 100 - (20 + 3) = 77
    });

    it('handles a Steam reading that jumps up after track idle >= 30m without double counting', () => {
      const goal: CatchUpGoal = {
        id: 'g-jump',
        appId: 3513350,
        targetHours: 100,
        targetDate: '2026-11-20',
        createdAtUtc: nowMs,
        lastSyncedSteamHours: 20.0,
        lastSyncUtc: nowMs,
        status: 'ACTIVE'
      };

      // Session finished 35 minutes ago (> 30m idle)
      const sessionEndUtc = nowMs + 3 * 3600 * 1000;
      const checkTimeUtc = sessionEndUtc + 35 * 60 * 1000;

      const canReset = shouldResetBaseline(sessionEndUtc, false, checkTimeUtc);
      expect(canReset).toBe(true);

      // Fresh reading from Steam arrives: 23.0h (Steam caught up)
      const freshSteamHours = 23.0;

      // When reset occurs: lastSyncedSteamHours becomes 23.0, creditedSinceSync resets to 0
      goal.lastSyncedSteamHours = freshSteamHours;
      goal.lastSyncUtc = checkTimeUtc;

      const remainingAfterReset = calculateRemainingHours(goal, 0);
      expect(remainingAfterReset).toBe(77.0); // exactly matches remainingDuringLag! No double counting!
    });

    it('handles a day where Steam is offline: retains last synced baseline and paces reliably', () => {
      const goal: CatchUpGoal = {
        id: 'g-offline',
        appId: 3513350,
        targetHours: 100,
        targetDate: '2026-11-20',
        createdAtUtc: nowMs,
        lastSyncedSteamHours: 25.0, // cached from previous day
        lastSyncUtc: nowMs,
        status: 'ACTIVE'
      };

      // Today Steam API is offline. HourForge credits 4 hours of playtime.
      const pacing = calculateGoalPacing({
        goal,
        creditedSinceSyncSeconds: 4 * 3600, // 4 hours credited locally
        activeProfile: regularProfile,
        nowUtc: nowMs + 24 * 3600 * 1000,
        timeZone: 'Asia/Kolkata'
      });

      expect(pacing.currentEffectiveHours).toBe(29.0); // 25 + 4
      expect(pacing.remainingHours).toBe(71.0);        // 100 - 29
      expect(pacing.isFeasible).toBe(true);
    });
  });

  describe('Clarification 2: Feasibility & Daily Cap Enforcement', () => {
    it('marks feasible when required daily hours <= profile daily cap', () => {
      const goal: CatchUpGoal = {
        id: 'g-feasible',
        appId: 3513350,
        targetHours: 50,
        targetDate: '2026-11-18', // 5 days from Nov 14 (14, 15, 16, 17, 18)
        createdAtUtc: nowMs,
        lastSyncedSteamHours: 10,
        lastSyncUtc: nowMs,
        status: 'ACTIVE'
      };

      // Remaining = 40h across 5 days = 8.0h/day.
      // Regular profile daily cap is 12h -> feasible!
      const pacing = calculateGoalPacing({
        goal,
        creditedSinceSyncSeconds: 0,
        activeProfile: regularProfile,
        allProfiles,
        nowUtc: nowMs,
        timeZone: 'Asia/Kolkata'
      });

      expect(pacing.isFeasible).toBe(true);
      expect(pacing.remainingHours).toBe(40);
      expect(pacing.daysRemaining).toBe(5);
      expect(pacing.requiredDailyHours).toBe(8.0);
    });

    it('never raises daily cap silently: reports unfeasible, earliest feasible date, and profile recommendations', () => {
      const goal: CatchUpGoal = {
        id: 'g-unfeasible',
        appId: 3513350,
        targetHours: 100,
        targetDate: '2026-11-16', // 3 days (14, 15, 16)
        createdAtUtc: nowMs,
        lastSyncedSteamHours: 10,
        lastSyncUtc: nowMs,
        status: 'ACTIVE'
      };

      // Remaining = 90h across 3 days = 30.0h/day!
      // Regular cap is 12h. Casual is 4h. Grinder is 16h.
      const pacing = calculateGoalPacing({
        goal,
        creditedSinceSyncSeconds: 0,
        activeProfile: regularProfile,
        allProfiles,
        nowUtc: nowMs,
        timeZone: 'Asia/Kolkata'
      });

      expect(pacing.isFeasible).toBe(false);
      expect(pacing.requiredDailyHours).toBe(30.0);
      expect(pacing.profileDailyCapHours).toBe(12);

      // Earliest feasible date with 12h cap:
      // Math.ceil(90 / 12) = 8 days -> Nov 14 + 8 days = Nov 22
      expect(pacing.earliestFeasibleDate).toBe('2026-11-22');

      // Test with an attainable but demanding target: 28h remaining in 2 days (14h/day)
      const goalAttainableOnGrinder: CatchUpGoal = {
        id: 'g-grinder',
        appId: 3513350,
        targetHours: 38,
        targetDate: '2026-11-15', // 2 days (14, 15)
        createdAtUtc: nowMs,
        lastSyncedSteamHours: 10,
        lastSyncUtc: nowMs,
        status: 'ACTIVE'
      };

      // 28h in 2 days = 14h/day.
      // Regular cap is 12h (not feasible).
      // Grinder cap is 16h (feasible!).
      const pacingGrinder = calculateGoalPacing({
        goal: goalAttainableOnGrinder,
        creditedSinceSyncSeconds: 0,
        activeProfile: regularProfile,
        allProfiles,
        nowUtc: nowMs,
        timeZone: 'Asia/Kolkata'
      });

      expect(pacingGrinder.isFeasible).toBe(false);
      expect(pacingGrinder.requiredDailyHours).toBe(14.0);
      // Recommends Grinder profile (16h cap)
      expect(pacingGrinder.recommendedProfiles.some(p => p.id === 'grinder')).toBe(true);
      expect(pacingGrinder.recommendedDailyHours).toBe(14.0);
    });
  });

  describe('Clarification 4: IANA Timezones and Missed Deadlines', () => {
    it('calculates calendar days and day boundaries in Asia/Kolkata (UTC+5:30)', () => {
      const tz = 'Asia/Kolkata';

      // 2026-11-14 20:00:00 UTC = 2026-11-15 01:30:00 in Kolkata (crossed into next day!)
      const lateUtc = Date.UTC(2026, 10, 14, 20, 0, 0);
      const partsKolkata = getZonedParts(lateUtc, tz);
      expect(partsKolkata.year).toBe(2026);
      expect(partsKolkata.month).toBe(11);
      expect(partsKolkata.day).toBe(15); // It is already Nov 15 in Kolkata!

      const goal: CatchUpGoal = {
        id: 'g-kolkata',
        appId: 3513350,
        targetHours: 50,
        targetDate: '2026-11-16',
        createdAtUtc: lateUtc,
        lastSyncedSteamHours: 20,
        status: 'ACTIVE'
      };

      // From Nov 15 to Nov 16 = 2 days in Kolkata
      const pacing = calculateGoalPacing({
        goal,
        creditedSinceSyncSeconds: 0,
        activeProfile: regularProfile,
        nowUtc: lateUtc,
        timeZone: tz
      });

      expect(pacing.daysRemaining).toBe(2);
      expect(pacing.remainingHours).toBe(30);
      expect(pacing.requiredDailyHours).toBe(15.0);
    });

    it('calculates calendar days correctly across DST transitions in America/New_York', () => {
      const tz = 'America/New_York';

      // Spring-forward weekend: 2026-03-07 to 2026-03-09 (March 8 has 23 hours!)
      const springStartUtc = Date.UTC(2026, 2, 7, 17, 0, 0); // 12:00 local NYC on Mar 7
      const springParts = getZonedParts(springStartUtc, tz);
      expect(springParts.day).toBe(7);

      // Target date: March 9
      const days = countCalendarDaysBetween(springParts, { year: 2026, month: 3, day: 9 });
      expect(days).toBe(3); // Exactly 3 calendar days (7, 8, 9) regardless of 23-hour DST day!

      // Fall-back weekend: 2026-10-31 to 2026-11-02 (Nov 1 has 25 hours!)
      const fallStartUtc = Date.UTC(2026, 9, 31, 16, 0, 0); // 12:00 local NYC on Oct 31
      const fallParts = getZonedParts(fallStartUtc, tz);
      expect(fallParts.day).toBe(31);

      const daysFall = countCalendarDaysBetween(fallParts, { year: 2026, month: 11, day: 2 });
      expect(daysFall).toBe(3); // Exactly 3 calendar days (Oct 31, Nov 1, Nov 2) regardless of 25-hour day!

      // Direct unit test of addCalendarDays
      const addedDate = addCalendarDays(fallParts, 5, tz);
      expect(addedDate).toBe('2026-11-05');
    });

    it('handles goal deadline that passed while PC was off: marks MISSED_DEADLINE and calculates earliest feasible date without crashing', () => {
      // Goal deadline was Nov 10, 2026. PC is turned on on Nov 14, 2026.
      const goalExpired: CatchUpGoal = {
        id: 'g-expired',
        appId: 3513350,
        targetHours: 100,
        targetDate: '2026-11-10', // Past deadline!
        createdAtUtc: Date.UTC(2026, 10, 1, 0, 0, 0),
        lastSyncedSteamHours: 60,
        status: 'ACTIVE'
      };

      const pacing = calculateGoalPacing({
        goal: goalExpired,
        creditedSinceSyncSeconds: 0,
        activeProfile: regularProfile,
        allProfiles,
        nowUtc: nowMs, // Nov 14
        timeZone: 'Asia/Kolkata'
      });

      expect(pacing.status).toBe('MISSED_DEADLINE');
      expect(pacing.daysRemaining).toBe(0);
      expect(pacing.isFeasible).toBe(false);
      expect(pacing.remainingHours).toBe(40); // 100 - 60 = 40 hours remaining

      // Earliest feasible date computed starting from today (Nov 14) + ceil(40 / 12) = 4 days -> Nov 18
      expect(pacing.earliestFeasibleDate).toBe('2026-11-18');
    });
  });
});
