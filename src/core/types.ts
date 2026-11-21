export const MAX_BREAK_SECONDS = 3600;

export type BlockType = 'play' | 'rest';

export type BlockReason = 'sample' | 'active_window' | 'daily_cap' | 'boot_jitter';

export type BlockCutReason = 'active_window_boundary' | 'daily_cap' | 'quota_end';

export interface Block {
  id: string;
  type: BlockType;
  startUtc: number;     // epoch ms
  endUtc: number;       // epoch ms
  durationSec: number;  // seconds
  reason?: BlockReason;
  cutReason?: BlockCutReason;
  locked?: boolean;
  isExact?: boolean;
  stepIndex?: number;
  stepMinSec?: number;
  stepMaxSec?: number;
}

export interface CustomStep {
  type: 'play' | 'rest';
  minMin: number;
  maxMin: number;
}

export interface CustomPattern {
  id: string;
  name: string;
  steps: CustomStep[];
  dailyLimitHours?: number;
  activeWindow?: {
    start: string;
    end: string;
    edgeJitterMin: number;
  };
}

export interface HumanProfile {
  id: string;
  name: string;
  session: {
    minMin: number;
    maxMin: number;
  };
  rest: {
    minMin: number;
    maxMin: number;
    longChance: number;
    longMinMin: number;
    longMaxMin: number;
  };
  restScalesWithSession: boolean;
  bootJitterSec: {
    min: number;
    max: number;
  };
  activeWindow?: {
    start: string;          // "HH:mm" local
    end: string;            // "HH:mm" local
    edgeJitterMin: number;
  };
  dailyCapHours?: number;   // per track per local day
  weekendSessionBoost?: number; // multiplier on Saturday and Sunday
}

export type TrackState =
  | 'PLANNED'
  | 'WAITING_START'
  | 'PLAYING'
  | 'RESTING'
  | 'DONE'
  | 'STOPPED';

export type TrackOverlay =
  | 'BLOCKED'
  | 'SUSPENDED'
  | 'MIRRORING'
  | 'USER_PAUSED';

export type RunMode = 'SINGLE' | 'MULTI' | 'DEDICATED' | 'CATCHUP' | 'CUSTOM';

export interface TrackConfig {
  appId: number;
  targetSeconds?: number; // quota for DEDICATED, optional for SINGLE
}

export interface SessionLogEntry {
  id: string;
  runId: string;
  appId: number;
  startUtc: number;
  endUtc: number;
  source: 'schedule' | 'mirror' | 'manual';
  creditedSeconds: number;
}
