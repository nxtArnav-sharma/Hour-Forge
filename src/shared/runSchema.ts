import { z } from 'zod';
import { GameEntry, CatchUpGoal } from './models';

export const CustomStepSchema = z
  .object({
    type: z.enum(['play', 'rest']),
    minMin: z.number().int().min(1).max(480),
    maxMin: z.number().int().min(1).max(480)
  })
  .strict()
  .refine(s => s.minMin <= s.maxMin, {
    message: 'minMin must be <= maxMin'
  })
  .superRefine((s, ctx) => {
    if (s.type === 'play') {
      if (s.minMin < 5 || s.maxMin > 480) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Play steps must be between 5 and 480 minutes.'
        });
      }
    } else if (s.type === 'rest') {
      if (s.minMin < 1 || s.maxMin > 60) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Breaks are limited to 60 minutes.'
        });
      }
    }
  });

export const CustomPatternSchema = z
  .object({
    id: z.string().min(1).max(50),
    name: z.string().trim().min(1).max(40),
    steps: z.array(CustomStepSchema).min(2).max(12).refine(steps => {
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

export const RunTrackSchema = z.object({
  appId: z.number().int().positive(),
  targetHours: z.number().positive().optional(),
  dailyQuotaHours: z.number().positive().optional()
});

export const StartRunInputSchema = z.object({
  mode: z.enum(['SINGLE', 'MULTI', 'DEDICATED', 'CATCHUP', 'CUSTOM']),
  tracks: z.array(RunTrackSchema),
  profile: z.object({
    id: z.string(),
    name: z.string()
  }).passthrough(),
  runSeed: z.string().optional(),
  delayMs: z.number().nonnegative().optional(),
  customPattern: CustomPatternSchema.optional()
});

export type ValidatedStartRunOptions = z.infer<typeof StartRunInputSchema>;

export function validateRunOptions(
  options: any,
  libraryGames: GameEntry[],
  activeGoals: CatchUpGoal[] = []
): ValidatedStartRunOptions {
  const parsed = StartRunInputSchema.parse(options);

  // 1. Check duplicate appIds
  const appIds = parsed.tracks.map(t => t.appId);
  if (new Set(appIds).size !== appIds.length) {
    throw new Error('Duplicate appIds found in run tracks');
  }

  // 2. Check each appId is in library AND enabled !== false
  const enabledGameMap = new Map(
    libraryGames.filter(g => g.enabled !== false).map(g => [g.appId, g])
  );
  for (const t of parsed.tracks) {
    if (!enabledGameMap.has(t.appId)) {
      throw new Error(`App ID ${t.appId} does not exist in library or is disabled`);
    }
  }

  // 3. Check mode constraints
  switch (parsed.mode) {
    case 'SINGLE':
      if (parsed.tracks.length !== 1) {
        throw new Error('SINGLE mode requires exactly 1 track');
      }
      break;
    case 'MULTI':
      if (parsed.tracks.length < 2 || parsed.tracks.length > 10) {
        throw new Error('MULTI mode requires between 2 and 10 tracks');
      }
      break;
    case 'DEDICATED':
      if (parsed.tracks.length < 1 || parsed.tracks.length > 10) {
        throw new Error('DEDICATED mode requires between 1 and 10 tracks');
      }
      for (const t of parsed.tracks) {
        if (typeof t.targetHours !== 'number' || t.targetHours <= 0) {
          throw new Error(`DEDICATED mode track ${t.appId} requires targetHours > 0`);
        }
      }
      break;
    case 'CATCHUP':
      if (parsed.tracks.length < 1 || parsed.tracks.length > 10) {
        throw new Error('CATCHUP mode requires between 1 and 10 tracks');
      }
      const goalAppIds = new Set(activeGoals.map(g => g.appId));
      for (const t of parsed.tracks) {
        if (!goalAppIds.has(t.appId)) {
          throw new Error(`CATCHUP mode track ${t.appId} has no active goal`);
        }
      }
      break;
    case 'CUSTOM':
      if (parsed.tracks.length < 1 || parsed.tracks.length > 10) {
        throw new Error('CUSTOM mode requires between 1 and 10 tracks');
      }
      if (!parsed.customPattern) {
        throw new Error('CUSTOM mode requires a customPattern');
      }
      CustomPatternSchema.parse(parsed.customPattern);
      break;
  }

  return parsed;
}
