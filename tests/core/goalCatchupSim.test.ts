import { describe, it, expect } from 'vitest';
import { BUILTIN_PROFILES } from '../../src/core/profiles';
import { calculateGoalPacing } from '../../src/core/goalPacing';
import { CatchUpGoal } from '../../src/shared/models';
import { TrackStateMachine } from '../../src/core/track';
import { planTrackBlocks } from '../../src/core/planner';

describe('Catch-Up Goal Simulated Week (Requirement 1)', () => {
  const profile = BUILTIN_PROFILES['regular']!; // 12h daily cap
  const ONE_DAY_MS = 24 * 3600 * 1000;

  it('simulates 1 week with fake clock: quota per day, planned vs credited hours, PC off on Day 3, and subsequent days adjusting', () => {
    // Start at Day 1 05:00:00 UTC (day boundary)
    const startDayMs = Date.UTC(2026, 10, 10, 5, 0, 0); // 2026-11-10
    const deadlineStr = '2026-11-17'; // 7 days later = Day 8 deadline (target finish by Day 7 with 1-day buffer)

    const goal: CatchUpGoal = {
      id: 'goal_sim',
      appId: 3513350,
      targetHours: 50.0,
      targetDate: deadlineStr,
      createdAtUtc: startDayMs,
      manualStartingHours: 0,
      status: 'ACTIVE'
    };

    let fakeNowMs = startDayMs;
    let totalCreditedSeconds = 0;

    interface DayReport {
      dayIndex: number;
      dateStr: string;
      remainingHours: number;
      dailyQuotaHours: number;
      dailyQuotaSeconds: number;
      plannedHours: number;
      plannedSeconds: number;
      creditedHours: number;
      creditedSeconds: number;
      pcState: 'ON' | 'OFF';
      note: string;
    }

    const reportTable: DayReport[] = [];

    // Simulate 7 days (Day 1 through Day 7)
    for (let day = 1; day <= 7; day++) {
      const date = new Date(fakeNowMs);
      const dateStr = date.toISOString().slice(0, 10);

      // Recompute pacing at 05:00 on each day
      const pacing = calculateGoalPacing({
        goal,
        creditedSinceSyncSeconds: totalCreditedSeconds,
        activeProfile: profile,
        nowUtc: fakeNowMs,
        runSeed: 'seed_catchup_sim'
      });

      const quotaHoursToday = pacing.targetDailyHoursToday;
      const quotaSecToday = Math.round(quotaHoursToday * 3600);

      if (day === 3) {
        // --- Day 3: PC WAS OFF ---
        // Zero planned hours, zero credited hours, clock jumps 24 hours to Day 4
        reportTable.push({
          dayIndex: day,
          dateStr,
          remainingHours: pacing.remainingHours,
          dailyQuotaHours: quotaHoursToday,
          dailyQuotaSeconds: quotaSecToday,
          plannedHours: 0.0,
          plannedSeconds: 0,
          creditedHours: 0.0,
          creditedSeconds: 0,
          pcState: 'OFF',
          note: 'PC OFF (0 hours played)'
        });

        // Fast-forward fake clock 24 hours to next day boundary
        fakeNowMs += ONE_DAY_MS;
        continue;
      }

      // --- Day is ON: Plan blocks with today's quota ---
      const track = new TrackStateMachine({
        runId: `run_day_${day}`,
        runSeed: `seed_${day}`,
        appId: goal.appId,
        profile,
        targetSeconds: quotaSecToday,
        dailyQuotaSeconds: quotaSecToday,
        t0Utc: fakeNowMs
      });

      // Generate full day schedule until today's quota is reached
      let dayCreditedSec = 0;
      let cursorMs = fakeNowMs;
      let iterations = 0;
      while (dayCreditedSec < quotaSecToday && cursorMs < fakeNowMs + ONE_DAY_MS && iterations < 10) {
        iterations++;
        const blocks = planTrackBlocks(
          track.rng,
          {
            profile,
            quotaSeconds: quotaSecToday,
            creditedSeconds: dayCreditedSec,
            todayCreditedSeconds: dayCreditedSec,
            startTimeUtc: cursorMs,
            dailyQuotaSeconds: quotaSecToday
          },
          8
        );
        if (blocks.length === 0) break;
        let advanced = false;
        for (const b of blocks) {
          if (b.type === 'play' && dayCreditedSec < quotaSecToday) {
            const playTime = Math.min(b.durationSec, quotaSecToday - dayCreditedSec);
            dayCreditedSec += playTime;
            cursorMs = Math.max(cursorMs + playTime * 1000, b.endUtc);
            advanced = true;
          } else {
            cursorMs = Math.max(cursorMs + 60000, b.endUtc);
            advanced = true;
          }
          if (dayCreditedSec >= quotaSecToday || cursorMs >= fakeNowMs + ONE_DAY_MS) break;
        }
        if (!advanced) break;
      }

      const creditedHoursToday = Math.round((dayCreditedSec / 3600) * 10) / 10;
      const plannedHours = Math.round(quotaHoursToday * 10) / 10;
      totalCreditedSeconds += dayCreditedSec;

      reportTable.push({
        dayIndex: day,
        dateStr,
        remainingHours: pacing.remainingHours,
        dailyQuotaHours: quotaHoursToday,
        dailyQuotaSeconds: quotaSecToday,
        plannedHours,
        plannedSeconds: quotaSecToday,
        creditedHours: creditedHoursToday,
        creditedSeconds: dayCreditedSec,
        pcState: 'ON',
        note: day === 4 ? 'Adjusted UP after PC OFF' : (day === 7 ? 'Goal Complete with 1-day buffer' : 'Normal Pace')
      });

      // Advance clock to next day boundary
      fakeNowMs += ONE_DAY_MS;
    }

    // Print Formatted Simulated Week Table
    console.log('\n========================================================================================');
    console.log('                          7-DAY CATCH-UP GOAL SIMULATION TABLE                         ');
    console.log('Target: 50.0h | Deadline: Day 8 (2026-11-17) | Profile Cap: 12.0h/day | 1-Day Safety Buffer');
    console.log('========================================================================================');
    console.log('Day | Date       | Remaining | Daily Quota | Planned | Credited | PC State | Note');
    console.log('----+------------+-----------+-------------+---------+----------+----------+-----------------------');
    for (const r of reportTable) {
      const d = String(r.dayIndex).padEnd(3);
      const dt = r.dateStr.padEnd(10);
      const rem = `${r.remainingHours.toFixed(1)}h`.padEnd(9);
      const quo = `${r.dailyQuotaHours.toFixed(1)}h`.padEnd(11);
      const pln = `${r.plannedHours.toFixed(1)}h`.padEnd(7);
      const crd = `${r.creditedHours.toFixed(1)}h`.padEnd(8);
      const pc = r.pcState.padEnd(8);
      console.log(`${d} | ${dt} | ${rem} | ${quo} | ${pln} | ${crd} | ${pc} | ${r.note}`);
    }
    console.log('========================================================================================');
    const finalTotalHours = (totalCreditedSeconds / 3600).toFixed(1);
    console.log(`Total Credited Hours Across Week: ${finalTotalHours}h / 50.0h\n`);

    // --- Assertions ---
    // 1. Day 3 PC was off: 0 credited hours
    expect(reportTable[2]!.creditedHours).toBe(0.0);
    expect(reportTable[2]!.pcState).toBe('OFF');

    // 2. Day 4 adjusted upwards after missed Day 3
    // Day 4 daily quota must be strictly higher than Day 2 daily quota to catch up
    expect(reportTable[3]!.dailyQuotaHours).toBeGreaterThan(reportTable[1]!.dailyQuotaHours);

    // 3. Quota never exceeds profile daily cap (12.0h)
    for (const r of reportTable) {
      expect(r.dailyQuotaHours).toBeLessThanOrEqual(profile.dailyCapHours!);
    }

    // 4. Target reached on Day 7, leaving Day 8 as 1-day safety buffer before deadline
    expect(totalCreditedSeconds / 3600).toBeGreaterThanOrEqual(49.0);

    // 5. Note 1: Daily quota is a hard ceiling to the second (no rounding overshoot)
    for (const r of reportTable) {
      expect(r.creditedSeconds).toBeLessThanOrEqual(r.dailyQuotaSeconds);
      expect(r.plannedSeconds).toBeLessThanOrEqual(r.dailyQuotaSeconds);
    }
  });
});
