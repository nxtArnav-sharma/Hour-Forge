import { Client } from '@xhayper/discord-rpc';
import { AtomicStore } from '../store/atomicStore';
import { RunStateSnapshot, TrackSnapshot, GameEntry, AppSettings, DiscordPresenceMode } from '../../shared/models';
import { PresenceLineRotator, Clock } from './presenceLines';

export const DISCORD_CLIENT_ID = '1421390654935662665';

export interface DiscordRpcServiceOptions {
  store: AtomicStore;
  getEngineState: () => RunStateSnapshot | null;
  getGames: () => Promise<GameEntry[]>;
  clientFactory?: () => any;
  retryIntervalMs?: number;
  maxRetryIntervalMs?: number;
  coalesceIntervalMs?: number; // default 15000ms (15s rate limit)
  rotator?: PresenceLineRotator;
  clock?: Clock;
}

export interface DiscordRpcStatus {
  isEnabled: boolean;
  isConnected: boolean;
  presenceMode: DiscordPresenceMode;
  lastError?: string;
}

export class DiscordRpcService {
  private store: AtomicStore;
  private getEngineState: () => RunStateSnapshot | null;
  private getGames: () => Promise<GameEntry[]>;
  private clientFactory: () => any;
  private retryIntervalMs: number;
  private maxRetryIntervalMs: number;
  private coalesceIntervalMs: number;
  private clock: Clock;

  private client: any = null;
  private isConnected = false;
  private isConnecting = false;
  private currentRetryDelay: number;
  private retryTimer: NodeJS.Timeout | null = null;
  private isStopped = false;

  private rotator: PresenceLineRotator;
  private lastUpdateTime = 0;
  private pendingUpdateTimer: NodeJS.Timeout | null = null;
  private rotationCheckTimer: NodeJS.Timeout | null = null;

  // Stored start timestamp to guarantee preservation across line rotations
  private activeStartTimestamp: number | null = null;

  constructor(options: DiscordRpcServiceOptions) {
    this.store = options.store;
    this.getEngineState = options.getEngineState;
    this.getGames = options.getGames;
    this.clientFactory = options.clientFactory || (() => new Client({ clientId: DISCORD_CLIENT_ID }));
    this.retryIntervalMs = options.retryIntervalMs ?? 15000;
    this.maxRetryIntervalMs = options.maxRetryIntervalMs ?? 30000;
    this.coalesceIntervalMs = options.coalesceIntervalMs ?? 15000;
    this.clock = options.clock || { now: () => Date.now() };
    this.currentRetryDelay = this.retryIntervalMs;

    this.rotator = options.rotator || new PresenceLineRotator({ clock: this.clock });
  }

  async start(): Promise<void> {
    this.isStopped = false;
    const settings = await this.getSettingsSafe();
    if (settings.discordPresenceMode === 'none') {
      return;
    }
    await this.tryConnect();
    this.startRotationTimer();
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.pendingUpdateTimer) {
      clearTimeout(this.pendingUpdateTimer);
      this.pendingUpdateTimer = null;
    }
    if (this.rotationCheckTimer) {
      clearInterval(this.rotationCheckTimer);
      this.rotationCheckTimer = null;
    }

    if (this.client) {
      try {
        if (this.isConnected && this.client.user?.clearActivity) {
          await this.client.user.clearActivity();
        }
      } catch (_) {}

      try {
        if (this.client.destroy) {
          await this.client.destroy();
        }
      } catch (_) {}

      this.client = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.activeStartTimestamp = null;
  }

  getStatus(): DiscordRpcStatus {
    return {
      isEnabled: this.client !== null || !this.isStopped,
      isConnected: this.isConnected,
      presenceMode: this.isStopped ? 'none' : 'hourforge'
    };
  }

  async onSettingsUpdated(settings: AppSettings): Promise<void> {
    if (settings.discordPresenceMode === 'none') {
      await this.stop();
    } else {
      if (!this.isConnected && !this.isConnecting) {
        this.isStopped = false;
        await this.tryConnect();
        this.startRotationTimer();
      } else {
        await this.queueUpdateActivity();
      }
    }
  }

  async onEngineState(snapshot: RunStateSnapshot): Promise<void> {
    if (snapshot.status === 'RUNNING') {
      if (!this.activeStartTimestamp) {
        this.activeStartTimestamp = snapshot.t0Utc || this.clock.now();
      }
    } else if (snapshot.status === 'IDLE') {
      this.activeStartTimestamp = null;
    }

    if (this.isConnected) {
      await this.queueUpdateActivity();
    }
  }

  private startRotationTimer(): void {
    if (this.rotationCheckTimer) return;
    // Check every 60 seconds if line rotation is due
    this.rotationCheckTimer = setInterval(async () => {
      if (this.isConnected && !this.isStopped) {
        const snapshot = this.getEngineState();
        if (snapshot && snapshot.status === 'RUNNING') {
          // If rotator rotates, push update (coalesced)
          await this.queueUpdateActivity();
        }
      }
    }, 60000);
  }

