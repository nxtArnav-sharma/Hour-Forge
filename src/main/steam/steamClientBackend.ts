import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { shell } from 'electron';
import { BackendEvent, BackendStatus, SteamBackend } from '../../shared/backend';
import { SteamDetector, SteamClientStatus } from './steamDetector';
import { cleanupPidFileWithVerification, verifyIsHourForgeHelper, queryWindowsProcessInfo } from './processSweep';

export interface HelperProcessInstance {
  appId: number;
  pid: number;
  child: ChildProcess;
  pidFilePath: string;
}

export interface SteamClientBackendOptions {
  detector?: SteamDetector;
  helpersDir: string;
  helperScriptPath: string;
  execPath?: string;
  startSteamAutomatically?: boolean;
  closeSteamOnQuit?: boolean;
  onNotification?: (title: string, message: string) => void;
  onLog?: (line: string) => void;
  pollIntervalMs?: number;
  getProcessInfo?: (pid: number) => Promise<{ executablePath?: string; commandLine?: string } | null>;
  killProcess?: (pid: number) => void;
}

export class SteamClientBackend implements SteamBackend {
  private detector: SteamDetector;
  private helpersDir: string;
  private helperScriptPath: string;
  private execPath: string;
  private startSteamAutomatically: boolean;
  private closeSteamOnQuit: boolean;
  private onNotification?: (title: string, message: string) => void;
  private onLog?: (line: string) => void;
  private pollIntervalMs: number;
  private getProcessInfo?: (pid: number) => Promise<{ executablePath?: string; commandLine?: string } | null>;
  private killProcess?: (pid: number) => void;

  private activeHelpers: Map<number, HelperProcessInstance> = new Map();
  private desiredPlayingAppIds: number[] = [];
  private eventListeners: Set<(e: BackendEvent) => void> = new Set();
  private pollTimer: NodeJS.Timeout | null = null;
  private lastSignOutNotificationTime: number = 0;
  private isStarted = false;
  private lastKnownSteamStatus: SteamClientStatus = {
    isInstalled: false,
    isRunning: false,
    isLoggedOn: false,
    pid: 0,
    activeUser: 0,
    personaName: null
  };

  constructor(options: SteamClientBackendOptions) {
    this.detector = options.detector || new SteamDetector();
    this.helpersDir = options.helpersDir;
    this.helperScriptPath = options.helperScriptPath;
    this.execPath = options.execPath || process.execPath;
    this.startSteamAutomatically = options.startSteamAutomatically ?? true;
    this.closeSteamOnQuit = options.closeSteamOnQuit ?? false;
    this.onNotification = options.onNotification;
    this.onLog = options.onLog;
    this.pollIntervalMs = options.pollIntervalMs || 2500;
    this.getProcessInfo = options.getProcessInfo;
    this.killProcess = options.killProcess;
  }

  private log(message: string): void {
    if (this.onLog) {
      this.onLog(`[SteamClientBackend] ${message}`);
    }
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    // 1. Startup sweep for stale helpers
    await this.cleanupStaleHelpers();

    // 2. Detect Steam client
    let steamStatus = await this.detector.getStatus();
    this.lastKnownSteamStatus = steamStatus;

    if (!steamStatus.isRunning && this.startSteamAutomatically) {
      this.log('Steam is not running. Launching Steam client (-silent)...');
      await this.detector.launchSteam(true);
      this.log('Waiting up to 120s for Steam to initialize and sign in...');
      steamStatus = await this.detector.waitForLogin(120, 2000);
      this.lastKnownSteamStatus = steamStatus;
    }

    if (steamStatus.isRunning && !steamStatus.isLoggedOn) {
      this.notifySignOutRequired();
    } else if (steamStatus.isLoggedOn) {
      this.log(`Steam client connected as: ${steamStatus.personaName || 'User'}`);
    }

    // 3. Start periodic background polling for Steam client & helper health
    this.startPolling();
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    this.stopPolling();

    // Kill all running helper processes
    await this.killAllHelpers();

    // If closeSteamOnQuit enabled and Steam is running, optionally close
    if (this.closeSteamOnQuit && this.lastKnownSteamStatus.pid > 0) {
      try {
        process.kill(this.lastKnownSteamStatus.pid);
      } catch {
        // ignore
      }
    }
  }

