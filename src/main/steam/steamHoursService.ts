import { AtomicStore } from '../store/atomicStore';
import { SteamDetector } from './steamDetector';
import { GameHoursData, RunStateSnapshot, SteamHoursSnapshot, SteamHoursSyncStatus } from '../../shared/models';

export interface SteamHoursServiceDeps {
  store: AtomicStore;
  detector: SteamDetector;
  getEngineSnapshot: () => RunStateSnapshot;
  fetchFn?: typeof fetch;
  onHoursUpdated?: (snapshot: SteamHoursSnapshot) => void;
  nowFn?: () => number;
}

export function stripApiKeyFromText(text: string, apiKey?: string): string {
  if (!text) return '';
  let cleaned = text.replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]');
  if (apiKey && apiKey.length >= 6) {
    cleaned = cleaned.split(apiKey).join('[REDACTED]');
  }
  return cleaned;
}

export function parseRetryAfterMs(headerVal: string | null | undefined, now: number): number | null {
  if (!headerVal) return null;
  const trimmed = headerVal.trim();
  if (/^\d+$/.test(trimmed)) {
    const sec = parseInt(trimmed, 10);
    return Math.max(1000, sec * 1000);
  }
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    return Math.max(1000, parsedDate - now);
  }
  return null;
}

export class SteamHoursService {
  private store: AtomicStore;
  private detector: SteamDetector;
  private getEngineSnapshot: () => RunStateSnapshot;
  private fetchFn: typeof fetch;
  private onHoursUpdated?: (snapshot: SteamHoursSnapshot) => void;
  private nowFn: () => number;

  private pollTimer: NodeJS.Timeout | null = null;
  private lastPollUtc = 0;
  private nextPollUtc = 0;
  private currentStatus: SteamHoursSyncStatus = 'NO_KEY';
  private statusMessage?: string;
  private cachedGames: Record<number, GameHoursData> = {};
  private activePollIntervalMs = 15 * 60 * 1000; // 15 mins default
  private isRefreshing = false;

  // Rate limit stepped backoff: 30m -> 60m -> 120m cap
  private backoffStep = 0;
  private backoffUntilUtc = 0;

  constructor(deps: SteamHoursServiceDeps) {
    this.store = deps.store;
    this.detector = deps.detector;
    this.getEngineSnapshot = deps.getEngineSnapshot;
    this.fetchFn = deps.fetchFn || globalThis.fetch;
    this.onHoursUpdated = deps.onHoursUpdated;
    this.nowFn = deps.nowFn || (() => Date.now());
  }

  getSnapshot(): SteamHoursSnapshot {
    return {
      status: this.currentStatus,
      statusMessage: this.statusMessage,
      hasApiKey: this.currentStatus !== 'NO_KEY',
      steamId64: undefined,
      games: { ...this.cachedGames },
      lastPollUtc: this.lastPollUtc,
      nextPollUtc: this.nextPollUtc
    };
  }

  getBackoffUntilUtc(): number {
    return this.backoffUntilUtc;
  }

  getBackoffStep(): number {
    return this.backoffStep;
  }

