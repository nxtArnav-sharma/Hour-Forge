import { BackendEvent, BackendStatus, SteamBackend } from '../../shared/backend';

export class FakeSteamBackend implements SteamBackend {
  private isStarted = false;
  private currentPlayingAppIds: number[] = [];
  private eventListeners: Set<(event: BackendEvent) => void> = new Set();
  public personaName: string | null = 'TestPlayer';
  public isLoggedOn = true;
  public isConnected = true;

  async start(): Promise<void> {
    this.isStarted = true;
    this.emitEvent('status_changed', await this.status());
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    this.currentPlayingAppIds = [];
    this.emitEvent('status_changed', await this.status());
  }

  async status(): Promise<BackendStatus> {
    return {
      isConnected: this.isStarted && this.isConnected,
      isLoggedOn: this.isStarted && this.isLoggedOn,
      isPlayingPossible: this.isStarted && this.isLoggedOn,
      nickname: this.personaName,
      steamId: '76561198000000000',
      currentPlayingAppIds: [...this.currentPlayingAppIds]
    };
  }

  async setPlaying(appIds: number[]): Promise<void> {
    this.currentPlayingAppIds = [...appIds];
    this.emitEvent('status_changed', await this.status());
  }

  async owns(appIds: number[]): Promise<Record<number, boolean>> {
    const res: Record<number, boolean> = {};
    for (const id of appIds) {
      res[id] = true;
    }
    return res;
  }

  async addFreeLicense(_appId: number): Promise<void> {
    // No-op in fake backend
  }

  onEvent(cb: (event: BackendEvent) => void): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  private emitEvent(type: BackendEvent['type'], payload: any) {
    const event: BackendEvent = {
      type,
      payload,
      timestampUtc: Date.now()
    };
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
  }
}
