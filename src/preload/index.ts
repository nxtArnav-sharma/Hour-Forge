import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/channels';
import { AppSettings, CatchUpGoal, GameEntry, GoalPacingReport, RunStateSnapshot, SteamHoursSnapshot } from '../shared/models';
import { HumanProfile, SessionLogEntry, RunMode } from '../core/types';
import { BackupPreview, AutoBackupInfo } from '../shared/backupSchema';
import { NavRoute } from '../shared/routes';

export interface HourForgeApi {
  app: {
    consumePendingRoute: () => Promise<NavRoute | null>;
    onNavigate: (callback: (route: NavRoute) => void) => () => void;
  };
  engine: {
    startRun: (options: {
      mode: RunMode;
      tracks: Array<{ appId: number; targetHours?: number; dailyQuotaHours?: number }>;
      profileId: string;
      delayMs?: number;
    }) => Promise<void>;
    stopRun: () => Promise<void>;
    pauseAll: () => Promise<void>;
    resumeAll: () => Promise<void>;
    skipRest: (appId: number) => Promise<void>;
    extendPlay: (appId: number, seconds: number) => Promise<void>;
    getState: () => Promise<RunStateSnapshot>;
    onStateChange: (callback: (state: RunStateSnapshot) => void) => () => void;
  };
  store: {
    getSettings: () => Promise<AppSettings>;
    saveSettings: (settings: AppSettings) => Promise<void>;
    getGames: () => Promise<GameEntry[]>;
    addGame: (game: GameEntry) => Promise<void>;
    removeGame: (appId: number) => Promise<void>;
    getProfiles: () => Promise<HumanProfile[]>;
    saveProfile: (profile: HumanProfile) => Promise<void>;
    getHistory: () => Promise<SessionLogEntry[]>;
  };
  steam: {
    resolveApp: (appIdOrUrl: string) => Promise<any>;
    addFreeLicense: (appId: number) => Promise<void>;
    getClientStatus: () => Promise<{
      isInstalled: boolean;
      isRunning: boolean;
      isLoggedOn: boolean;
      personaName: string | null;
      accountName?: string | null;
      steamId64?: string | null;
    }>;
    launchClient: () => Promise<boolean>;
    testApiKey: (apiKey: string, steamId?: string) => Promise<{ success: boolean; message?: string }>;
    saveApiKey: (apiKey: string) => Promise<void>;
    removeApiKey: () => Promise<void>;
    getHoursStatus: () => Promise<SteamHoursSnapshot>;
    refreshHours: () => Promise<SteamHoursSnapshot>;
    onHoursUpdated: (callback: (snapshot: SteamHoursSnapshot) => void) => () => void;
  };
  goals: {
    getGoals: () => Promise<CatchUpGoal[]>;
    saveGoal: (goal: CatchUpGoal) => Promise<void>;
    deleteGoal: (id: string) => Promise<void>;
    getPacingReport: (appId: number) => Promise<GoalPacingReport | null>;
    checkFriendHours: (appId: number, friendSteamId: string) => Promise<{
      success: boolean;
      isPrivate?: boolean;
      friendHours?: number;
      message?: string;
    }>;
    onGoalsUpdated: (callback: (goals: CatchUpGoal[]) => void) => () => void;
  };
  backup: {
    exportBackup: (
      includeHistory: boolean,
      savePath?: string
    ) => Promise<{ jsonString: string; filename: string; savedPath?: string }>;
    selectSavePath: (defaultFilename: string) => Promise<string | null>;
    selectImportFile: () => Promise<{ filename: string; content: string } | null>;
    previewImport: (jsonString: string) => Promise<BackupPreview>;
    applyImport: (jsonString: string, mode: 'MERGE' | 'REPLACE') => Promise<void>;
    getAutoBackups: () => Promise<AutoBackupInfo[]>;
    restoreAutoBackup: (filename: string) => Promise<void>;
  };
  system: {
    minimize: () => void;
    close: () => void;
    getLogs: () => Promise<{ engineLogs: string[]; helperLogs: string[] }>;
    onLogLine: (callback: (category: 'engine' | 'helper', line: string) => void) => () => void;
  };
}

