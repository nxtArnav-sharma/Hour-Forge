import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { AtomicStore } from './store/atomicStore';
import { BackupService } from './store/backupService';
import { SteamBackend } from '../shared/backend';
import { FakeSteamBackend } from './steam/fakeBackend';
import { HourForgeEngine } from './engine/engine';
import { TrayManager } from './tray';
import { NotificationManager, ToastType, getRouteForToast } from './notify';
import { AutostartManager } from './autostart';
import { PowerManager } from './power';
import { resolveSteamApp, parseAppId } from './steam/storeApi';
import { SteamDetector } from './steam/steamDetector';
import { SteamClientBackend } from './steam/steamClientBackend';
import { SteamHoursService } from './steam/steamHoursService';
import { GoalManager } from './engine/goalManager';
import { DiscordRpcService } from './discord/discordRpcService';
import { RouteManager } from './routeManager';
import { IPC_CHANNELS } from '../shared/channels';
import { CatchUpGoal } from '../shared/models';
import { RunMode } from '../core/types';
import { isAllowedExternalUrl } from '../shared/credit';

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let pickerWindow: BrowserWindow | null = null;
let store: AtomicStore;
let backend: SteamBackend;
let engine: HourForgeEngine;
let trayManager: TrayManager;
let notificationManager: NotificationManager;
let powerManager: PowerManager;
let steamDetector: SteamDetector;
let steamHoursService: SteamHoursService;
let goalManager: GoalManager;
let backupService: BackupService;
let discordRpcService: DiscordRpcService;
let routeManager: RouteManager;

const isAutostart = process.argv.includes('--autostart');
const isSimMode = process.argv.includes('--sim') || process.env.HOURFORGE_SIM === '1';
export const isDevSim = !app.isPackaged && isSimMode;

export function devSimLog(tag: string, data?: any) {
  if (isDevSim) {
    if (data !== undefined) {
      console.log(tag, data);
    } else {
      console.log(tag);
    }
  }
}

const appDataRoot =
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const hourforgeDir = path.join(appDataRoot, 'HourForge');
const dataDir = path.join(hourforgeDir, 'data');

const engineLogs: string[] = [];
const helperLogs: string[] = [];

function appendLog(category: 'engine' | 'helper', line: string) {
  const redacted = line.replace(/(key|token|password|secret|SteamID)=([^&\s]+)/gi, '$1=[REDACTED]');
  const target = category === 'engine' ? engineLogs : helperLogs;
  target.push(`[${new Date().toISOString()}] ${redacted}`);
  if (target.length > 2000) {
    target.shift();
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.webContents.send(IPC_CHANNELS.EVENT_LOG_LINE, { category, line: redacted });
  }
}

function getAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../build/icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(process.resourcesPath || '', 'build/icon.ico'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(process.resourcesPath || '', 'build/icon.png')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    devSimLog('[HOURFORGE_WINDOW_SHOWN]', { isVisible: mainWindow?.isVisible() ?? false });
  });

  mainWindow.on('show', async () => {
    if (engine && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.EVENT_ENGINE_STATE, engine.getSnapshot());
    }
    if (goalManager && mainWindow && !mainWindow.isDestroyed()) {
      const goals = await goalManager.getGoals();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.EVENT_GOALS_UPDATED, goals);
      }
    }
  });

  mainWindow.on('close', e => {
    if ((app as any).isQuitting) {
      return;
    }
    e.preventDefault();
    mainWindow?.destroy();
    mainWindow = null;
    routeManager?.onWindowDestroyed();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

function createLaunchPickerWindow(): BrowserWindow {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.showInactive();
    return pickerWindow;
  }

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const cardWidth = 440;
  const cardHeight = 620;
  const x = Math.max(0, width - cardWidth - 16);
  const y = Math.max(0, height - cardHeight - 16);

  pickerWindow = new BrowserWindow({
    width: cardWidth,
    height: cardHeight,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  pickerWindow.once('ready-to-show', () => {
    pickerWindow?.showInactive();
    devSimLog('[HOURFORGE_PICKER_CARD_SHOWN]', {
      x,
      y,
      isVisible: pickerWindow?.isVisible() ?? false
    });
  });

  pickerWindow.on('closed', () => {
    pickerWindow = null;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    pickerWindow.loadURL(`${devUrl}#launch-picker-card`);
  } else {
    pickerWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: 'launch-picker-card'
    });
  }

  return pickerWindow;
}

app.whenReady().then(async () => {
  // 1. Initialize atomic store
  store = new AtomicStore(dataDir);
  await store.initialize();
  const settings = await store.getSettings();

  // 1.1 Initialize Route Manager
  routeManager = new RouteManager({
    getWindow: () => mainWindow,
    createWindow: () => createMainWindow()
  });

  // 2. Initialize Notification Manager
  notificationManager = new NotificationManager((type: ToastType) => {
    routeManager.navigateTo(getRouteForToast(type));
  });

  // 3. Initialize Backend (SteamClientBackend by default, or FakeSteamBackend in sim mode)
  steamDetector = new SteamDetector();

  if (isSimMode) {
    backend = new FakeSteamBackend();
    appendLog('engine', 'Initialized in FakeSteamBackend simulation mode.');
  } else {
    const helpersDir = path.join(hourforgeDir, 'helpers');
    const helperScriptPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'steamHelper.js')
      : fs.existsSync(path.resolve(__dirname, 'steamHelper.js'))
        ? path.resolve(__dirname, 'steamHelper.js')
        : path.resolve(__dirname, 'steam/steamHelper.js');

    backend = new SteamClientBackend({
      detector: steamDetector,
      helpersDir,
      helperScriptPath,
      execPath: process.execPath,
      startSteamAutomatically: settings.startSteamAutomatically ?? true,
      closeSteamOnQuit: settings.closeSteamOnQuit ?? false,
      onNotification: (title, message) => {
        notificationManager.showToast('steam_client', title, message);
      },
      onLog: l => appendLog('helper', l)
    });
    appendLog('engine', 'Initialized SteamClientBackend mode.');
  }

  // 4. Initialize Engine
  engine = new HourForgeEngine(
    backend,
    store,
    snapshot => {
      trayManager.updateState(snapshot);
      if (discordRpcService) {
        discordRpcService.onEngineState(snapshot);
      }
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        mainWindow.webContents.send(IPC_CHANNELS.EVENT_ENGINE_STATE, snapshot);
      }
    },
    () => {
      notificationManager.showToast(
        'run_finished',
        'Grinding Run Finished',
        'All target game hours have been reached.'
      );
    }
  );

  // 5. Initialize Tray
  trayManager = new TrayManager(engine, {
    onToggleWindow: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.hide();
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createMainWindow();
      }
    },
    onOpenDashboard: () => {
      routeManager.navigateTo('dashboard');
    },
    onStartNewRun: () => {
      routeManager.navigateTo('new-run');
    },
    onOpenSettings: () => {
      routeManager.navigateTo('settings');
    }
  });
  trayManager.initialize();
  devSimLog('[HOURFORGE_MAIN_TRAY]', { trayCreated: trayManager.hasTray() });

  // 5.1 Initialize Goal Manager (M11 Catch-Up Goal)
  goalManager = new GoalManager({
    store,
    engine,
    onGoalUpdated: goals => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        mainWindow.webContents.send(IPC_CHANNELS.EVENT_GOALS_UPDATED, goals);
      }
    }
  });

  // 5.2 Initialize Backup Service (M12 Backup & Restore)
  backupService = new BackupService({
    store,
    appVersion: app.getVersion(),
    isRunActive: () => {
      if (!engine) return false;
      const st = engine.getStatus();
      return st === 'RUNNING' || st === 'PAUSED' || st === 'STARTING';
    }
  });

  // 5.2 Initialize Steam Hours Service (Web API hours polling & lag detection)
  steamHoursService = new SteamHoursService({
    store,
    detector: steamDetector,
    getEngineSnapshot: () => engine.getSnapshot(),
    onHoursUpdated: snapshot => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        mainWindow.webContents.send(IPC_CHANNELS.EVENT_HOURS_UPDATED, snapshot);
      }
      if (snapshot.status === 'OK' && goalManager) {
        for (const [appIdStr, data] of Object.entries(snapshot.games)) {
          goalManager.syncGoalWithSteam(Number(appIdStr), data.steamHours);
        }
      }
    }
  });
  steamHoursService.startPolling();

  // 5.3 Initialize Discord Rich Presence Service (M14a)
  discordRpcService = new DiscordRpcService({
    store,
    getEngineState: () => engine.getSnapshot(),
    getGames: () => store.getGames()
  });
  discordRpcService.start().catch(err => {
    appendLog('engine', `Discord RPC start error: ${err}`);
  });

  // 6. Initialize Power & Autostart
  powerManager = new PowerManager(
    () => {
      appendLog('engine', 'System sleep detected. Suspending engine.');
      engine.setGlobalOverlay('SUSPENDED');
    },
    () => {
      appendLog('engine', 'System wake detected. Resuming engine.');
      engine.setGlobalOverlay(null);
    }
  );
  powerManager.setKeepAwake(settings.keepAwake);

  // Backend events
  backend.onEvent(evt => {
    if (evt.type === 'blocked') {
      notificationManager.showToast(
        'blocked',
        'Steam Client Disconnected / Signed Out',
        'Steam desktop client is closed or signed out. Tracks paused automatically.'
      );
    }
  });

  // Start backend
  try {
    await backend.start();
  } catch (err) {
    appendLog('engine', `Backend start warning: ${err}`);
  }

  // Check crash-safe resume
  const previousSnapshot = await store.getRunSnapshot();
  if (previousSnapshot && (previousSnapshot.status === 'RUNNING' || previousSnapshot.status === 'PAUSED')) {
    const profiles = await store.getProfiles();
    const prof = profiles.find(p => p.id === previousSnapshot.profileId) || profiles[0]!;
    await engine.restoreFromSnapshot(previousSnapshot, prof);
  }

  // Register IPC Handlers
  registerIpcHandlers();

  // 7. Show Launch Picker card if autostart, or full MainWindow if normal start
  if (isAutostart) {
    createLaunchPickerWindow();
  } else if (!settings.startHidden) {
    createMainWindow();
  }
  devSimLog('[HOURFORGE_MAIN_WINDOWS]', {
    totalWindows: BrowserWindow.getAllWindows().length,
    visibleWindows: BrowserWindow.getAllWindows().filter(w => w.isVisible()).length
  });

  // Focus existing on second instance
  app.on('second-instance', () => {
    createMainWindow();
  });

  const exitAfterIdx = process.argv.indexOf('--exit-after-ms');
  if (exitAfterIdx >= 0 && process.argv[exitAfterIdx + 1]) {
    const delay = parseInt(process.argv[exitAfterIdx + 1]!, 10);
    setTimeout(async () => {
      console.log(`[HOURFORGE_MAIN_EXIT] Exiting after ${delay}ms as requested.`);
      app.quit();
    }, delay);
  }
});

