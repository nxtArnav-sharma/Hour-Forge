import { AtomicStore } from '../store/atomicStore';
import { HourForgeEngine } from './engine';
import { CatchUpGoal, GoalPacingReport } from '../../shared/models';
import { calculateGoalPacing, shouldResetBaseline } from '../../core/goalPacing';
import { stripApiKeyFromText } from '../steam/steamHoursService';

export interface GoalManagerDeps {
  store: AtomicStore;
  engine: HourForgeEngine;
  fetchFn?: typeof fetch;
  nowFn?: () => number;
  timeZone?: string;
  onGoalUpdated?: (goals: CatchUpGoal[]) => void;
}

export class GoalManager {
  private store: AtomicStore;
  private engine: HourForgeEngine;
  private fetchFn: typeof fetch;
  private nowFn: () => number;
  private timeZone?: string;
  private onGoalUpdated?: (goals: CatchUpGoal[]) => void;

  constructor(deps: GoalManagerDeps) {
    this.store = deps.store;
    this.engine = deps.engine;
    this.fetchFn = deps.fetchFn || globalThis.fetch;
    this.nowFn = deps.nowFn || (() => Date.now());
    this.timeZone = deps.timeZone;
    this.onGoalUpdated = deps.onGoalUpdated;
  }

  async getGoals(): Promise<CatchUpGoal[]> {
    return this.store.getGoals();
  }

  async getGoalForApp(appId: number): Promise<CatchUpGoal | null> {
    const goals = await this.getGoals();
    return goals.find(g => g.appId === appId) || null;
  }

  async saveGoal(goal: CatchUpGoal): Promise<void> {
    await this.store.saveGoal(goal);
    this.notifyUpdate();
  }

  async deleteGoal(id: string): Promise<void> {
    await this.store.deleteGoal(id);
    this.notifyUpdate();
  }

  async getPacingReport(appId: number): Promise<GoalPacingReport | null> {
    const goal = await this.getGoalForApp(appId);
    if (!goal) return null;

    const profiles = await this.store.getProfiles();
    const engineSnapshot = this.engine.getSnapshot();
    const activeProfile =
      profiles.find(p => p.id === engineSnapshot.profileId) || profiles[0]!;

    const history = await this.store.getHistory();
    const gameHistory = history.filter(h => h.appId === appId);

    const syncBaselineUtc = goal.lastSyncUtc || goal.createdAtUtc;
    const sinceSyncHistorySec = gameHistory
      .filter(h => (h.endUtc || 0) >= syncBaselineUtc)
      .reduce((acc, h) => acc + (h.creditedSeconds || 0), 0);

    // Add active track running seconds if currently playing
    let activeElapsedSec = 0;
    const activeTrack = engineSnapshot.tracks.find(t => t.appId === appId);
    if (activeTrack && engineSnapshot.status === 'RUNNING' && activeTrack.state === 'PLAYING') {
      activeElapsedSec = activeTrack.creditedSeconds || 0;
    }

    const creditedSinceSyncSeconds = sinceSyncHistorySec + activeElapsedSec;

    return calculateGoalPacing({
      goal,
      creditedSinceSyncSeconds,
      activeProfile,
      allProfiles: profiles,
      nowUtc: this.nowFn(),
      timeZone: this.timeZone
    });
  }

  /**
   * Syncs goal with a fresh Steam hours reading.
   * Respects Clarification 1: Reset baseline ONLY when track has been idle >= 30m.
   */
  async syncGoalWithSteam(
    appId: number,
    freshSteamHours: number,
    nowUtc = this.nowFn()
  ): Promise<void> {
    const goal = await this.getGoalForApp(appId);
    if (!goal) return;

    const engineSnapshot = this.engine.getSnapshot();
    const activeTrack = engineSnapshot.tracks.find(t => t.appId === appId);
    const isCurrentlyPlaying =
      Boolean(activeTrack && engineSnapshot.status === 'RUNNING' && activeTrack.state === 'PLAYING');

    const history = await this.store.getHistory();
    const gameHistory = history.filter(h => h.appId === appId);
    let lastSessionEndUtc = 0;
    for (const h of gameHistory) {
      if (h.endUtc && h.endUtc > lastSessionEndUtc) {
        lastSessionEndUtc = h.endUtc;
      }
    }

    if (shouldResetBaseline(lastSessionEndUtc, isCurrentlyPlaying, nowUtc)) {
      // Safe to update baseline reading without causing lag double counting
      goal.lastSyncedSteamHours = freshSteamHours;
      goal.lastSyncUtc = nowUtc;
      await this.store.saveGoal(goal);
      this.notifyUpdate();
    }
  }

  /**
   * Checks friend's hours helper (Clarification 3):
   * Reads public GetOwnedGames via user's API key.
   * Never stores or logs friend's SteamID!
   */
  async checkFriendHours(
    appId: number,
    friendSteamId64: string
  ): Promise<{
    success: boolean;
    isPrivate?: boolean;
    friendHours?: number;
    message?: string;
  }> {
    const trimmedId = friendSteamId64.trim();
    if (!/^\d{15,25}$/.test(trimmedId)) {
      return {
        success: false,
        message: 'Invalid SteamID64 format. Must be a 17-digit numeric ID.'
      };
    }

    const hasKey = await this.store.hasSteamApiKey();
    if (!hasKey) {
      return {
        success: false,
        message: 'Steam Web API key is required to check friends\' hours. Configure key in Settings.'
      };
    }

    let apiKey: string | null = null;
    try {
      apiKey = await this.store.getSteamApiKey();
    } catch {
      return { success: false, message: 'Failed to decrypt Steam Web API key.' };
    }

    if (!apiKey) {
      return { success: false, message: 'Steam Web API key is not configured.' };
    }

    try {
      const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(
        apiKey
      )}&steamid=${encodeURIComponent(
        trimmedId
      )}&include_played_free_games=1&include_appinfo=1&appids_filter[0]=${appId}&format=json`;

      const res = await this.fetchFn(url);
      if (res.status === 403) {
        return { success: false, message: 'Steam Web API key is invalid (HTTP 403 Forbidden).' };
      }
      if (res.status === 429) {
        return { success: false, message: 'Steam rate limit exceeded (HTTP 429). Please wait before checking again.' };
      }
      if (!res.ok) {
        return { success: false, message: `Steam Web API error: HTTP ${res.status}` };
      }

      const data = (await res.json()) as any;
      if (!data?.response || !Array.isArray(data.response.games)) {
        return {
          success: false,
          isPrivate: true,
          message: "Friend's Steam profile or game details are Private. Only public profiles can be checked."
        };
      }

      const foundGame = data.response.games.find((g: any) => g.appid === appId);
      if (!foundGame) {
        return {
          success: true,
          friendHours: 0,
          message: 'Friend does not own or has zero recorded playtime for this game.'
        };
      }

      const friendHours = Math.round((foundGame.playtime_forever / 60) * 10) / 10;

      return {
        success: true,
        friendHours,
        message: `Found ${friendHours} hours recorded on friend's profile.`
      };
    } catch (err: any) {
      const safeMsg = stripApiKeyFromText(err?.message || 'Network error', apiKey);
      return {
        success: false,
        message: `Failed to check friend's hours: ${safeMsg}`
      };
    }
  }

  private async notifyUpdate(): Promise<void> {
    if (this.onGoalUpdated) {
      const goals = await this.getGoals();
      this.onGoalUpdated(goals);
    }
  }
}

