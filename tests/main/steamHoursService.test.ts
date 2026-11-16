import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { AtomicStore, SafeStorageAdapter } from '../../src/main/store/atomicStore';
import { SteamDetector } from '../../src/main/steam/steamDetector';
import { SteamHoursService, stripApiKeyFromText, parseRetryAfterMs } from '../../src/main/steam/steamHoursService';
import { RunStateSnapshot } from '../../src/shared/models';

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

describe('SteamHoursService (Steam Web API & Lag Detection)', () => {
  let tempDir: string;
  let store: AtomicStore;
  let detector: SteamDetector;
  let engineSnapshot: RunStateSnapshot;
  let currentTime = 1700000000000;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf_hours_test_'));
    store = new AtomicStore(tempDir, new MockSafeStorage());
    await store.initialize();

    // Default tracked games in store
    await store.saveGames([
      {
        appId: 3513350,
        name: 'Wuthering Waves',
        developer: 'Kuro Games',
        publisher: 'Kuro Games',
        headerImage: '',
        processNames: ['Client-Win64-Shipping.exe']
      }
    ]);

    detector = new SteamDetector({
      queryRegistry: async () => ({
        SteamPath: 'C:\\Steam',
        SteamExe: 'C:\\Steam\\steam.exe',
        ActiveUser: 0x12345678,
        pid: 999
      }),
      isProcessRunning: () => true,
      readFile: async () => `"users" { "76561198000000001" { "PersonaName" "PlayerOne" "MostRecent" "1" } }`
    });

    engineSnapshot = {
      runId: 'test-run',
      mode: 'SINGLE',
      status: 'IDLE',
      t0Utc: currentTime,
      profileId: 'balanced',
      runSeed: 'seed',
      tracks: [],
      lastSnapshotUtc: currentTime
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('reports NO_KEY status when no Steam Web API key is configured', async () => {
    const service = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      nowFn: () => currentTime
    });

    const snapshot = await service.refreshHours();
    expect(snapshot.status).toBe('NO_KEY');
    expect(snapshot.hasApiKey).toBe(false);
  });

  it('validates API key using testApiKey: 403, 429, private profile, and success', async () => {
    // 1. 403 Forbidden
    const fakeFetch403 = vi.fn().mockResolvedValue({
      status: 403,
      ok: false
    });
    const service403 = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetch403 as any
    });
    const res403 = await service403.testApiKey('bad-key');
    expect(res403.success).toBe(false);
    expect(res403.message).toContain('403');

    // 2. 429 Rate Limit
    const fakeFetch429 = vi.fn().mockResolvedValue({
      status: 429,
      ok: false
    });
    const service429 = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetch429 as any
    });
    const res429 = await service429.testApiKey('rate-limited-key');
    expect(res429.success).toBe(false);
    expect(res429.message).toContain('429');

    // 3. Private Profile
    const fakeFetchPrivate = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ response: {} })
    });
    const servicePrivate = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetchPrivate as any
    });
    const resPrivate = await servicePrivate.testApiKey('good-key');
    expect(resPrivate.success).toBe(true);
    expect(resPrivate.message).toContain('Private');

    // 4. Success with games
    const fakeFetchSuccess = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        response: {
          game_count: 2,
          games: [
            { appid: 730, playtime_forever: 1200 },
            { appid: 3513350, playtime_forever: 300 }
          ]
        }
      })
    });
    const serviceSuccess = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetchSuccess as any
    });
    const resSuccess = await serviceSuccess.testApiKey('valid-key');
    expect(resSuccess.success).toBe(true);
    expect(resSuccess.message).toContain('2 games');
  });

  it('fetches games, uses appids_filter, and caches only tracked games', async () => {
    await store.saveSteamApiKey('secret-api-key');

    let calledUrl = '';
    const fakeFetch = vi.fn().mockImplementation((url: string) => {
      calledUrl = url;
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          response: {
            game_count: 3,
            games: [
              { appid: 3513350, playtime_forever: 600 }, // 10.0 hours (tracked)
              { appid: 730, playtime_forever: 2400 },    // 40.0 hours (untracked)
              { appid: 440, playtime_forever: 1800 }     // 30.0 hours (untracked)
            ]
          }
        })
      });
    });

    const service = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetch as any,
      nowFn: () => currentTime
    });

    const snapshot = await service.refreshHours();
    expect(snapshot.status).toBe('OK');

    // Verify appids_filter was appended for tracked game
    expect(calledUrl).toContain('appids_filter[0]=3513350');

    // Verify only tracked game 3513350 is present in snapshot.games
    expect(Object.keys(snapshot.games)).toEqual(['3513350']);
    const game = snapshot.games[3513350];
    expect(game?.steamHours).toBe(10.0);
    expect(game?.baselineSteamHours).toBe(10.0);
    expect(game?.steamGainHours).toBe(0.0);
    expect(game?.isLagging).toBe(false);

    // Verify untracked games 730 and 440 are NOT in baselines file on disk
    const baselines = await store.getSteamHoursBaselines();
    expect(baselines[3513350]?.baselineSteamHours).toBe(10.0);
    expect(baselines[730]).toBeUndefined();
    expect(baselines[440]).toBeUndefined();
  });

  it('429 backoff lengthens (30m -> 60m -> 120m cap), honors Retry-After, resets on success, and blocks manual refresh', async () => {
    await store.saveSteamApiKey('secret-api-key');

    let fetchCount = 0;
    const fakeFetch = vi.fn().mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        status: 429,
        ok: false,
        headers: new Headers()
      });
    });

    let mockNow = 1700000000000;
    const service = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetch as any,
      nowFn: () => mockNow
    });

    // 1st 429 -> Backoff step 1: 30 minutes
    const snap1 = await service.refreshHours(true);
    expect(snap1.status).toBe('RATE_LIMITED');
    expect(snap1.statusMessage).toContain('Retry in 30m');
    expect(service.getBackoffStep()).toBe(1);
    expect(service.getBackoffUntilUtc()).toBe(mockNow + 30 * 60 * 1000);

    // Manual refresh during active backoff must NOT call fetch and must show "retry in X"
    mockNow += 5 * 60 * 1000; // 5 min elapsed (25 min remaining)
    const snapBlocked = await service.refreshHours(true);
    expect(snapBlocked.status).toBe('RATE_LIMITED');
    expect(snapBlocked.statusMessage).toBe('Rate limited: retry in 25m');
    expect(fetchCount).toBe(1); // fetch was NOT called again!

    // Advance time past the 30m window
    mockNow += 26 * 60 * 1000; // 31 min elapsed, past backoff

    // 2nd 429 -> Backoff step 2: 60 minutes
    const snap2 = await service.refreshHours(true);
    expect(fetchCount).toBe(2);
    expect(snap2.status).toBe('RATE_LIMITED');
    expect(snap2.statusMessage).toContain('Retry in 60m');
    expect(service.getBackoffStep()).toBe(2);
    expect(service.getBackoffUntilUtc()).toBe(mockNow + 60 * 60 * 1000);

    // Advance time past 60m window
    mockNow += 61 * 60 * 1000;

    // 3rd 429 -> Backoff step 3: 120 minutes cap
    const snap3 = await service.refreshHours(true);
    expect(fetchCount).toBe(3);
    expect(snap3.status).toBe('RATE_LIMITED');
    expect(snap3.statusMessage).toContain('Retry in 120m');
    expect(service.getBackoffStep()).toBe(3);
    expect(service.getBackoffUntilUtc()).toBe(mockNow + 120 * 60 * 1000);

    // Advance time past 120m window
    mockNow += 121 * 60 * 1000;

    // 4th 429 with explicit Retry-After header: 180 seconds (3 minutes)
    fakeFetch.mockImplementationOnce(() => {
      fetchCount++;
      const headers = new Headers();
      headers.set('Retry-After', '180');
      return Promise.resolve({
        status: 429,
        ok: false,
        headers
      });
    });

    const snapRetryAfter = await service.refreshHours(true);
    expect(fetchCount).toBe(4);
    expect(snapRetryAfter.status).toBe('RATE_LIMITED');
    expect(snapRetryAfter.statusMessage).toContain('Retry in 3m');
    expect(service.getBackoffUntilUtc()).toBe(mockNow + 180 * 1000);

    // Advance past Retry-After window and return 200 OK -> backoff must reset to 0
    mockNow += 190 * 1000;
    fakeFetch.mockImplementationOnce(() => {
      fetchCount++;
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          response: {
            game_count: 1,
            games: [{ appid: 3513350, playtime_forever: 600 }]
          }
        })
      });
    });

    const snapSuccess = await service.refreshHours(true);
    expect(snapSuccess.status).toBe('OK');
    expect(service.getBackoffStep()).toBe(0);
    expect(service.getBackoffUntilUtc()).toBe(0);
  });

  it('leak test: asserts API key never appears in error messages, URLs, statusMessage, or logs', async () => {
    const FAKE_KEY = 'FAKEKEY1234567890';
    await store.saveSteamApiKey(FAKE_KEY);

    // Helper to test leak across different failure modes
    const runLeakCheck = async (fetchMock: any) => {
      const service = new SteamHoursService({
        store,
        detector,
        getEngineSnapshot: () => engineSnapshot,
        fetchFn: fetchMock,
        nowFn: () => currentTime
      });

      // 1. Check refreshHours snapshot output
      const snap = await service.refreshHours(true);
      const snapJson = JSON.stringify(snap);
      expect(snapJson).not.toContain(FAKE_KEY);
      if (snap.statusMessage) {
        expect(snap.statusMessage).not.toContain(FAKE_KEY);
      }

      // 2. Check testApiKey output
      const testRes = await service.testApiKey(FAKE_KEY);
      const testJson = JSON.stringify(testRes);
      expect(testJson).not.toContain(FAKE_KEY);
      if (testRes.message) {
        expect(testRes.message).not.toContain(FAKE_KEY);
      }
    };

    // Case A: Network failure with raw URL in error
    await runLeakCheck(
      vi.fn().mockRejectedValue(
        new Error(`fetch failed to https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${FAKE_KEY}&steamid=123: ECONNREFUSED`)
      )
    );

    // Case B: HTTP 403 Forbidden
    await runLeakCheck(
      vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
        statusText: `Forbidden key=${FAKE_KEY}`
      })
    );

    // Case C: HTTP 500 Internal Server Error
    await runLeakCheck(
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        statusText: `Internal Server Error for key=${FAKE_KEY}`
      })
    );

    // Case D: Timeout / Abort Error
    const abortErr = new Error(`Request timed out for https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${FAKE_KEY}`);
    abortErr.name = 'AbortError';
    await runLeakCheck(
      vi.fn().mockRejectedValue(abortErr)
    );

    // Direct unit test of stripApiKeyFromText
    const sampleDirty = `Error at https://api.steampowered.com/test?key=${FAKE_KEY}&steamid=123; Key was ${FAKE_KEY}`;
    const clean = stripApiKeyFromText(sampleDirty, FAKE_KEY);
    expect(clean).not.toContain(FAKE_KEY);
    expect(clean).toContain('key=[REDACTED]');
    expect(clean).toContain('[REDACTED]');

    // Direct unit test of parseRetryAfterMs
    expect(parseRetryAfterMs('60', 1000)).toBe(60000);
    expect(parseRetryAfterMs(null, 1000)).toBeNull();
  });

  it('detects Steam lag when session finished >30m ago and credited hours exceed Steam gain by >=0.5h', async () => {
    await store.saveSteamApiKey('secret-api-key');

    // Baseline: Steam has 10.0 hours
    const fakeFetch1 = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        response: {
          game_count: 1,
          games: [{ appid: 3513350, playtime_forever: 600 }] // 10.0 hours
        }
      })
    });

    const service = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetch1 as any,
      nowFn: () => currentTime
    });

    await service.refreshHours(true);

    // User plays 2 hours in HourForge. Session finished 45 minutes ago.
    const sessionEndTime = currentTime + 3600 * 1000 * 2; // +2 hours
    await store.saveHistory([
      {
        id: 'sess-1',
        runId: 'test-run',
        appId: 3513350,
        startUtc: currentTime,
        endUtc: sessionEndTime,
        creditedSeconds: 7200, // 2 hours
        source: 'schedule'
      }
    ]);

    const testTimeLag = sessionEndTime + 45 * 60 * 1000; // 45m after session end

    // Steam still shows 10.0 hours (Steam gain = 0.0h, but HF credited = 2.0h -> discrepancy 2.0h >= 0.5h)
    const fakeFetchLag = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        response: {
          game_count: 1,
          games: [{ appid: 3513350, playtime_forever: 600 }]
        }
      })
    });

    const serviceLag = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetchLag as any,
      nowFn: () => testTimeLag
    });

    const snapshotLag = await serviceLag.refreshHours(true);
    const gameLag = snapshotLag.games[3513350];
    expect(gameLag?.hourforgeCreditedHours).toBe(2.0);
    expect(gameLag?.steamGainHours).toBe(0.0);
    expect(gameLag?.isLagging).toBe(true);

    // Case B: If session finished only 10 minutes ago (<30 min), isLagging must be false
    const testTimeRecent = sessionEndTime + 10 * 60 * 1000;
    const serviceRecent = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetchLag as any,
      nowFn: () => testTimeRecent
    });
    const snapshotRecent = await serviceRecent.refreshHours(true);
    expect(snapshotRecent.games[3513350]?.isLagging).toBe(false);

    // Case C: If track is currently PLAYING, isLagging must be suppressed (false)
    const activeEngineSnapshot: RunStateSnapshot = {
      runId: 'test-run',
      mode: 'SINGLE',
      status: 'RUNNING',
      t0Utc: currentTime,
      profileId: 'balanced',
      runSeed: 'seed',
      lastSnapshotUtc: currentTime,
      tracks: [
        {
          appId: 3513350,
          state: 'PLAYING',
          overlay: null,
          creditedSeconds: 3600,
          currentBlockIndex: 0,
          blocks: []
        }
      ]
    };
    const servicePlaying = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => activeEngineSnapshot,
      fetchFn: fakeFetchLag as any,
      nowFn: () => testTimeLag
    });
    const snapshotPlaying = await servicePlaying.refreshHours(true);
    expect(snapshotPlaying.games[3513350]?.isLagging).toBe(false);

    // Case D: Once Steam catches up (12.0 hours, gain = 2.0h), isLagging becomes false
    const fakeFetchCaughtUp = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        response: {
          game_count: 1,
          games: [{ appid: 3513350, playtime_forever: 720 }] // 12.0 hours
        }
      })
    });
    const serviceCaughtUp = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetchCaughtUp as any,
      nowFn: () => testTimeLag
    });
    const snapshotCaughtUp = await serviceCaughtUp.refreshHours(true);
    expect(snapshotCaughtUp.games[3513350]?.steamGainHours).toBe(2.0);
    expect(snapshotCaughtUp.games[3513350]?.isLagging).toBe(false);
  });

  it('handles offline network failures gracefully with cached data', async () => {
    await store.saveSteamApiKey('secret-api-key');

    // First fetch sets cache
    const fakeFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        response: {
          game_count: 1,
          games: [{ appid: 3513350, playtime_forever: 600 }]
        }
      })
    });

    const service = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetch as any,
      nowFn: () => currentTime
    });

    await service.refreshHours(true);

    // Network offline
    const fakeFetchOffline = vi.fn().mockRejectedValue(new Error('Fetch failed: network unreachable'));
    const serviceOffline = new SteamHoursService({
      store,
      detector,
      getEngineSnapshot: () => engineSnapshot,
      fetchFn: fakeFetchOffline as any,
      nowFn: () => currentTime + 60000
    });

    const snapshotOffline = await serviceOffline.refreshHours(true);
    expect(snapshotOffline.status).toBe('OFFLINE');
    expect(snapshotOffline.statusMessage).toContain('Offline');
  });
});