  async status(): Promise<BackendStatus> {
    const steamStatus = await this.detector.getStatus();
    this.lastKnownSteamStatus = steamStatus;

    const currentPlayingAppIds = Array.from(this.activeHelpers.keys()).filter(appId => {
      const helper = this.activeHelpers.get(appId);
      if (!helper) return false;
      try {
        process.kill(helper.pid, 0);
        return true;
      } catch {
        return false;
      }
    });

    return {
      isConnected: steamStatus.isRunning,
      isLoggedOn: steamStatus.isLoggedOn,
      isPlayingPossible: steamStatus.isLoggedOn,
      nickname: steamStatus.personaName || null,
      steamId: steamStatus.activeUser ? String(steamStatus.activeUser) : '',
      currentPlayingAppIds
    };
  }

  async setPlaying(appIds: number[]): Promise<void> {
    this.desiredPlayingAppIds = [...appIds];

    const currentAppIds = Array.from(this.activeHelpers.keys());

    // 1. Stop any tracks no longer in desired appIds
    for (const curId of currentAppIds) {
      if (!appIds.includes(curId)) {
        await this.stopHelper(curId);
      }
    }

    // 2. Start any new tracks in desired appIds (if Steam is logged on)
    const canPlay = this.lastKnownSteamStatus.isLoggedOn;
    if (canPlay) {
      for (const targetId of appIds) {
        if (!this.activeHelpers.has(targetId)) {
          await this.spawnHelper(targetId);
        }
      }
    } else {
      this.log(`Cannot spawn game helpers: Steam client is not signed in.`);
    }

    this.emitEvent('status_changed', await this.status());
  }

  async owns(appIds: number[]): Promise<Record<number, boolean>> {
    // When connected to the local desktop client, all target library games are valid
    const record: Record<number, boolean> = {};
    for (const id of appIds) {
      record[id] = true;
    }
    return record;
  }

  async addFreeLicense(appId: number): Promise<void> {
    this.log(`Opening Steam client install protocol for App ID: ${appId}`);
    try {
      await shell.openExternal(`steam://install/${appId}`);
    } catch (err: any) {
      this.log(`Failed to open steam://install/${appId}: ${err.message}`);
    }
  }

  onEvent(cb: (e: BackendEvent) => void): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  private emitEvent(type: any, payload: any): void {
    const event: BackendEvent = {
      type,
      payload,
      timestampUtc: Date.now()
    };
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  private async spawnHelper(appId: number): Promise<void> {
    try {
      await fs.promises.mkdir(this.helpersDir, { recursive: true });
      const pidFilePath = path.join(this.helpersDir, `${appId}.pid`);

      this.log(`Spawning helper process for App ID ${appId}...`);

      const unpackedModules = process.resourcesPath
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
        : undefined;

      const helperEnv: Record<string, string | undefined> = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SteamAppId: String(appId),
        SteamGameId: String(appId)
      };

      if (unpackedModules && fs.existsSync(unpackedModules)) {
        helperEnv.NODE_PATH = unpackedModules;
      }

      const child = spawn(
        this.execPath,
        [this.helperScriptPath, String(appId), pidFilePath],
        {
          detached: false,
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: helperEnv
        }
      );

      const pid = child.pid || 0;
      if (!pid) {
        throw new Error(`Failed to obtain PID for helper process (App ID ${appId})`);
      }

      const instance: HelperProcessInstance = {
        appId,
        pid,
        child,
        pidFilePath
      };

      this.activeHelpers.set(appId, instance);

      child.stdout?.on('data', data => {
        this.log(`[Helper ${appId}] ${data.toString().trim()}`);
      });

      child.stderr?.on('data', data => {
        this.log(`[Helper ${appId} ERR] ${data.toString().trim()}`);
      });

      child.on('exit', (code, signal) => {
        this.log(`Helper process for App ID ${appId} exited (code: ${code}, signal: ${signal})`);
        this.activeHelpers.delete(appId);
        try {
          if (fs.existsSync(pidFilePath)) {
            fs.unlinkSync(pidFilePath);
          }
        } catch {
          // ignore
        }

        // If exited unexpectedly and still desired, notify
        if (this.isStarted && this.desiredPlayingAppIds.includes(appId)) {
          this.emitEvent('status_changed', { helperCrashedAppId: appId });
        }
      });
    } catch (err: any) {
      this.log(`Failed to spawn helper for App ID ${appId}: ${err.message}`);
    }
  }

