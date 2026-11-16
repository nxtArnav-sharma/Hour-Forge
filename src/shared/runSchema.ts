import { z } from 'zod';
import { GameEntry, CatchUpGoal } from './models';

export const RunTrackSchema = z.object({
  appId: z.number().int().positive(),
  targetHours: z.number().positive().optional(),
  dailyQuotaHours: z.number().positive().optional()
});

export const StartRunInputSchema = z.object({
  mode: z.enum(['SINGLE', 'MULTI', 'DEDICATED', 'CATCHUP']),
  tracks: z.array(RunTrackSchema),
  profile: z.object({
    id: z.string(),
    name: z.string()
  }).passthrough(),
  runSeed: z.string().optional(),
  delayMs: z.number().nonnegative().optional()
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
  }

  return parsed;
}
