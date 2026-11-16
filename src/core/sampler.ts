import { PRNG } from './rng';
import { HumanProfile } from './types';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Samples a humanized session duration in seconds.
 * Truncated log-normal distribution:
 * median = min + 0.4 * (max - min)
 * sigma = 0.45
 * X = median * exp(sigma * N(0, 1))
 */
export function sampleSessionDurationSec(
  rng: PRNG,
  profile: HumanProfile,
  isWeekend = false
): number {
  const boost = isWeekend && profile.weekendSessionBoost ? profile.weekendSessionBoost : 1.0;
  const minSec = Math.round(profile.session.minMin * 60 * boost);
  const maxSec = Math.round(profile.session.maxMin * 60 * boost);
  const medianSec = minSec + 0.4 * (maxSec - minSec);
  const sigma = 0.45;

  let draw = 0;
  let attempts = 0;
  while (attempts < 20) {
    const z = rng.nextGaussian();
    const x = medianSec * Math.exp(sigma * z);
    if (x >= minSec && x <= maxSec) {
      draw = Math.round(x);
      break;
    }
    attempts++;
  }

  // Fallback to uniform if 20 failed draws
  if (draw === 0) {
    draw = rng.nextInt(minSec, maxSec);
  }

  return Math.max(1, draw);
}

/**
 * Samples a humanized rest duration in seconds.
 * Probability longChance: uniform in [longMin, longMax]
 * Else: truncated log-normal with median = min + 0.3 * (max - min), sigma = 0.6
 * Scaling: if restScalesWithSession, scale by clamp(0.6 + 0.8 * (session - sessionMin)/(sessionMax - sessionMin), 0.6, 1.4)
 * Hard floor: 60 seconds (unless profile min is shorter, e.g. fast-test).
 */
export function sampleRestDurationSec(
  rng: PRNG,
  profile: HumanProfile,
  precedingSessionSec?: number,
  isWeekend = false
): number {
  const restConfig = profile.rest;
  const boost = isWeekend && profile.weekendSessionBoost ? profile.weekendSessionBoost : 1.0;
  const baseSessionMinSec = Math.round(profile.session.minMin * 60 * boost);
  const baseSessionMaxSec = Math.round(profile.session.maxMin * 60 * boost);

  const minSec = Math.round(restConfig.minMin * 60);
  const maxSec = Math.round(restConfig.maxMin * 60);

  let rawRestSec: number;

  if (restConfig.longChance > 0 && rng.next() < restConfig.longChance) {
    const longMinSec = Math.round(restConfig.longMinMin * 60);
    const longMaxSec = Math.round(restConfig.longMaxMin * 60);
    rawRestSec = rng.nextInt(longMinSec, longMaxSec);
  } else {
    const medianSec = minSec + 0.3 * (maxSec - minSec);
    const sigma = 0.6;
    let attempts = 0;
    let draw = 0;
    while (attempts < 20) {
      const z = rng.nextGaussian();
      const x = medianSec * Math.exp(sigma * z);
      if (x >= minSec && x <= maxSec) {
        draw = Math.round(x);
        break;
      }
      attempts++;
    }
    if (draw === 0) {
      draw = rng.nextInt(minSec, maxSec);
    }
    rawRestSec = draw;

    if (profile.restScalesWithSession && precedingSessionSec !== undefined) {
      const denom = baseSessionMaxSec - baseSessionMinSec;
      const ratio = denom > 0 ? (precedingSessionSec - baseSessionMinSec) / denom : 0.5;
      const factor = clamp(0.6 + 0.8 * ratio, 0.6, 1.4);
      rawRestSec = clamp(Math.round(rawRestSec * factor), minSec, maxSec);
    }
  }

  // Hard floor 60s, or profile minSec if profile allows shorter (e.g. fast-test)
  const floor = Math.min(60, minSec);
  return Math.max(floor, rawRestSec);
}

/**
 * Samples a boot jitter delay in seconds before the first Play block after T0.
 */
export function sampleBootJitterSec(rng: PRNG, profile: HumanProfile): number {
  return rng.nextInt(profile.bootJitterSec.min, profile.bootJitterSec.max);
}