  private async stopHelper(appId: number): Promise<void> {
    const helper = this.activeHelpers.get(appId);
    if (!helper) return;

    this.activeHelpers.delete(appId);
    try {
      if (helper.child && helper.child.connected) {
        helper.child.send('stop');
      }
    } catch {
      // ignore
    }

    const allowedDirs = [
      path.dirname(this.execPath),
      path.resolve(this.helpersDir, '..'),
      this.helpersDir
    ];

    const getProc = this.getProcessInfo || queryWindowsProcessInfo;
    const doKill = this.killProcess || ((pid: number) => {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // ignore
      }
    });

    try {
      const procInfo = await getProc(helper.pid);
      if (procInfo && verifyIsHourForgeHelper(procInfo, allowedDirs)) {
        doKill(helper.pid);
      } else {
        this.log(`Refusing to kill PID ${helper.pid}: process is not an HourForge steamHelper`);
      }
    } catch {
      // ignore
    }

    try {
      if (fs.existsSync(helper.pidFilePath)) {
        await fs.promises.unlink(helper.pidFilePath);
      }
    } catch {
      // ignore
    }
  }

  async killAllHelpers(): Promise<void> {
    const appIds = Array.from(this.activeHelpers.keys());
    for (const id of appIds) {
      await this.stopHelper(id);
    }
    await this.cleanupStaleHelpers();
  }

  private async cleanupStaleHelpers(): Promise<void> {
    try {
      if (!fs.existsSync(this.helpersDir)) return;
      const files = await fs.promises.readdir(this.helpersDir);
      const allowedDirs = [
        path.dirname(this.execPath),
        path.resolve(this.helpersDir, '..'),
        this.helpersDir
      ];
      for (const file of files) {
        if (!file.endsWith('.pid')) continue;
        const pidPath = path.join(this.helpersDir, file);
        await cleanupPidFileWithVerification({
          pidPath,
          helpersDir: this.helpersDir,
          allowedDirs,
          getProcessInfo: this.getProcessInfo,
          killProcess: this.killProcess
        });
      }
    } catch {
      // ignore
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      await this.pollStatus();
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollStatus(): Promise<void> {
    const prevStatus = this.lastKnownSteamStatus;
    const curStatus = await this.detector.getStatus();
    this.lastKnownSteamStatus = curStatus;

    // Detect state transitions
    if (!curStatus.isRunning && prevStatus.isRunning) {
      this.log('Steam client was closed mid-run. Suspending playtime.');
      this.emitEvent('status_changed', { suspended: true, reason: 'steam_closed' });
      // Kill helpers since Steam is closed
      for (const appId of Array.from(this.activeHelpers.keys())) {
        await this.stopHelper(appId);
      }
    } else if (curStatus.isRunning && !curStatus.isLoggedOn && prevStatus.isLoggedOn) {
      this.log('Steam client was signed out. Suspending playtime.');
      this.emitEvent('status_changed', { suspended: true, reason: 'steam_signed_out' });
      this.notifySignOutRequired();
      for (const appId of Array.from(this.activeHelpers.keys())) {
        await this.stopHelper(appId);
      }
    } else if (curStatus.isLoggedOn && (!prevStatus.isLoggedOn || !prevStatus.isRunning)) {
      this.log(`Steam client is signed in as ${curStatus.personaName || 'User'}. Resuming desired tracks.`);
      this.emitEvent('status_changed', { suspended: false, resumed: true });
      // Re-spawn desired helpers
      for (const appId of this.desiredPlayingAppIds) {
        if (!this.activeHelpers.has(appId)) {
          await this.spawnHelper(appId);
        }
      }
    } else if (curStatus.isRunning && !curStatus.isLoggedOn) {
      this.notifySignOutRequired();
    }
  }

  private notifySignOutRequired(): void {
    const now = Date.now();
    // Notify at most once per 10 minutes
    if (now - this.lastSignOutNotificationTime >= 10 * 60 * 1000) {
      this.lastSignOutNotificationTime = now;
      if (this.onNotification) {
        this.onNotification('Sign in to Steam', 'Sign in to the Steam desktop client to continue accumulating playtime.');
      }
    }
  }
}
