import { CatchUpGoal, GoalPacingReport, GoalPaceStatus } from '../shared/models';
import { HumanProfile, SessionLogEntry } from './types';
import { getZonedParts, zonedTimeToUtcMs, ZonedParts } from './calendar';
import { createPRNG, hash32 } from './rng';

export interface GoalPacingOptions {
  goal: CatchUpGoal;
  creditedSinceSyncSeconds: number;
  activeProfile: HumanProfile;
  allProfiles?: HumanProfile[];
  nowUtc: number;
  timeZone?: string;
  runSeed?: string;
}

/**
 * Calculates current effective hours:
 * If Steam hours are synced, uses lastSyncedSteamHours + HF credited hours since that sync.
 * Otherwise falls back to manualStartingHours + HF credited hours.
 */
export function calculateEffectiveHours(
  goal: CatchUpGoal,
  creditedSinceSyncSeconds: number
): number {
  const baseHours =
    goal.lastSyncedSteamHours !== undefined
      ? goal.lastSyncedSteamHours
      : (goal.manualStartingHours || 0);

  const creditedHours = Math.max(0, creditedSinceSyncSeconds) / 3600;
  return Math.round((baseHours + creditedHours) * 100) / 100;
}

/**
 * Calculates remaining hours to reach the target:
 * remaining = target - (lastSyncedSteamHours + hourforgeCreditedHoursSinceThatSync)
 */
export function calculateRemainingHours(
  goal: CatchUpGoal,
  creditedSinceSyncSeconds: number
): number {
  const effective = calculateEffectiveHours(goal, creditedSinceSyncSeconds);
  return Math.max(0, Math.round((goal.targetHours - effective) * 100) / 100);
}

/**
 * Baseline Reset Rule (Clarification 1):
 * Reset the baseline only when a fresh Steam reading arrives after the track has been
 * idle at least 30 minutes, so lag never causes double counting or daily-quota swings.
 */
export function shouldResetBaseline(
  lastSessionEndTimeUtc: number,
  isCurrentlyPlaying: boolean,
  nowUtc: number
): boolean {
  if (isCurrentlyPlaying) {
    return false;
  }
  if (lastSessionEndTimeUtc > 0 && nowUtc - lastSessionEndTimeUtc < 30 * 60 * 1000) {
    return false;
  }
  return true;
}

/**
 * Parses YYYY-MM-DD string into year, month, day components.
 */
export function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  const parts = dateStr.trim().split('-');
  return {
    year: parseInt(parts[0] || '1970', 10),
    month: parseInt(parts[1] || '1', 10),
    day: parseInt(parts[2] || '1', 10)
  };
}

/**
 * Counts calendar days between two zoned dates inclusive of both endpoints.
 * Operates purely on calendar date indices, immune to DST 23h/25h shifts.
 */
export function countCalendarDaysBetween(start: ZonedParts, end: { year: number; month: number; day: number }): number {
  const utcStart = Date.UTC(start.year, start.month - 1, start.day);
  const utcEnd = Date.UTC(end.year, end.month - 1, end.day);
  const diffDays = Math.round((utcEnd - utcStart) / (24 * 3600 * 1000));
  return diffDays + 1;
}

/**
 * Adds integer calendar days to a zoned date in target timezone and formats as YYYY-MM-DD.
 */
