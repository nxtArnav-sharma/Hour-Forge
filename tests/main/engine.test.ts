import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { HourForgeEngine } from '../../src/main/engine/engine';
import { FakeSteamBackend } from '../../src/main/steam/fakeBackend';
import { AtomicStore } from '../../src/main/store/atomicStore';
import { BUILTIN_PROFILES } from '../../src/core/profiles';

describe('HourForge Main Engine & State Machine Integration', () => {
  const testDataDir = path.resolve('tmp_test_data');
  let store: AtomicStore;
  let backend: FakeSteamBackend;
  let engine: HourForgeEngine;

  beforeAll(async () => {
    await fs.mkdir(testDataDir, { recursive: true });
    store = new AtomicStore(testDataDir);
    await store.initialize();
    await store.saveGames([
      {
        appId: 3513350,
        name: 'Wuthering Waves',
        developer: 'Kuro Games',
        publisher: 'Kuro Games',
        enabled: true
      },
      {
        appId: 4508340,
        name: 'NTE: Neverness to Everness',
        developer: 'Hotta Studio',
        publisher: 'Perfect World Games',
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

  it('starts a run and initializes track snapshots', async () => {
    const profile = BUILTIN_PROFILES['fast-test']!;

    await engine.startRun({
      mode: 'DEDICATED',
      tracks: [
        { appId: 3513350, targetHours: 1 },
        { appId: 4508340, targetHours: 2 }
      ],
      profile
    });

    expect(engine.getStatus()).toBe('RUNNING');
    const snapshot = engine.getSnapshot();
    expect(snapshot.tracks.length).toBe(2);
    expect(snapshot.mode).toBe('DEDICATED');

    const wuwaTrack = snapshot.tracks.find(t => t.appId === 3513350);
    const nteTrack = snapshot.tracks.find(t => t.appId === 4508340);
    expect(wuwaTrack?.targetSeconds).toBe(3600);
    expect(nteTrack?.targetSeconds).toBe(7200);
  });

  it('pauses and resumes all tracks', async () => {
    engine.pauseAll();
    expect(engine.getStatus()).toBe('PAUSED');
    let snapshot = engine.getSnapshot();
    expect(snapshot.tracks[0]?.overlay).toBe('USER_PAUSED');

    engine.resumeAll();
    expect(engine.getStatus()).toBe('RUNNING');
    snapshot = engine.getSnapshot();
    expect(snapshot.tracks[0]?.overlay).toBeNull();
  });

  it('skips rest and extends play', async () => {
    const snapshotBefore = engine.getSnapshot();
    const curBlock = snapshotBefore.tracks[0]?.blocks[0];

    if (curBlock?.type === 'rest') {
      engine.skipRest(3513350);
      const snapshotAfter = engine.getSnapshot();
      expect(snapshotAfter.tracks[0]?.currentBlockIndex).toBeGreaterThanOrEqual(1);
    }

    engine.extendPlay(3513350, 900); // 15 min extend
    const snapshotExtended = engine.getSnapshot();
    expect(snapshotExtended.tracks[0]?.blocks[snapshotExtended.tracks[0].currentBlockIndex]?.durationSec)
      .toBeGreaterThanOrEqual(900);
  });

  it('persists snapshot and restores from it (crash recovery)', async () => {
    const snapshot = engine.getSnapshot();
    await store.saveRunSnapshot(snapshot);

    const saved = await store.getRunSnapshot();
    expect(saved).not.toBeNull();
    expect(saved?.runId).toBe(snapshot.runId);

    // Stop current engine, restore into new engine
    await engine.stopRun();
    expect(engine.getStatus()).toBe('STOPPED');

    const restoredEngine = new HourForgeEngine(backend, store);
    await restoredEngine.restoreFromSnapshot(saved!, BUILTIN_PROFILES['fast-test']!);
    expect(restoredEngine.getStatus()).toBe('RUNNING');
    expect(restoredEngine.getSnapshot().tracks.length).toBe(2);

    await restoredEngine.stopRun();
  });
});

