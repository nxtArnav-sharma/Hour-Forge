import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { SteamDetector, parseLoginUsersVdf } from '../../src/main/steam/steamDetector';
import { SteamClientBackend } from '../../src/main/steam/steamClientBackend';
import { HourForgeEngine } from '../../src/main/engine/engine';
import { AtomicStore } from '../../src/main/store/atomicStore';
import { BUILTIN_PROFILES } from '../../src/core/profiles';

describe('SteamDetector (Fake Registry & Process Providers)', () => {
  it('detects Steam not installed when registry keys are missing', async () => {
    const detector = new SteamDetector({
      queryRegistry: async (): Promise<Record<string, string | number>> => ({})
    });

    const status = await detector.getStatus();
    expect(status.isInstalled).toBe(false);
    expect(status.isRunning).toBe(false);
    expect(status.isLoggedOn).toBe(false);
  });

  it('detects Steam installed but not running', async () => {
    const detector = new SteamDetector({
      queryRegistry: async (key): Promise<Record<string, string | number>> => {
        if (key.includes('ActiveProcess')) {
          return { pid: 0, ActiveUser: 0 };
        }
        return {
          SteamPath: 'C:\\Program Files (x86)\\Steam',
          SteamExe: 'C:\\Program Files (x86)\\Steam\\steam.exe'
        };
      },
      isProcessRunning: () => false
    });

    const status = await detector.getStatus();
    expect(status.isInstalled).toBe(true);
    expect(status.isRunning).toBe(false);
    expect(status.isLoggedOn).toBe(false);
  });

  it('detects Steam running but signed out (ActiveUser == 0)', async () => {
    const detector = new SteamDetector({
      queryRegistry: async (key): Promise<Record<string, string | number>> => {
        if (key.includes('ActiveProcess')) {
          return { pid: 12345, ActiveUser: 0 };
        }
        return {
          SteamPath: 'C:\\Program Files (x86)\\Steam',
          SteamExe: 'C:\\Program Files (x86)\\Steam\\steam.exe'
        };
      },
      isProcessRunning: pid => pid === 12345
    });

    const status = await detector.getStatus();
    expect(status.isInstalled).toBe(true);
    expect(status.isRunning).toBe(true);
    expect(status.isLoggedOn).toBe(false);
    expect(status.personaName).toBeNull();
  });

  it('detects Steam running and signed in with parsed PersonaName', async () => {
    const fakeVdf = `"users"
{
  "76561198000000000"
  {
    "AccountName" "tester1"
    "PersonaName" "Astaroth"
    "MostRecent" "1"
    "timestamp" "1794643058"
  }
}`;

    const detector = new SteamDetector({
      queryRegistry: async (key): Promise<Record<string, string | number>> => {
        if (key.includes('ActiveProcess')) {
          return { pid: 12345, ActiveUser: 0x25e4400 };
        }
        return {
          SteamPath: 'C:\\Program Files (x86)\\Steam',
          SteamExe: 'C:\\Program Files (x86)\\Steam\\steam.exe'
        };
      },
      isProcessRunning: pid => pid === 12345,
      readFile: async () => fakeVdf
    });

    const status = await detector.getStatus();
    expect(status.isInstalled).toBe(true);
    expect(status.isRunning).toBe(true);
    expect(status.isLoggedOn).toBe(true);
    expect(status.personaName).toBe('Astaroth');
  });

  it('parses loginusers.vdf accurately picking most recent account', () => {
    const multiUserVdf = `"users"
{
  "11111111111111111"
  {
    "AccountName" "old_user"
    "PersonaName" "OldName"
    "MostRecent" "0"
    "timestamp" "100"
  }
  "22222222222222222"
  {
    "AccountName" "current_user"
    "PersonaName" "CurrentPersona"
    "MostRecent" "1"
    "timestamp" "200"
  }
}`;

    const parsed = parseLoginUsersVdf(multiUserVdf);
    expect(parsed.personaName).toBe('CurrentPersona');
    expect(parsed.accountName).toBe('current_user');
    expect(parsed.steamId64).toBe('22222222222222222');
  });

  it('reads loginusers.vdf from Steam install folder (SteamPath from registry), not LOCALAPPDATA', async () => {
    let capturedVdfPath = '';
    const fakeCustomSteamPath = 'D:\\CustomInstall\\Steam';

    const detector = new SteamDetector({
      queryRegistry: async (key): Promise<Record<string, string | number>> => {
        if (key.includes('ActiveProcess')) {
          return { pid: 4321, ActiveUser: 0x12345 };
        }
        return {
          SteamPath: fakeCustomSteamPath,
          SteamExe: path.join(fakeCustomSteamPath, 'steam.exe')
        };
      },
      isProcessRunning: () => true,
      readFile: async (filePath: string) => {
        capturedVdfPath = filePath;
        return `"users" { "76561198000000001" { "PersonaName" "Player1" "MostRecent" "1" } }`;
      }
    });

    const status = await detector.getStatus();
    expect(status.isLoggedOn).toBe(true);

    // Verify path is constructed from registry SteamPath, not AppData/Local
    const expectedPath = path.normalize(path.join(fakeCustomSteamPath, 'config', 'loginusers.vdf'));
    expect(path.normalize(capturedVdfPath)).toBe(expectedPath);
    expect(capturedVdfPath.toLowerCase()).not.toContain('appdata');
    expect(capturedVdfPath.toLowerCase()).not.toContain('localappdata');
  });

  it('falls back to ActiveUser DWORD mathematical derivation when loginusers.vdf is missing', async () => {
    const fakeActiveUser = 0x25e4400; // decimal 39734272
    // Expected SteamID64 = 76561197960265728 + 39734272 = 76561198000000000
    const expectedDerivedSteamId64 = (BigInt('76561197960265728') + BigInt(fakeActiveUser)).toString();

    const detector = new SteamDetector({
      queryRegistry: async (key): Promise<Record<string, string | number>> => {
        if (key.includes('ActiveProcess')) {
          return { pid: 5678, ActiveUser: fakeActiveUser };
        }
        return {
          SteamPath: 'C:\\Program Files (x86)\\Steam',
          SteamExe: 'C:\\Program Files (x86)\\Steam\\steam.exe'
        };
      },
      isProcessRunning: () => true,
      readFile: async () => {
        throw new Error('ENOENT: no such file or directory, open loginusers.vdf');
      }
    });

    const status = await detector.getStatus();
    expect(status.isInstalled).toBe(true);
    expect(status.isRunning).toBe(true);
    expect(status.isLoggedOn).toBe(true);
    expect(status.personaName).toBeNull(); // Missing file -> personaName is null
    expect(status.steamId64).toBe(expectedDerivedSteamId64); // Fallback derivation applied!
  });
});

