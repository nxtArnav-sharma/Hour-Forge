import { SteamBackend, BackendStatus } from '../../shared/backend';
import { AtomicStore } from '../store/atomicStore';
import { TrackStateMachine } from '../../core/track';
import { HumanProfile, RunMode, TrackOverlay } from '../../core/types';
import { RunStateSnapshot, TrackSnapshot } from '../../shared/models';
import { validateRunOptions } from '../../shared/runSchema';

export interface StartRunOptions {
  mode: RunMode;
  tracks: Array<{ appId: number; targetHours?: number; dailyQuotaHours?: number }>;
  profile: HumanProfile;
  runSeed?: string;
  delayMs?: number;
}

export type EngineEventCallback = (snapshot: RunStateSnapshot) => void;

export class HourForgeEngine {
  private backend: SteamBackend;
  private store: AtomicStore;
  private onStateChange?: EngineEventCallback;
  private onFinishCallback?: () => void;

  private runId: string | null = null;
  private mode: RunMode = 'SINGLE';
  private profile: HumanProfile | null = null;
  private runSeed: string = '';
  private t0Utc = 0;
  private status: 'IDLE' | 'STARTING' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'STOPPED' = 'IDLE';

  private tracks: Map<number, TrackStateMachine> = new Map();
  private tickInterval: any = null;
  private snapshotInterval: any = null;

  // Monotonic vs wall clock gap detection
  private lastTickMonotonic = 0;
  private lastTickWallUtc = 0;

  constructor(
    backend: SteamBackend,
    store: AtomicStore,
    onStateChange?: EngineEventCallback,
    onFinish?: () => void
  ) {
    this.backend = backend;
    this.store = store;
    this.onStateChange = onStateChange;
    this.onFinishCallback = onFinish;
  }

  getStatus() {
    return this.status;
  }

  getSnapshot(): RunStateSnapshot {
    const trackSnapshots: TrackSnapshot[] = Array.from(this.tracks.values()).map(t => {
      const curBlock = t.getCurrentBlock();
      const allBlocks = t.getBlocks();
      const curIdx = curBlock ? allBlocks.findIndex(b => b.id === curBlock.id) : 0;

      return {
        appId: t.appId,
        state: t.getState(),
        overlay: t.getOverlay(),
        creditedSeconds: t.getCreditedSeconds(),
        todayCreditedSeconds: t.getTodayCreditedSeconds(),
        dailyQuotaSeconds: t.getDailyQuotaSecondsValue(),
        targetSeconds: t.targetSeconds,
        currentBlockIndex: Math.max(0, curIdx),
        blocks: allBlocks
      };
    });

    return {
      runId: this.runId || '',
      mode: this.mode,
      status: this.status,
      t0Utc: this.t0Utc,
      profileId: this.profile?.id || 'regular',
      runSeed: this.runSeed,
      tracks: trackSnapshots,
      lastSnapshotUtc: Date.now()
    };
  }

  async startRun(options: StartRunOptions): Promise<void> {
    const games = await this.store.getGames();
    const goals = options.mode === 'CATCHUP' ? await this.store.getGoals() : [];
    const valid = validateRunOptions(options, games, goals);

    if (this.status === 'RUNNING' || this.status === 'STARTING') {
      await this.stopRun();
    }

    // Stop any previous helper processes before starting a run
    try {
      if (typeof (this.backend as any).killAllHelpers === 'function') {
        await (this.backend as any).killAllHelpers();
      }
      await this.backend.setPlaying([]);
    } catch {
      // ignore
    }

    this.runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.mode = valid.mode as RunMode;
    this.profile = options.profile;
    this.runSeed = valid.runSeed || `seed_${Date.now()}`;
    this.t0Utc = Date.now() + (valid.delayMs || 0);
    this.status = valid.delayMs ? 'STARTING' : 'RUNNING';

    this.tracks.clear();
    for (const t of valid.tracks) {
      const targetSec = t.targetHours ? Math.round(t.targetHours * 3600) : undefined;
      const dailySec = t.dailyQuotaHours ? Math.round(t.dailyQuotaHours * 3600) : undefined;
      const sm = new TrackStateMachine({
        runId: this.runId,
        runSeed: this.runSeed,
        appId: t.appId,
        profile: this.profile,
        targetSeconds: targetSec,
        dailyQuotaSeconds: dailySec,
        t0Utc: this.t0Utc
      });
      this.tracks.set(t.appId, sm);
    }

    this.startTickLoop();
    await this.persistSnapshot();
    this.broadcastState();
  }

  async stopRun(): Promise<void> {
    this.stopTickLoop();
    this.status = 'STOPPED';

    for (const track of this.tracks.values()) {
      track.stop();
      await this.store.appendSessionLogs(track.getSessionLogs());
    }

    await this.backend.setPlaying([]);
    await this.store.clearRunSnapshot();
    this.broadcastState();
  }

  pauseAll(): void {
    if (this.status !== 'RUNNING') return;
    this.status = 'PAUSED';
    const now = Date.now();
    for (const track of this.tracks.values()) {
      track.setOverlay('USER_PAUSED', now);
    }
    this.backend.setPlaying([]);
    this.broadcastState();
  }

