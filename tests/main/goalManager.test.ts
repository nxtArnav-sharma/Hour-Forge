import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { AtomicStore, SafeStorageAdapter } from '../../src/main/store/atomicStore';
import { GoalManager } from '../../src/main/engine/goalManager';
import { FakeSteamBackend } from '../../src/main/steam/fakeBackend';
import { HourForgeEngine } from '../../src/main/engine/engine';
import { BUILTIN_PROFILES } from '../../src/core/profiles';

class MockSafeStorage implements SafeStorageAdapter {
  isEncryptionAvailable(): boolean {
    return true;
  }
  encryptString(plainText: string): Buffer {
    return Buffer.from(`ENC:${plainText}`, 'utf8');
  }
  decryptString(encrypted: Buffer): string {
    const str = encrypted.toString('utf8');
    if (str.startsWith('ENC:')) return str.substring(4);
    throw new Error('Decryption failed');
  }
}

describe('GoalManager Service (Clarifications 1, 2, 3)', () => {
  let tempDir: string;
  let store: AtomicStore;
  let backend: FakeSteamBackend;
  let engine: HourForgeEngine;
  let nowMs = 1700000000000;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf_goal_mgr_test_'));
    store = new AtomicStore(tempDir, new MockSafeStorage());
    await store.initialize();

    await store.saveProfiles([
      BUILTIN_PROFILES['regular']!,
      BUILTIN_PROFILES['casual']!,
      BUILTIN_PROFILES['grinder']!
    ]);

    backend = new FakeSteamBackend();
    engine = new HourForgeEngine(backend, store);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('persists and retrieves goals cleanly in goals.json', async () => {
    const manager = new GoalManager({
      store,
      engine,
      nowFn: () => nowMs
    });

    await manager.saveGoal({
      id: 'g-1',
      appId: 3513350,
      targetHours: 150,
      targetDate: '2026-12-01',
      createdAtUtc: nowMs,
      manualStartingHours: 20,
      status: 'ACTIVE'
    });

    const goals = await manager.getGoals();
    expect(goals.length).toBe(1);
    expect(goals[0]?.appId).toBe(3513350);
    expect(goals[0]?.targetHours).toBe(150);

    // Update goal
    await manager.saveGoal({
      id: 'g-1',
      appId: 3513350,
      targetHours: 200,
      targetDate: '2026-12-15',
      createdAtUtc: nowMs,
      manualStartingHours: 25,
      status: 'ACTIVE'
    });

    const updated = await manager.getGoalForApp(3513350);
    expect(updated?.targetHours).toBe(200);

    // Delete goal
    await manager.deleteGoal('g-1');
    const empty = await manager.getGoals();
    expect(empty.length).toBe(0);
  });

  it('computes pacing report taking history and active sessions into account', async () => {
    const manager = new GoalManager({
      store,
      engine,
      nowFn: () => nowMs,
      timeZone: 'Asia/Kolkata'
    });

    await manager.saveGoal({
      id: 'g-pacing',
      appId: 3513350,
      targetHours: 50,
      targetDate: '2026-11-20',
      createdAtUtc: nowMs,
      lastSyncedSteamHours: 10,
      lastSyncUtc: nowMs,
      status: 'ACTIVE'
    });

    // Save history of 2 hours
    await store.saveHistory([
      {
        id: 'h1',
        runId: 'r1',
        appId: 3513350,
        startUtc: nowMs,
        endUtc: nowMs + 7200000,
        creditedSeconds: 7200, // 2 hours
        source: 'schedule'
      }
    ]);

    const report = await manager.getPacingReport(3513350);
    expect(report).not.toBeNull();
    expect(report?.currentEffectiveHours).toBe(12.0); // 10 synced + 2 credited
    expect(report?.remainingHours).toBe(38.0);        // 50 - 12
    expect(report?.isFeasible).toBe(true);
  });

  it('syncGoalWithSteam resets baseline only when track is idle for >= 30m', async () => {
    const manager = new GoalManager({
      store,
      engine,
      nowFn: () => nowMs
    });

    await manager.saveGoal({
      id: 'g-sync',
      appId: 3513350,
      targetHours: 100,
      targetDate: '2026-11-25',
      createdAtUtc: nowMs,
      lastSyncedSteamHours: 20,
      lastSyncUtc: nowMs,
      status: 'ACTIVE'
    });

    // Session ended 10 min ago (< 30m idle)
    const sessionEndUtc = nowMs + 3600000;
    await store.saveHistory([
      {
        id: 'h2',
        runId: 'r1',
        appId: 3513350,
        startUtc: nowMs,
        endUtc: sessionEndUtc,
        creditedSeconds: 3600,
        source: 'schedule'
      }
    ]);

    const checkTimeRecent = sessionEndUtc + 10 * 60 * 1000; // 10 min idle
    await manager.syncGoalWithSteam(3513350, 25, checkTimeRecent);

    // Goal baseline should NOT have updated because idle < 30m
    const goalUnchanged = await manager.getGoalForApp(3513350);
    expect(goalUnchanged?.lastSyncedSteamHours).toBe(20);

    // Check time 40 min idle (>= 30m)
    const checkTimeIdle = sessionEndUtc + 40 * 60 * 1000;
    await manager.syncGoalWithSteam(3513350, 25, checkTimeIdle);

    // Now baseline updates cleanly!
    const goalUpdated = await manager.getGoalForApp(3513350);
    expect(goalUpdated?.lastSyncedSteamHours).toBe(25);
    expect(goalUpdated?.lastSyncUtc).toBe(checkTimeIdle);
  });

  describe('Clarification 3: Friend Hours Helper & Privacy', () => {
    const FRIEND_STEAM_ID = '76561198123456789';

    it('rejects invalid SteamID format without calling API', async () => {
      const manager = new GoalManager({
        store,
        engine
      });

      const res = await manager.checkFriendHours(3513350, 'invalid_id');
      expect(res.success).toBe(false);
      expect(res.message).toContain('17-digit');
    });

    it('handles friend with private profile reporting clear message', async () => {
      await store.saveSteamApiKey('my-api-key');

      const fakeFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ response: {} }) // Private profile returns empty response!
      });

      const manager = new GoalManager({
        store,
        engine,
        fetchFn: fakeFetch as any
      });

      const res = await manager.checkFriendHours(3513350, FRIEND_STEAM_ID);
      expect(res.success).toBe(false);
      expect(res.isPrivate).toBe(true);
      expect(res.message).toContain('Private');
    });

    it('retrieves hours and persona name for friend with public profile', async () => {
      await store.saveSteamApiKey('my-api-key');

      const fakeFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('GetPlayerSummaries')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              response: {
                players: [{ personaname: 'BestFriend' }]
              }
            })
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              game_count: 1,
              games: [{ appid: 3513350, playtime_forever: 18000 }] // 300.0 hours
            }
          })
        });
      });

      const manager = new GoalManager({
        store,
        engine,
        fetchFn: fakeFetch as any
      });

      const res = await manager.checkFriendHours(3513350, FRIEND_STEAM_ID);
      expect(res.success).toBe(true);
      expect(res.friendHours).toBe(300.0);
    });

    it('privacy: friend SteamID and persona names are never saved to goals.json', async () => {
      const manager = new GoalManager({
        store,
        engine,
        nowFn: () => nowMs
      });

      await manager.saveGoal({
        id: 'g-friend',
        appId: 3513350,
        targetHours: 300,
        targetDate: '2026-12-31',
        createdAtUtc: nowMs,
        userLabel: 'My Rival',
        friendHours: 300,
        status: 'ACTIVE'
      });

      const goalsRaw = fs.readFileSync(path.join(tempDir, 'goals.json'), 'utf-8');
      expect(goalsRaw).not.toContain(FRIEND_STEAM_ID);
      expect(goalsRaw).not.toContain('friendPersonaName');
      expect(goalsRaw).toContain('My Rival');
    });
  });
});