export function addCalendarDays(
  start: ZonedParts,
  days: number,
  timeZone?: string
): string {
  // Use midday (12:00:00 UTC) so timestamp falls on target calendar day across all global timezones (UTC-12 to UTC+14)
  const utcMs = Date.UTC(start.year, start.month - 1, start.day + days, 12, 0, 0);
  const parts = getZonedParts(utcMs, timeZone);
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${parts.year}-${mm}-${dd}`;
}

/**
 * Computes the full pacing and feasibility report for a goal.
 */
export function calculateGoalPacing(opts: GoalPacingOptions): GoalPacingReport {
  const { goal, creditedSinceSyncSeconds, activeProfile, allProfiles = [], nowUtc, timeZone } = opts;

  const currentEffectiveHours = calculateEffectiveHours(goal, creditedSinceSyncSeconds);
  const remainingHours = calculateRemainingHours(goal, creditedSinceSyncSeconds);

  // Timezone-aware date calculations
  const todayParts = getZonedParts(nowUtc, timeZone);
  const deadlineDateParts = parseDateString(goal.targetDate);

  const deadlineUtc = zonedTimeToUtcMs(
    deadlineDateParts.year,
    deadlineDateParts.month,
    deadlineDateParts.day,
    23,
    59,
    59,
    timeZone
  );

  const profileDailyCap = activeProfile.dailyCapHours || 12;
  const todayStr = `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-${String(todayParts.day).padStart(2, '0')}`;

  // 1. Goal already reached
  if (remainingHours <= 0) {
    return {
      goalId: goal.id,
      appId: goal.appId,
      targetHours: goal.targetHours,
      targetDate: goal.targetDate,
      currentEffectiveHours,
      remainingHours: 0,
      daysRemaining: 0,
      safetyBufferDays: 1,
      requiredDailyHours: 0,
      baseDailyHours: 0,
      targetDailyHoursToday: 0,
      variationPct: 0,
      profileDailyCapHours: profileDailyCap,
      isFeasible: true,
      earliestFeasibleDate: addCalendarDays(todayParts, 0, timeZone),
      projectedFinishDate: addCalendarDays(todayParts, 0, timeZone),
      recommendedProfiles: [],
      recommendedDailyHours: 0,
      paceStatus: 'ACHIEVED',
      paceDifferenceHours: Math.round((currentEffectiveHours - goal.targetHours) * 100) / 100,
      requiredPcOnHoursPerDay: 0,
      status: 'ACHIEVED'
    };
  }

  // 2. Deadline passed while PC was off or inactive (Clarification 4)
  if (nowUtc > deadlineUtc) {
    const daysNeeded = Math.max(1, Math.ceil(remainingHours / profileDailyCap));
    const earliestDate = addCalendarDays(todayParts, daysNeeded, timeZone);

    const recommended = allProfiles
      .filter(p => (p.dailyCapHours || 0) > profileDailyCap)
      .map(p => ({ id: p.id, name: p.name, dailyCapHours: p.dailyCapHours || 0 }));

    return {
      goalId: goal.id,
      appId: goal.appId,
      targetHours: goal.targetHours,
      targetDate: goal.targetDate,
      currentEffectiveHours,
      remainingHours,
      daysRemaining: 0,
      safetyBufferDays: 1,
      requiredDailyHours: remainingHours,
      baseDailyHours: remainingHours,
      targetDailyHoursToday: Math.min(profileDailyCap, remainingHours),
      variationPct: 0,
      profileDailyCapHours: profileDailyCap,
      isFeasible: false,
      feasibilityNotice: `Goal deadline passed. Requires ${remainingHours.toFixed(1)} h total. Earliest feasible date: ${earliestDate}.`,
      earliestFeasibleDate: earliestDate,
      projectedFinishDate: earliestDate,
      recommendedProfiles: recommended,
      recommendedDailyHours: Math.min(24, Math.round((remainingHours / daysNeeded) * 10) / 10),
      paceStatus: 'MISSED_DEADLINE',
      paceDifferenceHours: -remainingHours,
      requiredPcOnHoursPerDay: Math.min(24, Math.round((profileDailyCap / 0.8) * 10) / 10),
      status: 'MISSED_DEADLINE'
    };
  }

  // 3. Goal is active: compute days remaining and pacing
  const rawDaysRemaining = countCalendarDaysBetween(todayParts, deadlineDateParts);
  const daysRemaining = Math.max(1, rawDaysRemaining);

  // 1-day safety buffer before deadline (finish 1 day early)
  const safetyBufferDays = 1;
  const pacingDaysWithBuffer = Math.max(1, daysRemaining - safetyBufferDays);
  const baseDailyHours = Math.round((remainingHours / pacingDaysWithBuffer) * 100) / 100;
  const requiredDailyHours = Math.round((remainingHours / daysRemaining) * 100) / 100;

  // ±12% deterministic daily variation for human-like pacing (seeded by runSeed + appId + today)
  const runSeedKey = `${opts.runSeed ?? 'hf_catchup_seed'}:${todayStr}`;
  const daySeed = hash32(runSeedKey, goal.appId);
  const prng = createPRNG(daySeed);
  const variationPct = Math.round((-0.12 + prng.next() * 0.24) * 1000) / 1000;

  // Today's target daily quota: base * (1 + variation), never above profile daily cap and never above remaining
  let targetDailyHoursToday = Math.round(baseDailyHours * (1 + variationPct) * 100) / 100;
  targetDailyHoursToday = Math.min(profileDailyCap, targetDailyHoursToday);
  targetDailyHoursToday = Math.min(remainingHours, targetDailyHoursToday);
  targetDailyHoursToday = Math.max(0, targetDailyHoursToday);

  // Feasibility Check (Clarification 2 & Item 4):
  // Never raise the cap silently. Feasible only if requiredDailyHours <= activeProfile.dailyCapHours.
  const isFeasible = requiredDailyHours <= profileDailyCap + 0.001;

  const daysNeededForCap = Math.max(1, Math.ceil(remainingHours / profileDailyCap));
  const earliestFeasibleDate = addCalendarDays(todayParts, daysNeededForCap, timeZone);

  // Projected finish date based on effective pacing (using safety buffer target rate)
  const effectivePace = Math.min(profileDailyCap, targetDailyHoursToday || baseDailyHours || profileDailyCap);
  const daysToFinish = Math.max(1, Math.ceil(remainingHours / (effectivePace > 0 ? effectivePace : profileDailyCap)));
  const projectedFinishDate = addCalendarDays(todayParts, daysToFinish, timeZone);

  // Recommendations: find profiles whose dailyCapHours >= requiredDailyHours
  const recommendedProfiles = allProfiles
    .filter(p => (p.dailyCapHours || 0) >= requiredDailyHours && p.id !== activeProfile.id)
    .map(p => ({ id: p.id, name: p.name, dailyCapHours: p.dailyCapHours || 0 }));

  // Required PC-on hours per day (duty cycle estimate ~80% playing during active window)
  const dutyCycle = 0.8;
  const requiredPcOnHoursPerDay = Math.min(24, Math.round((targetDailyHoursToday / dutyCycle) * 10) / 10);

  // Plain feasibility notice (Item 4: state number of hours/day needed, plainly note when far above human pattern, no lecturing)
  let feasibilityNotice: string | undefined;
  if (!isFeasible) {
    if (requiredDailyHours > 24) {
      feasibilityNotice = `Requires ${requiredDailyHours.toFixed(1)} h/day, which exceeds 24 hours in a day. Profile cap is ${profileDailyCap.toFixed(1)} h/day. Earliest feasible date under current cap: ${earliestFeasibleDate}.`;
    } else if (requiredDailyHours > 16) {
      feasibilityNotice = `Requires ${requiredDailyHours.toFixed(1)} h/day, which is far above a typical human pattern (16h+ per day). Profile cap is ${profileDailyCap.toFixed(1)} h/day. Earliest feasible date under current cap: ${earliestFeasibleDate}.`;
    } else {
      feasibilityNotice = `Requires ${requiredDailyHours.toFixed(1)} h/day, exceeding profile cap of ${profileDailyCap.toFixed(1)} h/day. Earliest feasible date: ${earliestFeasibleDate}.`;
    }
  }

  // Pace status determination (On track vs Behind by X h)
  const paceDifferenceHours = Math.round((targetDailyHoursToday - requiredDailyHours) * 100) / 100;

  let paceStatus: GoalPaceStatus = 'ON_TRACK';
  if (!isFeasible) {
    paceStatus = 'NOT_FEASIBLE';
  } else if (paceDifferenceHours <= -0.5) {
    paceStatus = 'BEHIND';
  } else if (paceDifferenceHours >= 0.5) {
    paceStatus = 'AHEAD';
  } else {
    paceStatus = 'ON_TRACK';
  }

  return {
    goalId: goal.id,
    appId: goal.appId,
    targetHours: goal.targetHours,
    targetDate: goal.targetDate,
    currentEffectiveHours,
    remainingHours,
    daysRemaining,
    safetyBufferDays,
    requiredDailyHours,
    baseDailyHours,
    targetDailyHoursToday,
    variationPct,
    profileDailyCapHours: profileDailyCap,
    isFeasible,
    feasibilityNotice,
    earliestFeasibleDate,
    projectedFinishDate,
    recommendedProfiles,
    recommendedDailyHours: Math.round(requiredDailyHours * 10) / 10,
    paceStatus,
    paceDifferenceHours,
    requiredPcOnHoursPerDay,
    status: 'ACTIVE'
  };
}

export interface PlannedVsActualDay {
  date: string;
  label: string;
  plannedHours: number;
  actualHours: number;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Calculates planned vs actual daily hours across recent days and upcoming days
 * for the dedicated Goals screen planned-vs-actual chart.
 */
export function getGoalPlannedVsActual(
  goal: CatchUpGoal,
  report: GoalPacingReport,
  sessionLogs: SessionLogEntry[],
  nowUtc: number,
  timeZone?: string
): PlannedVsActualDay[] {
  const todayParts = getZonedParts(nowUtc, timeZone);
  const result: PlannedVsActualDay[] = [];

  // 4 past days, today, and 3 future days = 8-day window
  for (let offset = -4; offset <= 3; offset++) {
    const dayStr = addCalendarDays(todayParts, offset, timeZone);
    const isToday = offset === 0;
    const isFuture = offset > 0;

    // Actual hours from sessionLogs for this game on this calendar day
    let actualSeconds = 0;
    for (const log of sessionLogs) {
      if (log.appId === goal.appId) {
        const logDateStr = addCalendarDays(getZonedParts(log.startUtc, timeZone), 0, timeZone);
        if (logDateStr === dayStr) {
          actualSeconds += log.creditedSeconds;
        }
      }
    }
    const actualHours = Math.round((actualSeconds / 3600) * 10) / 10;

    // Planned hours
    let plannedHours = 0;
    if (isToday) {
      plannedHours = report.targetDailyHoursToday;
    } else if (isFuture) {
      // Future days planned at base rate
      plannedHours = Math.min(report.profileDailyCapHours, report.baseDailyHours);
    } else {
      // Past days planned target
      plannedHours = report.baseDailyHours;
    }

    const dayMonth = dayStr.slice(5); // "MM-DD"
    result.push({
      date: dayStr,
      label: isToday ? 'Today' : dayMonth,
      plannedHours,
      actualHours,
      isToday,
      isFuture
    });
  }

  return result;
}
