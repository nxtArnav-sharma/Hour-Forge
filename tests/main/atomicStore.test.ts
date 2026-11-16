import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AtomicStore, DpapiUnavailableError, SafeStorageAdapter } from '../../src/main/store/atomicStore';

describe('AtomicStore M9 ASF cleanup & secure storage', () => {
  let tmpDataDir: string;
  let tmpHourForgeDir: string;

  beforeEach(async () => {
    tmpHourForgeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hourforge-root-'));
    tmpDataDir = path.join(tmpHourForgeDir, 'data');
    await fs.mkdir(tmpDataDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpHourForgeDir, { recursive: true, force: true });
  });

  it('eradicates legacy ASF directories and artifacts on initialization', async () => {
    // 1. Setup legacy ASF folder and files
    const legacyAsfDir = path.join(tmpHourForgeDir, 'asf');
    await fs.mkdir(legacyAsfDir, { recursive: true });
    await fs.writeFile(path.join(legacyAsfDir, 'ArchiSteamFarm.exe'), 'dummy-exe');

    const legacyDataFiles = [
      'credentials.bin',
      'hourforge.db',
      'hourforge.json',
      'IPC.config',
      'ASF.json',
      'asf.pid'
    ];
    for (const f of legacyDataFiles) {
      await fs.writeFile(path.join(tmpDataDir, f), 'secret-content');
      await fs.writeFile(path.join(tmpHourForgeDir, f), 'root-content');
    }

    // Legacy settings file with old keys
    const legacySettings = {
      startWithWindows: false,
      startHidden: false,
      closeToTray: true,
      theme: 'dark',
      steamUsername: 'old_steam_user',
      hasStoredPassword: true,
      backend: 'asf',
      ipcPort: 51242,
      ipcPassword: 'old_ipc_password',
      notifyOnAuth: true,
      firstRunCompleted: true
    };
    await fs.writeFile(
      path.join(tmpDataDir, 'settings.json'),
      JSON.stringify(legacySettings, null, 2)
    );

    // Initialize store
    const store = new AtomicStore(tmpDataDir);
    await store.initialize();

    // Verify asf directory is gone
    await expect(fs.access(legacyAsfDir)).rejects.toThrow();

    // Verify legacy files in data and root are deleted
    for (const f of legacyDataFiles) {
      await expect(fs.access(path.join(tmpDataDir, f))).rejects.toThrow();
      await expect(fs.access(path.join(tmpHourForgeDir, f))).rejects.toThrow();
    }

    // Verify settings were sanitized of legacy properties
    const cleaned = await store.getSettings();
    expect((cleaned as any).steamUsername).toBeUndefined();
    expect((cleaned as any).hasStoredPassword).toBeUndefined();
    expect((cleaned as any).backend).toBeUndefined();
    expect((cleaned as any).ipcPort).toBeUndefined();
    expect((cleaned as any).ipcPassword).toBeUndefined();
    expect((cleaned as any).notifyOnAuth).toBeUndefined();
    expect(cleaned.startSteamAutomatically).toBe(true);
    expect(cleaned.closeSteamOnQuit).toBe(false);
  });

  it('deletes ONLY exact named paths without wildcards, ensuring unrelated and near-miss files survive', async () => {
    // 1. Exact targets to be deleted
    const exactTargets = [
      'ASF.json',
      'IPC.config',
      'hourforge.json',
      'hourforge.db',
      'asf.pid',
      'credentials.bin'
    ];
    for (const f of exactTargets) {
      await fs.writeFile(path.join(tmpDataDir, f), 'delete-me');
    }
    const exactAsfDir = path.join(tmpHourForgeDir, 'asf');
    await fs.mkdir(exactAsfDir, { recursive: true });
    await fs.writeFile(path.join(exactAsfDir, 'dummy.txt'), 'inside-asf');

    // 2. Unrelated and near-miss files & directories that MUST survive
    const nearMissFiles = [
      'credentials.bin.bak',
      'credentials.bin.old',
      'hourforge.json.backup',
      'hourforge.db.bak',
      'ASF.json.bak',
      'my_asf_notes.txt',
      'asf.pid.old',
      'custom-config.json'
    ];
    for (const f of nearMissFiles) {
      await fs.writeFile(path.join(tmpDataDir, f), `survive-${f}`);
      await fs.writeFile(path.join(tmpHourForgeDir, f), `root-survive-${f}`);
    }

    // Near-miss directories that must survive
    const nearMissDirs = [
      path.join(tmpHourForgeDir, 'asf-old'),
      path.join(tmpHourForgeDir, 'asf_backup'),
      path.join(tmpHourForgeDir, 'asf2')
    ];
    for (const d of nearMissDirs) {
      await fs.mkdir(d, { recursive: true });
      await fs.writeFile(path.join(d, 'file.txt'), 'keep');
    }

    // Run cleanup via store.initialize()
    const store = new AtomicStore(tmpDataDir);
    await store.initialize();

    // Verify exact targets are deleted
    await expect(fs.access(exactAsfDir)).rejects.toThrow();
    for (const f of exactTargets) {
      await expect(fs.access(path.join(tmpDataDir, f))).rejects.toThrow();
    }

    // Verify all near-miss files survived intact with correct content
    for (const f of nearMissFiles) {
      const dataContent = await fs.readFile(path.join(tmpDataDir, f), 'utf-8');
      expect(dataContent).toBe(`survive-${f}`);

      const rootContent = await fs.readFile(path.join(tmpHourForgeDir, f), 'utf-8');
      expect(rootContent).toBe(`root-survive-${f}`);
    }

    // Verify all near-miss directories survived
    for (const d of nearMissDirs) {
      const exists = (await fs.stat(d)).isDirectory();
      expect(exists).toBe(true);
      const inner = await fs.readFile(path.join(d, 'file.txt'), 'utf-8');
      expect(inner).toBe('keep');
    }
  });

  it('refuses to store API key when safeStorage is unavailable', async () => {
    const unavailableStorage: SafeStorageAdapter = {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw new Error('Should not be called');
      },
      decryptString: () => {
        throw new Error('Should not be called');
      }
    };

    const store = new AtomicStore(tmpDataDir, unavailableStorage);
    await store.initialize();

    await expect(store.saveSteamApiKey('1234567890ABCDEF1234567890ABCDEF')).rejects.toThrow(
      DpapiUnavailableError
    );

    expect(await store.hasSteamApiKey()).toBe(false);
  });

  it('successfully persists, retrieves, and clears Steam Web API key with valid SafeStorageAdapter', async () => {
    const mockStorage: SafeStorageAdapter = {
      isEncryptionAvailable: () => true,
      encryptString: (plainText: string) => Buffer.from(`ENC:${plainText}`, 'utf8'),
      decryptString: (encrypted: Buffer) => encrypted.toString('utf8').replace('ENC:', '')
    };

    const store = new AtomicStore(tmpDataDir, mockStorage);
    await store.initialize();

    const apiKey = 'ABCDEF1234567890ABCDEF1234567890';
    await store.saveSteamApiKey(apiKey);

    expect(await store.hasSteamApiKey()).toBe(true);
    const retrieved = await store.getSteamApiKey();
    expect(retrieved).toBe(apiKey);

    // Clear key
    await store.clearSteamApiKey();
    expect(await store.hasSteamApiKey()).toBe(false);
    expect(await store.getSteamApiKey()).toBeNull();
  });

  it('initializes default settings, games, profiles and history atomically', async () => {
    const store = new AtomicStore(tmpDataDir);
    await store.initialize();

    const settings = await store.getSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.firstRunCompleted).toBe(false);

    const games = await store.getGames();
    expect(games.length).toBe(0);

    const profiles = await store.getProfiles();
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.some(p => p.id === 'regular')).toBe(true);
  });

  it('migrates legacy goals by purging friendPersonaName from disk', async () => {
    const legacyGoal = {
      id: 'goal-legacy',
      appId: 730,
      targetHours: 500,
      targetDate: '2026-12-31',
      createdAtUtc: 1794700000000,
      friendPersonaName: 'OldFriendPersona',
      friendHours: 450,
      status: 'ACTIVE'
    };
    await fs.writeFile(path.join(tmpDataDir, 'goals.json'), JSON.stringify([legacyGoal]));

    const store = new AtomicStore(tmpDataDir);
    const goals = await store.getGoals();

    expect(goals).toHaveLength(1);
    expect((goals[0] as any).friendPersonaName).toBeUndefined();
    expect(goals[0]?.friendHours).toBe(450);

    // Verify rewritten file on disk no longer contains friendPersonaName
    const diskContent = await fs.readFile(path.join(tmpDataDir, 'goals.json'), 'utf-8');
    expect(diskContent).not.toContain('friendPersonaName');
    expect(diskContent).not.toContain('OldFriendPersona');
  });

  it('migrates legacy discord settings to discordPresenceMode', async () => {
    const legacySettings = {
      startWithWindows: false,
      startHidden: false,
      closeToTray: true,
      theme: 'dark',
      firstRunCompleted: true,
      discordRpcEnabled: false,
      discordShowGameNames: true,
      discordShowHours: true
    };
    await fs.writeFile(
      path.join(tmpDataDir, 'settings.json'),
      JSON.stringify(legacySettings, null, 2)
    );

    const store = new AtomicStore(tmpDataDir);
    await store.initialize();

    const settings = await store.getSettings();
    expect(settings.discordPresenceMode).toBe('none');
    expect((settings as any).discordRpcEnabled).toBeUndefined();
    expect((settings as any).discordShowGameNames).toBeUndefined();
    expect((settings as any).discordShowHours).toBeUndefined();

    // Verify rewritten file on disk
    const diskContent = await fs.readFile(path.join(tmpDataDir, 'settings.json'), 'utf-8');
    expect(diskContent).toContain('"discordPresenceMode": "none"');
    expect(diskContent).not.toContain('"discordRpcEnabled"');
  });
});
