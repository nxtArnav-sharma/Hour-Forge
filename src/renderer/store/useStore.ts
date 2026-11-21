import { create } from 'zustand';
import {
  AppSettings,
  CatchUpGoal,
  GameEntry,
  GoalPacingReport,
  RunStateSnapshot,
  SteamHoursSnapshot,
  CustomPattern
} from '../../shared/models';
import { HumanProfile, SessionLogEntry, RunMode } from '../../core/types';
import { type NavRoute, NavRouteSchema } from '../../shared/routes';
export { type NavRoute, NavRouteSchema };

interface AppStoreState {
  currentRoute: NavRoute;
  engineState: RunStateSnapshot | null;
  settings: AppSettings | null;
  games: GameEntry[];
  profiles: HumanProfile[];
  history: SessionLogEntry[];
  engineLogs: string[];
  helperLogs: string[];
  steamHours: SteamHoursSnapshot | null;
  goals: CatchUpGoal[];
  customPatterns: CustomPattern[];
  pacingReports: Record<number, GoalPacingReport>;
  appVersion: string;
  isLoading: boolean;

  // Navigation
  navigate: (route: NavRoute) => void;

  // Initial Load
  loadInitialData: () => Promise<void>;

  // Engine Actions
  startRun: (options: {
    mode: RunMode;
    tracks: Array<{ appId: number; targetHours?: number; dailyQuotaHours?: number }>;
    profileId: string;
    delayMs?: number;
    customPattern?: CustomPattern;
  }) => Promise<void>;
  stopRun: () => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
  skipRest: (appId: number) => Promise<void>;
  extendPlay: (appId: number, seconds: number) => Promise<void>;

  // Store Actions
  saveSettings: (settings: AppSettings) => Promise<void>;
  addGame: (game: GameEntry) => Promise<void>;
  removeGame: (appId: number) => Promise<void>;
  reorderGames: (fromIndex: number, toIndex: number) => void;
  saveProfile: (profile: HumanProfile) => Promise<void>;
  saveCustomPattern: (pattern: CustomPattern) => Promise<void>;
  deleteCustomPattern: (id: string) => Promise<void>;

  // Steam
  addFreeLicense: (appId: number) => Promise<void>;
  refreshSteamHours: () => Promise<void>;
  testSteamApiKey: (apiKey: string, steamId?: string) => Promise<{ success: boolean; message?: string }>;
  saveSteamApiKey: (apiKey: string) => Promise<void>;
  removeSteamApiKey: () => Promise<void>;

