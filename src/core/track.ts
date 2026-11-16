import { Block, HumanProfile, TrackOverlay, TrackState, SessionLogEntry } from './types';
import { PRNG, createPRNG, hash32 } from './rng';
import { planTrackBlocks } from './planner';
import { getNextDayBoundaryMs } from './calendar';

export interface TrackOptions {
  runId: string;
  runSeed: number | string;
  appId: number;
  profile: HumanProfile;
  targetSeconds?: number; // Quota for DEDICATED
  t0Utc: number;          // Run start time
  dailyQuotaSeconds?: number;
  getDailyQuotaSeconds?: (nowUtc: number, creditedTodaySec: number) => number;
}

export interface BackendConfirmation {
  isPlaying: boolean;
  isLoggedOn: boolean;
  isPlayingPossible: boolean;
}

export class TrackStateMachine {
  readonly runId: string;
  readonly appId: number;
  readonly profile: HumanProfile;
  readonly targetSeconds?: number;
  readonly rng: PRNG;
  private dailyQuotaSeconds?: number;
  private getDailyQuotaSeconds?: (nowUtc: number, creditedTodaySec: number) => number;

  private state: TrackState = 'PLANNED';
  private overlay: TrackOverlay | null = null;
  private blocks: Block[] = [];
  private currentBlockIndex = 0;
  private creditedSeconds = 0;
  private todayCreditedSeconds = 0;
  private currentDayBoundaryMs = 0;
  private activeBlockStartedAtUtc: number | null = null;
  private interruptionStartedAtUtc: number | null = null;
  private sessionLogs: SessionLogEntry[] = [];

  constructor(options: TrackOptions) {
    this.runId = options.runId;
    this.appId = options.appId;
    this.profile = options.profile;
    this.targetSeconds = options.targetSeconds;
    this.dailyQuotaSeconds = options.dailyQuotaSeconds;
    this.getDailyQuotaSeconds = options.getDailyQuotaSeconds;
    this.currentDayBoundaryMs = getNextDayBoundaryMs(options.t0Utc);

    const trackSeed = hash32(options.runSeed, options.appId);
    this.rng = createPRNG(trackSeed);

    // Initial plan
    this.blocks = planTrackBlocks(
      this.rng,
      {
        profile: this.profile,
        quotaSeconds: this.targetSeconds,
        creditedSeconds: 0,
        startTimeUtc: options.t0Utc,
        isFirstBlockOfRun: true,
        dailyQuotaSeconds: this.getEffectiveDailyQuota(options.t0Utc)
      },
      8
    );

    this.state = 'WAITING_START';
  }

  getEffectiveDailyQuota(nowUtc: number): number | undefined {
    if (this.getDailyQuotaSeconds) {
      return this.getDailyQuotaSeconds(nowUtc, this.todayCreditedSeconds);
    }
    return this.dailyQuotaSeconds;
  }

  setDailyQuota(dailyQuotaSeconds?: number): void {
    this.dailyQuotaSeconds = dailyQuotaSeconds;
  }

  getState(): TrackState {
    return this.state;
  }

  getOverlay(): TrackOverlay | null {
    return this.overlay;
  }

  getCreditedSeconds(): number {
    return this.creditedSeconds;
  }

  getTodayCreditedSeconds(): number {
    return this.todayCreditedSeconds;
  }

  setTodayCreditedSeconds(sec: number): void {
    this.todayCreditedSeconds = sec;
  }

  getDailyQuotaSecondsValue(): number | undefined {
    return this.dailyQuotaSeconds;
  }

  getBlocks(): Block[] {
    return [...this.blocks];
  }

  getCurrentBlock(): Block | undefined {
    return this.blocks[this.currentBlockIndex];
  }

  getSessionLogs(): SessionLogEntry[] {
    return [...this.sessionLogs];
  }

  setOverlay(overlay: TrackOverlay | null, nowUtc: number): void {
    if (this.overlay === overlay) return;

    if (overlay !== null) {
      // Entering overlay interruption
      this.interruptionStartedAtUtc = nowUtc;
    } else if (this.interruptionStartedAtUtc !== null) {
      // Exiting overlay interruption
      const interruptionDurationMs = nowUtc - this.interruptionStartedAtUtc;
      this.interruptionStartedAtUtc = null;

      // Section 7.7: If interruption lasted > 30 minutes, replan with fresh rest
      if (interruptionDurationMs > 30 * 60 * 1000) {
        this.replan(nowUtc);
      }
    }

    this.overlay = overlay;
  }