function registerIpcHandlers() {
  // Engine Handlers
  ipcMain.handle(IPC_CHANNELS.ENGINE_START_RUN, async (_event, opts: any) => {
    const profiles = await store.getProfiles();
    const profile = profiles.find(p => p.id === opts.profileId) || profiles[0]!;
    await engine.startRun({
      mode: opts.mode as RunMode,
      tracks: opts.tracks,
      profile,
      delayMs: opts.delayMs
    });
    if (pickerWindow && !pickerWindow.isDestroyed()) {
      pickerWindow.close();
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_STOP_RUN, async () => {
    await engine.stopRun();
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_PAUSE_ALL, () => {
    engine.pauseAll();
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RESUME_ALL, () => {
    engine.resumeAll();
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_TRACK_ACTION, (_event, { appId, action, seconds }: any) => {
    if (action === 'skip_rest') {
      engine.skipRest(appId);
    } else if (action === 'extend' && seconds) {
      engine.extendPlay(appId, seconds);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_STATE, () => {
    return engine.getSnapshot();
  });

  // Store Handlers
  ipcMain.handle(IPC_CHANNELS.STORE_GET_SETTINGS, async () => {
    return store.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.STORE_SAVE_SETTINGS, async (_event, newSettings) => {
    await store.saveSettings(newSettings);
    AutostartManager.setEnabled(newSettings.startWithWindows);
    powerManager.setKeepAwake(newSettings.keepAwake);
    if (discordRpcService) {
      await discordRpcService.onSettingsUpdated(newSettings);
    }
  });

  ipcMain.handle(IPC_CHANNELS.STORE_GET_GAMES, async () => {
    return store.getGames();
  });

  ipcMain.handle(IPC_CHANNELS.STORE_ADD_GAME, async (_event, game) => {
    const games = await store.getGames();
    if (!games.some(g => g.appId === game.appId)) {
      games.push(game);
      await store.saveGames(games);
    }
  });

  ipcMain.handle(IPC_CHANNELS.STORE_REMOVE_GAME, async (_event, appId: number) => {
    const games = await store.getGames();
    const filtered = games.filter(g => g.appId !== appId);
    await store.saveGames(filtered);
  });

  ipcMain.handle(IPC_CHANNELS.STORE_GET_PROFILES, async () => {
    return store.getProfiles();
  });

  ipcMain.handle(IPC_CHANNELS.STORE_SAVE_PROFILE, async (_event, profile) => {
    const profiles = await store.getProfiles();
    const idx = profiles.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = profile;
    } else {
      profiles.push(profile);
    }
    await store.saveProfiles(profiles);
  });

  ipcMain.handle(IPC_CHANNELS.STORE_GET_HISTORY, async () => {
    return store.getHistory();
  });

  // Steam & Client Handlers
  ipcMain.handle(IPC_CHANNELS.STEAM_RESOLVE_APP, async (_event, input: string) => {
    const appId = parseAppId(input);
    if (!appId) return null;
    return resolveSteamApp(appId);
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_ADD_FREE_LICENSE, async (_event, appId: number) => {
    await backend.addFreeLicense(appId);
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_GET_CLIENT_STATUS, async () => {
    return steamDetector.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_LAUNCH_CLIENT, async () => {
    return steamDetector.launchSteam(false);
  });

  ipcMain.handle(
    IPC_CHANNELS.STEAM_TEST_API_KEY,
    async (_event, { apiKey, steamId }: { apiKey: string; steamId?: string }) => {
      return steamHoursService.testApiKey(apiKey, steamId);
    }
  );

  ipcMain.handle(IPC_CHANNELS.STEAM_SAVE_API_KEY, async (_event, apiKey: string) => {
    await steamHoursService.saveApiKey(apiKey);
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_REMOVE_API_KEY, async () => {
    await steamHoursService.removeApiKey();
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_GET_HOURS_STATUS, async () => {
    return steamHoursService.getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.STEAM_REFRESH_HOURS, async () => {
    return steamHoursService.refreshHours(true);
  });

  // Goal Handlers (M11)
  ipcMain.handle(IPC_CHANNELS.GOAL_GET_ALL, async () => {
    return goalManager.getGoals();
  });

  ipcMain.handle(IPC_CHANNELS.GOAL_SAVE, async (_event, goal: CatchUpGoal) => {
    await goalManager.saveGoal(goal);
  });

  ipcMain.handle(IPC_CHANNELS.GOAL_DELETE, async (_event, id: string) => {
    await goalManager.deleteGoal(id);
  });

  ipcMain.handle(IPC_CHANNELS.GOAL_GET_PACING, async (_event, appId: number) => {
    return goalManager.getPacingReport(appId);
  });

  ipcMain.handle(
    IPC_CHANNELS.GOAL_CHECK_FRIEND,
    async (_event, { appId, friendSteamId }: { appId: number; friendSteamId: string }) => {
      return goalManager.checkFriendHours(appId, friendSteamId);
    }
  );

  // Backup & Restore Handlers (M12)
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_EXPORT,
    async (
      _event,
      { includeHistory, savePath }: { includeHistory?: boolean; savePath?: string } = {}
    ) => {
      const exportResult = await backupService.exportBackup(Boolean(includeHistory));
      if (savePath) {
        await fs.promises.writeFile(savePath, exportResult.jsonString, 'utf8');
        return { ...exportResult, savedPath: savePath };
      }
      return exportResult;
    }
  );

  ipcMain.handle(IPC_CHANNELS.BACKUP_SELECT_SAVE_PATH, async (_event, defaultFilename: string) => {
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const res = await dialog.showSaveDialog(parent as any, {
      title: 'Export HourForge Backup',
      defaultPath: defaultFilename,
      filters: [{ name: 'HourForge Backup (*.json)', extensions: ['json'] }]
    });
    return res.canceled ? null : res.filePath;
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_SELECT_IMPORT_FILE, async () => {
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const res = await dialog.showOpenDialog(parent as any, {
      title: 'Import HourForge Backup',
      filters: [{ name: 'HourForge Backup (*.json)', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const filePath = res.filePaths[0];
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { filename: path.basename(filePath), content };
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_PREVIEW, async (_event, jsonString: string) => {
    return backupService.previewImport(jsonString);
  });

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_APPLY,
    async (_event, { jsonString, mode }: { jsonString: string; mode: 'MERGE' | 'REPLACE' }) => {
      await backupService.applyImport(jsonString, mode);
    }
  );

  ipcMain.handle(IPC_CHANNELS.BACKUP_GET_AUTO_LIST, async () => {
    return backupService.getAutomaticBackups();
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_RESTORE_AUTO, async (_event, filename: string) => {
    await backupService.restoreAutomaticBackup(filename);
  });

  ipcMain.handle(IPC_CHANNELS.APP_CONSUME_PENDING_ROUTE, () => {
    return routeManager.consumePendingRoute();
  });

  // System & Window Handlers
  ipcMain.on(IPC_CHANNELS.SYSTEM_WINDOW_MINIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.on(IPC_CHANNELS.SYSTEM_WINDOW_CLOSE, event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.destroy();
      if (win === mainWindow) {
        mainWindow = null;
        routeManager?.onWindowDestroyed();
      }
      if (win === pickerWindow) pickerWindow = null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_LOGS, () => {
    return { engineLogs, helperLogs };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL_URL, async (_event, url: string) => {
    if (typeof url !== 'string' || !isAllowedExternalUrl(url)) {
      throw new Error(`Disallowed external URL: ${url}`);
    }
    await shell.openExternal(url);
  });
}

app.on('window-all-closed', () => {
  // Keep running in tray (R4)
});

app.on('before-quit', async () => {
  if (discordRpcService) {
    await discordRpcService.stop();
  }
  if (steamHoursService) {
    steamHoursService.stopPolling();
  }
  if (engine) {
    await engine.stopRun();
  }
  if (backend) {
    await backend.stop();
  }
  if (trayManager) {
    trayManager.destroy();
  }
});