const api: HourForgeApi = {
  app: {
    consumePendingRoute: () => ipcRenderer.invoke(IPC_CHANNELS.APP_CONSUME_PENDING_ROUTE),
    onNavigate: callback => {
      const handler = (_event: any, route: NavRoute) => callback(route);
      ipcRenderer.on(IPC_CHANNELS.EVENT_NAVIGATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_NAVIGATE, handler);
    }
  },
  engine: {
    startRun: opts => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_START_RUN, opts),
    stopRun: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_STOP_RUN),
    pauseAll: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_PAUSE_ALL),
    resumeAll: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_RESUME_ALL),
    skipRest: appId =>
      ipcRenderer.invoke(IPC_CHANNELS.ENGINE_TRACK_ACTION, { appId, action: 'skip_rest' }),
    extendPlay: (appId, seconds) =>
      ipcRenderer.invoke(IPC_CHANNELS.ENGINE_TRACK_ACTION, {
        appId,
        action: 'extend',
        seconds
      }),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_GET_STATE),
    onStateChange: callback => {
      const handler = (_event: any, state: RunStateSnapshot) => callback(state);
      ipcRenderer.on(IPC_CHANNELS.EVENT_ENGINE_STATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_ENGINE_STATE, handler);
    }
  },
  store: {
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET_SETTINGS),
    saveSettings: s => ipcRenderer.invoke(IPC_CHANNELS.STORE_SAVE_SETTINGS, s),
    getGames: () => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET_GAMES),
    addGame: g => ipcRenderer.invoke(IPC_CHANNELS.STORE_ADD_GAME, g),
    removeGame: id => ipcRenderer.invoke(IPC_CHANNELS.STORE_REMOVE_GAME, id),
    getProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET_PROFILES),
    saveProfile: p => ipcRenderer.invoke(IPC_CHANNELS.STORE_SAVE_PROFILE, p),
    getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.STORE_GET_HISTORY)
  },
  steam: {
    resolveApp: input => ipcRenderer.invoke(IPC_CHANNELS.STEAM_RESOLVE_APP, input),
    addFreeLicense: appId => ipcRenderer.invoke(IPC_CHANNELS.STEAM_ADD_FREE_LICENSE, appId),
    getClientStatus: () => ipcRenderer.invoke(IPC_CHANNELS.STEAM_GET_CLIENT_STATUS),
    launchClient: () => ipcRenderer.invoke(IPC_CHANNELS.STEAM_LAUNCH_CLIENT),
    testApiKey: (apiKey, steamId) =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAM_TEST_API_KEY, { apiKey, steamId }),
    saveApiKey: apiKey => ipcRenderer.invoke(IPC_CHANNELS.STEAM_SAVE_API_KEY, apiKey),
    removeApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.STEAM_REMOVE_API_KEY),
    getHoursStatus: () => ipcRenderer.invoke(IPC_CHANNELS.STEAM_GET_HOURS_STATUS),
    refreshHours: () => ipcRenderer.invoke(IPC_CHANNELS.STEAM_REFRESH_HOURS),
    onHoursUpdated: callback => {
      const handler = (_event: any, snapshot: SteamHoursSnapshot) => callback(snapshot);
      ipcRenderer.on(IPC_CHANNELS.EVENT_HOURS_UPDATED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_HOURS_UPDATED, handler);
    }
  },
  goals: {
    getGoals: () => ipcRenderer.invoke(IPC_CHANNELS.GOAL_GET_ALL),
    saveGoal: goal => ipcRenderer.invoke(IPC_CHANNELS.GOAL_SAVE, goal),
    deleteGoal: id => ipcRenderer.invoke(IPC_CHANNELS.GOAL_DELETE, id),
    getPacingReport: appId => ipcRenderer.invoke(IPC_CHANNELS.GOAL_GET_PACING, appId),
    checkFriendHours: (appId, friendSteamId) =>
      ipcRenderer.invoke(IPC_CHANNELS.GOAL_CHECK_FRIEND, { appId, friendSteamId }),
    onGoalsUpdated: callback => {
      const handler = (_event: any, goals: CatchUpGoal[]) => callback(goals);
      ipcRenderer.on(IPC_CHANNELS.EVENT_GOALS_UPDATED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_GOALS_UPDATED, handler);
    }
  },
  backup: {
    exportBackup: (includeHistory, savePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_EXPORT, { includeHistory, savePath }),
    selectSavePath: defaultFilename =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SELECT_SAVE_PATH, defaultFilename),
    selectImportFile: () =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SELECT_IMPORT_FILE),
    previewImport: jsonString =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_PREVIEW, jsonString),
    applyImport: (jsonString, mode) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_APPLY, { jsonString, mode }),
    getAutoBackups: () =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_GET_AUTO_LIST),
    restoreAutoBackup: filename =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE_AUTO, filename)
  },
  system: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.SYSTEM_WINDOW_MINIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.SYSTEM_WINDOW_CLOSE),
    getLogs: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_LOGS),
    onLogLine: callback => {
      const handler = (_event: any, payload: { category: 'engine' | 'helper'; line: string }) =>
        callback(payload.category, payload.line);
      ipcRenderer.on(IPC_CHANNELS.EVENT_LOG_LINE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_LOG_LINE, handler);
    }
  }
};

contextBridge.exposeInMainWorld('hourforge', api);