  async testApiKey(
    apiKey: string,
    overrideSteamId?: string
  ): Promise<{ success: boolean; message?: string }> {
    const key = apiKey.trim();
    if (!key) {
      return { success: false, message: 'API key cannot be empty.' };
    }

    const steamId = await this.resolveSteamId64(overrideSteamId);
    if (!steamId) {
      return {
        success: false,
        message: 'No SteamID64 detected. Ensure Steam client is running or enter SteamID64 manually.'
      };
    }

    try {
      const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(
        key
      )}&steamid=${encodeURIComponent(steamId)}&include_played_free_games=1&include_appinfo=1&format=json`;

      const res = await this.fetchFn(url);
      if (res.status === 403) {
        return { success: false, message: 'Steam Web API key is invalid (HTTP 403 Forbidden).' };
      }
      if (res.status === 429) {
        return { success: false, message: 'Steam Web API rate limit exceeded (HTTP 429).' };
      }
      if (!res.ok) {
        return { success: false, message: `Steam Web API returned HTTP ${res.status}.` };
      }

      const data = (await res.json()) as any;
      if (!data?.response || !Array.isArray(data.response.games)) {
        return {
          success: true,
          message:
            'Connected successfully, but game details are Private. Set Game details to Public in Steam Privacy Settings to view playtime.'
        };
      }

      return {
        success: true,
        message: `Connected successfully! Found ${data.response.games.length} games on Steam profile.`
      };
    } catch (err: any) {
      const safeErrorMsg = stripApiKeyFromText(err?.message || 'Failed to fetch', key);
      return {
        success: false,
        message: `Network error connecting to Steam Web API: ${safeErrorMsg}`
      };
    }
  }

  async saveApiKey(apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();
    await this.store.saveSteamApiKey(trimmed);
    const settings = await this.store.getSettings();
    settings.hasSteamApiKey = true;
    await this.store.saveSettings(settings);

    // Reset backoff on new key
    this.backoffStep = 0;
    this.backoffUntilUtc = 0;

    await this.refreshHours(true);
  }

  async removeApiKey(): Promise<void> {
    await this.store.clearSteamApiKey();
    const settings = await this.store.getSettings();
    settings.hasSteamApiKey = false;
    await this.store.saveSettings(settings);

    this.backoffStep = 0;
    this.backoffUntilUtc = 0;
    this.currentStatus = 'NO_KEY';
    this.statusMessage = 'No Steam Web API key configured.';
    this.cachedGames = {};
    this.notifyUpdate();
  }

  async refreshHours(force = false): Promise<SteamHoursSnapshot> {
    if (this.isRefreshing) {
      return this.getSnapshot();
    }

    const now = this.nowFn();

    // 1. If currently under active 429 backoff, do NOT bypass backoff even with force
    if (now < this.backoffUntilUtc) {
      const remainingMin = Math.max(1, Math.ceil((this.backoffUntilUtc - now) / 60000));
      this.currentStatus = 'RATE_LIMITED';
      this.statusMessage = `Rate limited: retry in ${remainingMin}m`;
      this.notifyUpdate();
      return this.getSnapshot();
    }

    // Debounce manual refresh within 10 seconds unless forced with empty cache
    if (!force && now - this.lastPollUtc < 10000 && Object.keys(this.cachedGames).length > 0) {
      return this.getSnapshot();
    }

    this.isRefreshing = true;

    try {
      const hasKey = await this.store.hasSteamApiKey();
      if (!hasKey) {
        this.currentStatus = 'NO_KEY';
        this.statusMessage = 'No Steam Web API key configured.';
        this.lastPollUtc = now;
        this.notifyUpdate();
        return this.getSnapshot();
      }

      let apiKey: string | null = null;
      try {
        apiKey = await this.store.getSteamApiKey();
      } catch {
        this.currentStatus = 'ERROR';
        this.statusMessage = 'Failed to decrypt Steam Web API key from secure storage.';
        this.notifyUpdate();
        return this.getSnapshot();
      }

      if (!apiKey) {
        this.currentStatus = 'NO_KEY';
        this.statusMessage = 'No Steam Web API key configured.';
        this.notifyUpdate();
        return this.getSnapshot();
      }

      const settings = await this.store.getSettings();
      const steamId = await this.resolveSteamId64(settings.steamId64Override);
      if (!steamId) {
        this.currentStatus = 'ERROR';
        this.statusMessage =
          'No SteamID64 detected. Ensure Steam desktop client is logged in or provide a SteamID64 override in Settings.';
        this.notifyUpdate();
        return this.getSnapshot();
      }

      // Query only tracked games via appids_filter
      const trackedGames = await this.store.getGames();
      const trackedAppIds = new Set(trackedGames.map(g => g.appId));

      let filterParams = '';
      if (trackedGames.length > 0) {
        trackedGames.forEach((g, idx) => {
          filterParams += `&appids_filter[${idx}]=${g.appId}`;
        });
      }

      const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(
        apiKey
      )}&steamid=${encodeURIComponent(steamId)}&include_played_free_games=1&include_appinfo=1&format=json${filterParams}`;

      let res: Response;
      try {
        res = await this.fetchFn(url);
      } catch (err: any) {
        // Network offline
        this.currentStatus = 'OFFLINE';
        const cleanMsg = stripApiKeyFromText(
          err?.message ? `Offline: ${err.message}` : 'Offline: Unable to reach Steam Web API. Showing cached hours.',
          apiKey
        );
        this.statusMessage = cleanMsg;
        this.lastPollUtc = now;
        this.nextPollUtc = now + this.activePollIntervalMs;
        this.notifyUpdate();
        return this.getSnapshot();
      }

      this.lastPollUtc = now;

      if (res.status === 403) {
        this.currentStatus = 'INVALID_KEY';
        this.statusMessage = 'Steam Web API key is invalid or unauthorized (HTTP 403).';
        this.nextPollUtc = now + this.activePollIntervalMs;
        this.notifyUpdate();
        return this.getSnapshot();
      }

      if (res.status === 429) {
        // Lengthening backoff: honor Retry-After if present, otherwise 30m -> 60m -> 120m cap
        let delayMs: number;
        const retryHeader = res.headers?.get?.('Retry-After') || res.headers?.get?.('retry-after');
        const parsedRetryMs = parseRetryAfterMs(retryHeader, now);

        if (parsedRetryMs !== null && parsedRetryMs > 0) {
          delayMs = parsedRetryMs;
        } else {
          this.backoffStep = Math.min(this.backoffStep + 1, 3);
          if (this.backoffStep === 1) {
            delayMs = 30 * 60 * 1000; // 30m
          } else if (this.backoffStep === 2) {
            delayMs = 60 * 60 * 1000; // 60m
          } else {
            delayMs = 120 * 60 * 1000; // 120m cap
          }
        }

        this.backoffUntilUtc = now + delayMs;
        this.nextPollUtc = this.backoffUntilUtc;
        this.activePollIntervalMs = delayMs;
        this.reschedulePolling(delayMs);

        const remainingMin = Math.max(1, Math.ceil(delayMs / 60000));
        this.currentStatus = 'RATE_LIMITED';
        this.statusMessage = `Steam rate limit exceeded (HTTP 429). Retry in ${remainingMin}m.`;
        this.notifyUpdate();
        return this.getSnapshot();
      }

      // If status 500 or other non-OK HTTP status
      if (!res.ok) {
        this.currentStatus = 'ERROR';
        this.statusMessage = stripApiKeyFromText(`Steam Web API error: HTTP ${res.status}`, apiKey);
        this.notifyUpdate();
        return this.getSnapshot();
      }

      // Successful request resets backoff
      this.backoffStep = 0;
      this.backoffUntilUtc = 0;
      this.activePollIntervalMs = 15 * 60 * 1000;
      this.nextPollUtc = now + this.activePollIntervalMs;
      this.reschedulePolling(this.activePollIntervalMs);

      const data = (await res.json()) as any;
      if (!data?.response || !Array.isArray(data.response.games)) {
        this.currentStatus = 'PRIVATE_PROFILE';
        this.statusMessage =
          'Steam profile game details are set to Private. Make Game details Public in Steam Privacy Settings.';
        this.notifyUpdate();
        return this.getSnapshot();
      }

      // Filter response down immediately to tracked games and cache ONLY those
      const rawGames: Array<{ appid: number; playtime_forever: number }> = data.response.games;
      const filteredGames = rawGames.filter(g => trackedAppIds.has(g.appid));

      this.currentStatus = 'OK';
      this.statusMessage = `Synced successfully. ${filteredGames.length} tracked game(s) updated.`;

      await this.processGamesData(filteredGames, trackedAppIds, now);
      this.notifyUpdate();
      return this.getSnapshot();
    } finally {
      this.isRefreshing = false;
    }
  }

  private async processGamesData(
    gamesList: Array<{ appid: number; playtime_forever: number }>,
    trackedAppIds: Set<number>,
    now: number
  ): Promise<void> {
    const rawBaselines = await this.store.getSteamHoursBaselines();
    const history = await this.store.getHistory();
    const engineSnapshot = this.getEngineSnapshot();

    // Prune baselines down to tracked games only
    const baselines: Record<number, { baselineSteamHours: number; initialSyncUtc: number; cachedSteamHours?: number }> = {};
    for (const [appIdStr, b] of Object.entries(rawBaselines)) {
      const id = Number(appIdStr);
      if (trackedAppIds.has(id)) {
        baselines[id] = b;
      }
    }

    const newGames: Record<number, GameHoursData> = {};
    let baselinesChanged = Object.keys(rawBaselines).length !== Object.keys(baselines).length;

    for (const game of gamesList) {
      const appId = game.appid;
      if (!trackedAppIds.has(appId)) {
        continue;
      }

      const steamHours = Math.round((game.playtime_forever / 60) * 10) / 10;

      let baseline = baselines[appId];
      if (!baseline) {
        baseline = {
          baselineSteamHours: steamHours,
          initialSyncUtc: now,
          cachedSteamHours: steamHours
        };
        baselines[appId] = baseline;
        baselinesChanged = true;
      } else {
        baseline.cachedSteamHours = steamHours;
      }

      const steamGainHours = Math.max(
        0,
        Math.round((steamHours - baseline.baselineSteamHours) * 10) / 10
      );

      // Credited hours by HourForge for this game
      const gameHistory = history.filter(h => h.appId === appId);
      const totalHistorySec = gameHistory.reduce((acc, h) => acc + (h.creditedSeconds || 0), 0);

      // Credited since baseline
      const sinceBaselineHistorySec = gameHistory
        .filter(h => (h.endUtc || 0) >= baseline!.initialSyncUtc)
        .reduce((acc, h) => acc + (h.creditedSeconds || 0), 0);

      // Add currently active track elapsed seconds if playing
      const activeTrack = engineSnapshot.tracks.find(t => t.appId === appId);
      let activeElapsedSec = 0;
      const isCurrentlyPlaying =
        activeTrack &&
        engineSnapshot.status === 'RUNNING' &&
        activeTrack.state === 'PLAYING';

      if (activeTrack) {
        activeElapsedSec = activeTrack.creditedSeconds || 0;
      }

      const totalCreditedSec = totalHistorySec + activeElapsedSec;
      const hourforgeCreditedHours = Math.round((totalCreditedSec / 3600) * 10) / 10;

      const creditedSinceBaselineSec = sinceBaselineHistorySec + activeElapsedSec;
      const creditedSinceBaselineHours =
        Math.round((creditedSinceBaselineSec / 3600) * 10) / 10;

      // Lag detection:
      // If currently playing, lag warning is suppressed
      let isLagging = false;
      if (!isCurrentlyPlaying) {
        // Find last session ended time
        let lastSessionEndTime = 0;
        for (const h of gameHistory) {
          if (h.endUtc && h.endUtc > lastSessionEndTime) {
            lastSessionEndTime = h.endUtc;
          }
        }

        // If at least 30 minutes elapsed since last session ended
        if (lastSessionEndTime > 0 && now - lastSessionEndTime >= 30 * 60 * 1000) {
          // If HF credited since baseline exceeds Steam gain by >= 0.5 hours
          if (creditedSinceBaselineHours - steamGainHours >= 0.5) {
            isLagging = true;
          }
        }
      }

      newGames[appId] = {
        appId,
        steamHours,
        hourforgeCreditedHours,
        baselineSteamHours: baseline.baselineSteamHours,
        steamGainHours,
        creditedSinceBaselineHours,
        isLagging,
        lastSyncUtc: now
      };
    }

    this.cachedGames = newGames;

    if (baselinesChanged) {
      await this.store.saveSteamHoursBaselines(baselines);
    }
  }

  private async resolveSteamId64(overrideSteamId?: string): Promise<string | null> {
    if (overrideSteamId && /^\d{15,25}$/.test(overrideSteamId.trim())) {
      return overrideSteamId.trim();
    }
    const status = await this.detector.getStatus();
    return status.steamId64 || null;
  }

  startPolling(intervalMs?: number): void {
    if (intervalMs) {
      this.activePollIntervalMs = intervalMs;
    }
    this.stopPolling();

    // Initial refresh
    this.refreshHours().catch(() => {});

    this.pollTimer = setInterval(() => {
      this.refreshHours().catch(() => {});
    }, this.activePollIntervalMs);
  }

  private reschedulePolling(intervalMs: number): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => {
        this.refreshHours().catch(() => {});
      }, intervalMs);
    }
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private notifyUpdate(): void {
    if (this.onHoursUpdated) {
      this.onHoursUpdated(this.getSnapshot());
    }
  }
}
