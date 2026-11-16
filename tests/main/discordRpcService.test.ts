import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'events';
import { DiscordRpcService, DISCORD_CLIENT_ID } from '../../src/main/discord/discordRpcService';
import { PresenceLineRotator, NEUTRAL_LINES, CHEEKY_LINES, getPresenceLines } from '../../src/main/discord/presenceLines';
import { RunStateSnapshot, GameEntry, AppSettings } from '../../src/shared/models';

class MockTransport extends EventEmitter {}

class MockDiscordClient {
  public clientId: string;
  public transport: MockTransport;
  public user: {
    setActivity: ReturnType<typeof vi.fn>;
    clearActivity: ReturnType<typeof vi.fn>;
  };
  public login: ReturnType<typeof vi.fn>;
  public destroy: ReturnType<typeof vi.fn>;

  constructor(options: { clientId: string }) {
    this.clientId = options.clientId;
    this.transport = new MockTransport();
    this.user = {
      setActivity: vi.fn().mockResolvedValue(undefined),
      clearActivity: vi.fn().mockResolvedValue(undefined)
    };
    this.login = vi.fn().mockResolvedValue(undefined);
    this.destroy = vi.fn().mockResolvedValue(undefined);
  }
}

describe('PresenceLineRotator (Shuffle Bag)', () => {
  it('combines neutral and cheeky lines by default', () => {
    const lines = getPresenceLines();
    expect(lines).toContain(NEUTRAL_LINES[0]);
    expect(lines).toContain(CHEEKY_LINES[0]);
    expect(lines.length).toBe(NEUTRAL_LINES.length + CHEEKY_LINES.length);
  });

  it('omits cheeky lines when includeCheeky is false', () => {
    const neutralOnly = getPresenceLines(false);
    expect(neutralOnly).toEqual(NEUTRAL_LINES);
    expect(neutralOnly).not.toContain(CHEEKY_LINES[0]);
  });

  it('guarantees no repeat across bag boundaries', () => {
    // Test with small deterministic list
    const testItems = ['Line A', 'Line B', 'Line C'];
    // Sequence of deterministic RNG values
    let callCount = 0;
    const deterministicRng = () => {
      callCount++;
      return (callCount * 0.17) % 1;
    };

    let fakeTime = 1000000;
    const fakeClock = { now: () => fakeTime };

    const rotator = new PresenceLineRotator({
      items: testItems,
      rng: deterministicRng,
      clock: fakeClock,
      minIntervalMs: 20 * 60 * 1000,
      maxIntervalMs: 40 * 60 * 1000
    });

    const drawnHistory: string[] = [];
    for (let i = 0; i < 30; i++) {
      drawnHistory.push(rotator.getLine());
      // Advance clock past rotation interval
      fakeTime += 45 * 60 * 1000;
    }

    // Verify no two consecutive lines are ever identical (including across bag boundaries)
    for (let i = 1; i < drawnHistory.length; i++) {
      expect(drawnHistory[i]).not.toBe(drawnHistory[i - 1]);
    }
  });

  it('schedules next rotation between 20 and 40 minutes', () => {
    let fakeTime = 1000000;
    const fakeClock = { now: () => fakeTime };
    const minRng = () => 0; // produces min 20 min
    const maxRng = () => 0.999999; // produces max 40 min

    const rotatorMin = new PresenceLineRotator({
      items: ['A', 'B'],
      rng: minRng,
      clock: fakeClock,
      minIntervalMs: 20 * 60 * 1000,
      maxIntervalMs: 40 * 60 * 1000
    });
    expect(rotatorMin.getNextRotationTime() - fakeTime).toBe(20 * 60 * 1000);

    const rotatorMax = new PresenceLineRotator({
      items: ['A', 'B'],
      rng: maxRng,
      clock: fakeClock,
      minIntervalMs: 20 * 60 * 1000,
      maxIntervalMs: 40 * 60 * 1000
    });
    const maxDiff = rotatorMax.getNextRotationTime() - fakeTime;
    expect(maxDiff).toBeGreaterThanOrEqual(20 * 60 * 1000);
    expect(maxDiff).toBeLessThanOrEqual(40 * 60 * 1000);
  });
});

