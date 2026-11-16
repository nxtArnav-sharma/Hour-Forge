import { RunMode, TrackState, TrackOverlay, Block } from '../core/types';

export type DiscordPresenceMode = 'hourforge' | 'none';

export interface AppSettings {
  startWithWindows: boolean;
  startHidden: boolean;
  closeToTray: boolean;
  theme: 'dark' | 'light' | 'system';
  onlineStatus: number; // 1 = Online, 7 = Invisible
  familyPin?: string;
  launchPickerCountdownSec: number; // default 60
  defaultTemplate?: {
    mode: RunMode;
    appIds: number[];
    profileId: string;
    targets?: Record<number, number>; // seconds
  };
  notifyOnBlocked: boolean;
  notifyOnFinish: boolean;
  notifyOnCrashLoop: boolean;
  keepAwake: boolean;
  pauseOnSleep: boolean;
  firstRunCompleted: boolean;
  startSteamAutomatically?: boolean;
  closeSteamOnQuit?: boolean;
  steamConnectedAccount?: string;
  steamId64Override?: string;
  hasSteamApiKey?: boolean;
  discordPresenceMode?: DiscordPresenceMode;
}

export interface GameHoursData {
  appId: number;
  steamHours: number;              // playtime_forever / 60
  hourforgeCreditedHours: number;  // total credited by HourForge for this game
  baselineSteamHours: number;      // initial synced Steam playtime
  steamGainHours: number;          // steamHours - baselineSteamHours
  creditedSinceBaselineHours: number; // credited hours since first sync
  isLagging: boolean;              // true if HF credited >= 0.5h more than Steam gain and session ended 30+ min ago
  lastSyncUtc: number;
}

export type SteamHoursSyncStatus =
  | 'NO_KEY'
  | 'OK'
  | 'INVALID_KEY'
  | 'PRIVATE_PROFILE'
  | 'RATE_LIMITED'
  | 'OFFLINE'
  | 'ERROR';

export interface SteamHoursSnapshot {
  status: SteamHoursSyncStatus;
  statusMessage?: string;
  hasApiKey: boolean;
  steamId64?: string;
  games: Record<number, GameHoursData>;
  lastPollUtc: number;
  nextPollUtc: number;
}

export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'MISSED_DEADLINE' | 'PAUSED';

export interface CatchUpGoal {
  id: string;                         // e.g. "goal_3513350"
  appId: number;
  targetHours: number;
  targetDate: string;                 // ISO date YYYY-MM-DD
  createdAtUtc: number;
  lastSyncedSteamHours?: number;      // verified Steam hours reading when idle >= 30m
  lastSyncUtc?: number;               // timestamp of verified reading
  manualStartingHours?: number;       // fallback when no API key
  userLabel?: string;                 // optional user-typed note or benchmark label
  friendHours?: number;               // public friend hours reading
  status: GoalStatus;
}

export type GoalPaceStatus =
  | 'ON_TRACK'
  | 'BEHIND'
  | 'AHEAD'
  | 'ACHIEVED'
  | 'MISSED_DEADLINE'
  | 'NOT_FEASIBLE';

export interface GoalPacingReport {
  goalId: string;
  appId: number;
  targetHours: number;
  targetDate: string;
  currentEffectiveHours: number;
  remainingHours: number;
  daysRemaining: number;
  safetyBufferDays: number;
  requiredDailyHours: number;
  baseDailyHours: number;
  targetDailyHoursToday: number;
  variationPct: number;
  profileDailyCapHours: number;
  isFeasible: boolean;
  feasibilityNotice?: string;
  earliestFeasibleDate: string;
  projectedFinishDate: string;
  recommendedProfiles: Array<{ id: string; name: string; dailyCapHours: number }>;
  recommendedDailyHours: number;
  paceStatus: GoalPaceStatus;
  paceDifferenceHours: number;
  requiredPcOnHoursPerDay: number;
  status: GoalStatus;
}

export interface GameEntry {
  appId: number;
  name: string;
  developer: string;
  publisher: string;
  headerImage?: string;
  isOwned?: boolean;
  processNames?: string[];
  defaultHours?: number;
  enabled?: boolean;
}

export interface TrackSnapshot {
  appId: number;
  state: TrackState;
  overlay: TrackOverlay | null;
  creditedSeconds: number;
  todayCreditedSeconds?: number;
  dailyQuotaSeconds?: number;
  targetSeconds?: number;
  currentBlockIndex: number;
  blocks: Block[];
}

export interface RunStateSnapshot {
  runId: string;
  mode: RunMode;
  status: 'IDLE' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'STOPPED';
  t0Utc: number;
  profileId: string;
  runSeed: string;
  tracks: TrackSnapshot[];
  lastSnapshotUtc: number;
}

export interface PlaytimeTotals {
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  allTimeSeconds: number;
}

