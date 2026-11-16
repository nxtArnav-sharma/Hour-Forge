export interface BackendStatus {
  isConnected: boolean;
  isLoggedOn: boolean;
  isPlayingPossible: boolean;
  nickname: string | null;
  steamId: string;
  avatarHash?: string | null;
  currentPlayingAppIds: number[];
}

export type BackendEventType =
  | 'status_changed'
  | 'log'
  | 'blocked'
  | 'error'
  | 'disconnected';

export interface BackendEvent {
  type: BackendEventType;
  payload: any;
  timestampUtc: number;
}

export interface SteamBackend {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<BackendStatus>;
  setPlaying(appIds: number[]): Promise<void>;
  owns(appIds: number[]): Promise<Record<number, boolean>>;
  addFreeLicense(appId: number): Promise<void>;
  onEvent(cb: (e: BackendEvent) => void): () => void;
}
