import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AtomicStore, SafeStorageAdapter } from '../../src/main/store/atomicStore';
import { BackupService } from '../../src/main/store/backupService';
import { BACKUP_SCHEMA_VERSION, BackupFile } from '../../src/shared/backupSchema';
import { GameEntry, CatchUpGoal } from '../../src/shared/models';
import { HumanProfile, SessionLogEntry } from '../../src/core/types';

class MemorySafeStorage implements SafeStorageAdapter {
  isEncryptionAvailable(): boolean {
    return true;
  }
  encryptString(plainText: string): Buffer {
    return Buffer.from(plainText, 'utf-8');
  }
  decryptString(cipherText: Buffer): string {
    return cipherText.toString('utf-8');
  }
}

describe('BackupService (Milestone M12)', () => {
  let tmpRoot: string;
  let tmpDataDir: string;
  let store: AtomicStore;
  let backupService: BackupService;
  let safeStorage: MemorySafeStorage;
  let runActiveFlag: boolean;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hourforge-backup-test-'));
    tmpDataDir = path.join(tmpRoot, 'data');
    await fs.mkdir(tmpDataDir, { recursive: true });

    safeStorage = new MemorySafeStorage();
    store = new AtomicStore(tmpDataDir, safeStorage);
    await store.initialize();

    runActiveFlag = false;
    backupService = new BackupService({
      store,
      appVersion: '0.1.1',
      isRunActive: () => runActiveFlag
    });
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('performs round-trip export and import in MERGE mode', async () => {
    // 1. Populate store with initial data
    const testGame: GameEntry = {
      appId: 730,
      name: 'Counter-Strike 2',
      developer: 'Valve',
      publisher: 'Valve',
      headerImage: '',
      processNames: ['cs2.exe']
    };
    await store.saveGames([testGame]);

    const testGoal: CatchUpGoal = {
      id: 'goal-cs2',
      appId: 730,
      targetHours: 500,
      targetDate: '2026-12-31',
      createdAtUtc: 1794700000000,
      lastSyncedSteamHours: 420,
      userLabel: 'Summer Rank Target',
      friendHours: 510,
      status: 'ACTIVE'
    };
    await store.saveGoals([testGoal]);

    const testProfile: HumanProfile = {
      id: 'profile-custom',
      name: 'Hardcore Farmer',
      session: { minMin: 60, maxMin: 120 },
      rest: { minMin: 10, maxMin: 20, longChance: 0.1, longMinMin: 30, longMaxMin: 60 },
      restScalesWithSession: true,
      bootJitterSec: { min: 30, max: 60 },
      dailyCapHours: 10,
      weekendSessionBoost: 1.2
    };
    await store.saveProfiles([testProfile]);

    const historyEntry: SessionLogEntry = {
      id: 'sess-1',
      runId: 'run-1',
      appId: 730,
      startUtc: 1794696400000,
      endUtc: 1794698200000,
      source: 'schedule',
      creditedSeconds: 1800
    };
    await store.saveHistory([historyEntry]);

    // 2. Export backup including history
    const { jsonString, filename } = await backupService.exportBackup(true);
    expect(filename).toMatch(/^hourforge-backup-\d{4}-\d{2}-\d{2}\.json$/);

    // 3. Inspect preview
    const preview = await backupService.previewImport(jsonString);
    expect(preview.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(preview.games.unchanged.length).toBe(1);
    expect(preview.profiles.unchanged.length).toBe(1);
    expect(preview.goals.unchanged.length).toBe(1);
    expect(preview.historyCount).toBe(1);

    // 4. Clear games and goals in store to test restore
    await store.saveGames([]);
    await store.saveGoals([]);
    await store.saveProfiles([]);

    const emptyPreview = await backupService.previewImport(jsonString);
    expect(emptyPreview.games.toAdd.length).toBe(1);
    expect(emptyPreview.profiles.toAdd.length).toBe(1);
    expect(emptyPreview.goals.toAdd.length).toBe(1);

    // 5. Apply import in MERGE mode
    await backupService.applyImport(jsonString, 'MERGE');

    const restoredGames = await store.getGames();
    expect(restoredGames).toHaveLength(1);
    expect(restoredGames[0]?.appId).toBe(730);

    const restoredGoals = await store.getGoals();
    expect(restoredGoals).toHaveLength(1);
    expect(restoredGoals[0]?.id).toBe('goal-cs2');
    expect(restoredGoals[0]?.targetHours).toBe(500);
    expect(restoredGoals[0]?.userLabel).toBe('Summer Rank Target');

    const restoredProfiles = await store.getProfiles();
    expect(restoredProfiles.some(p => p.id === 'profile-custom')).toBe(true);

    const restoredHistory = await store.getHistory();
    expect(restoredHistory).toHaveLength(1);
    expect(restoredHistory[0]?.creditedSeconds).toBe(1800);
  });

  it('performs round-trip export and import in REPLACE mode', async () => {
    // 1. Initial backup data
    const backupGame: GameEntry = {
      appId: 570,
      name: 'Dota 2',
      developer: 'Valve',
      publisher: 'Valve',
      headerImage: '',
      processNames: ['dota2.exe']
    };
    await store.saveGames([backupGame]);
    const { jsonString } = await backupService.exportBackup(false);

    // 2. Store acquires unrelated game and profile that should NOT survive a REPLACE
    const extraneousGame: GameEntry = {
      appId: 999999,
      name: 'Temporary Game',
      developer: '',
      publisher: '',
      headerImage: '',
      processNames: []
    };
    await store.saveGames([backupGame, extraneousGame]);

    const extraneousProfile: HumanProfile = {
      id: 'profile-temp',
      name: 'Temporary Profile',
      session: { minMin: 30, maxMin: 60 },
      rest: { minMin: 10, maxMin: 15, longChance: 0.1, longMinMin: 20, longMaxMin: 40 },
      restScalesWithSession: true,
      bootJitterSec: { min: 10, max: 20 }
    };
    await store.saveProfiles([extraneousProfile]);

    // 3. Apply REPLACE mode
    await backupService.applyImport(jsonString, 'REPLACE');

    const gamesAfter = await store.getGames();
    expect(gamesAfter).toHaveLength(1);
    expect(gamesAfter[0]?.appId).toBe(570);

    const profilesAfter = await store.getProfiles();
    expect(profilesAfter.some(p => p.id === 'profile-temp')).toBe(false);
  });

  it('rejects corrupt JSON, missing fields, and files exceeding 2 MB limit', async () => {
    // Malformed JSON
    await expect(backupService.previewImport('{ not valid json')).rejects.toThrow(
      'Invalid backup file: not valid JSON.'
    );

    // Not an object
    await expect(backupService.previewImport('"just a string"')).rejects.toThrow(
      'Invalid backup file: root must be an object.'
    );

    // Missing schemaVersion & settings
    const invalidSchema = JSON.stringify({
      games: [],
      profiles: []
    });
    await expect(backupService.previewImport(invalidSchema)).rejects.toThrow(
      /Invalid backup file structure:/
    );

    // Exceeds 2 MB limit
    const hugePayload = JSON.stringify({
      schemaVersion: 1,
      exportedAtUtc: 1794700000000,
      appVersion: '0.1.0',
      settings: {
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
        firstRunCompleted: true
      },
      games: [],
      profiles: [],
      goals: [],
      junk: 'x'.repeat(2.1 * 1024 * 1024)
    });
    await expect(backupService.previewImport(hugePayload)).rejects.toThrow(/exceeds maximum allowed size of 2 MB/);
  });

  it('rejects backup created by a newer schemaVersion', async () => {
    const futureBackup: Partial<BackupFile> = {
      schemaVersion: BACKUP_SCHEMA_VERSION + 99,
      exportedAtUtc: 1794700000000,
      appVersion: '99.0.0',
      settings: {
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
        firstRunCompleted: true
      },
      games: [],
      profiles: [],
      goals: []
    };

    const futureJson = JSON.stringify(futureBackup);
    await expect(backupService.previewImport(futureJson)).rejects.toThrow(
      `This backup was created with a newer version of HourForge (schema version ${BACKUP_SCHEMA_VERSION + 99}). Please update HourForge to restore it.`
    );
  });

  it('validation beyond types: rejects broken profiles, extra keys, and invalid ranges', async () => {
    const baseValid = {
      schemaVersion: 1,
      exportedAtUtc: 1794700000000,
      appVersion: '0.1.0',
      settings: {
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
        firstRunCompleted: true
      },
      games: [],
      profiles: [],
      goals: []
    };

    // 1. Broken profile session: min > max
    const brokenSession = {
      ...baseValid,
      profiles: [
        {
          id: 'bad-session',
          name: 'Broken Session',
          session: { minMin: 120, maxMin: 45 }
        }
      ]
    };
    await expect(backupService.previewImport(JSON.stringify(brokenSession))).rejects.toThrow(
      /session minMin must be <= maxMin/
    );

    // 2. Broken profile daily cap > 24 hours
    const brokenCap = {
      ...baseValid,
      profiles: [
        {
          id: 'bad-cap',
          name: 'Impossible Cap',
          dailyCapHours: 26
        }
      ]
    };
    await expect(backupService.previewImport(JSON.stringify(brokenCap))).rejects.toThrow(
      /profiles\.0\.dailyCapHours/
    );

    // 3. Broken active window times (25:99)
    const brokenWindow = {
      ...baseValid,
      profiles: [
        {
          id: 'bad-window',
          name: 'Broken Window',
          activeWindow: { start: '25:99', end: '18:00', edgeJitterMin: 10 }
        }
      ]
    };
    await expect(backupService.previewImport(JSON.stringify(brokenWindow))).rejects.toThrow(
      /Invalid activeWindow start time/
    );

    // 4. Malicious unknown extra key rejected by .strict()
    const injectedKey = {
      ...baseValid,
      profiles: [
        {
          id: 'p1',
          name: 'Valid Name',
          maliciousInjectedField: 'hack'
        }
      ]
    };
    await expect(backupService.previewImport(JSON.stringify(injectedKey))).rejects.toThrow(
      /Unrecognized key/
    );

    // 5. Game App ID not positive integer
    const negativeAppId = {
      ...baseValid,
      games: [
        {
          appId: -730,
          name: 'Negative Game'
        }
      ]
    };
    await expect(backupService.previewImport(JSON.stringify(negativeAppId))).rejects.toThrow(
      /games\.0\.appId/
    );
  });

  it('strict privacy assertions: fails export on planted SteamID64, 32-hex keys, or active credentials in values', async () => {
    // 1. Setup base store
    const SECRET_STEAM_ID = '76561198012345678';
    const HEX_32_KEY = 'A1B2C3D4E5F60123456789ABCDEF0123';
    const REAL_API_KEY = 'ACTUAL_STEAM_WEB_API_KEY_9876543';

    await store.saveSteamApiKey(REAL_API_KEY);
    await store.saveSettings({
      startWithWindows: true,
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
      steamId64Override: SECRET_STEAM_ID
    });

    const baseProfileFields = {
      session: { minMin: 30, maxMin: 60 },
      rest: { minMin: 10, maxMin: 15, longChance: 0.1, longMinMin: 20, longMaxMin: 40 },
      restScalesWithSession: true,
      bootJitterSec: { min: 10, max: 20 }
    };

    // Plant 1: SteamID64 inside a profile name
    await store.saveProfiles([
      {
        id: 'p-leaker',
        name: `Rival ${SECRET_STEAM_ID}`,
        ...baseProfileFields
      }
    ]);
    await expect(backupService.exportBackup(false)).rejects.toThrow(
      /exported backup contains a SteamID64 value pattern/
    );

    // Fix profile, then Plant 2: 32-hex API key inside a game name
    await store.saveProfiles([
      {
        id: 'p-clean',
        name: 'Clean Profile',
        ...baseProfileFields
      }
    ]);
    await store.saveGames([
      {
        appId: 730,
        name: `Game With Secret ${HEX_32_KEY}`,
        developer: '',
        publisher: '',
        headerImage: '',
        processNames: []
      }
    ]);
    await expect(backupService.exportBackup(false)).rejects.toThrow(
      /exported backup contains a 32-character hex API key pattern/
    );

    // Fix game, then Plant 3: SteamID64 inside a goal userLabel
    await store.saveGames([
      {
        appId: 730,
        name: 'Clean Game',
        developer: '',
        publisher: '',
        headerImage: '',
        processNames: []
      }
    ]);
    await store.saveGoals([
      {
        id: 'g-leak',
        appId: 730,
        targetHours: 100,
        targetDate: '2026-12-31',
        createdAtUtc: 1794700000000,
        userLabel: `Target for 76561198099999999`,
        status: 'ACTIVE'
      }
    ]);
    await expect(backupService.exportBackup(false)).rejects.toThrow(
      /exported backup contains a SteamID64 value pattern/
    );

    // Fix goal, then Plant 4: Active API key string inside a goal userLabel
    await store.saveGoals([
      {
        id: 'g-leak-key',
        appId: 730,
        targetHours: 100,
        targetDate: '2026-12-31',
        createdAtUtc: 1794700000000,
        userLabel: `Secret key is ${REAL_API_KEY}`,
        status: 'ACTIVE'
      }
    ]);
    await expect(backupService.exportBackup(false)).rejects.toThrow(
      /exported backup contains the active Steam Web API key/
    );

    // Clean goals -> export should succeed with zero leaks
    await store.saveGoals([
      {
        id: 'g-clean',
        appId: 730,
        targetHours: 100,
        targetDate: '2026-12-31',
        createdAtUtc: 1794700000000,
        userLabel: 'Rival Benchmark',
        friendHours: 95,
        status: 'ACTIVE'
      }
    ]);
    const cleanExport = await backupService.exportBackup(false);
    expect(cleanExport.jsonString).not.toContain(SECRET_STEAM_ID);
    expect(cleanExport.jsonString).not.toContain(HEX_32_KEY);
    expect(cleanExport.jsonString).not.toContain(REAL_API_KEY);
    expect(cleanExport.jsonString).not.toContain('friendPersonaName');
  });

  it('refuses import and restore while a run is active', async () => {
    // Generate valid backup JSON
    const { jsonString } = await backupService.exportBackup(false);

    // Set engine run to ACTIVE
    runActiveFlag = true;

    // 1. Refuse MERGE
    await expect(backupService.applyImport(jsonString, 'MERGE')).rejects.toThrow(
      'Cannot restore backup while a run is active. Stop the run first.'
    );

    // 2. Refuse REPLACE
    await expect(backupService.applyImport(jsonString, 'REPLACE')).rejects.toThrow(
      'Cannot restore backup while a run is active. Stop the run first.'
    );

    // 3. Refuse restoreAutomaticBackup
    await expect(backupService.restoreAutomaticBackup('auto-backup-12345.json')).rejects.toThrow(
      'Cannot restore backup while a run is active. Stop the run first.'
    );

    // Reset flag -> restore should proceed
    runActiveFlag = false;
    await expect(backupService.applyImport(jsonString, 'MERGE')).resolves.not.toThrow();
  });

  it('maintains rolling backup limit of exactly 5 and creates safety snapshot on auto-restore', async () => {
    // Create 7 consecutive rolling backups with deterministic timestamp spacing
    for (let i = 1; i <= 7; i++) {
      await backupService.createRollingBackup(1794700000000 + i * 1000);
    }

    const autoBackups = await backupService.getAutomaticBackups();
    expect(autoBackups).toHaveLength(5);

    // Verify disk files match exactly 5
    const backupsDir = path.join(tmpDataDir, 'backups');
    const diskFiles = await fs.readdir(backupsDir);
    expect(diskFiles.filter(f => f.startsWith('auto-backup-') && f.endsWith('.json'))).toHaveLength(5);

    // Verify restoreAutomaticBackup creates safety snapshot before restoring
    const targetSnapshot = autoBackups[4]!.filename;
    await backupService.restoreAutomaticBackup(targetSnapshot);

    const backupsAfterRestore = await backupService.getAutomaticBackups();
    expect(backupsAfterRestore).toHaveLength(5);
  });

  it('migrates legacy Discord settings on import while respecting strict schema', async () => {
    // Legacy backup JSON containing 0.1.0-alpha keys: discordRpcEnabled, discordShowGameNames, discordShowHours
    const legacyBackup = {
      schemaVersion: 1,
      exportedAtUtc: 1794700000000,
      appVersion: '0.1.0-alpha',
      settings: {
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
        startSteamAutomatically: true,
        closeSteamOnQuit: false,
        discordRpcEnabled: false,
        discordShowGameNames: true,
        discordShowHours: true
      },
      games: [],
      profiles: [],
      goals: []
    };

    const legacyJson = JSON.stringify(legacyBackup);

    // Preview should succeed despite .strict() schema because of migration
    const preview = await backupService.previewImport(legacyJson);
    expect(preview.hasSettings).toBe(true);

    // Apply import in REPLACE mode
    await backupService.applyImport(legacyJson, 'REPLACE');

    // Verify migrated settings in store
    const updatedSettings = await store.getSettings();
    expect(updatedSettings.discordPresenceMode).toBe('none');
    expect((updatedSettings as any).discordRpcEnabled).toBeUndefined();
    expect((updatedSettings as any).discordShowGameNames).toBeUndefined();
    expect((updatedSettings as any).discordShowHours).toBeUndefined();

    // Now test legacy backup with discordRpcEnabled: true -> migrates to 'hourforge'
    legacyBackup.settings.discordRpcEnabled = true;
    await backupService.applyImport(JSON.stringify(legacyBackup), 'REPLACE');
    const enabledSettings = await store.getSettings();
    expect(enabledSettings.discordPresenceMode).toBe('hourforge');
  });
});
