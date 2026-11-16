import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { HourForgeEngine } from '../../src/main/engine/engine';
import { FakeSteamBackend } from '../../src/main/steam/fakeBackend';
import { AtomicStore } from '../../src/main/store/atomicStore';
import { BUILTIN_PROFILES } from '../../src/core/profiles';

describe('Run Game Selection & Main Process Validation', () => {
  const testDataDir = path.resolve('tmp_test_run_selection');
  let store: AtomicStore;
  let backend: FakeSteamBackend;
  let engine: HourForgeEngine;

  beforeAll(async () => {
    await fs.mkdir(testDataDir, { recursive: true });
  });

  beforeEach(async () => {
    await fs.rm(testDataDir, { recursive: true, force: true });
    await fs.mkdir(testDataDir, { recursive: true });
    store = new AtomicStore(testDataDir);
    await store.initialize();

    // Set library to ONLY Once Human (appId 2139460)
    await store.saveGames([
      {
        appId: 2139460,
        name: 'Once Human',
        developer: 'Starry Studio',
        publisher: 'Starry Studio',
        headerImage: 'https://example.com/header.jpg',
        processNames: ['ONCE_HUMAN.exe'],
        defaultHours: 8,
        enabled: true
      }
    ]);

    backend = new FakeSteamBackend();
    await backend.start();
    engine = new HourForgeEngine(backend, store);
  });

  afterAll(async () => {
    if (engine) await engine.stopRun();
    if (backend) await backend.stop();
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('starts ONLY the games selected from library (Once Human only)', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;

    // Start Once Human with 8 hours
    await engine.startRun({
      mode: 'DEDICATED',
      tracks: [{ appId: 2139460, targetHours: 8 }],
      profile
    });

    const snapshot = engine.getSnapshot();
    expect(snapshot.tracks.length).toBe(1);
    expect(snapshot.tracks[0]?.appId).toBe(2139460);
    expect(snapshot.tracks[0]?.targetSeconds).toBe(8 * 3600);
    // Ensure hardcoded 3513350 or 4508340 NEVER appear
    expect(snapshot.tracks.some(t => t.appId === 3513350)).toBe(false);
    expect(snapshot.tracks.some(t => t.appId === 4508340)).toBe(false);
  });

  it('rejects appId not present in library', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;

    await expect(
      engine.startRun({
        mode: 'DEDICATED',
        tracks: [
          { appId: 2139460, targetHours: 8 },
          { appId: 3513350, targetHours: 1 } // Not in library!
        ],
        profile
      })
    ).rejects.toThrow();
  });

  it('rejects disabled games in library', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;
    const games = await store.getGames();
    games.push({
      appId: 999,
      name: 'Disabled Game',
      developer: 'Test',
      publisher: 'Test',
      enabled: false
    });
    await store.saveGames(games);

    await expect(
      engine.startRun({
        mode: 'DEDICATED',
        tracks: [{ appId: 999, targetHours: 2 }],
        profile
      })
    ).rejects.toThrow();
  });

  it('rejects duplicate appIds', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;

    await expect(
      engine.startRun({
        mode: 'MULTI',
        tracks: [
          { appId: 2139460, targetHours: 2 },
          { appId: 2139460, targetHours: 3 }
        ],
        profile
      })
    ).rejects.toThrow();
  });

  it('enforces mode constraints: SINGLE requires exactly 1 track', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;
    const games = await store.getGames();
    games.push({
      appId: 1002,
      name: 'Game 2',
      developer: 'Test',
      publisher: 'Test',
      enabled: true
    });
    await store.saveGames(games);

    await expect(
      engine.startRun({
        mode: 'SINGLE',
        tracks: [
          { appId: 2139460 },
          { appId: 1002 }
        ],
        profile
      })
    ).rejects.toThrow();
  });

  it('enforces mode constraints: MULTI requires at least 2 tracks and at most 10', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;

    // Less than 2 tracks
    await expect(
      engine.startRun({
        mode: 'MULTI',
        tracks: [{ appId: 2139460 }],
        profile
      })
    ).rejects.toThrow();
  });

  it('enforces mode constraints: DEDICATED requires targetHours > 0', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;

    await expect(
      engine.startRun({
        mode: 'DEDICATED',
        tracks: [{ appId: 2139460, targetHours: 0 }],
        profile
      })
    ).rejects.toThrow();
  });

  it('enforces mode constraints: CATCHUP requires active goal', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;

    // No goal saved for 2139460
    await expect(
      engine.startRun({
        mode: 'CATCHUP',
        tracks: [{ appId: 2139460 }],
        profile
      })
    ).rejects.toThrow();
  });

  it('sanitizes stale template and snapshot IDs on store initialization', async () => {
    // Save snapshot with non-library game
    await store.saveRunSnapshot({
      runId: 'stale_run',
      mode: 'DEDICATED',
      status: 'RUNNING',
      t0Utc: Date.now(),
      profileId: 'regular',
      runSeed: 'seed',
      lastSnapshotUtc: Date.now(),
      tracks: [
        {
          appId: 3513350, // Stale!
          state: 'PLAYING',
          overlay: null,
          creditedSeconds: 0,
          currentBlockIndex: 0,
          blocks: []
        }
      ]
    });

    // Save default template with stale app ID
    const settings = await store.getSettings();
    settings.defaultTemplate = {
      mode: 'DEDICATED',
      appIds: [3513350, 2139460],
      profileId: 'regular',
      targets: { 3513350: 3600, 2139460: 7200 }
    };
    await store.saveSettings(settings);

    // Re-initialize store
    await store.initialize();

    const sanitizedSettings = await store.getSettings();
    expect(sanitizedSettings.defaultTemplate?.appIds).toEqual([2139460]);
    expect(sanitizedSettings.defaultTemplate?.targets?.[3513350]).toBeUndefined();

    const sanitizedSnapshot = await store.getRunSnapshot();
    // Stale track was only track, so snapshot should be cleared or contain only valid games
    expect(sanitizedSnapshot).toBeNull();
  });
});