  /**
   * Evaluates state on each engine tick (1 second).
   */
  tick(nowUtc: number, backend: BackendConfirmation): { desiredPlaying: boolean } {
    if (this.state === 'DONE' || this.state === 'STOPPED') {
      return { desiredPlaying: false };
    }

    // Reset daily accumulated credit when advancing past local day boundary (05:00)
    if (nowUtc >= this.currentDayBoundaryMs) {
      this.todayCreditedSeconds = 0;
      this.currentDayBoundaryMs = getNextDayBoundaryMs(nowUtc);
      this.replan(nowUtc);
    }

    // Check today's daily cap / quota
    const effectiveCapSec = this.getEffectiveDailyQuota(nowUtc);
    const profileDailyCapSec = this.profile.dailyCapHours ? this.profile.dailyCapHours * 3600 : undefined;
    const finalDailyCapSec = effectiveCapSec !== undefined
      ? (profileDailyCapSec !== undefined ? Math.min(profileDailyCapSec, effectiveCapSec) : effectiveCapSec)
      : profileDailyCapSec;

    if (finalDailyCapSec !== undefined && this.todayCreditedSeconds >= finalDailyCapSec) {
      const cur = this.getCurrentBlock();
      if (cur && cur.type === 'play') {
        this.finalizeCurrentBlock(nowUtc, 'schedule');
        this.currentBlockIndex += 1;
        this.ensureBlocksAhead(nowUtc);
        return { desiredPlaying: false };
      }
    }

    const currentBlock = this.getCurrentBlock();
    if (!currentBlock) {
      if (this.targetSeconds !== undefined && this.creditedSeconds >= this.targetSeconds) {
        this.state = 'DONE';
      } else {
        // Replenish blocks lazily
        this.replenishBlocks(nowUtc);
      }
      return { desiredPlaying: false };
    }

    // Determine target state based on current block
    const isPlayBlock = currentBlock.type === 'play';
    this.state = isPlayBlock ? 'PLAYING' : 'RESTING';

    // Credit playtime only when confirmed playing, logged on, and no blocking overlay
    const isCreditable =
      isPlayBlock &&
      this.overlay === null &&
      backend.isPlaying &&
      backend.isLoggedOn &&
      backend.isPlayingPossible;

    if (isCreditable) {
      if (this.activeBlockStartedAtUtc === null) {
        this.activeBlockStartedAtUtc = nowUtc;
      }
      this.creditedSeconds += 1;
      this.todayCreditedSeconds += 1;

      // Check daily cap completion (hard ceiling to the second)
      if (finalDailyCapSec !== undefined && this.todayCreditedSeconds >= finalDailyCapSec) {
        this.finalizeCurrentBlock(nowUtc, 'schedule');
        this.currentBlockIndex += 1;
        this.ensureBlocksAhead(nowUtc);
        return { desiredPlaying: false };
      }

      // Check quota completion
      if (this.targetSeconds !== undefined && this.creditedSeconds >= this.targetSeconds) {
        this.finalizeCurrentBlock(nowUtc, 'schedule');
        this.state = 'DONE';
        return { desiredPlaying: false };
      }
    }

    // Check if current block time has elapsed
    if (nowUtc >= currentBlock.endUtc) {
      this.finalizeCurrentBlock(nowUtc, isPlayBlock ? 'schedule' : undefined);
      this.currentBlockIndex += 1;

      if (this.currentBlockIndex >= this.blocks.length) {
        if (this.targetSeconds !== undefined && this.creditedSeconds >= this.targetSeconds) {
          this.state = 'DONE';
          return { desiredPlaying: false };
        }
        this.replenishBlocks(nowUtc);
      }
    }

    const nextBlock = this.getCurrentBlock();
    const desiredPlaying = this.overlay === null && nextBlock?.type === 'play';
    return { desiredPlaying };
  }

  skipRest(nowUtc: number): void {
    const cur = this.getCurrentBlock();
    if (cur && cur.type === 'rest') {
      // Cut rest short to now
      cur.endUtc = nowUtc;
      cur.durationSec = Math.max(0, Math.round((cur.endUtc - cur.startUtc) / 1000));
      this.currentBlockIndex += 1;
      this.ensureBlocksAhead(nowUtc);
    }
  }

  extendPlay(seconds: number): void {
    const cur = this.getCurrentBlock();
    if (cur && cur.type === 'play') {
      cur.durationSec += seconds;
      cur.endUtc += seconds * 1000;
      // Shift subsequent blocks
      for (let i = this.currentBlockIndex + 1; i < this.blocks.length; i++) {
        const b = this.blocks[i]!;
        b.startUtc += seconds * 1000;
        b.endUtc += seconds * 1000;
      }
    }
  }

  replan(nowUtc: number): void {
    // Keep completed blocks, replan upcoming unlocked blocks from nowUtc
    const completed = this.blocks.slice(0, this.currentBlockIndex);
    const newBlocks = planTrackBlocks(
      this.rng,
      {
        profile: this.profile,
        quotaSeconds: this.targetSeconds,
        creditedSeconds: this.creditedSeconds,
        todayCreditedSeconds: this.todayCreditedSeconds,
        startTimeUtc: nowUtc,
        dailyQuotaSeconds: this.getEffectiveDailyQuota(nowUtc)
      },
      6
    );
    this.blocks = [...completed, ...newBlocks];
    this.currentBlockIndex = completed.length;
  }

  stop(): void {
    this.state = 'STOPPED';
  }

  private finalizeCurrentBlock(nowUtc: number, source?: 'schedule' | 'mirror' | 'manual'): void {
    if (source && this.activeBlockStartedAtUtc !== null) {
      const credited = Math.max(1, Math.round((nowUtc - this.activeBlockStartedAtUtc) / 1000));
      this.sessionLogs.push({
        id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        runId: this.runId,
        appId: this.appId,
        startUtc: this.activeBlockStartedAtUtc,
        endUtc: nowUtc,
        source,
        creditedSeconds: credited
      });
    }
    this.activeBlockStartedAtUtc = null;
  }

  private replenishBlocks(nowUtc: number): void {
    const upcoming = planTrackBlocks(
      this.rng,
      {
        profile: this.profile,
        quotaSeconds: this.targetSeconds,
        creditedSeconds: this.creditedSeconds,
        todayCreditedSeconds: this.todayCreditedSeconds,
        startTimeUtc: nowUtc,
        dailyQuotaSeconds: this.getEffectiveDailyQuota(nowUtc)
      },
      6
    );
    this.blocks = [...this.blocks, ...upcoming];
  }

  private ensureBlocksAhead(nowUtc: number): void {
    const remainingCount = this.blocks.length - this.currentBlockIndex;
    if (remainingCount < 4) {
      this.replenishBlocks(nowUtc);
    }
  }
}

