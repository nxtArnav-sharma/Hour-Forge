import fs from 'fs/promises';
import path from 'path';
import { AtomicStore } from './atomicStore';
import {
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_SIZE_BYTES,
  BackupFile,
  BackupFileSchema,
  BackupPreview,
  AutoBackupInfo
} from '../../shared/backupSchema';
import { AppSettings, CatchUpGoal, GameEntry } from '../../shared/models';
import { HumanProfile, SessionLogEntry } from '../../core/types';

export interface BackupServiceDeps {
  store: AtomicStore;
  appVersion?: string;
  isRunActive?: () => boolean;
}

export function migrateLegacyBackupSettings(parsed: any): any {
  if (parsed && typeof parsed === 'object' && parsed.settings && typeof parsed.settings === 'object') {
    const s = { ...parsed.settings };
    if (s.discordPresenceMode === undefined) {
      if (s.discordRpcEnabled === false) {
        s.discordPresenceMode = 'none';
      } else {
        s.discordPresenceMode = 'hourforge';
      }
    }
    delete s.discordRpcEnabled;
    delete s.discordShowGameNames;
    delete s.discordShowHours;
    return {
      ...parsed,
      settings: s
    };
  }
  return parsed;
}

export class BackupService {
  private store: AtomicStore;
  private appVersion: string;
  private backupsDir: string;
  private isRunActive?: () => boolean;

