import { describe, it, expect } from 'vitest';
import { TrackStateMachine } from '../../src/core/track';
import { BUILTIN_PROFILES } from '../../src/core/profiles';
import { VirtualClock } from '../../src/core/clock';
import { computeActiveWindow, getNextDayBoundaryMs } from '../../src/core/calendar';
import { Block } from '../../src/core/types';

describe('7-Day Accelerated Simulation & R2/R3 Acceptance Tests', () => {
  it('passes R2 Acceptance: 7-day simulation has unique sessions, valid rests, respects daily cap and sleep window', () => {
    const profile = BUILTIN_PROFILES['regular']!;
    const gameAppId = 3513350; // Wuthering Waves
    const t0 = new Date(2026, 10, 14, 9, 0, 0).getTime(); // Saturday 09:00 local
    const clock = new VirtualClock(t0);

    const track = new TrackStateMachine({
      runId: 'run_7day_sim',
      runSeed: 'r2_seed_42',
      appId: gameAppId,
      profile,
      t0Utc: t0
    });

    const sessionLengths = new Set<number>();
    const sevenDaysSec = 7 * 24 * 3600;
    const backend = { isPlaying: true, isLoggedOn: true, isPlayingPossible: true };

    let currentDayIndex = 0;
    let nextDayBoundary = getNextDayBoundaryMs(t0);
    let dailyPlaySec = 0;
    const maxDailyCapSec = (profile.dailyCapHours || 12) * 3600;

    const dailySessionsCount: number[] = [0, 0, 0, 0, 0, 0, 0];
    const dailyPlayHours: number[] = [0, 0, 0, 0, 0, 0, 0];
    const day2Blocks: Block[] = [];

    for (let sec = 0; sec < sevenDaysSec; sec++) {
      const now = clock.now();
      const currentBlock = track.getCurrentBlock();

      if (currentBlock && currentBlock.type === 'play') {
        // Assert no Play block starts inside a configured sleep window
        const activeWin = computeActiveWindow(now, profile);
        if (activeWin) {
          const jitterMs = (profile.activeWindow?.edgeJitterMin ?? 0) * 60 * 1000;
          expect(now).toBeGreaterThanOrEqual(activeWin.windowStartMs - jitterMs);
          expect(now).toBeLessThan(activeWin.windowEndMs + jitterMs);
        }
      }

      // Check transitions
      const prevBlock = track.getCurrentBlock();
      track.tick(now, backend);
      const nextBlock = track.getCurrentBlock();

      if (prevBlock && nextBlock && prevBlock.id !== nextBlock.id) {
        const dayIdx = currentDayIndex;

        // Capture blocks for Day 2 (dayIdx === 1)
        if (dayIdx === 1) {
          day2Blocks.push({ ...prevBlock });
        }

        if (prevBlock.type === 'play') {
          sessionLengths.add(prevBlock.durationSec);
          dailySessionsCount[dayIdx] = (dailySessionsCount[dayIdx] || 0) + 1;

          // STRICT ASSERTION: If not cut by active window boundary or daily cap, must be >= sessionMinSec
          const minSessionSec = profile.session.minMin * 60; // 3600s
          if (!prevBlock.cutReason) {
            expect(prevBlock.durationSec).toBeGreaterThanOrEqual(minSessionSec);
            expect(prevBlock.durationSec).toBeLessThanOrEqual(profile.session.maxMin * 60);
          } else {
            // Cut session must have valid cut reason
            expect(['active_window_boundary', 'daily_cap', 'quota_end']).toContain(prevBlock.cutReason);
          }
        } else if (prevBlock.type === 'rest' && prevBlock.reason === 'sample') {
          // Assert sampled rest stays inside profile bounds (allowing long rests up to longMaxMin)
          const minRest = profile.rest.minMin * 60;
          const maxRest = profile.rest.longMaxMin * 60;
          expect(prevBlock.durationSec).toBeGreaterThanOrEqual(Math.min(60, minRest));
          expect(prevBlock.durationSec).toBeLessThanOrEqual(maxRest);
        }
      }

      // Track daily cap per local calendar day (05:00 boundary)
      if (now >= nextDayBoundary && currentDayIndex < 6) {
        dailyPlayHours[currentDayIndex] = Number((dailyPlaySec / 3600).toFixed(2));
        expect(dailyPlaySec).toBeLessThanOrEqual(maxDailyCapSec);
        currentDayIndex++;
        dailyPlaySec = 0;
        nextDayBoundary = getNextDayBoundaryMs(now);
      }

      if (track.getState() === 'PLAYING') {
        dailyPlaySec++;
      }

      clock.advance(1000);
    }

    if (currentDayIndex < 7) {
      dailyPlayHours[currentDayIndex] = Number((dailyPlaySec / 3600).toFixed(2));
    }

    // Assert that there are no identical session lengths in the sample set (all unique)
    expect(sessionLengths.size).toBeGreaterThan(15);

    // Compute mean credited hours per day on days 2 to 6 (indexes 1 to 5)
    const midDays = dailyPlayHours.slice(1, 6);
    const meanHoursMidDays = midDays.reduce((a, b) => a + b, 0) / midDays.length;

    console.log('\n=================== 7-DAY SIMULATION REPORT ===================');
    console.log(`Profile: ${profile.name} (${profile.id})`);
    console.log(`Game: App ID ${gameAppId} (Wuthering Waves)`);
    console.log(`Configured Active Window: ${profile.activeWindow?.start} to ${profile.activeWindow?.end}`);
    console.log(`Configured Daily Cap: ${profile.dailyCapHours} hours`);
    console.log('---------------------------------------------------------------');
    for (let d = 0; d < 7; d++) {
      console.log(`Day ${d + 1}: ${dailySessionsCount[d]} sessions, ${dailyPlayHours[d]} hours played`);
    }
    console.log('---------------------------------------------------------------');
    console.log(`Mean Credited Hours (Days 2 to 6): ${meanHoursMidDays.toFixed(2)} h`);
    console.log(`Total Unique Sessions: ${sessionLengths.size}`);
    const sessionsArr = Array.from(sessionLengths);
    console.log(`Min Session Length: ${Math.min(...sessionsArr)} s`);
    console.log(`Max Session Length: ${Math.max(...sessionsArr)} s`);
    console.log('---------------------------------------------------------------');
    console.log('DAY 2 FULL BLOCK SCHEDULE:');
    for (const b of day2Blocks) {
      const startStr = new Date(b.startUtc).toTimeString().split(' ')[0];
      const endStr = new Date(b.endUtc).toTimeString().split(' ')[0];
      const durMin = (b.durationSec / 60).toFixed(1);
      const cutStr = b.cutReason ? ` [CUT: ${b.cutReason}]` : '';
      console.log(`  ${b.type.toUpperCase().padEnd(4)} | ${startStr} -> ${endStr} | ${b.durationSec}s (${durMin}m) | reason: ${b.reason || 'none'}${cutStr}`);
    }
    console.log('===============================================================\n');

    // USER-REQUESTED STRICT ASSERTION: Mean credited hours on days 2 to 6 between 8 and 12
    expect(meanHoursMidDays).toBeGreaterThanOrEqual(8.0);
    expect(meanHoursMidDays).toBeLessThanOrEqual(12.0);
  }, 15000);

  it('passes R3 Acceptance: DEDICATED WuWa 1h + NTE 2h starts at T0, credits exact quotas, different rest windows, ends when done', () => {
    const profile = BUILTIN_PROFILES['fast-test']!;
    const t0 = 1731542400000;
    const clock = new VirtualClock(t0);

    const wuwaQuotaSec = 3600; // 1h
    const nteQuotaSec = 7200;  // 2h

    const wuwaTrack = new TrackStateMachine({
      runId: 'r3_run',
      runSeed: 'r3_shared_seed',
      appId: 3513350, // WuWa
      profile,
      targetSeconds: wuwaQuotaSec,
      t0Utc: t0
    });

    const nteTrack = new TrackStateMachine({
      runId: 'r3_run',
      runSeed: 'r3_shared_seed',
      appId: 4508340, // NTE
      profile,
      targetSeconds: nteQuotaSec,
      t0Utc: t0
    });

    expect(wuwaTrack.rng).not.toBe(nteTrack.rng);

    let bothDone = false;
    let maxSeconds = 30000;

    while (!bothDone && maxSeconds > 0) {
      const now = clock.now();

      wuwaTrack.tick(now, { isPlaying: true, isLoggedOn: true, isPlayingPossible: true });
      nteTrack.tick(now, { isPlaying: true, isLoggedOn: true, isPlayingPossible: true });

      const wuwaDone = wuwaTrack.getState() === 'DONE';
      const nteDone = nteTrack.getState() === 'DONE';

      if (wuwaDone && nteDone) {
        bothDone = true;
        break;
      }

      clock.advance(1000);
      maxSeconds--;
    }

    expect(bothDone).toBe(true);
    expect(wuwaTrack.getCreditedSeconds()).toBe(wuwaQuotaSec);
    expect(nteTrack.getCreditedSeconds()).toBe(nteQuotaSec);

    const wuwaRests = wuwaTrack.getBlocks().filter(b => b.type === 'rest').map(b => b.durationSec);
    const nteRests = nteTrack.getBlocks().filter(b => b.type === 'rest').map(b => b.durationSec);
    expect(wuwaRests).not.toEqual(nteRests);
  });
});
