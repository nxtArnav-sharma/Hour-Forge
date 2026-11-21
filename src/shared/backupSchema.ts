import { z } from 'zod';

export const BACKUP_SCHEMA_VERSION = 2;
export const MAX_BACKUP_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB file size limit

export const DefaultTemplateBackupSchema = z
  .object({
    mode: z.enum(['DEDICATED', 'SINGLE', 'MULTI', 'CATCHUP', 'CUSTOM']),
    appIds: z.array(z.number().int().positive()).max(50),
    profileId: z.string().min(1).max(50),
    targets: z.record(z.string(), z.number().positive()).optional(),
    customPatternId: z.string().max(50).optional()
  })
  .strict();

export const AppSettingsBackupSchema = z
  .object({
    startWithWindows: z.boolean(),
    startHidden: z.boolean(),
    closeToTray: z.boolean(),
    theme: z.enum(['dark', 'light', 'system']),
    onlineStatus: z.number().int().min(1).max(7),
    launchPickerCountdownSec: z.number().int().min(5).max(300),
    showLaunchPickerAtStartup: z.boolean().optional(),
    defaultTemplate: DefaultTemplateBackupSchema.optional(),
    notifyOnBlocked: z.boolean(),
    notifyOnFinish: z.boolean(),
    notifyOnCrashLoop: z.boolean(),
    keepAwake: z.boolean(),
    pauseOnSleep: z.boolean(),
    firstRunCompleted: z.boolean(),
    startSteamAutomatically: z.boolean().optional(),
    closeSteamOnQuit: z.boolean().optional(),
    discordPresenceMode: z.enum(['hourforge', 'none']).optional()
  })
  .strict();

export const GameEntryBackupSchema = z
  .object({
    appId: z.number().int().positive(),
    name: z.string().min(1).max(200),
    developer: z.string().max(200).optional(),
    publisher: z.string().max(200).optional(),
    headerImage: z.string().max(1000).optional(),
    isOwned: z.boolean().optional(),
    processNames: z.array(z.string().max(100)).max(50).optional(),
    defaultHours: z.number().min(0).max(100000).optional()
  })
  .strict();

const SessionConfigSchema = z
  .object({
    minMin: z.number().int().min(1).max(1440),
    maxMin: z.number().int().min(1).max(1440)
  })
  .strict()
  .refine(s => s.minMin <= s.maxMin, {
    message: 'session minMin must be <= maxMin'
  });

const RestConfigSchema = z
  .object({
    minMin: z.number().int().min(1).max(1440),
    maxMin: z.number().int().min(1).max(1440),
    longChance: z.number().min(0).max(1),
    longMinMin: z.number().int().min(0).max(1440),
    longMaxMin: z.number().int().min(0).max(1440)
  })
  .strict()
  .refine(r => r.minMin <= r.maxMin, {
    message: 'rest minMin must be <= maxMin'
  })
  .refine(r => r.longMinMin <= r.longMaxMin, {
    message: 'rest longMinMin must be <= longMaxMin'
  })
  .transform(r => ({
    minMin: Math.min(60, r.minMin),
    maxMin: Math.min(60, r.maxMin),
    longChance: r.longChance,
    longMinMin: Math.min(60, r.longMinMin),
    longMaxMin: Math.min(60, r.longMaxMin)
  }));

const BootJitterSchema = z
  .object({
    min: z.number().int().min(0).max(3600),
    max: z.number().int().min(0).max(3600)
  })
  .strict()
  .refine(b => b.min <= b.max, {
    message: 'bootJitterSec min must be <= max'
  });

const ActiveWindowSchema = z
  .object({
    start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Invalid activeWindow start time (HH:mm)'),
    end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Invalid activeWindow end time (HH:mm)'),
    edgeJitterMin: z.number().int().min(0).max(120)
  })
  .strict();

export const HumanProfileBackupSchema = z
  .object({
    id: z.string().min(1).max(50),
    name: z.string().min(1).max(100),
    session: SessionConfigSchema.optional(),
    rest: RestConfigSchema.optional(),
    restScalesWithSession: z.boolean().optional(),
    bootJitterSec: BootJitterSchema.optional(),
    activeWindow: ActiveWindowSchema.optional(),
    dailyCapHours: z.number().min(1).max(24).optional(),
    weekendSessionBoost: z.number().min(0.5).max(3.0).optional()
  })
  .strict();