  // Goals (M11 Catch-Up Goal)
  saveGoal: (goal: CatchUpGoal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  refreshPacingReport: (appId: number) => Promise<GoalPacingReport | null>;
  checkFriendHours: (appId: number, friendSteamId: string) => Promise<{
    success: boolean;
    isPrivate?: boolean;
    friendHours?: number;
    message?: string;
  }>;
}

export const useStore = create<AppStoreState>((set, get) => ({
  currentRoute: 'dashboard',
  engineState: null,
  settings: null,
  games: [],
  profiles: [],
  history: [],
  engineLogs: [],
  helperLogs: [],
  steamHours: null,
  goals: [],
  customPatterns: [],
  pacingReports: {},
  appVersion: '',
  isLoading: true,

  navigate: (route: NavRoute) => {
    const parsed = NavRouteSchema.safeParse(route);
    if (parsed.success) {
      if (typeof window !== 'undefined') {
        (window as any).__HOURFORGE_ROUTE__ = parsed.data;
      }
      set({ currentRoute: parsed.data });
    }
  },

  loadInitialData: async () => {
    try {
      const [settings, games, profiles, history, engineState, logs, steamHours, goals, customPatterns, pendingRoute, rawVersion] =
        await Promise.all([
          window.hourforge.store.getSettings(),
          window.hourforge.store.getGames(),
          window.hourforge.store.getProfiles(),
          window.hourforge.store.getHistory(),
          window.hourforge.engine.getState(),
          window.hourforge.system.getLogs(),
          window.hourforge.steam.getHoursStatus(),
          window.hourforge.goals.getGoals(),
          window.hourforge.store.getCustomPatterns(),
          window.hourforge.app.consumePendingRoute(),
          window.hourforge.app.getVersion().catch(() => '')
        ]);

      const appVersion = rawVersion ? (rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`) : '';

      // Load pacing reports for all goals
      const pacingReports: Record<number, GoalPacingReport> = {};
      for (const g of goals) {
        const rep = await window.hourforge.goals.getPacingReport(g.appId);
        if (rep) pacingReports[g.appId] = rep;
      }

      let initialRoute: NavRoute = get().currentRoute || 'dashboard';
      if (pendingRoute) {
        const parsed = NavRouteSchema.safeParse(pendingRoute);
        if (parsed.success) {
          initialRoute = parsed.data;
        }
      }

      if (typeof window !== 'undefined') {
        (window as any).__HOURFORGE_ROUTE__ = initialRoute;
      }

      set({
        currentRoute: initialRoute,
        settings,
        games,
        profiles,
        history,
        engineState,
        engineLogs: logs.engineLogs || [],
        helperLogs: logs.helperLogs || [],
        steamHours,
        goals,
        customPatterns,
        pacingReports,
        appVersion,
        isLoading: false
      });

      // Subscribe to navigation events from main process (warm navigation)
      window.hourforge.app.onNavigate(route => {
        const parsed = NavRouteSchema.safeParse(route);
        if (parsed.success) {
          if (typeof window !== 'undefined') {
            (window as any).__HOURFORGE_ROUTE__ = parsed.data;
          }
          set({ currentRoute: parsed.data });
        }
      });

      // Subscribe to real-time events from main process
      window.hourforge.engine.onStateChange(snapshot => {
        set({ engineState: snapshot });
      });

      window.hourforge.steam.onHoursUpdated(snapshot => {
        set({ steamHours: snapshot });
        // Refresh pacing reports on hours update
        const currentGoals = get().goals;
        for (const g of currentGoals) {
          get().refreshPacingReport(g.appId);
        }
      });

      window.hourforge.goals.onGoalsUpdated(async updatedGoals => {
        const reports: Record<number, GoalPacingReport> = {};
        for (const g of updatedGoals) {
          const rep = await window.hourforge.goals.getPacingReport(g.appId);
          if (rep) reports[g.appId] = rep;
        }
        set({ goals: updatedGoals, pacingReports: reports });
      });

      window.hourforge.system.onLogLine((category, line) => {
        if (category === 'engine') {
          set(state => ({
            engineLogs: [...state.engineLogs.slice(-1000), line]
          }));
        } else {
          set(state => ({
            helperLogs: [...state.helperLogs.slice(-1000), line]
          }));
        }
      });
    } catch (err) {
      console.error('Failed to load initial data:', err);
      set({ isLoading: false });
    }
  },

  startRun: async options => {
    await window.hourforge.engine.startRun(options);
    const state = await window.hourforge.engine.getState();
    set({ engineState: state, currentRoute: 'dashboard' });
  },

  stopRun: async () => {
    await window.hourforge.engine.stopRun();
    const state = await window.hourforge.engine.getState();
    const history = await window.hourforge.store.getHistory();
    set({ engineState: state, history });
  },

  pauseAll: async () => {
    await window.hourforge.engine.pauseAll();
    const state = await window.hourforge.engine.getState();
    set({ engineState: state });
  },

  resumeAll: async () => {
    await window.hourforge.engine.resumeAll();
    const state = await window.hourforge.engine.getState();
    set({ engineState: state });
  },

  skipRest: async appId => {
    await window.hourforge.engine.skipRest(appId);
    const state = await window.hourforge.engine.getState();
    set({ engineState: state });
  },

  extendPlay: async (appId, seconds) => {
    await window.hourforge.engine.extendPlay(appId, seconds);
    const state = await window.hourforge.engine.getState();
    set({ engineState: state });
  },

  saveSettings: async newSettings => {
    await window.hourforge.store.saveSettings(newSettings);
    set({ settings: newSettings });
  },

  addGame: async game => {
    await window.hourforge.store.addGame(game);
    const games = await window.hourforge.store.getGames();
    set({ games });
  },

  removeGame: async appId => {
    await window.hourforge.store.removeGame(appId);
    const games = await window.hourforge.store.getGames();
    set({ games });
  },

  reorderGames: (fromIndex: number, toIndex: number) => {
    const list = [...get().games];
    const [moved] = list.splice(fromIndex, 1);
    if (moved) {
      list.splice(toIndex, 0, moved);
      set({ games: list });
    }
  },

  saveProfile: async profile => {
    await window.hourforge.store.saveProfile(profile);
    const profiles = await window.hourforge.store.getProfiles();
    set({ profiles });
  },

  saveCustomPattern: async pattern => {
    await window.hourforge.store.saveCustomPattern(pattern);
    const customPatterns = await window.hourforge.store.getCustomPatterns();
    set({ customPatterns });
  },

  deleteCustomPattern: async id => {
    await window.hourforge.store.deleteCustomPattern(id);
    const customPatterns = await window.hourforge.store.getCustomPatterns();
    set({ customPatterns });
  },

  addFreeLicense: async appId => {
    await window.hourforge.steam.addFreeLicense(appId);
  },

  refreshSteamHours: async () => {
    const snapshot = await window.hourforge.steam.refreshHours();
    set({ steamHours: snapshot });
  },

  testSteamApiKey: async (apiKey, steamId) => {
    return window.hourforge.steam.testApiKey(apiKey, steamId);
  },

  saveSteamApiKey: async apiKey => {
    await window.hourforge.steam.saveApiKey(apiKey);
    const settings = await window.hourforge.store.getSettings();
    const steamHours = await window.hourforge.steam.getHoursStatus();
    set({ settings, steamHours });
  },

  removeSteamApiKey: async () => {
    await window.hourforge.steam.removeApiKey();
    const settings = await window.hourforge.store.getSettings();
    const steamHours = await window.hourforge.steam.getHoursStatus();
    set({ settings, steamHours });
  },

  saveGoal: async goal => {
    await window.hourforge.goals.saveGoal(goal);
    const goals = await window.hourforge.goals.getGoals();
    const rep = await window.hourforge.goals.getPacingReport(goal.appId);
    set(state => ({
      goals,
      pacingReports: rep ? { ...state.pacingReports, [goal.appId]: rep } : state.pacingReports
    }));
  },

  deleteGoal: async id => {
    await window.hourforge.goals.deleteGoal(id);
    const goals = await window.hourforge.goals.getGoals();
    set({ goals });
  },

  refreshPacingReport: async appId => {
    const rep = await window.hourforge.goals.getPacingReport(appId);
    if (rep) {
      set(state => ({
        pacingReports: { ...state.pacingReports, [appId]: rep }
      }));
    }
    return rep;
  },

  checkFriendHours: async (appId, friendSteamId) => {
    return window.hourforge.goals.checkFriendHours(appId, friendSteamId);
  }
}));