  resumeAll(): void {
    if (this.status !== 'PAUSED') return;
    this.status = 'RUNNING';
    const now = Date.now();
    for (const track of this.tracks.values()) {
      track.setOverlay(null, now);
    }
    this.broadcastState();
  }

  setGlobalOverlay(overlay: TrackOverlay | null): void {
    const now = Date.now();
    for (const track of this.tracks.values()) {
      track.setOverlay(overlay, now);
    }
    if (overlay !== null) {
      this.backend.setPlaying([]);
    }
    this.broadcastState();
  }

  skipRest(appId: number): void {
    const track = this.tracks.get(appId);
    if (track) {
      track.skipRest(Date.now());
      this.broadcastState();
    }
  }

  extendPlay(appId: number, seconds: number): void {
    const track = this.tracks.get(appId);
    if (track) {
      track.extendPlay(seconds);
      this.broadcastState();
    }
  }

  async restoreFromSnapshot(snapshot: RunStateSnapshot, profile: HumanProfile): Promise<void> {
    this.runId = snapshot.runId;
    this.mode = snapshot.mode;
    this.profile = profile;
    this.runSeed = snapshot.runSeed;
    this.t0Utc = snapshot.t0Utc;
    this.status = 'RUNNING';

    this.tracks.clear();
    for (const ts of snapshot.tracks) {
      const sm = new TrackStateMachine({
        runId: this.runId,
        runSeed: this.runSeed,
        appId: ts.appId,
        profile: this.profile,
        targetSeconds: ts.targetSeconds,
        dailyQuotaSeconds: ts.dailyQuotaSeconds,
        t0Utc: this.t0Utc
      });
      if (ts.todayCreditedSeconds !== undefined) {
        sm.setTodayCreditedSeconds(ts.todayCreditedSeconds);
      }
      // Replan starting from remaining credited time
      sm.replan(Date.now());
      this.tracks.set(ts.appId, sm);
    }

    this.startTickLoop();
    this.broadcastState();
  }

  private startTickLoop(): void {
    this.stopTickLoop();

    this.lastTickMonotonic = performance.now();
    this.lastTickWallUtc = Date.now();

    this.tickInterval = setInterval(() => this.tick(), 1000);
    this.snapshotInterval = setInterval(() => this.persistSnapshot(), 30000);
  }

  private stopTickLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
  }

  private async tick(): Promise<void> {
    const nowWall = Date.now();
    const nowMono = performance.now();

    // Gap detection: check if wall clock jumped forward > 60s beyond monotonic delta (PC sleep)
    const monoDeltaMs = nowMono - this.lastTickMonotonic;
    const wallDeltaMs = nowWall - this.lastTickWallUtc;

    if (wallDeltaMs - monoDeltaMs > 60000) {
      // PC woke from sleep
      this.setGlobalOverlay('SUSPENDED');
      setTimeout(() => this.setGlobalOverlay(null), 2000);
    }

    this.lastTickMonotonic = nowMono;
    this.lastTickWallUtc = nowWall;

    if (this.status !== 'RUNNING') return;

    // Check delay start
    if (nowWall < this.t0Utc) {
      return;
    }

    let backendStatus: BackendStatus;
    try {
      backendStatus = await this.backend.status();
    } catch {
      backendStatus = {
        isConnected: false,
        isLoggedOn: false,
        isPlayingPossible: false,
        nickname: null,
        steamId: '0',
        currentPlayingAppIds: []
      };
    }

    const desiredPlayingAppIds: number[] = [];
    let allTracksDone = true;

    for (const track of this.tracks.values()) {
      const isConfirmedPlaying = backendStatus.currentPlayingAppIds.includes(track.appId);
      const { desiredPlaying } = track.tick(nowWall, {
        isPlaying: isConfirmedPlaying,
        isLoggedOn: backendStatus.isLoggedOn,
        isPlayingPossible: backendStatus.isPlayingPossible
      });

      if (desiredPlaying) {
        desiredPlayingAppIds.push(track.appId);
      }

      if (track.getState() !== 'DONE') {
        allTracksDone = false;
      }
    }

    // Update played set if changed
    const currentPlayingSet = new Set(backendStatus.currentPlayingAppIds);

    const changed =
      desiredPlayingAppIds.length !== backendStatus.currentPlayingAppIds.length ||
      desiredPlayingAppIds.some(id => !currentPlayingSet.has(id));

    if (changed && backendStatus.isLoggedOn && backendStatus.isPlayingPossible) {
      await this.backend.setPlaying(desiredPlayingAppIds);
    }

    // Check DEDICATED or CATCHUP run completion
    if ((this.mode === 'DEDICATED' || this.mode === 'CATCHUP') && allTracksDone && this.tracks.size > 0) {
      this.status = 'FINISHED';
      this.stopTickLoop();
      await this.backend.setPlaying([]);
      await this.persistSnapshot();
      this.broadcastState();
      this.onFinishCallback?.();
      return;
    }

    this.broadcastState();
  }

  private async persistSnapshot(): Promise<void> {
    if (this.status === 'RUNNING' || this.status === 'PAUSED') {
      const snapshot = this.getSnapshot();
      await this.store.saveRunSnapshot(snapshot);
    }
  }

  private broadcastState(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getSnapshot());
    }
  }
}