describe('SteamClientBackend Lifecycle & Helper Management', () => {
  let tempDir: string;
  let helpersDir: string;
  let fakeHelperScript: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf_backend_test_'));
    helpersDir = path.join(tempDir, 'helpers');
    fs.mkdirSync(helpersDir, { recursive: true });
    fakeHelperScript = path.join(tempDir, 'mockHelper.js');
    fs.writeFileSync(fakeHelperScript, 'setInterval(() => {}, 1000);', 'utf-8');
  });

  it('starts and triggers launchSteam if Steam is closed and startSteamAutomatically is true', async () => {
    let launchCalled = false;
    let pollCount = 0;

    const fakeDetector = new SteamDetector({
      queryRegistry: async () => ({})
    });

    vi.spyOn(fakeDetector, 'getStatus').mockImplementation(async () => {
      pollCount++;
      return {
        isInstalled: true,
        isRunning: pollCount > 1,
        isLoggedOn: pollCount > 1,
        pid: pollCount > 1 ? 5555 : 0,
        activeUser: pollCount > 1 ? 12345 : 0,
        personaName: pollCount > 1 ? 'TestPlayer' : null
      };
    });

    vi.spyOn(fakeDetector, 'launchSteam').mockImplementation(async () => {
      launchCalled = true;
      return true;
    });

    const backend = new SteamClientBackend({
      detector: fakeDetector,
      helpersDir,
      helperScriptPath: fakeHelperScript,
      startSteamAutomatically: true,
      pollIntervalMs: 50
    });

    await backend.start();
    expect(launchCalled).toBe(true);

    const st = await backend.status();
    expect(st.isLoggedOn).toBe(true);
    expect(st.nickname).toBe('TestPlayer');

    await backend.stop();
  });

  it('spawns a helper process on setPlaying and terminates on stop', async () => {
    const fakeDetector = new SteamDetector({});
    vi.spyOn(fakeDetector, 'getStatus').mockResolvedValue({
      isInstalled: true,
      isRunning: true,
      isLoggedOn: true,
      pid: 1234,
      activeUser: 9999,
      personaName: 'Gamer'
    });

    const backend = new SteamClientBackend({
      detector: fakeDetector,
      helpersDir,
      helperScriptPath: fakeHelperScript,
      pollIntervalMs: 100
    });

    await backend.start();

    // Start playing app 3513350
    await backend.setPlaying([3513350]);
    const st1 = await backend.status();
    expect(st1.currentPlayingAppIds).toContain(3513350);

    // Stop playing app 3513350
    await backend.setPlaying([]);
    const st2 = await backend.status();
    expect(st2.currentPlayingAppIds).toHaveLength(0);

    await backend.stop();
  });

  it('detects Steam closed mid-run and suspends helpers', async () => {
    let isSteamRunning = true;
    const fakeDetector = new SteamDetector({});
    vi.spyOn(fakeDetector, 'getStatus').mockImplementation(async () => ({
      isInstalled: true,
      isRunning: isSteamRunning,
      isLoggedOn: isSteamRunning,
      pid: isSteamRunning ? 1234 : 0,
      activeUser: isSteamRunning ? 9999 : 0,
      personaName: isSteamRunning ? 'Gamer' : null
    }));

    const events: any[] = [];
    const backend = new SteamClientBackend({
      detector: fakeDetector,
      helpersDir,
      helperScriptPath: fakeHelperScript,
      pollIntervalMs: 20
    });

    backend.onEvent(e => events.push(e));
    await backend.start();
    await backend.setPlaying([3513350]);

    // Simulate Steam closed mid-run
    isSteamRunning = false;
    await new Promise(r => setTimeout(r, 60));

    expect(events.some(e => e.payload?.suspended && e.payload?.reason === 'steam_closed')).toBe(true);
    const st = await backend.status();
    expect(st.isLoggedOn).toBe(false);

    await backend.stop();
  });

  it('killAllHelpers() terminates genuine helpers and leaves unrelated processes untouched', async () => {
    const installDir = path.join(tempDir, 'install');
    fs.mkdirSync(installDir, { recursive: true });
    const fakeExecPath = path.join(installDir, 'HourForge.exe');

    const killedPids: number[] = [];
    const mockKillProcess = vi.fn((pid: number) => {
      killedPids.push(pid);
    });

    const processTable: Record<number, { executablePath: string; commandLine: string }> = {
      2001: {
        executablePath: fakeExecPath,
        commandLine: `"${fakeExecPath}" "${path.join(helpersDir, 'steamHelper.js')}" 2139460`
      },
      2002: {
        executablePath: 'C:\\Windows\\System32\\notepad.exe',
        commandLine: 'C:\\Windows\\System32\\notepad.exe my_notes.txt'
      },
      2003: {
        executablePath: 'C:\\Python310\\python.exe',
        commandLine: 'C:\\Python310\\python.exe check_steamHelper.py'
      }
    };

    const mockGetProcessInfo = vi.fn(async (pid: number) => {
      return processTable[pid] || null;
    });

    fs.writeFileSync(path.join(helpersDir, '2139460.pid'), '2001', 'utf-8');
    fs.writeFileSync(path.join(helpersDir, '3513350.pid'), '2002', 'utf-8');
    fs.writeFileSync(path.join(helpersDir, '4508340.pid'), '2003', 'utf-8');

    const fakeDetector = new SteamDetector({});
    vi.spyOn(fakeDetector, 'getStatus').mockResolvedValue({
      isInstalled: true,
      isRunning: true,
      isLoggedOn: true,
      pid: 1234,
      activeUser: 9999,
      personaName: 'Gamer'
    });

    const backend = new SteamClientBackend({
      detector: fakeDetector,
      helpersDir,
      helperScriptPath: fakeHelperScript,
      execPath: fakeExecPath,
      getProcessInfo: mockGetProcessInfo,
      killProcess: mockKillProcess,
      pollIntervalMs: 100
    });

    await backend.killAllHelpers();

    // Genuine helper (2001) MUST be killed
    expect(killedPids).toContain(2001);

    // Unrelated processes MUST survive untouched:
    expect(killedPids).not.toContain(2002); // notepad survived
    expect(killedPids).not.toContain(2003); // python script survived

    // Stale pidfiles must be unlinked
    expect(fs.existsSync(path.join(helpersDir, '2139460.pid'))).toBe(false);
    expect(fs.existsSync(path.join(helpersDir, '3513350.pid'))).toBe(false);
    expect(fs.existsSync(path.join(helpersDir, '4508340.pid'))).toBe(false);
  });
});

