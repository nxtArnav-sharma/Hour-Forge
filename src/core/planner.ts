import { PRNG } from './rng';
import { Block, HumanProfile, MAX_BREAK_SECONDS, CustomPattern, BlockCutReason } from './types';
import {
  sampleSessionDurationSec,
  sampleRestDurationSec,
  sampleBootJitterSec,
  sampleCustomStepDurationSec
} from './sampler';
import { computeActiveWindow, getNextDayBoundaryMs, isLocalWeekend } from './calendar';

let blockIdCounter = 0;
function nextBlockId(): string {
  return `blk_${Date.now()}_${++blockIdCounter}`;
}

export interface PlanOptions {
  profile: HumanProfile;
  quotaSeconds?: number;
  creditedSeconds?: number;
  todayCreditedSeconds?: number;
  startTimeUtc: number; // epoch ms (T0 or current block start)
  isFirstBlockOfRun?: boolean;
  dailyQuotaSeconds?: number; // Target daily quota for CATCHUP mode (never exceeds daily cap)
  customPattern?: CustomPattern;
  startStepIndex?: number;
  initialStepElapsedSec?: number;
}

/**
 * Plans the next sequence of blocks for a track.
 */
export function planTrackBlocks(
  rng: PRNG,
  options: PlanOptions,
  blockCount = 6
): Block[] {
  const {
    profile,
    quotaSeconds,
    creditedSeconds = 0,
    startTimeUtc,
    isFirstBlockOfRun = false
  } = options;

  let currentCursorMs = startTimeUtc;
  let remainingQuota = quotaSeconds !== undefined ? Math.max(0, quotaSeconds - creditedSeconds) : undefined;
  let todayCredited = options.todayCreditedSeconds ?? 0;
  let nextDayBoundaryMs = getNextDayBoundaryMs(currentCursorMs);
  const blocks: Block[] = [];

  // Custom Pattern Planning Mode
  if (options.customPattern) {
    const pattern = options.customPattern;
    const steps = pattern.steps;
    let stepIdx = options.startStepIndex ?? 0;
    let firstStep = true;
    const customDailyCapSec = pattern.dailyLimitHours ? pattern.dailyLimitHours * 3600 : undefined;

    if (isFirstBlockOfRun) {
      const jitterSec = rng.nextInt(45, 420);
      if (jitterSec > 0) {
        blocks.push({
          id: nextBlockId(),
          type: 'rest',
          reason: 'boot_jitter',
          startUtc: currentCursorMs,
          endUtc: currentCursorMs + jitterSec * 1000,
          durationSec: jitterSec,
          isExact: true
        });
        currentCursorMs += jitterSec * 1000;
      }
    }

    while (blocks.length < blockCount) {
      if (currentCursorMs >= nextDayBoundaryMs) {
        todayCredited = 0;
        nextDayBoundaryMs = getNextDayBoundaryMs(currentCursorMs);
      }

      // Check daily cap
      if (customDailyCapSec && todayCredited >= customDailyCapSec) {
        const nextDayStartMs = getNextDayBoundaryMs(currentCursorMs);
        const restDurationSec = Math.max(60, Math.round((nextDayStartMs - currentCursorMs) / 1000));
        blocks.push({
          id: nextBlockId(),
          type: 'rest',
          reason: 'daily_cap',
          startUtc: currentCursorMs,
          endUtc: nextDayStartMs,
          durationSec: restDurationSec
        });
        currentCursorMs = nextDayStartMs;
        todayCredited = 0;
        continue;
      }

      // Check active window
      let activeWin = null;
      if (pattern.activeWindow) {
        activeWin = computeActiveWindow(currentCursorMs, { activeWindow: pattern.activeWindow } as any, rng);
      }
      if (activeWin) {
        if (currentCursorMs < activeWin.windowStartMs) {
          const restDurationSec = Math.max(60, Math.round((activeWin.windowStartMs - currentCursorMs) / 1000));
          blocks.push({
            id: nextBlockId(),
            type: 'rest',
            reason: 'active_window',
            startUtc: currentCursorMs,
            endUtc: activeWin.windowStartMs,
            durationSec: restDurationSec
          });
          currentCursorMs = activeWin.windowStartMs;
          continue;
        }
        if (currentCursorMs >= activeWin.windowEndMs) {
          const nextDayWin = computeActiveWindow(activeWin.windowEndMs + 1000, { activeWindow: pattern.activeWindow } as any, rng);
          const nextStart = nextDayWin ? nextDayWin.windowStartMs : activeWin.windowEndMs + 8 * 3600 * 1000;
          const restDurationSec = Math.max(60, Math.round((nextStart - currentCursorMs) / 1000));
          blocks.push({
            id: nextBlockId(),
            type: 'rest',
            reason: 'active_window',
            startUtc: currentCursorMs,
            endUtc: nextStart,
            durationSec: restDurationSec
          });
          currentCursorMs = nextStart;
          continue;
        }
      }

      const step = steps[stepIdx]!;
      let durationSec = sampleCustomStepDurationSec(rng, step);
      if (firstStep && options.initialStepElapsedSec && options.initialStepElapsedSec > 0) {
        durationSec = Math.max(1, durationSec - options.initialStepElapsedSec);
      }
      firstStep = false;

      if (step.type === 'play') {
        let cutReason: BlockCutReason | undefined;
        if (customDailyCapSec && todayCredited + durationSec > customDailyCapSec) {
          durationSec = customDailyCapSec - todayCredited;
          cutReason = 'daily_cap';
        }
        if (activeWin && currentCursorMs + durationSec * 1000 > activeWin.windowEndMs) {
          durationSec = Math.floor((activeWin.windowEndMs - currentCursorMs) / 1000);
          cutReason = 'active_window_boundary';
        }

        if ((cutReason === 'active_window_boundary' || cutReason === 'daily_cap') && durationSec < 600) {
          let restEnd: number;
          let reason: 'active_window' | 'daily_cap';
          if (cutReason === 'daily_cap') {
            const nextDayStartMs = getNextDayBoundaryMs(currentCursorMs);
            restEnd = nextDayStartMs;
            reason = 'daily_cap';
            todayCredited = 0;
          } else {
            restEnd = activeWin ? activeWin.windowEndMs : currentCursorMs + Math.max(60, durationSec) * 1000;
            reason = 'active_window';
          }
          const restDuration = Math.max(60, Math.round((restEnd - currentCursorMs) / 1000));
          blocks.push({
            id: nextBlockId(),
            type: 'rest',
            reason,
            startUtc: currentCursorMs,
            endUtc: restEnd,
            durationSec: restDuration
          });
          currentCursorMs = restEnd;
          stepIdx = (stepIdx + 1) % steps.length;
          continue;
        }

        if (durationSec <= 0) {
          stepIdx = (stepIdx + 1) % steps.length;
          continue;
        }

        const playStart = currentCursorMs;
        const playEnd = playStart + durationSec * 1000;
        blocks.push({
          id: nextBlockId(),
          type: 'play',
          reason: 'sample',
          cutReason,
          startUtc: playStart,
          endUtc: playEnd,
          durationSec,
          isExact: step.minMin === step.maxMin,
          stepIndex: stepIdx,
          stepMinSec: step.minMin * 60,
          stepMaxSec: step.maxMin * 60
        });

        currentCursorMs = playEnd;
        todayCredited += durationSec;
        stepIdx = (stepIdx + 1) % steps.length;

        if (cutReason === 'daily_cap') {
          const nextDayStartMs = getNextDayBoundaryMs(currentCursorMs);
          const restDuration = Math.max(60, Math.round((nextDayStartMs - currentCursorMs) / 1000));
          blocks.push({
            id: nextBlockId(),
            type: 'rest',
            reason: 'daily_cap',
            startUtc: currentCursorMs,
            endUtc: nextDayStartMs,
            durationSec: restDuration
          });
          currentCursorMs = nextDayStartMs;
          todayCredited = 0;
        }
      } else {
        const restStart = currentCursorMs;
        const restEnd = restStart + durationSec * 1000;
        blocks.push({
          id: nextBlockId(),
          type: 'rest',
          reason: 'sample',
          startUtc: restStart,
          endUtc: restEnd,
          durationSec,
          isExact: step.minMin === step.maxMin,
          stepIndex: stepIdx,
          stepMinSec: step.minMin * 60,
          stepMaxSec: step.maxMin * 60
        });
        currentCursorMs = restEnd;
        stepIdx = (stepIdx + 1) % steps.length;
      }
    }

    return blocks;
  }

  // Boot jitter for first block of run
  if (isFirstBlockOfRun) {
    const jitterSec = sampleBootJitterSec(rng, profile);
    if (jitterSec > 0) {
      blocks.push({
        id: nextBlockId(),
        type: 'rest',
        reason: 'boot_jitter',
        startUtc: currentCursorMs,
        endUtc: currentCursorMs + jitterSec * 1000,
        durationSec: jitterSec
      });
      currentCursorMs += jitterSec * 1000;
    }
  }

  const isQuotaMode = quotaSeconds !== undefined;
  const profileDailyCapSec = profile.dailyCapHours ? profile.dailyCapHours * 3600 : undefined;
  const dailyCapSec =
    options.dailyQuotaSeconds !== undefined
      ? (profileDailyCapSec !== undefined
          ? Math.min(profileDailyCapSec, options.dailyQuotaSeconds)
          : options.dailyQuotaSeconds)
      : profileDailyCapSec;

  let precedingSessionSec: number | undefined;

  while (blocks.length < blockCount) {
    if (isQuotaMode && remainingQuota !== undefined && remainingQuota <= 0) {
      break;
    }

    // Reset daily accumulated credit if cursor has crossed the local day boundary
    if (currentCursorMs >= nextDayBoundaryMs) {
      todayCredited = 0;
      nextDayBoundaryMs = getNextDayBoundaryMs(currentCursorMs);
    }

    const isWeekend = isLocalWeekend(currentCursorMs);
    const boost = isWeekend && profile.weekendSessionBoost ? profile.weekendSessionBoost : 1.0;
    const sessionMinSec = Math.round(profile.session.minMin * 60 * boost);
    const sessionMaxSec = Math.round(profile.session.maxMin * 60 * boost);

    // Check Daily Cap
    if (dailyCapSec && todayCredited >= dailyCapSec) {
      const nextDayStartMs = getNextDayBoundaryMs(currentCursorMs);
      const restDurationSec = Math.max(60, Math.round((nextDayStartMs - currentCursorMs) / 1000));
      blocks.push({
        id: nextBlockId(),
        type: 'rest',
        reason: 'daily_cap',
        startUtc: currentCursorMs,
        endUtc: nextDayStartMs,
        durationSec: restDurationSec
      });
      currentCursorMs = nextDayStartMs;
      todayCredited = 0;
      continue;
    }

    // Check Active Window
    const activeWin = computeActiveWindow(currentCursorMs, profile, rng);
    if (activeWin) {
      // If cursor is before window start or after window end (during sleep window)
      if (currentCursorMs < activeWin.windowStartMs) {
        const restDurationSec = Math.max(60, Math.round((activeWin.windowStartMs - currentCursorMs) / 1000));
        blocks.push({
          id: nextBlockId(),
          type: 'rest',
          reason: 'active_window',
          startUtc: currentCursorMs,
          endUtc: activeWin.windowStartMs,
          durationSec: restDurationSec
        });
        currentCursorMs = activeWin.windowStartMs;
        continue;
      }
      if (currentCursorMs >= activeWin.windowEndMs) {
        // Compute next day's active window
        const nextDayWin = computeActiveWindow(activeWin.windowEndMs + 1000, profile, rng);
        const nextStart = nextDayWin ? nextDayWin.windowStartMs : activeWin.windowEndMs + 8 * 3600 * 1000;
        const restDurationSec = Math.max(60, Math.round((nextStart - currentCursorMs) / 1000));
        blocks.push({
          id: nextBlockId(),
          type: 'rest',
          reason: 'active_window',
          startUtc: currentCursorMs,
          endUtc: nextStart,
          durationSec: restDurationSec
        });
        currentCursorMs = nextStart;
        continue;
      }
    }

    // --- Sample Play Session ---
    let sessionSec = sampleSessionDurationSec(rng, profile, isWeekend);
    let cutReason: import('./types').BlockCutReason | undefined;

    if (isQuotaMode && remainingQuota !== undefined) {
      if (quotaSeconds! < sessionMinSec) {
        // Initial quota smaller than min session: single block
        sessionSec = remainingQuota;
        cutReason = 'quota_end';
      } else if (sessionSec >= remainingQuota) {
        sessionSec = remainingQuota;
        cutReason = 'quota_end';
      } else {
        // Tail rule
        const tail = remainingQuota - sessionSec;
        if (tail < sessionMinSec) {
          if (sessionSec + tail <= 1.25 * sessionMaxSec) {
            // Absorb tail
            sessionSec = remainingQuota;
            cutReason = 'quota_end';
          } else {
            // Shrink session so exactly sessionMinSec remains
            sessionSec = Math.max(sessionMinSec, remainingQuota - sessionMinSec);
          }
        }
      }
    }

    // Clip to Daily Cap if needed
    if (dailyCapSec && todayCredited + sessionSec > dailyCapSec) {
      sessionSec = dailyCapSec - todayCredited;
      cutReason = 'daily_cap';
    }

    // Clip to Active Window end if needed
    if (activeWin && currentCursorMs + sessionSec * 1000 > activeWin.windowEndMs) {
      const allowedSec = Math.floor((activeWin.windowEndMs - currentCursorMs) / 1000);
      sessionSec = allowedSec;
      cutReason = 'active_window_boundary';
    }

    // Skip sessions cut shorter than 10 minutes (600s) by boundary/cap, resting instead (quota-end excepted)
    if ((cutReason === 'active_window_boundary' || cutReason === 'daily_cap') && sessionSec < 600) {
      let restEnd: number;
      let reason: 'active_window' | 'daily_cap';

      if (cutReason === 'daily_cap') {
        const nextDayStartMs = getNextDayBoundaryMs(currentCursorMs);
        const bootJitterSec = sampleBootJitterSec(rng, profile);
        restEnd = nextDayStartMs + bootJitterSec * 1000;
        reason = 'daily_cap';
        todayCredited = 0;
      } else {
        restEnd = activeWin ? activeWin.windowEndMs : currentCursorMs + Math.max(60, sessionSec) * 1000;
        reason = 'active_window';
      }

      const restDuration = Math.max(60, Math.round((restEnd - currentCursorMs) / 1000));
      blocks.push({
        id: nextBlockId(),
        type: 'rest',
        reason,
        startUtc: currentCursorMs,
        endUtc: restEnd,
        durationSec: restDuration
      });
      currentCursorMs = restEnd;
      continue;
    }

    if (sessionSec <= 0) {
      break;
    }

    const playStartMs = currentCursorMs;
    const playEndMs = playStartMs + sessionSec * 1000;

    blocks.push({
      id: nextBlockId(),
      type: 'play',
      reason: 'sample',
      cutReason,
      startUtc: playStartMs,
      endUtc: playEndMs,
      durationSec: sessionSec
    });

    currentCursorMs = playEndMs;
    precedingSessionSec = sessionSec;
    todayCredited += sessionSec;

    if (remainingQuota !== undefined) {
      remainingQuota -= sessionSec;
      if (remainingQuota <= 0) {
        // No rest block after final quota block
        break;
      }
    }

    // If session ended due to daily cap, rest until next day boundary (plus boot jitter) immediately
    if (cutReason === 'daily_cap') {
      const nextDayStartMs = getNextDayBoundaryMs(currentCursorMs);
      const bootJitterSec = sampleBootJitterSec(rng, profile);
      const restEnd = nextDayStartMs + bootJitterSec * 1000;
      const restDuration = Math.max(60, Math.round((restEnd - currentCursorMs) / 1000));
      blocks.push({
        id: nextBlockId(),
        type: 'rest',
        reason: 'daily_cap',
        startUtc: currentCursorMs,
        endUtc: restEnd,
        durationSec: restDuration
      });
      currentCursorMs = restEnd;
      todayCredited = 0;
      continue;
    }

    // --- Sample Rest Block ---
    const rawRest = sampleRestDurationSec(rng, profile, precedingSessionSec, isWeekend);
    const restSec = Math.min(MAX_BREAK_SECONDS, rawRest);
    const restStartMs = currentCursorMs;
    const restEndMs = restStartMs + restSec * 1000;

    blocks.push({
      id: nextBlockId(),
      type: 'rest',
      reason: 'sample',
      startUtc: restStartMs,
      endUtc: restEndMs,
      durationSec: restSec
    });

    currentCursorMs = restEndMs;
  }

  return mergeConsecutiveRests(blocks);
}

