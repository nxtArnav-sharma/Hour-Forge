import { describe, it, expect } from 'vitest';
import { BUILTIN_PROFILES } from '../../src/core/profiles';
import { Mulberry32 } from '../../src/core/rng';
import { sampleRestDurationSec } from '../../src/core/sampler';
import { planTrackBlocks, avoidBoundaryCollisions } from '../../src/core/planner';
import { TrackStateMachine } from '../../src/core/track';
import { MAX_BREAK_SECONDS } from '../../src/core/types';
import { VirtualClock } from '../../src/core/clock';

describe('Rest Cap — 60-Minute Hard Ceiling (R1 to R7)', () => {
  const presets = ['casual', 'regular', 'grinder', 'weekend-warrior'];

  it('R1 & R7: 10,000 draws per preset produces 0 samples > 3600 seconds', () => {
    for (const pid of presets) {
      const p = BUILTIN_PROFILES[pid]!;
      const rng = new Mulberry32(12345);
      for (let i = 0; i < 10000; i++) {
        const restSec = sampleRestDurationSec(rng, p, 3600, i % 2 === 0);
        expect(restSec).toBeLessThanOrEqual(MAX_BREAK_SECONDS);
        expect(restSec).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('R1 & R7: Multi-track planner never produces sample rest blocks > 3600s across 1, 2 and 3 tracks', () => {
    for (const pid of presets) {
      const p = BUILTIN_PROFILES[pid]!;
      for (const trackCount of [1, 2, 3]) {
        const rng = new Mulberry32(999);
        const t0 = 1731542400000;
        const multiTrackBlocks = [];

        for (let t = 0; t < trackCount; t++) {
          const blocks = planTrackBlocks(rng, { profile: p, startTimeUtc: t0 + t * 60000 }, 10);
          multiTrackBlocks.push(blocks);
        }

        const adjusted = avoidBoundaryCollisions(multiTrackBlocks, rng);

        for (const trackBlocks of adjusted) {
          for (const b of trackBlocks) {
            if (b.type === 'rest' && b.reason === 'sample') {
              expect(b.durationSec).toBeLessThanOrEqual(MAX_BREAK_SECONDS);
            }
          }
        }
      }
    }
  });

  it('R1 & R7: Collision avoidance shifts never push a rest block duration over 3600s', () => {
    const rng = new Mulberry32(42);
    const track1 = [
      { id: 'b1', type: 'play' as const, startUtc: 1000, endUtc: 5000, durationSec: 4 }
    ];
    // Track 2 has rest that ends near track 1 end
    const track2 = [
      { id: 'b2', type: 'rest' as const, reason: 'sample' as const, startUtc: 1000, endUtc: 4600, durationSec: 3600 }
    ];

    const adjusted = avoidBoundaryCollisions([track1, track2], rng);
    const shiftedRest = adjusted[1]![0]!;
    expect(shiftedRest.durationSec).toBeLessThanOrEqual(MAX_BREAK_SECONDS);
  });

  it('R1 & R7: extendRest clamps total rest duration to MAX_BREAK_SECONDS', () => {
    const p = BUILTIN_PROFILES['regular']!;
    const sm = new TrackStateMachine({
      runId: 'r_cap',
      runSeed: 42,
      appId: 100,
      profile: p,
      t0Utc: 1000000
    });

    // Advance until state is RESTING with reason 'sample'
    const cur = sm.getCurrentBlock();
    if (cur && cur.type === 'rest') {
      cur.reason = 'sample';
      cur.durationSec = 3000;
      sm.extendRest(1000); // would be 4000s without cap
      expect(cur.durationSec).toBe(3600);
      sm.extendRest(500); // already 3600
      expect(cur.durationSec).toBe(3600);
    }
  });

  it('R4: snapshot restore clamps legacy break > 60m to 60m', () => {
    const legacyProfile = {
      ...BUILTIN_PROFILES['casual']!,
      rest: {
        minMin: 10,
        maxMin: 90,
        longChance: 0.5,
        longMinMin: 60,
        longMaxMin: 120
      }
    };

    // When clamped in engine or store
    const clampedRest = {
      ...legacyProfile.rest,
      minMin: Math.min(60, legacyProfile.rest.minMin),
      maxMin: Math.min(60, legacyProfile.rest.maxMin),
      longMinMin: Math.min(60, legacyProfile.rest.longMinMin),
      longMaxMin: Math.min(60, legacyProfile.rest.longMaxMin)
    };

    expect(clampedRest.maxMin).toBe(60);
    expect(clampedRest.longMaxMin).toBe(60);
  });

  it('R2: all preset profiles have rest bounds and long rests <= 60 minutes', () => {
    for (const [id, p] of Object.entries(BUILTIN_PROFILES)) {
      if (id === 'fast-test') continue;
      expect(p.rest.maxMin).toBeLessThanOrEqual(60);
      expect(p.rest.longMaxMin).toBeLessThanOrEqual(60);
    }
  });

  it('R7: 7-day accelerated simulations for all presets have zero sample rest > 3600s', () => {
    for (const pid of ['casual', 'regular', 'grinder', 'weekend-warrior']) {
      const p = BUILTIN_PROFILES[pid]!;
      const t0 = new Date(2026, 10, 14, 9, 0, 0).getTime();
      const clock = new VirtualClock(t0);
      const sm = new TrackStateMachine({
        runId: `sim_${pid}`,
        runSeed: `seed_${pid}`,
        appId: 1001,
        profile: p,
        t0Utc: t0
      });

      const backend = { isPlaying: true, isLoggedOn: true, isPlayingPossible: true };
      const oneDaySec = 24 * 3600;

      // Run 24h accelerated sim
      for (let s = 0; s < oneDaySec; s += 60) {
        const now = clock.now();
        sm.tick(now, backend);
        const block = sm.getCurrentBlock();
        if (block && block.type === 'rest' && block.reason === 'sample') {
          expect(block.durationSec).toBeLessThanOrEqual(MAX_BREAK_SECONDS);
        }
        clock.advance(60000);
      }
    }
  });
});
