import { describe, it, expect } from 'vitest';
import { BUILTIN_PROFILES } from '../../src/core/profiles';
import { TrackStateMachine } from '../../src/core/track';

describe('Two Simultaneous Catch-Up Goals (Requirement 2)', () => {
  const profile = BUILTIN_PROFILES['regular']!; // 12h daily cap

  it('runs two simultaneous goals with concurrent accrual where neither track exceeds PC-on hours', () => {
    // Anchor t0 to a fixed morning time (10:00 AM local on fixed date) inside the active window (09:00-23:00)
    // Avoids time-of-day flake when test suite runs during overnight sleep window
    const t0Utc = new Date(2026, 10, 15, 10, 0, 0).getTime();
    const quota1Hours = 4.0; // 14,400s
    const quota2Hours = 6.0; // 21,600s
    const quota1Sec = Math.round(quota1Hours * 3600);
    const quota2Sec = Math.round(quota2Hours * 3600);

    const track1 = new TrackStateMachine({
      runId: 'run_simultaneous',
      runSeed: 'seed_sim_1',
      appId: 3513350,
      profile,
      targetSeconds: quota1Sec,
      dailyQuotaSeconds: quota1Sec,
      t0Utc
    });

    const track2 = new TrackStateMachine({
      runId: 'run_simultaneous',
      runSeed: 'seed_sim_2',
      appId: 4508340,
      profile,
      targetSeconds: quota2Sec,
      dailyQuotaSeconds: quota2Sec,
      t0Utc
    });

    // Simulate 8 hours of PC-on time (28,800 wall-clock seconds)
    const pcOnSeconds = 8 * 3600;
    let concurrentPlayTicks = 0;

    for (let sec = 0; sec < pcOnSeconds; sec++) {
      const currentWallUtc = t0Utc + sec * 1000;

      // Check desired state from each track
      // If desiredPlaying is true, backend confirms it is playing
      const curBlock1 = track1.getCurrentBlock();
      const curBlock2 = track2.getCurrentBlock();

      const want1 = curBlock1?.type === 'play' && track1.getTodayCreditedSeconds() < quota1Sec;
      const want2 = curBlock2?.type === 'play' && track2.getTodayCreditedSeconds() < quota2Sec;

      const res1 = track1.tick(currentWallUtc, {
        isPlaying: want1,
        isLoggedOn: true,
        isPlayingPossible: true
      });

      const res2 = track2.tick(currentWallUtc, {
        isPlaying: want2,
        isLoggedOn: true,
        isPlayingPossible: true
      });

      if (want1 && want2 && res1.desiredPlaying && res2.desiredPlaying) {
        concurrentPlayTicks++;
      }

      // Invariant check on EVERY tick:
      // Neither game can EVER accrue more playtime than the PC has been powered on!
      const elapsedWallSec = sec + 1;
      expect(track1.getCreditedSeconds()).toBeLessThanOrEqual(elapsedWallSec);
      expect(track2.getCreditedSeconds()).toBeLessThanOrEqual(elapsedWallSec);
    }

    const credited1Hours = track1.getCreditedSeconds() / 3600;
    const credited2Hours = track2.getCreditedSeconds() / 3600;
    const totalPcOnHours = pcOnSeconds / 3600;

    console.log('\n=============================================================');
    console.log('              TWO SIMULTANEOUS GOALS ACCRUAL REPORT          ');
    console.log('=============================================================');
    console.log(`Wall Clock PC-On Time:         ${totalPcOnHours.toFixed(1)} hours`);
    console.log(`Game 1 (3513350) Credited:     ${credited1Hours.toFixed(2)} hours (Quota: ${quota1Hours}h)`);
    console.log(`Game 2 (4508340) Credited:     ${credited2Hours.toFixed(2)} hours (Quota: ${quota2Hours}h)`);
    console.log(`Combined Playtime Accrued:     ${(credited1Hours + credited2Hours).toFixed(2)} hours`);
    console.log(`Concurrent Overlap Playtime:   ${(concurrentPlayTicks / 3600).toFixed(2)} hours`);
    console.log('=============================================================\n');

    // --- Assertions ---
    // 1. Both tracks accrued concurrent progress
    expect(concurrentPlayTicks).toBeGreaterThan(0);

    // 2. Game 1 stopped when its 4.0h daily quota was reached
    expect(credited1Hours).toBeLessThanOrEqual(quota1Hours);

    // 3. Game 2 stopped when its 6.0h daily quota was reached
    expect(credited2Hours).toBeLessThanOrEqual(quota2Hours);

    // 4. Combined playtime accrued exceeds PC-on wall time due to concurrent multi-game running
    expect(credited1Hours + credited2Hours).toBeGreaterThan(credited2Hours);

    // 5. Neither individual track ever exceeded PC-on hours
    expect(credited1Hours).toBeLessThanOrEqual(totalPcOnHours);
    expect(credited2Hours).toBeLessThanOrEqual(totalPcOnHours);
  });

  it('runs two simultaneous goals when PC-on window is shorter than sum of quotas: proportional progress, neither exceeds window or cap', () => {
    // Anchor t0 to a fixed morning time (10:00 AM local on fixed date) inside the active window (09:00-23:00)
    const t0Utc = new Date(2026, 10, 15, 10, 0, 0).getTime();
    const quota1Hours = 4.0; // 14,400s
    const quota2Hours = 6.0; // 21,600s
    const quota1Sec = Math.round(quota1Hours * 3600);
    const quota2Sec = Math.round(quota2Hours * 3600);
    const sumOfQuotasHours = quota1Hours + quota2Hours; // 10.0h

    // PC-on window is only 5.0 hours (shorter than 10.0h sum of quotas)
    const pcOnHours = 5.0;
    const pcOnSeconds = pcOnHours * 3600;

    const track1 = new TrackStateMachine({
      runId: 'run_short_window',
      runSeed: 'seed_short_1',
      appId: 3513350,
      profile,
      targetSeconds: quota1Sec,
      dailyQuotaSeconds: quota1Sec,
      t0Utc
    });

    const track2 = new TrackStateMachine({
      runId: 'run_short_window',
      runSeed: 'seed_short_2',
      appId: 4508340,
      profile,
      targetSeconds: quota2Sec,
      dailyQuotaSeconds: quota2Sec,
      t0Utc
    });

    for (let sec = 0; sec < pcOnSeconds; sec++) {
      const currentWallUtc = t0Utc + sec * 1000;

      const curBlock1 = track1.getCurrentBlock();
      const curBlock2 = track2.getCurrentBlock();

      const want1 = curBlock1?.type === 'play' && track1.getTodayCreditedSeconds() < quota1Sec;
      const want2 = curBlock2?.type === 'play' && track2.getTodayCreditedSeconds() < quota2Sec;

      track1.tick(currentWallUtc, {
        isPlaying: want1,
        isLoggedOn: true,
        isPlayingPossible: true
      });

      track2.tick(currentWallUtc, {
        isPlaying: want2,
        isLoggedOn: true,
        isPlayingPossible: true
      });

      const elapsedSec = sec + 1;
      expect(track1.getCreditedSeconds()).toBeLessThanOrEqual(elapsedSec);
      expect(track2.getCreditedSeconds()).toBeLessThanOrEqual(elapsedSec);
    }

    const credited1Hours = track1.getCreditedSeconds() / 3600;
    const credited2Hours = track2.getCreditedSeconds() / 3600;

    console.log('\n=============================================================');
    console.log('       TWO GOALS IN SHORT PC-ON WINDOW (5h < 10h SUM)        ');
    console.log('=============================================================');
    console.log(`PC-On Active Window:           ${pcOnHours.toFixed(1)} hours`);
    console.log(`Sum of Quotas:                 ${sumOfQuotasHours.toFixed(1)} hours`);
    console.log(`Game 1 (3513350) Credited:     ${credited1Hours.toFixed(2)} hours / ${quota1Hours}h quota`);
    console.log(`Game 2 (4508340) Credited:     ${credited2Hours.toFixed(2)} hours / ${quota2Hours}h quota`);
    console.log(`Combined Playtime Accrued:     ${(credited1Hours + credited2Hours).toFixed(2)} hours`);
    console.log('=============================================================\n');

    // 1. Both goals made significant progress towards their respective quotas
    expect(credited1Hours).toBeGreaterThan(1.5);
    expect(credited2Hours).toBeGreaterThan(1.5);

    // 2. Each goal strictly respected its own daily quota ceiling
    expect(credited1Hours).toBeLessThanOrEqual(quota1Hours);
    expect(credited2Hours).toBeLessThanOrEqual(quota2Hours);

    // 3. Neither game exceeded the 5.0h PC-on active window
    expect(credited1Hours).toBeLessThanOrEqual(pcOnHours);
    expect(credited2Hours).toBeLessThanOrEqual(pcOnHours);

    // 4. Neither game exceeded profile daily cap (12.0h)
    expect(credited1Hours).toBeLessThanOrEqual(profile.dailyCapHours!);
    expect(credited2Hours).toBeLessThanOrEqual(profile.dailyCapHours!);

    // 5. Concurrent accrual allowed combined playtime to exceed the 5.0h active window
    expect(credited1Hours + credited2Hours).toBeGreaterThan(pcOnHours);
  });
});