describe('Engine Bug Fixes (SINGLE Mode & Today Credited Playtime)', () => {
  const createMockBackend = (): any => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue({
      isConnected: true,
      isLoggedOn: true,
      isPlayingPossible: true,
      nickname: 'Player',
      steamId: '12345',
      currentPlayingAppIds: []
    }),
    setPlaying: vi.fn().mockResolvedValue(undefined),
    owns: vi.fn().mockResolvedValue({ 3513350: true, 4508340: true }),
    addFreeLicense: vi.fn().mockResolvedValue(undefined),
    submitAuth: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockReturnValue(() => {})
  });

  it('enforces that SINGLE mode runs at most ONE track even if multiple tracks are submitted', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf_engine_bug_'));
    const store = new AtomicStore(testDir);
    await store.initialize();
    await store.saveGames([
      { appId: 3513350, name: 'WuWa', developer: 'Kuro', publisher: 'Kuro', enabled: true },
      { appId: 4508340, name: 'NTE', developer: 'Hotta', publisher: 'PWG', enabled: true }
    ]);

    const mockBackend = createMockBackend();
    const engine = new HourForgeEngine(mockBackend, store);

    // Rejects >1 track for SINGLE mode
    await expect(
      engine.startRun({
        mode: 'SINGLE',
        tracks: [
          { appId: 3513350, targetHours: 2 },
          { appId: 4508340, targetHours: 3 }
        ],
        profile: BUILTIN_PROFILES['regular']!
      })
    ).rejects.toThrow();

    // Runs exactly 1 track
    await engine.startRun({
      mode: 'SINGLE',
      tracks: [{ appId: 3513350, targetHours: 2 }],
      profile: BUILTIN_PROFILES['regular']!
    });

    const snapshot = engine.getSnapshot();
    expect(snapshot.mode).toBe('SINGLE');
    // Critical assertion: exactly one track created!
    expect(snapshot.tracks).toHaveLength(1);
    expect(snapshot.tracks[0]!.appId).toBe(3513350);

    await engine.stopRun();
  });

  it('populates todayCreditedSeconds in TrackSnapshot for open-ended tracks', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf_today_test_'));
    const store = new AtomicStore(testDir);
    await store.initialize();
    await store.saveGames([
      { appId: 3513350, name: 'WuWa', developer: 'Kuro', publisher: 'Kuro', enabled: true }
    ]);

    const mockBackend = createMockBackend();
    const engine = new HourForgeEngine(mockBackend, store);

    await engine.startRun({
      mode: 'SINGLE',
      tracks: [{ appId: 3513350 }], // Open-ended (no targetHours)
      profile: BUILTIN_PROFILES['fast-test']!
    });

    const snapshot = engine.getSnapshot();
    const track = snapshot.tracks[0]!;
    expect(track.targetSeconds).toBeUndefined();
    expect(track.todayCreditedSeconds).toBeDefined();
    expect(track.todayCreditedSeconds).toBeGreaterThanOrEqual(0);

    await engine.stopRun();
  });
});