/**
 * Merges consecutive rest blocks into a single continuous rest block.
 */
export function mergeConsecutiveRests(blocks: Block[]): Block[] {
  if (blocks.length <= 1) return blocks;
  const merged: Block[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last && last.type === 'rest' && block.type === 'rest') {
      last.endUtc = block.endUtc;
      let dur = Math.round((last.endUtc - last.startUtc) / 1000);
      if (last.reason === 'sample' && block.reason === 'sample') {
        dur = Math.min(MAX_BREAK_SECONDS, dur);
        last.endUtc = last.startUtc + dur * 1000;
      }
      last.durationSec = dur;
      if (last.reason !== 'daily_cap') {
        last.reason = block.reason || last.reason;
      }
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

/**
 * Adjusts boundaries across multiple tracks to avoid near-simultaneous transitions.
 * Section 7.6: If a boundary of one track is within 20s of another track, shift the later track by 20..90s.
 */
export function avoidBoundaryCollisions(
  multiTrackBlocks: Block[][],
  rng: PRNG
): Block[][] {
  if (multiTrackBlocks.length <= 1) {
    return multiTrackBlocks;
  }

  const result: Block[][] = multiTrackBlocks.map(track => track.map(b => ({ ...b })));

  for (let t = 1; t < result.length; t++) {
    const currentTrack = result[t]!;
    for (let prevIdx = 0; prevIdx < t; prevIdx++) {
      const prevTrack = result[prevIdx]!;

      for (const currentBlock of currentTrack) {
        if (currentBlock.locked || currentBlock.isExact) continue;

        for (const prevBlock of prevTrack) {
          // Check start boundary collision within 20s
          const startDelta = Math.abs(currentBlock.startUtc - prevBlock.startUtc);
          if (startDelta > 0 && startDelta < 20_000) {
            const shiftMs = rng.nextInt(20, 90) * 1000;
            currentBlock.startUtc += shiftMs;
            currentBlock.endUtc += shiftMs;
          }

          // Check end boundary collision within 20s
          const endDelta = Math.abs(currentBlock.endUtc - prevBlock.endUtc);
          if (endDelta > 0 && endDelta < 20_000) {
            const shiftMs = rng.nextInt(20, 90) * 1000;
            currentBlock.endUtc += shiftMs;
            let dur = Math.round((currentBlock.endUtc - currentBlock.startUtc) / 1000);
            if (currentBlock.stepMinSec !== undefined && currentBlock.stepMaxSec !== undefined) {
              dur = Math.max(currentBlock.stepMinSec, Math.min(currentBlock.stepMaxSec, dur));
            }
            if (currentBlock.type === 'rest') {
              dur = Math.min(MAX_BREAK_SECONDS, dur);
            }
            currentBlock.durationSec = dur;
            currentBlock.endUtc = currentBlock.startUtc + dur * 1000;
          }
        }
      }
    }
  }

  return result;
}
