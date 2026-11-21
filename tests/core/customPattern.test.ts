import { describe, it, expect } from 'vitest';
import { Mulberry32 } from '../../src/core/rng';
import { planTrackBlocks, avoidBoundaryCollisions } from '../../src/core/planner';
import { TrackStateMachine } from '../../src/core/track';
import { CustomStepSchema, CustomPatternSchema, validateRunOptions } from '../../src/shared/runSchema';
import { BUILTIN_CUSTOM_PATTERN, BUILTIN_PROFILES } from '../../src/core/profiles';
import { CustomPattern, CustomStep, HumanProfile } from '../../src/core/types';
import { BackupFileSchema } from '../../src/shared/backupSchema';

describe('Custom Operating Mode & Patterns (Task 2)', () => {
  const defaultProfile: HumanProfile = BUILTIN_PROFILES[0]!;

  describe('Schema Validation', () => {
    it('validates a valid custom pattern with exact steps', () => {
      const valid = CustomPatternSchema.safeParse(BUILTIN_CUSTOM_PATTERN);
      expect(valid.success).toBe(true);
    });

    it('validates ranges and optional activeWindow and dailyLimitHours', () => {
      const pattern: CustomPattern = {
        id: 'pat-1',
        name: 'My Pattern',
        steps: [
          { type: 'play', minMin: 10, maxMin: 45 },
          { type: 'rest', minMin: 5, maxMin: 15 }
        ],
        dailyLimitHours: 8,
        activeWindow: {
          start: '10:00',
          end: '22:00',
          edgeJitterMin: 10
        }
      };
      const parsed = CustomPatternSchema.safeParse(pattern);
      expect(parsed.success).toBe(true);
    });

    it('rejects play step below 5 minutes or above 480 minutes', () => {
      expect(CustomStepSchema.safeParse({ type: 'play', minMin: 4, maxMin: 10 }).success).toBe(false);
      expect(CustomStepSchema.safeParse({ type: 'play', minMin: 10, maxMin: 481 }).success).toBe(false);
    });

    it('rejects rest step below 1 minute or above 60 minutes', () => {
      expect(CustomStepSchema.safeParse({ type: 'rest', minMin: 0, maxMin: 10 }).success).toBe(false);
      expect(CustomStepSchema.safeParse({ type: 'rest', minMin: 5, maxMin: 65 }).success).toBe(false);
    });

    it('rejects minMin > maxMin', () => {
      expect(CustomStepSchema.safeParse({ type: 'play', minMin: 30, maxMin: 20 }).success).toBe(false);
      expect(CustomStepSchema.safeParse({ type: 'rest', minMin: 15, maxMin: 5 }).success).toBe(false);
    });

    it('rejects pattern with fewer than 2 steps or more than 12 steps', () => {
      expect(
        CustomPatternSchema.safeParse({
          id: 'p1',
          name: 'Too short',
          steps: [{ type: 'play', minMin: 60, maxMin: 60 }]
        }).success
      ).toBe(false);

      const thirteenSteps: CustomStep[] = Array(13).fill(null).map((_, i) => ({
        type: i % 2 === 0 ? 'play' : 'rest',
        minMin: 10,
        maxMin: 10
      }));
      expect(
        CustomPatternSchema.safeParse({
          id: 'p2',
          name: 'Too long',
          steps: thirteenSteps
        }).success
      ).toBe(false);
    });

    it('rejects pattern without both play and rest steps', () => {
      expect(
        CustomPatternSchema.safeParse({
          id: 'p1',
          name: 'All play',
          steps: [
            { type: 'play', minMin: 10, maxMin: 20 },
            { type: 'play', minMin: 20, maxMin: 30 }
          ]
        }).success
      ).toBe(false);

      expect(
        CustomPatternSchema.safeParse({
          id: 'p2',
          name: 'All rest',
          steps: [
            { type: 'rest', minMin: 5, maxMin: 10 },
            { type: 'rest', minMin: 10, maxMin: 15 }
          ]
        }).success
      ).toBe(false);
    });

    it('rejects bad pattern names (empty or too long)', () => {
      expect(
        CustomPatternSchema.safeParse({
          id: 'p1',
          name: '   ',
          steps: BUILTIN_CUSTOM_PATTERN.steps
        }).success
      ).toBe(false);

      expect(
        CustomPatternSchema.safeParse({
          id: 'p2',
          name: 'A'.repeat(45),
          steps: BUILTIN_CUSTOM_PATTERN.steps
        }).success
      ).toBe(false);
    });
  });

  describe('Planner with Custom Patterns', () => {
    it('produces the exact sequence 60, 5, 120, 60 and repeats for "My original example"', () => {
      const rng = new Mulberry32(12345);
      const startTime = 1700000000000;
      const blocks = planTrackBlocks(
        rng,
        {
          profile: defaultProfile,
          customPattern: BUILTIN_CUSTOM_PATTERN,
          startTimeUtc: startTime,
          isFirstBlockOfRun: false
        },
        8
      );

      expect(blocks.length).toBe(8);
      // Step 0: Play 60m (3600s)
      expect(blocks[0]!.type).toBe('play');
      expect(blocks[0]!.durationSec).toBe(60 * 60);
      expect(blocks[0]!.isExact).toBe(true);

      // Step 1: Rest 5m (300s)
      expect(blocks[1]!.type).toBe('rest');
      expect(blocks[1]!.durationSec).toBe(5 * 60);
      expect(blocks[1]!.isExact).toBe(true);

      // Step 2: Play 120m (7200s)
      expect(blocks[2]!.type).toBe('play');
      expect(blocks[2]!.durationSec).toBe(120 * 60);
      expect(blocks[2]!.isExact).toBe(true);

      // Step 3: Rest 60m (3600s)
      expect(blocks[3]!.type).toBe('rest');
      expect(blocks[3]!.durationSec).toBe(60 * 60);
      expect(blocks[3]!.isExact).toBe(true);

      // Step 4 (Repeat step 0): Play 60m
      expect(blocks[4]!.type).toBe('play');
      expect(blocks[4]!.durationSec).toBe(60 * 60);

      // Step 5 (Repeat step 1): Rest 5m
      expect(blocks[5]!.type).toBe('rest');
      expect(blocks[5]!.durationSec).toBe(5 * 60);

      // Step 6 (Repeat step 2): Play 120m
      expect(blocks[6]!.type).toBe('play');
      expect(blocks[6]!.durationSec).toBe(120 * 60);

      // Step 7 (Repeat step 3): Rest 60m
      expect(blocks[7]!.type).toBe('rest');
      expect(blocks[7]!.durationSec).toBe(60 * 60);
    });

    it('respects range bounds over 1,000 draws for variable steps', () => {
      const variablePattern: CustomPattern = {
        id: 'var-pat',
        name: 'Variable Pattern',
        steps: [
          { type: 'play', minMin: 15, maxMin: 90 },
          { type: 'rest', minMin: 5, maxMin: 45 }
        ]
      };

      const rng = new Mulberry32(99999);
      for (let i = 0; i < 500; i++) {
        const blocks = planTrackBlocks(
          rng,
          {
            profile: defaultProfile,
            customPattern: variablePattern,
            startTimeUtc: 1700000000000 + i * 10000,
            isFirstBlockOfRun: false
          },
          2
        );
        const playBlock = blocks[0]!;
        const restBlock = blocks[1]!;
        expect(playBlock.durationSec).toBeGreaterThanOrEqual(15 * 60);
        expect(playBlock.durationSec).toBeLessThanOrEqual(90 * 60);
        expect(restBlock.durationSec).toBeGreaterThanOrEqual(5 * 60);
        expect(restBlock.durationSec).toBeLessThanOrEqual(45 * 60);
        expect(restBlock.durationSec).toBeLessThanOrEqual(3600);
      }
    });

    it('first block has boot jitter when isFirstBlockOfRun is true', () => {
      const rng = new Mulberry32(42);
      const startTime = 1700000000000;
      const blocks = planTrackBlocks(
        rng,
        {
          profile: defaultProfile,
          customPattern: BUILTIN_CUSTOM_PATTERN,
          startTimeUtc: startTime,
          isFirstBlockOfRun: true
        },
        5
      );

      // First block is boot jitter rest block between 45 and 420 seconds
      expect(blocks[0]!.type).toBe('rest');
      expect(blocks[0]!.reason).toBe('boot_jitter');
      expect(blocks[0]!.durationSec).toBeGreaterThanOrEqual(45);
      expect(blocks[0]!.durationSec).toBeLessThanOrEqual(420);

      // Followed by step 0: play 60m
      expect(blocks[1]!.type).toBe('play');
      expect(blocks[1]!.durationSec).toBe(60 * 60);
    });

    it('multi-track exact steps remain offset by their boot jitter and collision avoidance leaves them untouched', () => {
      const rng1 = new Mulberry32(1111);
      const rng2 = new Mulberry32(2222);
      const rng3 = new Mulberry32(3333);
      const t0 = 1700000000000;

      const track1 = planTrackBlocks(rng1, { profile: defaultProfile, customPattern: BUILTIN_CUSTOM_PATTERN, startTimeUtc: t0, isFirstBlockOfRun: true }, 4);
      const track2 = planTrackBlocks(rng2, { profile: defaultProfile, customPattern: BUILTIN_CUSTOM_PATTERN, startTimeUtc: t0, isFirstBlockOfRun: true }, 4);
      const track3 = planTrackBlocks(rng3, { profile: defaultProfile, customPattern: BUILTIN_CUSTOM_PATTERN, startTimeUtc: t0, isFirstBlockOfRun: true }, 4);

      const jitter1 = track1[0]!.durationSec;
      const jitter2 = track2[0]!.durationSec;
      const jitter3 = track3[0]!.durationSec;

      // Because seeds differ, boot jitters differ
      expect(jitter1).not.toBe(jitter2);
      expect(jitter3).not.toBe(jitter1);

      const adjusted = avoidBoundaryCollisions([track1, track2, track3], new Mulberry32(4444));

      // Exact steps are untouched
      expect(adjusted[0]![1]!.startUtc).toBe(track1[1]!.startUtc);
      expect(adjusted[0]![1]!.durationSec).toBe(track1[1]!.durationSec);
      expect(adjusted[1]![1]!.startUtc).toBe(track2[1]!.startUtc);
      expect(adjusted[1]![1]!.durationSec).toBe(track2[1]!.durationSec);
      expect(adjusted[2]![1]!.startUtc).toBe(track3[1]!.startUtc);
      expect(adjusted[2]![1]!.durationSec).toBe(track3[1]!.durationSec);
    });
  });

  describe('TrackStateMachine & Restart / Sleep Gap Behavior', () => {
    it('initializes and maintains step index through progression', () => {
      const sm = new TrackStateMachine({
        runId: 'r1',
        runSeed: 'seed_1',
        appId: 100,
        profile: defaultProfile,
        t0Utc: 1700000000000,
        customPattern: BUILTIN_CUSTOM_PATTERN
      });

      expect(sm.getCustomStepIndex()).toBe(0);
      expect(sm.getStepElapsedSec()).toBe(0);
    });

    it('resumes mid-step after gap under 30 minutes without skipping', () => {
      const sm = new TrackStateMachine({
        runId: 'r1',
        runSeed: 'seed_1',
        appId: 100,
        profile: defaultProfile,
        t0Utc: 1700000000000,
        customPattern: BUILTIN_CUSTOM_PATTERN,
        initialStepIndex: 2, // Play 120m step
        initialStepElapsedSec: 30 * 60 // 30m elapsed
      });

      // Gap of 10 minutes (< 30 minutes)
      sm.replan(1700000000000 + 600000, 10 * 60 * 1000);
      expect(sm.getCustomStepIndex()).toBe(2);
      const blocks = sm.getBlocks();
      // Remaining play time should be 120m - 30m = 90m (5400s)
      expect(blocks[0]!.type).toBe('play');
      expect(blocks[0]!.durationSec).toBe(90 * 60);
    });

    it('skips to next rest step after gap of 30 minutes or more', () => {
      const sm = new TrackStateMachine({
        runId: 'r1',
        runSeed: 'seed_1',
        appId: 100,
        profile: defaultProfile,
        t0Utc: 1700000000000,
        customPattern: BUILTIN_CUSTOM_PATTERN,
        initialStepIndex: 0, // Play 60m step
        initialStepElapsedSec: 20 * 60
      });

      // Gap of 35 minutes (>= 30 minutes)
      sm.replan(1700000000000 + 35 * 60 * 1000, 35 * 60 * 1000);

      // Skips to next rest step: step 1 (Rest 5m)
      expect(sm.getCustomStepIndex()).toBe(1);
      const blocks = sm.getBlocks();
      expect(blocks[0]!.type).toBe('rest');
      expect(blocks[0]!.durationSec).toBe(5 * 60);
    });
  });

  describe('Backup Schema v2 Compatibility', () => {
    it('validates schemaVersion 2 with customPatterns', () => {
      const backupPayload = {
        schemaVersion: 2,
        exportedAtUtc: 1700000000000,
        appVersion: '0.1.3',
        settings: {
          startWithWindows: false,
          startHidden: false,
          closeToTray: true,
          theme: 'dark' as const,
          onlineStatus: 1,
          launchPickerCountdownSec: 60,
          showLaunchPickerAtStartup: true,
          notifyOnBlocked: true,
          notifyOnFinish: true,
          notifyOnCrashLoop: true,
          keepAwake: false,
          pauseOnSleep: true,
          firstRunCompleted: true
        },
        games: [],
        profiles: [],
        goals: [],
        customPatterns: [BUILTIN_CUSTOM_PATTERN]
      };

      const parsed = BackupFileSchema.safeParse(backupPayload);
      expect(parsed.success).toBe(true);
    });

    it('accepts schemaVersion 1 backups without customPatterns', () => {
      const v1Payload = {
        schemaVersion: 1,
        exportedAtUtc: 1700000000000,
        appVersion: '0.1.2',
        settings: {
          startWithWindows: false,
          startHidden: false,
          closeToTray: true,
          theme: 'dark' as const,
          onlineStatus: 1,
          launchPickerCountdownSec: 60,
          notifyOnBlocked: true,
          notifyOnFinish: true,
          notifyOnCrashLoop: true,
          keepAwake: false,
          pauseOnSleep: true,
          firstRunCompleted: true
        },
        games: [],
        profiles: [],
        goals: []
      };

      const parsed = BackupFileSchema.safeParse(v1Payload);
      expect(parsed.success).toBe(true);
    });

    it('clamps imported custom patterns rest breaks exceeding 60m', () => {
      const patternWithLongRest = {
        id: 'pat-long',
        name: 'Long Rest Pattern',
        steps: [
          { type: 'play' as const, minMin: 60, maxMin: 60 },
          { type: 'rest' as const, minMin: 90, maxMin: 120 }
        ]
      };

      const backupPayload = {
        schemaVersion: 2,
        exportedAtUtc: 1700000000000,
        appVersion: '0.1.3',
        settings: {
          startWithWindows: false,
          startHidden: false,
          closeToTray: true,
          theme: 'dark' as const,
          onlineStatus: 1,
          launchPickerCountdownSec: 60,
          notifyOnBlocked: true,
          notifyOnFinish: true,
          notifyOnCrashLoop: true,
          keepAwake: false,
          pauseOnSleep: true,
          firstRunCompleted: true
        },
        games: [],
        profiles: [],
        goals: [],
        customPatterns: [patternWithLongRest]
      };

      const parsed = BackupFileSchema.parse(backupPayload);
      const restStep = parsed.customPatterns![0]!.steps[1]!;
      expect(restStep.minMin).toBe(60);
      expect(restStep.maxMin).toBe(60);
    });
  });

  describe('Run Selection Rules in Custom Mode', () => {
    it('validates between 1 and 10 tracks for CUSTOM mode', () => {
      const games = [{ appId: 100, name: 'Game 100', enabled: true, developer: '', publisher: '' }];
      const valid = validateRunOptions(
        {
          mode: 'CUSTOM',
          tracks: [{ appId: 100 }],
          profile: { id: 'regular', name: 'Regular' },
          customPattern: BUILTIN_CUSTOM_PATTERN
        },
        games
      );
      expect(valid.mode).toBe('CUSTOM');
      expect(valid.tracks.length).toBe(1);
    });

    it('rejects CUSTOM mode when customPattern is missing', () => {
      const games = [{ appId: 100, name: 'Game 100', enabled: true, developer: '', publisher: '' }];
      expect(() => {
        validateRunOptions(
          {
            mode: 'CUSTOM',
            tracks: [{ appId: 100 }],
            profile: { id: 'regular', name: 'Regular' }
          },
          games
        );
      }).toThrow('CUSTOM mode requires a customPattern');
    });

    it('rejects unticked or disabled games in CUSTOM mode', () => {
      const games = [{ appId: 100, name: 'Game 100', enabled: false, developer: '', publisher: '' }];
      expect(() => {
        validateRunOptions(
          {
            mode: 'CUSTOM',
            tracks: [{ appId: 100 }],
            profile: { id: 'regular', name: 'Regular' },
            customPattern: BUILTIN_CUSTOM_PATTERN
          },
          games
        );
      }).toThrow('does not exist in library or is disabled');
    });
  });
});
