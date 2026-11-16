/**
 * Seedable PRNGs and deterministic hashing for HourForge core engine.
 * Pure TypeScript, zero external dependencies, no Math.random().
 */

export interface PRNG {
  next(): number;       // [0, 1)
  nextInt(min: number, max: number): number; // inclusive [min, max]
  nextGaussian(): number; // standard normal N(0, 1)
}

/**
 * 32-bit FNV-1a hash combining a run seed and appId to produce an unsigned 32-bit track seed.
 */
export function hash32(runSeed: number | string, appId: number): number {
  const str = `${runSeed}:${appId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 PRNG implementation.
 */
export class Mulberry32 implements PRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(this.next() * (hi - lo + 1)) + lo;
  }

  /**
   * Box-Muller transform for N(0, 1) standard normal distribution.
   */
  nextGaussian(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}

/**
 * Convenience factory to create a PRNG instance from a 32-bit seed.
 */
export function createPRNG(seed: number): PRNG {
  return new Mulberry32(seed);
}

