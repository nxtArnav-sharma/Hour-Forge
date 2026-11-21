import { describe, it, expect } from 'vitest';
import { Mulberry32 } from '../../src/core/rng';
import { sampleSessionDurationSec, sampleRestDurationSec, sampleBootJitterSec } from '../../src/core/sampler';
import { BUILTIN_PROFILES } from '../../src/core/profiles';

describe('Sampler Distributions (10,000 draws)', () => {
  const profile = BUILTIN_PROFILES['regular']!;

  it('respects session bounds over 10,000 draws', () => {
    const rng = new Mulberry32(424242);
    const minSec = profile.session.minMin * 60; // 60m -> 3600s
    const maxSec = profile.session.maxMin * 60; // 180m -> 10800s

    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const s = sampleSessionDurationSec(rng, profile, false);
      expect(s).toBeGreaterThanOrEqual(minSec);
      expect(s).toBeLessThanOrEqual(maxSec);
      expect(Number.isInteger(s)).toBe(true);
      sum += s;
    }

    const mean = sum / n;
    // Theoretical median is min + 0.4*(max - min) = 3600 + 0.4*7200 = 6480s (~108m)
    expect(mean).toBeGreaterThan(5000);
    expect(mean).toBeLessThan(8000);
  });

  it('respects rest bounds, 60s hard floor, and 3600s hard cap over 10,000 draws for all presets', () => {
    const presets = ['casual', 'regular', 'grinder', 'weekend-warrior'];
    for (const presetId of presets) {
      const p = BUILTIN_PROFILES[presetId]!;
      const rng = new Mulberry32(101010);
      const minSec = p.rest.minMin * 60;
      const n = 10000;
      for (let i = 0; i < n; i++) {
        const r = sampleRestDurationSec(rng, p, 7200, false);
        expect(r).toBeGreaterThanOrEqual(60); // 60s hard floor
        expect(r).toBeGreaterThanOrEqual(minSec);
        expect(r).toBeLessThanOrEqual(3600); // 60m hard cap
      }
    }
  });

  it('scales rest with preceding session duration when enabled', () => {
    const rng1 = new Mulberry32(555);
    const rng2 = new Mulberry32(555);

    // Sample with short session (min bound)
    const restShort = sampleRestDurationSec(rng1, profile, profile.session.minMin * 60, false);
    // Sample with long session (max bound)
    const restLong = sampleRestDurationSec(rng2, profile, profile.session.maxMin * 60, false);

    expect(restLong).toBeGreaterThanOrEqual(restShort);
  });

  it('respects boot jitter range', () => {
    const rng = new Mulberry32(777);
    for (let i = 0; i < 500; i++) {
      const j = sampleBootJitterSec(rng, profile);
      expect(j).toBeGreaterThanOrEqual(profile.bootJitterSec.min);
      expect(j).toBeLessThanOrEqual(profile.bootJitterSec.max);
    }
  });

  it('applies weekend session boost accurately', () => {
    const ww = BUILTIN_PROFILES['weekend-warrior']!;
    const rng = new Mulberry32(999);

    const weekdayDraw = sampleSessionDurationSec(rng, ww, false);
    const weekendDraw = sampleSessionDurationSec(rng, ww, true);

    // Weekend warrior has 1.8x multiplier on weekend
    expect(ww.weekendSessionBoost).toBe(1.8);
    expect(weekendDraw).toBeGreaterThanOrEqual(Math.round(ww.session.minMin * 60 * 1.8));
    expect(weekdayDraw).toBeLessThanOrEqual(Math.round(ww.session.maxMin * 60));
  });
});

