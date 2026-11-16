import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppSettings, CatchUpGoal, GameEntry, RunStateSnapshot } from '../../shared/models';
import { HumanProfile, SessionLogEntry } from '../../core/types';
import { BUILTIN_PROFILES } from '../../core/profiles';

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class DpapiUnavailableError extends Error {
  constructor(
    message = 'Operating system credential encryption (Windows DPAPI) is unavailable. Secure key cannot be stored.'
  ) {
    super(message);
    this.name = 'DpapiUnavailableError';
  }
}

export class AtomicStore {
  readonly dataDir: string;
  private safeStorageAdapter?: SafeStorageAdapter;

  constructor(dataDir: string, safeStorageAdapter?: SafeStorageAdapter) {
    this.dataDir = dataDir;
    this.safeStorageAdapter = safeStorageAdapter;
  }

  private getStorage(): SafeStorageAdapter | null {
    if (this.safeStorageAdapter) {
      return this.safeStorageAdapter;
    }
    try {
      const electron = require('electron');
      if (
        electron.safeStorage &&
        typeof electron.safeStorage.isEncryptionAvailable === 'function'
      ) {
        return electron.safeStorage as SafeStorageAdapter;
      }
      return null;
    } catch {
      return null;
    }
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });

    // 1. Upgrade cleanup: delete legacy ASF files, directories, and credentials
    await this.cleanupLegacyAsfArtifacts();

    // 2. Initialize settings if missing
    const settingsPath = this.getFilePath('settings.json');
    if (!existsSync(settingsPath)) {
      const defaultSettings: AppSettings = {
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
        firstRunCompleted: false,
        startSteamAutomatically: true,
        closeSteamOnQuit: false,
        discordPresenceMode: 'hourforge'
      };
      await this.saveSettings(defaultSettings);
    } else {
      // Clean legacy properties from existing settings
      const raw = await this.readJsonFile<any>('settings.json');
      let modified = false;
      const legacyKeys = [
        'steamUsername',
        'hasStoredPassword',
        'ipcPort',
        'ipcPassword',
        'backend',
        'notifyOnAuth'
      ];
      for (const key of legacyKeys) {
        if (key in raw) {
          delete raw[key];
          modified = true;
        }
      }
      if (raw.startSteamAutomatically === undefined) {
        raw.startSteamAutomatically = true;
        modified = true;
      }
      if (raw.closeSteamOnQuit === undefined) {
        raw.closeSteamOnQuit = false;
        modified = true;
      }
      // Migrate legacy Discord settings to discordPresenceMode
      if (raw.discordPresenceMode === undefined) {
        if (raw.discordRpcEnabled === false) {
          raw.discordPresenceMode = 'none';
        } else {
          raw.discordPresenceMode = 'hourforge';
        }
        modified = true;
      }
      if ('discordRpcEnabled' in raw) {
        delete raw.discordRpcEnabled;
        modified = true;
      }
      if ('discordShowGameNames' in raw) {
        delete raw.discordShowGameNames;
        modified = true;
      }
      if ('discordShowHours' in raw) {
        delete raw.discordShowHours;
        modified = true;
      }
      if (modified) {
        await this.saveSettings(raw);
      }
    }

    // 3. Initialize default games if missing
    const gamesPath = this.getFilePath('games.json');
    if (!existsSync(gamesPath)) {
      const defaultGames: GameEntry[] = [
        {
          appId: 3513350,
          name: 'Wuthering Waves',
          developer: 'Kuro Games',
          publisher: 'Kuro Games',
          headerImage:
            'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3513350/header.jpg',
          processNames: ['Wuthering Waves.exe', 'Client-Win64-Shipping.exe'],
          defaultHours: 1
        },
        {
          appId: 4508340,
          name: 'NTE: Neverness to Everness',
          developer: 'Hotta Studio',
          publisher: 'Perfect World Games',
          headerImage:
            'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4508340/header.jpg',
          processNames: ['NTE.exe', 'NevernessToEverness.exe'],
          defaultHours: 2
        }
      ];
      await this.saveGames(defaultGames);
    }

    // 4. Initialize profiles if missing
    const profilesPath = this.getFilePath('profiles.json');
    if (!existsSync(profilesPath)) {
      await this.saveProfiles(Object.values(BUILTIN_PROFILES));
    }

    // 5. Initialize history if missing
    const historyPath = this.getFilePath('history.json');
    if (!existsSync(historyPath)) {
      await this.saveHistory([]);
    }
  }

  /**
   * Deletes legacy ASF leftover directories and files across %LOCALAPPDATA%\HourForge.
   */
  async cleanupLegacyAsfArtifacts(): Promise<void> {
    const parentDir = path.resolve(this.dataDir, '..');
    const asfFolder = path.join(parentDir, 'asf');

    if (existsSync(asfFolder)) {
      try {
        await fs.rm(asfFolder, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    // Leftover files to eradicate
    const legacyFiles = [
      'ASF.json',
      'IPC.config',
      'hourforge.json',
      'hourforge.db',
      'asf.pid',
      'credentials.bin'
    ];

    const searchDirs = [this.dataDir, parentDir];
    for (const dir of searchDirs) {
      for (const fileName of legacyFiles) {
        const fullPath = path.join(dir, fileName);
        if (existsSync(fullPath)) {
          try {
            if (fileName === 'credentials.bin') {
              // Securely overwrite credentials.bin with random bytes before unlinking
              const stat = await fs.stat(fullPath);
              const randomBytes = crypto.randomBytes(stat.size || 64);
              await fs.writeFile(fullPath, randomBytes);
            }
            await fs.unlink(fullPath);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  getFilePath(filename: string): string {
    return path.join(this.dataDir, filename);
  }

  // --- Settings ---
  async getSettings(): Promise<AppSettings> {
    return this.readJsonFile<AppSettings>('settings.json');
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.writeAtomicJson('settings.json', settings);
  }

  // --- Steam Web API Key Storage (safeStorage / DPAPI only for M10) ---
  async saveSteamApiKey(apiKey: string): Promise<void> {
    const storage = this.getStorage();
    if (!storage || !storage.isEncryptionAvailable()) {
      throw new DpapiUnavailableError();
    }

    const encrypted = storage.encryptString(apiKey);
    const keyPath = this.getFilePath('steam-api-key.bin');
    await fs.writeFile(keyPath, encrypted);
  }

  async getSteamApiKey(): Promise<string | null> {
    const keyPath = this.getFilePath('steam-api-key.bin');
    if (!existsSync(keyPath)) return null;

    const storage = this.getStorage();
    if (!storage || !storage.isEncryptionAvailable()) {
      throw new DpapiUnavailableError();
    }

    const buf = await fs.readFile(keyPath);
    return storage.decryptString(buf);
  }

  async hasSteamApiKey(): Promise<boolean> {
    return existsSync(this.getFilePath('steam-api-key.bin'));
  }

  async clearSteamApiKey(): Promise<void> {
    const keyPath = this.getFilePath('steam-api-key.bin');
    try {
      if (existsSync(keyPath)) {
        const stat = await fs.stat(keyPath);
        await fs.writeFile(keyPath, crypto.randomBytes(stat.size || 32));
        await fs.unlink(keyPath);
      }
    } catch {
      // ignore
    }
  }

  // --- Games ---
  async getGames(): Promise<GameEntry[]> {
    return this.readJsonFile<GameEntry[]>('games.json');
  }

  async saveGames(games: GameEntry[]): Promise<void> {
    await this.writeAtomicJson('games.json', games);
  }

  // --- Profiles ---
  async getProfiles(): Promise<HumanProfile[]> {
    return this.readJsonFile<HumanProfile[]>('profiles.json');
  }

  async saveProfiles(profiles: HumanProfile[]): Promise<void> {
    await this.writeAtomicJson('profiles.json', profiles);
  }

  // --- History & Session Logs ---
  async getHistory(): Promise<SessionLogEntry[]> {
    return this.readJsonFile<SessionLogEntry[]>('history.json');
  }

  async saveHistory(history: SessionLogEntry[]): Promise<void> {
    await this.writeAtomicJson('history.json', history);
  }

  async appendSessionLogs(logs: SessionLogEntry[]): Promise<void> {
    if (logs.length === 0) return;
    const history = await this.getHistory();
    history.push(...logs);
    await this.saveHistory(history);
  }

  // --- Run State Snapshot (Crash Recovery) ---
  async getRunSnapshot(): Promise<RunStateSnapshot | null> {
    const p = this.getFilePath('run-state.json');
    if (!existsSync(p)) return null;
    try {
      return await this.readJsonFile<RunStateSnapshot>('run-state.json');
    } catch {
      return null;
    }
  }

  async saveRunSnapshot(snapshot: RunStateSnapshot): Promise<void> {
    await this.writeAtomicJson('run-state.json', snapshot);
  }

  async clearRunSnapshot(): Promise<void> {
    const p = this.getFilePath('run-state.json');
    try {
      await fs.unlink(p);
    } catch {}
  }

  // --- Steam Hours Baselines & Cache ---
  async getSteamHoursBaselines(): Promise<Record<number, { baselineSteamHours: number; initialSyncUtc: number; cachedSteamHours?: number }>> {
    const p = this.getFilePath('steam-hours-baselines.json');
    if (!existsSync(p)) return {};
    try {
      return await this.readJsonFile('steam-hours-baselines.json');
    } catch {
      return {};
    }
  }

  async saveSteamHoursBaselines(data: Record<number, { baselineSteamHours: number; initialSyncUtc: number; cachedSteamHours?: number }>): Promise<void> {
    await this.writeAtomicJson('steam-hours-baselines.json', data);
  }

  // --- Catch-Up Goals (M11) ---
  async getGoals(): Promise<CatchUpGoal[]> {
    const p = this.getFilePath('goals.json');
    if (!existsSync(p)) return [];
    try {
      const raw = await this.readJsonFile<any[]>('goals.json');
      if (!Array.isArray(raw)) return [];
      let migrated = false;
      const cleanedGoals: CatchUpGoal[] = raw.map(g => {
        if (g && typeof g === 'object' && 'friendPersonaName' in g) {
          migrated = true;
          const { friendPersonaName: _f, ...rest } = g;
          return rest as CatchUpGoal;
        }
        return g as CatchUpGoal;
      });
      if (migrated) {
        await this.saveGoals(cleanedGoals);
      }
      return cleanedGoals;
    } catch {
      return [];
    }
  }

  async saveGoals(goals: CatchUpGoal[]): Promise<void> {
    await this.writeAtomicJson('goals.json', goals);
  }

  async saveGoal(goal: CatchUpGoal): Promise<void> {
    const goals = await this.getGoals();
    const idx = goals.findIndex(g => g.id === goal.id || g.appId === goal.appId);
    if (idx >= 0) {
      goals[idx] = goal;
    } else {
      goals.push(goal);
    }
    await this.saveGoals(goals);
  }

  async deleteGoal(id: string): Promise<void> {
    const goals = await this.getGoals();
    const filtered = goals.filter(g => g.id !== id && String(g.appId) !== id);
    await this.saveGoals(filtered);
  }

  // --- Helper Methods ---
  private async readJsonFile<T>(filename: string): Promise<T> {
    const filePath = this.getFilePath(filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  }

  private async writeAtomicJson(filename: string, data: any): Promise<void> {
    const filePath = this.getFilePath(filename);
    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
    const str = JSON.stringify(data, null, 2);
    await fs.writeFile(tmpPath, str, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }
}
