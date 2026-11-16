import { describe, it, expect } from 'vitest';
import { Mulberry32, hash32 } from '../../src/core/rng';

describe('Mulberry32 PRNG and Hashing', () => {
  it('produces identical sequences for identical seeds', () => {
    const rng1 = new Mulberry32(12345);
    const rng2 = new Mulberry32(12345);

    const draws1 = Array.from({ length: 50 }, () => rng1.next());
    const draws2 = Array.from({ length: 50 }, () => rng2.next());

    expect(draws1).toEqual(draws2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = new Mulberry32(12345);
    const rng2 = new Mulberry32(54321);

    expect(rng1.next()).not.toEqual(rng2.next());
  });

  it('generates uniform numbers strictly in [0, 1)', () => {
    const rng = new Mulberry32(99999);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('generates bounded integers in [min, max]', () => {
    const rng = new Mulberry32(888);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(5, 15);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(15);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('hash32 generates stable distinct 32-bit seeds', () => {
    const runSeed = 'test_run_alpha_42';
    const seedWuWa = hash32(runSeed, 3513350);
    const seedNTE = hash32(runSeed, 4508340);

    expect(seedWuWa).toBeGreaterThan(0);
    expect(seedNTE).toBeGreaterThan(0);
    expect(seedWuWa).not.toEqual(seedNTE);

    // Deterministic repeat
    expect(hash32(runSeed, 3513350)).toEqual(seedWuWa);
  });
});