export const CatchUpGoalBackupSchema = z
  .object({
    id: z.string().min(1).max(50),
    appId: z.number().int().positive(),
    targetHours: z.number().positive().max(100000),
    targetDate: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, 'Invalid target date (YYYY-MM-DD)'),
    createdAtUtc: z.number().int().positive(),
    lastSyncedSteamHours: z.number().min(0).max(100000).optional(),
    lastSyncUtc: z.number().int().positive().optional(),
    manualStartingHours: z.number().min(0).max(100000).optional(),
    userLabel: z.string().max(100).optional(),
    friendHours: z.number().min(0).max(100000).optional(),
    status: z.enum(['ACTIVE', 'ACHIEVED', 'MISSED_DEADLINE', 'PAUSED'])
  })
  .strict();

export const SessionLogEntryBackupSchema = z
  .object({
    id: z.string().min(1).max(100),
    runId: z.string().min(1).max(100),
    appId: z.number().int().positive(),
    startUtc: z.number().int().positive(),
    endUtc: z.number().int().positive(),
    source: z.enum(['schedule', 'mirror', 'manual']),
    creditedSeconds: z.number().int().min(0)
  })
  .strict();

export const CustomStepBackupSchema = z
  .object({
    type: z.enum(['play', 'rest']),
    minMin: z.number().int().min(1).max(1440),
    maxMin: z.number().int().min(1).max(1440)
  })
  .strict()
  .refine(s => s.minMin <= s.maxMin, {
    message: 'minMin must be <= maxMin'
  })
  .transform(s => ({
    type: s.type,
    minMin: s.type === 'rest' ? Math.min(60, s.minMin) : s.minMin,
    maxMin: s.type === 'rest' ? Math.min(60, s.maxMin) : s.maxMin
  }));

export const CustomPatternBackupSchema = z
  .object({
    id: z.string().min(1).max(50),
    name: z.string().trim().min(1).max(40),
    steps: z.array(CustomStepBackupSchema).min(2).max(12).refine(steps => {
      const hasPlay = steps.some(s => s.type === 'play');
      const hasRest = steps.some(s => s.type === 'rest');
      return hasPlay && hasRest;
    }, {
      message: 'Pattern must contain at least one play step and one rest step.'
    }),
    dailyLimitHours: z.number().min(1).max(24).optional(),
    activeWindow: z
      .object({
        start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Invalid activeWindow start time (HH:mm)'),
        end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Invalid activeWindow end time (HH:mm)'),
        edgeJitterMin: z.number().int().min(0).max(15)
      })
      .strict()
      .optional()
  })
  .strict();

export const BackupFileSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    exportedAtUtc: z.number().int().positive(),
    appVersion: z.string().min(1).max(50),
    settings: AppSettingsBackupSchema,
    games: z.array(GameEntryBackupSchema).max(500),
    profiles: z.array(HumanProfileBackupSchema).max(50),
    goals: z.array(CatchUpGoalBackupSchema).max(200),
    customPatterns: z.array(CustomPatternBackupSchema).max(20).optional(),
    history: z.array(SessionLogEntryBackupSchema).max(50000).optional()
  })
  .strict();

export type BackupFile = z.infer<typeof BackupFileSchema>;

export interface BackupPreviewDiffItem {
  id: string | number;
  label: string;
}

export interface BackupPreview {
  schemaVersion: number;
  exportedAtUtc: number;
  appVersion: string;
  games: {
    totalInBackup: number;
    toAdd: BackupPreviewDiffItem[];
    toUpdate: BackupPreviewDiffItem[];
    unchanged: BackupPreviewDiffItem[];
  };
  profiles: {
    totalInBackup: number;
    toAdd: BackupPreviewDiffItem[];
    toUpdate: BackupPreviewDiffItem[];
    unchanged: BackupPreviewDiffItem[];
  };
  goals: {
    totalInBackup: number;
    toAdd: BackupPreviewDiffItem[];
    toUpdate: BackupPreviewDiffItem[];
    unchanged: BackupPreviewDiffItem[];
  };
  customPatterns?: {
    totalInBackup: number;
    toAdd: BackupPreviewDiffItem[];
    toUpdate: BackupPreviewDiffItem[];
    unchanged: BackupPreviewDiffItem[];
  };
  historyCount: number;
  hasSettings: boolean;
}

export interface AutoBackupInfo {
  filename: string;
  createdAtUtc: number;
  sizeBytes: number;
}