  constructor(deps: BackupServiceDeps) {
    this.store = deps.store;
    let resolvedVersion = deps.appVersion;
    if (!resolvedVersion) {
      try {
        const { app } = require('electron');
        resolvedVersion = app?.getVersion?.();
      } catch {
        // electron not available in unit tests
      }
    }
    if (!resolvedVersion) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('../../../package.json');
        resolvedVersion = pkg.version;
      } catch {
        resolvedVersion = '0.1.0';
      }
    }
    this.appVersion = resolvedVersion || '0.1.0';
    this.backupsDir = path.join(this.store.dataDir, 'backups');
    this.isRunActive = deps.isRunActive;
  }

  /**
   * Exports a versioned, secret-free JSON backup string.
   */
  async exportBackup(includeHistory: boolean = false): Promise<{ jsonString: string; filename: string }> {
    const [rawSettings, games, profiles, goals, history, customPatterns] = await Promise.all([
      this.store.getSettings(),
      this.store.getGames(),
      this.store.getProfiles(),
      this.store.getGoals(),
      includeHistory ? this.store.getHistory() : Promise.resolve([]),
      this.store.getCustomPatterns()
    ]);

    // Sanitize settings: strip API keys, SteamID, account names, credentials, family PIN
    const sanitizedSettings = {
      startWithWindows: Boolean(rawSettings.startWithWindows),
      startHidden: Boolean(rawSettings.startHidden),
      closeToTray: Boolean(rawSettings.closeToTray),
      theme: rawSettings.theme || 'dark',
      onlineStatus: rawSettings.onlineStatus ?? 1,
      launchPickerCountdownSec: rawSettings.launchPickerCountdownSec ?? 60,
      defaultTemplate: rawSettings.defaultTemplate,
      notifyOnBlocked: Boolean(rawSettings.notifyOnBlocked),
      notifyOnFinish: Boolean(rawSettings.notifyOnFinish),
      notifyOnCrashLoop: Boolean(rawSettings.notifyOnCrashLoop),
      keepAwake: Boolean(rawSettings.keepAwake),
      pauseOnSleep: Boolean(rawSettings.pauseOnSleep),
      firstRunCompleted: Boolean(rawSettings.firstRunCompleted),
      startSteamAutomatically: rawSettings.startSteamAutomatically,
      closeSteamOnQuit: rawSettings.closeSteamOnQuit,
      discordPresenceMode: rawSettings.discordPresenceMode ?? 'hourforge'
    };

    // Sanitize goals: strictly ensure friend SteamID & profile names are NEVER included
    const sanitizedGoals = goals.map(g => ({
      id: g.id,
      appId: g.appId,
      targetHours: g.targetHours,
      targetDate: g.targetDate,
      createdAtUtc: g.createdAtUtc,
      lastSyncedSteamHours: g.lastSyncedSteamHours,
      lastSyncUtc: g.lastSyncUtc,
      manualStartingHours: g.manualStartingHours,
      userLabel: g.userLabel,
      friendHours: g.friendHours,
      status: g.status
    }));

    const backupData: BackupFile = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAtUtc: Date.now(),
      appVersion: this.appVersion,
      settings: sanitizedSettings,
      games,
      profiles,
      goals: sanitizedGoals,
      customPatterns,
      history: includeHistory ? history : undefined
    };

    // Validate structure against Zod schema
    const validated = BackupFileSchema.parse(backupData);
    const jsonString = JSON.stringify(validated, null, 2);

    // Hard verification: assert no secret leaks
    const currentApiKey = await this.store.getSteamApiKey();
    const currentSteamId = rawSettings.steamId64Override;
    this.assertNoSecrets(jsonString, currentApiKey, currentSteamId);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `hourforge-backup-${dateStr}.json`;

    return { jsonString, filename };
  }

  /**
   * Validates an import JSON file and calculates a preview diff without applying changes.
   */
  async previewImport(jsonString: string): Promise<BackupPreview> {
    if (Buffer.byteLength(jsonString, 'utf8') > MAX_BACKUP_SIZE_BYTES) {
      throw new Error(`Backup file exceeds maximum allowed size of ${MAX_BACKUP_SIZE_BYTES / (1024 * 1024)} MB.`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Invalid backup file: not valid JSON.');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid backup file: root must be an object.');
    }

    parsed = migrateLegacyBackupSettings(parsed);

    // Check schema version
    if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
      throw new Error(
        `This backup was created with a newer version of HourForge (schema version ${parsed.schemaVersion}). Please update HourForge to restore it.`
      );
    }

    const validation = BackupFileSchema.safeParse(parsed);
    if (!validation.success) {
      const issueDetails = validation.error.issues
        .slice(0, 3)
        .map((i: any) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Invalid backup file structure: ${issueDetails}`);
    }

    const backup = validation.data;
    const [currentGames, currentProfiles, currentGoals] = await Promise.all([
      this.store.getGames(),
      this.store.getProfiles(),
      this.store.getGoals()
    ]);

    // Calculate Games diff
    const curGameMap = new Map(currentGames.map(g => [g.appId, g]));
    const gamesToAdd: { id: number; label: string }[] = [];
    const gamesToUpdate: { id: number; label: string }[] = [];
    const gamesUnchanged: { id: number; label: string }[] = [];

    for (const g of backup.games) {
      const existing = curGameMap.get(g.appId);
      if (!existing) {
        gamesToAdd.push({ id: g.appId, label: g.name });
      } else if (existing.name === g.name) {
        gamesUnchanged.push({ id: g.appId, label: g.name });
      } else {
        gamesToUpdate.push({ id: g.appId, label: g.name });
      }
    }

    // Calculate Profiles diff
    const curProfileMap = new Map(currentProfiles.map(p => [p.id, p]));
    const profilesToAdd: { id: string; label: string }[] = [];
    const profilesToUpdate: { id: string; label: string }[] = [];
    const profilesUnchanged: { id: string; label: string }[] = [];

    for (const p of backup.profiles) {
      const existing = curProfileMap.get(p.id);
      if (!existing) {
        profilesToAdd.push({ id: p.id, label: p.name });
      } else if (existing.name === p.name && existing.dailyCapHours === p.dailyCapHours) {
        profilesUnchanged.push({ id: p.id, label: p.name });
      } else {
        profilesToUpdate.push({ id: p.id, label: p.name });
      }
    }

    // Calculate Goals diff
    const curGoalMap = new Map(currentGoals.map(g => [g.appId, g]));
    const goalsToAdd: { id: number; label: string }[] = [];
    const goalsToUpdate: { id: number; label: string }[] = [];
    const goalsUnchanged: { id: number; label: string }[] = [];

    for (const g of backup.goals) {
      const label = `${g.targetHours}h by ${g.targetDate}`;
      const existing = curGoalMap.get(g.appId);
      if (!existing) {
        goalsToAdd.push({ id: g.appId, label });
      } else if (
        existing.targetHours === g.targetHours &&
        existing.targetDate === g.targetDate &&
        existing.status === g.status
      ) {
        goalsUnchanged.push({ id: g.appId, label });
      } else {
        goalsToUpdate.push({ id: g.appId, label });
      }
    }

    // Calculate CustomPatterns diff
    const curPatternMap = new Map((await this.store.getCustomPatterns()).map(p => [p.id, p]));
    const patternsToAdd: { id: string; label: string }[] = [];
    const patternsToUpdate: { id: string; label: string }[] = [];
    const patternsUnchanged: { id: string; label: string }[] = [];

    if (backup.customPatterns) {
      for (const pat of backup.customPatterns) {
        const existing = curPatternMap.get(pat.id);
        if (!existing) {
          patternsToAdd.push({ id: pat.id, label: pat.name });
        } else if (JSON.stringify(existing) === JSON.stringify(pat)) {
          patternsUnchanged.push({ id: pat.id, label: pat.name });
        } else {
          patternsToUpdate.push({ id: pat.id, label: pat.name });
        }
      }
    }

    return {
      schemaVersion: backup.schemaVersion,
      exportedAtUtc: backup.exportedAtUtc,
      appVersion: backup.appVersion,
      games: {
        totalInBackup: backup.games.length,
        toAdd: gamesToAdd,
        toUpdate: gamesToUpdate,
        unchanged: gamesUnchanged
      },
      profiles: {
        totalInBackup: backup.profiles.length,
        toAdd: profilesToAdd,
        toUpdate: profilesToUpdate,
        unchanged: profilesUnchanged
      },
      goals: {
        totalInBackup: backup.goals.length,
        toAdd: goalsToAdd,
        toUpdate: goalsToUpdate,
        unchanged: goalsUnchanged
      },
      customPatterns: backup.customPatterns
        ? {
            totalInBackup: backup.customPatterns.length,
            toAdd: patternsToAdd,
            toUpdate: patternsToUpdate,
            unchanged: patternsUnchanged
          }
        : undefined,
      historyCount: backup.history ? backup.history.length : 0,
      hasSettings: true
    };
  }

  /**
   * Applies an import backup using either MERGE or REPLACE mode.
   * Automatically creates a rolling backup before modifying settings.
   */
  async applyImport(jsonString: string, mode: 'MERGE' | 'REPLACE'): Promise<void> {
    if (this.isRunActive && this.isRunActive()) {
      throw new Error('Cannot restore backup while a run is active. Stop the run first.');
    }

    // 1. Validate
    await this.previewImport(jsonString);
    const backup: BackupFile = migrateLegacyBackupSettings(JSON.parse(jsonString));

    // 2. Create automatic rolling backup of current state
    await this.createRollingBackup();

    const [currentSettings, currentGames, currentProfiles, currentGoals, currentHistory, currentCustomPatterns] =
      await Promise.all([
        this.store.getSettings(),
        this.store.getGames(),
        this.store.getProfiles(),
        this.store.getGoals(),
        this.store.getHistory(),
        this.store.getCustomPatterns()
      ]);

    if (mode === 'REPLACE') {
      // Replace settings (preserving existing local machine auth keys)
      const mergedSettings: AppSettings = {
        ...backup.settings,
        hasSteamApiKey: currentSettings.hasSteamApiKey,
        steamConnectedAccount: currentSettings.steamConnectedAccount,
        steamId64Override: currentSettings.steamId64Override,
        familyPin: currentSettings.familyPin
      };
      await this.store.saveSettings(mergedSettings);

      // Replace games, profiles, goals, custom patterns
      await this.store.saveGames(backup.games.map(g => this.normalizeGame(g)));
      await this.store.saveProfiles(backup.profiles.map(p => this.normalizeProfile(p)));
      await this.store.saveGoals(backup.goals);
      if (backup.customPatterns) {
        await this.store.saveCustomPatterns(backup.customPatterns);
      }

      // If backup has history, replace history
      if (backup.history) {
        await this.store.saveHistory(backup.history);
      }
    } else {
      // MERGE mode
      const mergedSettings: AppSettings = {
        ...currentSettings,
        ...backup.settings,
        hasSteamApiKey: currentSettings.hasSteamApiKey,
        steamConnectedAccount: currentSettings.steamConnectedAccount,
        steamId64Override: currentSettings.steamId64Override,
        familyPin: currentSettings.familyPin
      };
      await this.store.saveSettings(mergedSettings);

      // Merge games (existing games preserved, imported games added or updated)
      const gameMap = new Map<number, GameEntry>(currentGames.map(g => [g.appId, g]));
      for (const g of backup.games) {
        gameMap.set(g.appId, this.normalizeGame(g));
      }
      await this.store.saveGames(Array.from(gameMap.values()));

      // Merge profiles
      const profileMap = new Map<string, HumanProfile>(currentProfiles.map(p => [p.id, p]));
      for (const p of backup.profiles) {
        profileMap.set(p.id, this.normalizeProfile(p));
      }
      await this.store.saveProfiles(Array.from(profileMap.values()));

      // Merge goals
      const goalMap = new Map<number, CatchUpGoal>(currentGoals.map(g => [g.appId, g]));
      for (const g of backup.goals) {
        goalMap.set(g.appId, g);
      }
      await this.store.saveGoals(Array.from(goalMap.values()));

      // Merge custom patterns
      if (backup.customPatterns && backup.customPatterns.length > 0) {
        const patMap = new Map<string, any>(currentCustomPatterns.map(p => [p.id, p]));
        for (const pat of backup.customPatterns) {
          patMap.set(pat.id, pat);
        }
        await this.store.saveCustomPatterns(Array.from(patMap.values()));
      }

      // Merge history if present
      if (backup.history && backup.history.length > 0) {
        const histMap = new Map<string, SessionLogEntry>(currentHistory.map(h => [h.id, h]));
        for (const h of backup.history) {
          histMap.set(h.id, h);
        }
        await this.store.saveHistory(Array.from(histMap.values()));
      }
    }
  }

  /**
   * Creates an automatic rolling backup in the data directory and prunes to the last 5.
   */
  async createRollingBackup(timestampOverride?: number): Promise<string> {
    await fs.mkdir(this.backupsDir, { recursive: true });

    const { jsonString } = await this.exportBackup(false);
    const timestamp = timestampOverride ?? Date.now();
    const filename = `auto-backup-${timestamp}.json`;
    const filePath = path.join(this.backupsDir, filename);

    // Atomic write
    const tempPath = `${filePath}.tmp_${Math.random().toString(36).substring(2, 8)}`;
    await fs.writeFile(tempPath, jsonString, 'utf8');
    await fs.rename(tempPath, filePath);

    // Prune older backups: keep only the latest 5
    await this.pruneRollingBackups(5);

    return filename;
  }

  /**
   * Retrieves the list of automatic rolling backups, newest first.
   */
  async getAutomaticBackups(): Promise<AutoBackupInfo[]> {
    try {
      await fs.mkdir(this.backupsDir, { recursive: true });
      const entries = await fs.readdir(this.backupsDir);
      const autoBackups = entries.filter(f => f.startsWith('auto-backup-') && f.endsWith('.json'));

      const result: AutoBackupInfo[] = [];
      for (const filename of autoBackups) {
        const filePath = path.join(this.backupsDir, filename);
        const stats = await fs.stat(filePath);
        // Extract timestamp from filename: auto-backup-<timestamp>.json
        const match = filename.match(/^auto-backup-(\d+)\.json$/);
        const createdAtUtc = match && match[1] ? parseInt(match[1], 10) : stats.mtimeMs;

        result.push({
          filename,
          createdAtUtc,
          sizeBytes: stats.size
        });
      }

      // Sort newest first
      result.sort((a, b) => b.createdAtUtc - a.createdAtUtc);
      return result;
    } catch {
      return [];
    }
  }

  /**
   * Restores an automatic rolling backup by filename.
   * Refuses if a run is active, and takes a safety snapshot before restoring.
   */
  async restoreAutomaticBackup(filename: string): Promise<void> {
    if (this.isRunActive && this.isRunActive()) {
      throw new Error('Cannot restore backup while a run is active. Stop the run first.');
    }

    const safeName = path.basename(filename);
    if (!safeName.startsWith('auto-backup-') || !safeName.endsWith('.json')) {
      throw new Error('Invalid automatic backup filename.');
    }

    const filePath = path.join(this.backupsDir, safeName);
    const content = await fs.readFile(filePath, 'utf8');

    // Create safety snapshot before restoring
    await this.createRollingBackup();

    await this.applyImport(content, 'REPLACE');
  }

  /**
   * Deletes oldest rolling backups until at most `keepCount` remain.
   */
  private async pruneRollingBackups(keepCount: number = 5): Promise<void> {
    try {
      const backups = await this.getAutomaticBackups();
      if (backups.length > keepCount) {
        const toDelete = backups.slice(keepCount);
        for (const item of toDelete) {
          const p = path.join(this.backupsDir, item.filename);
          await fs.unlink(p).catch(() => {});
        }
      }
    } catch {
      // Non-fatal
    }
  }

  /**
   * Strict assertion ensuring no secret or credential ever leaks into an export.
   * Scans key names, string values for SteamID64 (17 digits starting with 7656119),
   * Web-API-key-like 32-hex strings, and known active secrets.
   */
  private assertNoSecrets(
    jsonString: string,
    currentApiKey?: string | null,
    currentSteamId?: string | null
  ): void {
    const forbiddenPatterns = [
      /"apiKey"\s*:/i,
      /"hasSteamApiKey"\s*:/i,
      /"steamConnectedAccount"\s*:/i,
      /"steamId64Override"\s*:/i,
      /"friendSteamId"/i,
      /"friendPersonaName"/i,
      /"password"\s*:/i,
      /"familyPin"\s*:/i
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(jsonString)) {
        throw new Error(`Security violation: exported backup contains forbidden secret pattern ${pattern}`);
      }
    }

    // 1. SteamID64 pattern: 17 digits starting with 7656119
    const steamIdPattern = /\b7656119\d{10}\b/;
    if (steamIdPattern.test(jsonString)) {
      throw new Error('Security violation: exported backup contains a SteamID64 value pattern.');
    }

    // 2. Web-API-key-like 32-hex string
    const apiKeyHexPattern = /\b[0-9a-fA-F]{32}\b/;
    if (apiKeyHexPattern.test(jsonString)) {
      throw new Error('Security violation: exported backup contains a 32-character hex API key pattern.');
    }

    // 3. Known active API key (if set and >= 8 chars)
    if (currentApiKey && currentApiKey.trim().length >= 8 && jsonString.includes(currentApiKey.trim())) {
      throw new Error('Security violation: exported backup contains the active Steam Web API key.');
    }

    // 4. Known active SteamID (if set and >= 8 chars)
    if (currentSteamId && currentSteamId.trim().length >= 8 && jsonString.includes(currentSteamId.trim())) {
      throw new Error('Security violation: exported backup contains the active SteamID.');
    }
  }

  private normalizeGame(g: any): GameEntry {
    return {
      appId: g.appId,
      name: g.name,
      developer: g.developer || '',
      publisher: g.publisher || '',
      headerImage: g.headerImage || '',
      isOwned: g.isOwned,
      processNames: g.processNames || [],
      defaultHours: g.defaultHours
    };
  }

  private normalizeProfile(p: any): HumanProfile {
    const rawRest = p.rest || { minMin: 15, maxMin: 30, longChance: 0.15, longMinMin: 35, longMaxMin: 60 };
    return {
      id: p.id,
      name: p.name,
      session: p.session || { minMin: 45, maxMin: 120 },
      rest: {
        minMin: Math.min(60, rawRest.minMin),
        maxMin: Math.min(60, rawRest.maxMin),
        longChance: rawRest.longChance ?? 0.15,
        longMinMin: Math.min(60, rawRest.longMinMin ?? rawRest.minMin),
        longMaxMin: Math.min(60, rawRest.longMaxMin ?? rawRest.maxMin)
      },
      restScalesWithSession: p.restScalesWithSession ?? true,
      bootJitterSec: p.bootJitterSec || { min: 60, max: 180 },
      activeWindow: p.activeWindow,
      dailyCapHours: p.dailyCapHours,
      weekendSessionBoost: p.weekendSessionBoost
    };
  }
}