describe('DiscordRpcService (Task 2)', () => {
  let mockStore: any;
  let mockGames: GameEntry[];
  let engineSnapshot: RunStateSnapshot | null;
  let activeClients: MockDiscordClient[];
  let fakeNow: number;

  beforeEach(() => {
    vi.useFakeTimers();
    activeClients = [];
    fakeNow = 1700000000000;

    mockGames = [
      {
        appId: 730,
        name: 'Counter-Strike 2',
        developer: 'Valve',
        publisher: 'Valve',
        headerImage: 'https://steamstatic.com/cs2.jpg',
        processNames: ['cs2.exe']
      },
      {
        appId: 570,
        name: 'Dota 2',
        developer: 'Valve',
        publisher: 'Valve',
        headerImage: 'https://steamstatic.com/dota2.jpg',
        processNames: ['dota2.exe']
      },
      {
        appId: 999999,
        name: 'A Very Long Super Ridiculously Verbose Game Title That Exceeds One Hundred Characters Easily In Normal Play Testing Scenarios And Needs Truncation',
        developer: 'Test Dev',
        publisher: 'Test Pub',
        headerImage: '',
        processNames: ['long.exe']
      }
    ];

    let currentSettings: AppSettings = {
      startWithWindows: false,
      startHidden: false,
      closeToTray: true,
      theme: 'dark',
      onlineStatus: 1,
      launchPickerCountdownSec: 60,
      notifyOnBlocked: true,
      notifyOnFinish: true,
      notifyOnCrashLoop: true,
      keepAwake: false,
      pauseOnSleep: true,
      firstRunCompleted: true,
      discordPresenceMode: 'hourforge'
    };

    mockStore = {
      getSettings: vi.fn().mockImplementation(async () => ({ ...currentSettings })),
      saveSettings: vi.fn().mockImplementation(async (s: AppSettings) => {
        currentSettings = { ...s };
      })
    };

    engineSnapshot = {
      runId: 'run_123',
      status: 'RUNNING',
      mode: 'SINGLE',
      profileId: 'default',
      runSeed: 'seed_123',
      t0Utc: 1700000000000,
      lastSnapshotUtc: 1700000000000,
      tracks: [
        {
          appId: 730,
          state: 'PLAYING',
          overlay: null,
          creditedSeconds: 7200,
          currentBlockIndex: 0,
          blocks: []
        }
      ]
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createService = (clientFactory?: () => any, overrides?: any) => {
    const factory =
      clientFactory ||
      (() => {
        const c = new MockDiscordClient({ clientId: DISCORD_CLIENT_ID });
        activeClients.push(c);
        return c;
      });

    const clock = overrides?.clock || { now: () => fakeNow };

    return new DiscordRpcService({
      store: mockStore,
      getEngineState: () => engineSnapshot,
      getGames: async () => mockGames,
      clientFactory: factory,
      retryIntervalMs: 15000,
      maxRetryIntervalMs: 30000,
      coalesceIntervalMs: 15000,
      clock,
      ...overrides
    });
  };

  it('uses pinned Discord Client ID 1421390654935662665', () => {
    expect(DISCORD_CLIENT_ID).toBe('1421390654935662665');
  });

  it('broadcasts single game title in details and rotating line in state', async () => {
    const testRotator = new PresenceLineRotator({ items: ['Hours don\'t forge themselves'] });
    const service = createService(undefined, { rotator: testRotator });
    await service.start();

    expect(activeClients).toHaveLength(1);
    const client = activeClients[0]!;
    expect(client.login).toHaveBeenCalled();
    expect(service.getStatus().isConnected).toBe(true);

    expect(client.user.setActivity).toHaveBeenCalledWith({
      details: 'Counter-Strike 2',
      state: 'Hours don\'t forge themselves',
      largeImageKey: 'hourforge',
      largeImageText: 'HourForge',
      instance: false,
      startTimestamp: 1700000000000
    });

    await service.stop();
  });

  it('clamps single game titles exceeding 100 characters', async () => {
    engineSnapshot!.tracks = [
      {
        appId: 999999,
        state: 'PLAYING',
        overlay: null,
        creditedSeconds: 300,
        currentBlockIndex: 0,
        blocks: []
      }
    ];

    const testRotator = new PresenceLineRotator({ items: ['Rotating status line'] });
    const service = createService(undefined, { rotator: testRotator });
    await service.start();

    const client = activeClients[0]!;
    const lastCall = client.user.setActivity.mock.calls[0]![0];
    expect(lastCall.details.length).toBeLessThanOrEqual(100);
    expect(lastCall.details).toContain('...');

    await service.stop();
  });

  it('displays "Farming Multiple Games" when multiple tracks are active', async () => {
    engineSnapshot!.tracks = [
      { appId: 730, state: 'PLAYING', overlay: null, creditedSeconds: 100, currentBlockIndex: 0, blocks: [] },
      { appId: 570, state: 'PLAYING', overlay: null, creditedSeconds: 100, currentBlockIndex: 0, blocks: [] }
    ];

    const service = createService();
    await service.start();

    const client = activeClients[0]!;
    expect(client.user.setActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        details: 'Farming Multiple Games'
      })
    );

    await service.stop();
  });

  it('sets state to "Paused (touching grass, apparently)" when engine status is PAUSED', async () => {
    engineSnapshot!.status = 'PAUSED';

    const service = createService();
    await service.start();

    const client = activeClients[0]!;
    expect(client.user.setActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        details: 'Counter-Strike 2',
        state: 'Paused (touching grass, apparently)'
      })
    );

    await service.stop();
  });

  it('clears activity when engine is IDLE', async () => {
    engineSnapshot = {
      runId: 'run_idle',
      status: 'IDLE',
      mode: 'SINGLE',
      profileId: 'default',
      runSeed: 'seed_idle',
      t0Utc: 1700000000000,
      lastSnapshotUtc: 1700000000000,
      tracks: []
    };

    const service = createService();
    await service.start();

    const client = activeClients[0]!;
    expect(client.user.clearActivity).toHaveBeenCalled();

    await service.stop();
  });

  it('preserves startTimestamp across status line rotations', async () => {
    const testRotator = new PresenceLineRotator({
      items: ['Status Alpha', 'Status Beta'],
      rng: () => 0,
      clock: { now: () => fakeNow }
    });

    const initialLine = testRotator.getLine();

    const service = createService(undefined, { rotator: testRotator });
    await service.start();

    const client = activeClients[0]!;
    expect(client.user.setActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: initialLine,
        startTimestamp: 1700000000000
      })
    );

    // Advance time past the rotation window (30 minutes)
    fakeNow += 30 * 60 * 1000;
    await service.executeActivityUpdate();

    const rotatedLine = testRotator.getLine();
    expect(rotatedLine).not.toBe(initialLine);

    expect(client.user.setActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: rotatedLine,
        // startTimestamp is strictly preserved, not reset to fakeNow
        startTimestamp: 1700000000000
      })
    );

    await service.stop();
  });

  it('coalesces rapid updateActivity calls to at most 1 per 15 seconds', async () => {
    const service = createService();
    await service.start();

    const client = activeClients[0]!;
    expect(client.user.setActivity).toHaveBeenCalledTimes(1);

    // Fire 5 rapid state changes in 2 seconds
    for (let i = 0; i < 5; i++) {
      fakeNow += 400;
      await service.queueUpdateActivity();
    }
    // Still only 1 actual setActivity call sent
    expect(client.user.setActivity).toHaveBeenCalledTimes(1);

    // Advance timers by 15s to reach and pass coalesce window
    await vi.advanceTimersByTimeAsync(15000);
    fakeNow += 15000;

    // Coalesced update fired
    expect(client.user.setActivity).toHaveBeenCalledTimes(2);

    await service.stop();
  });

  it('disconnects and clears activity when discordPresenceMode is set to "none"', async () => {
    const service = createService();
    await service.start();

    const client = activeClients[0]!;
    expect(service.getStatus().isConnected).toBe(true);

    const newSettings = await mockStore.getSettings();
    newSettings.discordPresenceMode = 'none';
    await service.onSettingsUpdated(newSettings);

    expect(client.user.clearActivity).toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalled();
    expect(service.getStatus().isConnected).toBe(false);
  });

  it('does not connect on startup if discordPresenceMode is "none"', async () => {
    const settings = await mockStore.getSettings();
    settings.discordPresenceMode = 'none';
    mockStore.getSettings = vi.fn().mockResolvedValue(settings);

    const service = createService();
    await service.start();

    expect(activeClients).toHaveLength(0);
    expect(service.getStatus().isConnected).toBe(false);
  });

  it('preserves original startTimestamp when resumed after app restart', async () => {
    const originalRunStartUtc = 1699990000000; // run started earlier
    const restartTimeUtc = 1700000000000;     // app restarted 10,000s later

    // Simulated restored snapshot from atomicStore
    engineSnapshot = {
      runId: 'run_resumed',
      status: 'RUNNING',
      mode: 'SINGLE',
      profileId: 'default',
      runSeed: 'seed_resumed',
      t0Utc: originalRunStartUtc,
      lastSnapshotUtc: restartTimeUtc,
      tracks: [
        { appId: 730, state: 'PLAYING', overlay: null, creditedSeconds: 10000, currentBlockIndex: 0, blocks: [] }
      ]
    };

    const service = createService(undefined, { clock: { now: () => restartTimeUtc } });
    await service.start();

    const client = activeClients[0]!;
    // Activity must use the original run start t0Utc, NOT the restart time
    expect(client.user.setActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        details: 'Counter-Strike 2',
        startTimestamp: originalRunStartUtc
      })
    );
    expect(client.user.setActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({
        startTimestamp: restartTimeUtc
      })
    );

    await service.stop();
  });

  it('handles live switching from mode "none" to "hourforge" and back', async () => {
    const settings = await mockStore.getSettings();
    settings.discordPresenceMode = 'none';
    mockStore.getSettings = vi.fn().mockResolvedValue(settings);

    const service = createService();
    await service.start();
    expect(activeClients).toHaveLength(0);
    expect(service.getStatus().isConnected).toBe(false);

    // Live switch to 'hourforge'
    settings.discordPresenceMode = 'hourforge';
    await service.onSettingsUpdated(settings);
    expect(activeClients).toHaveLength(1);
    expect(service.getStatus().isConnected).toBe(true);

    // Live switch back to 'none'
    settings.discordPresenceMode = 'none';
    await service.onSettingsUpdated(settings);
    expect(activeClients[0]!.user.clearActivity).toHaveBeenCalled();
    expect(activeClients[0]!.destroy).toHaveBeenCalled();
    expect(service.getStatus().isConnected).toBe(false);
  });
});