  private async tryConnect(): Promise<void> {
    if (this.isStopped || this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      const client = this.clientFactory();
      this.client = client;

      // Handle quiet disconnect / restart
      if (client.transport) {
        client.transport.on('close', () => {
          this.handleDisconnect();
        });
      }

      await client.login();
      this.isConnected = true;
      this.isConnecting = false;
      this.currentRetryDelay = this.retryIntervalMs; // Reset backoff on success
      console.log('[DISCORD_RPC] Successfully connected to Discord via local IPC named pipe.');

      await this.executeActivityUpdate();
    } catch (_) {
      // Discord not running or connection refused: handle quietly with backoff
      this.isConnecting = false;
      this.isConnected = false;
      this.client = null;
      console.log(`[DISCORD_RPC] Discord offline or pipe unavailable, scheduling retry in ${this.currentRetryDelay}ms.`);
      this.scheduleRetry();
    }
  }

  private handleDisconnect(): void {
    if (this.isStopped) return;
    this.isConnected = false;
    this.isConnecting = false;
    this.client = null;
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.isStopped || this.retryTimer) return;

    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (!this.isStopped) {
        // Increase backoff up to maxRetryIntervalMs (15s -> 20s -> 25s -> 30s)
        this.currentRetryDelay = Math.min(this.maxRetryIntervalMs, this.currentRetryDelay + 5000);
        await this.tryConnect();
      }
    }, this.currentRetryDelay);
  }

  /**
   * Rate limited update queue: coalesces updates to <= 1 update per 15 seconds.
   */
  async queueUpdateActivity(): Promise<void> {
    if (!this.isConnected || !this.client || this.isStopped) {
      return;
    }

    const now = this.clock.now();
    const elapsed = now - this.lastUpdateTime;

    if (elapsed >= this.coalesceIntervalMs) {
      // Time window elapsed, fire immediately
      if (this.pendingUpdateTimer) {
        clearTimeout(this.pendingUpdateTimer);
        this.pendingUpdateTimer = null;
      }
      await this.executeActivityUpdate();
    } else {
      // Coalesce into pending timer if not already scheduled
      if (!this.pendingUpdateTimer) {
        const waitMs = this.coalesceIntervalMs - elapsed;
        this.pendingUpdateTimer = setTimeout(async () => {
          this.pendingUpdateTimer = null;
          await this.executeActivityUpdate();
        }, waitMs);
      }
    }
  }

  /**
   * Internal execution of Discord activity update.
   */
  async executeActivityUpdate(): Promise<void> {
    if (!this.isConnected || !this.client || !this.client.user?.setActivity) {
      return;
    }

    const settings = await this.getSettingsSafe();
    if (settings.discordPresenceMode === 'none') {
      await this.stop();
      return;
    }

    this.lastUpdateTime = this.clock.now();

    const snapshot = this.getEngineState();

    if (!snapshot || snapshot.status === 'IDLE') {
      this.activeStartTimestamp = null;
      try {
        if (this.client.user.clearActivity) {
          await this.client.user.clearActivity();
        }
      } catch (_) {}
      return;
    }

    const games = await this.getGamesSafe();
    const isPaused = snapshot.status === 'PAUSED';

    const activeTracks: TrackSnapshot[] = snapshot.tracks || [];

    // Details formatting per spec:
    // Single game title (clamped <= 100 chars) or "Farming Multiple Games"
    let details: string;
    if (activeTracks.length === 1 && activeTracks[0]) {
      const trk = activeTracks[0];
      const g = games.find(game => game.appId === trk.appId);
      const rawTitle = g?.name || `App ${trk.appId}`;
      details = rawTitle.length > 100 ? rawTitle.slice(0, 97) + '...' : rawTitle;
    } else if (activeTracks.length > 1) {
      details = 'Farming Multiple Games';
    } else {
      details = 'HourForge';
    }

    // State formatting per spec:
    // If paused: "Paused (touching grass, apparently)"
    // If running: rotating humorous lines from presenceLines.ts
    let state: string;
    if (isPaused) {
      state = 'Paused (touching grass, apparently)';
    } else {
      state = this.rotator.getLine();
    }

    // Truncate strings to Discord RPC 128-char limit
    if (details.length > 120) details = details.slice(0, 117) + '...';
    if (state.length > 120) state = state.slice(0, 117) + '...';

    const activityPayload: any = {
      details,
      state,
      largeImageKey: 'hourforge',
      largeImageText: 'HourForge',
      instance: false
    };

    // startTimestamp: preserved across rotations while running
    if (!isPaused) {
      if (!this.activeStartTimestamp) {
        this.activeStartTimestamp = snapshot.t0Utc || this.clock.now();
      }
      activityPayload.startTimestamp = this.activeStartTimestamp;
    }

    try {
      await this.client.user.setActivity(activityPayload);
    } catch (_) {
      // Ignore transient setActivity errors
    }
  }

  // Backwards compatibility alias
  async updateActivity(): Promise<void> {
    await this.queueUpdateActivity();
  }

  getRotator(): PresenceLineRotator {
    return this.rotator;
  }

  getLastUpdateTime(): number {
    return this.lastUpdateTime;
  }

  getActiveStartTimestamp(): number | null {
    return this.activeStartTimestamp;
  }

  private async getSettingsSafe(): Promise<AppSettings> {
    try {
      const s = await this.store.getSettings();
      return s || { discordPresenceMode: 'hourforge' } as any;
    } catch {
      return { discordPresenceMode: 'hourforge' } as any;
    }
  }

  private async getGamesSafe(): Promise<GameEntry[]> {
    try {
      return (await this.getGames()) || [];
    } catch {
      return [];
    }
  }
}
