import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Square,
  FastForward,
  Clock,
  Layers,
  Activity,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Key,
  Target,
  Users,
  CheckCircle,
  X,
  Sparkles,
  Moon
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { useStore } from '../store/useStore';
import { CatchUpGoal, GameEntry } from '../../shared/models';

export const DashboardScreen: React.FC = () => {
  const engineState = useStore(state => state.engineState);
  const games = useStore(state => state.games);
  const profiles = useStore(state => state.profiles);
  const history = useStore(state => state.history);
  const steamHours = useStore(state => state.steamHours);
  const refreshSteamHours = useStore(state => state.refreshSteamHours);
  const goals = useStore(state => state.goals);
  const pacingReports = useStore(state => state.pacingReports);
  const saveGoal = useStore(state => state.saveGoal);
  const deleteGoal = useStore(state => state.deleteGoal);
  const checkFriendHours = useStore(state => state.checkFriendHours);
  const pauseAll = useStore(state => state.pauseAll);
  const resumeAll = useStore(state => state.resumeAll);
  const stopRun = useStore(state => state.stopRun);
  const skipRest = useStore(state => state.skipRest);
  const extendPlay = useStore(state => state.extendPlay);
  const navigate = useStore(state => state.navigate);

  const [isRefreshingHours, setIsRefreshingHours] = useState(false);

  // Catch-Up Goal Modal State
  const [selectedGoalGame, setSelectedGoalGame] = useState<GameEntry | null>(null);
  const [goalTargetHours, setGoalTargetHours] = useState<string>('100');
  const [goalTargetDate, setGoalTargetDate] = useState<string>('');
  const [goalManualHours, setGoalManualHours] = useState<string>('0');
  const [friendSteamIdInput, setFriendSteamIdInput] = useState<string>('');
  const [isCheckingFriend, setIsCheckingFriend] = useState<boolean>(false);
  const [friendCheckResult, setFriendCheckResult] = useState<{
    success: boolean;
    friendHours?: number;
    message?: string;
    isPrivate?: boolean;
  } | null>(null);

  const handleRefreshHours = async () => {
    setIsRefreshingHours(true);
    try {
      await refreshSteamHours();
    } finally {
      setIsRefreshingHours(false);
    }
  };

  const openGoalModal = (game: GameEntry) => {
    setSelectedGoalGame(game);
    const existingGoal = goals.find(g => g.appId === game.appId);
    if (existingGoal) {
      setGoalTargetHours(String(existingGoal.targetHours));
      setGoalTargetDate(existingGoal.targetDate);
      setGoalManualHours(String(existingGoal.manualStartingHours || 0));
    } else {
      const currentHours = steamHours?.games?.[game.appId]?.steamHours || 0;
      setGoalTargetHours(String(Math.ceil(currentHours + 30)));
      // Default to 14 days from now in YYYY-MM-DD
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setGoalTargetDate(d.toISOString().slice(0, 10));
      setGoalManualHours(String(currentHours));
    }
    setFriendSteamIdInput('');
    setFriendCheckResult(null);
  };

  const handleCheckFriend = async () => {
    if (!selectedGoalGame || !friendSteamIdInput.trim()) return;
    setIsCheckingFriend(true);
    setFriendCheckResult(null);
    try {
      const res = await checkFriendHours(selectedGoalGame.appId, friendSteamIdInput.trim());
      setFriendCheckResult(res);
      if (res.success && res.friendHours !== undefined) {
        setGoalTargetHours(String(res.friendHours));
      }
    } catch (err: any) {
      setFriendCheckResult({
        success: false,
        message: err?.message || 'Failed to check friend.'
      });
    } finally {
      setIsCheckingFriend(false);
    }
  };

  const handleSaveGoal = async () => {
    if (!selectedGoalGame || !goalTargetDate) return;
    const targetH = parseFloat(goalTargetHours) || 10;
    const manualH = parseFloat(goalManualHours) || 0;
    const existing = goals.find(g => g.appId === selectedGoalGame.appId);

    const goalToSave: CatchUpGoal = {
      id: existing?.id || `goal_${selectedGoalGame.appId}`,
      appId: selectedGoalGame.appId,
      targetHours: targetH,
      targetDate: goalTargetDate,
      createdAtUtc: existing?.createdAtUtc || Date.now(),
      lastSyncedSteamHours: existing?.lastSyncedSteamHours,
      lastSyncUtc: existing?.lastSyncUtc,
      manualStartingHours: manualH,
      userLabel: existing?.userLabel,
      friendHours: friendCheckResult?.friendHours || existing?.friendHours,
      status: 'ACTIVE'
    };

    await saveGoal(goalToSave);
    setSelectedGoalGame(null);
  };

  const handleDeleteGoal = async () => {
    if (!selectedGoalGame) return;
    const existing = goals.find(g => g.appId === selectedGoalGame.appId);
    if (existing) {
      await deleteGoal(existing.id);
    }
    setSelectedGoalGame(null);
  };

  // Local ticker for smooth countdown rendering (paused when document is hidden)
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) {
        setTick(t => t + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isRunning = engineState?.status === 'RUNNING';
  const isPaused = engineState?.status === 'PAUSED';

  // Compute 7-day playtime data for chart from history
  const chartData = React.useMemo(() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      days[key] = 0;
    }

    for (const entry of history) {
      const d = new Date(entry.startUtc);
      const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      if (days[key] !== undefined) {
        days[key] += entry.creditedSeconds / 3600;
      }
    }

    return Object.entries(days).map(([day, hours]) => ({
      day,
      hours: Number(hours.toFixed(2))
    }));
  }, [history]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Top Header / Run Status Strip */}
      <div className="liquid-glass-card-glow p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xs tracking-wider transition-all ${
              isRunning
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : isPaused
                ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                : 'bg-white/[0.04] text-slate-400 border border-white/[0.08]'
            }`}
          >
            {isRunning ? 'RUN' : isPaused ? 'PAUSE' : 'IDLE'}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              {isRunning
                ? (engineState?.mode === 'DEDICATED'
                    ? 'Dedicated Run'
                    : engineState?.mode === 'CATCHUP'
                    ? 'Catch-Up Run'
                    : engineState?.mode === 'SINGLE'
                    ? 'Single Game Run'
                    : engineState?.mode === 'MULTI'
                    ? 'Multi-Game Run'
                    : engineState?.mode === 'CUSTOM'
                    ? `Custom: ${engineState?.customPattern?.name || 'Custom Pattern'}`
                    : `Running (${engineState?.mode})`)
                : isPaused
                ? 'Run Paused'
                : 'No Active Run'}
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
              <span>Profile: <strong className="text-purple-300 font-medium">{profiles.find(p => p.id === engineState?.profileId)?.name || 'Default'}</strong></span>
              <span>·</span>
              <span>Active Tracks: <strong className="text-slate-200 font-medium">{engineState?.tracks.length || 0}</strong></span>
            </p>
          </div>
        </div>

        {/* Global Run Action Controls */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <button
                onClick={() => pauseAll()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl transition-all shadow-[0_0_12px_rgba(245,158,11,0.2)]"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause All
              </button>
              <button
                onClick={() => stopRun()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-xl transition-all shadow-[0_0_12px_rgba(239,68,68,0.2)]"
              >
                <Square className="w-3.5 h-3.5 fill-rose-300" />
                Stop Run
              </button>
            </>
          ) : isPaused ? (
            <>
              <button
                onClick={() => resumeAll()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl transition-all shadow-[0_0_12px_rgba(16,185,129,0.2)]"
              >
                <Play className="w-3.5 h-3.5 fill-emerald-300" />
                Resume All
              </button>
              <button
                onClick={() => stopRun()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-xl transition-all shadow-[0_0_12px_rgba(239,68,68,0.2)]"
              >
                <Square className="w-3.5 h-3.5 fill-rose-300" />
                Stop Run
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('new-run')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium liquid-glass-btn-primary"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Start New Run
            </button>
          )}
        </div>
      </div>

      {/* Active Tracks Grid */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Track Status ({engineState?.tracks.length || 0})
        </h3>

        {!engineState || engineState.tracks.length === 0 ? (
          <div className="liquid-glass-card border-dashed p-8 text-center text-slate-400 text-sm">
            No active tracks. Click "Start New Run" to schedule games.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {engineState.tracks.map(track => {
              const game = games.find(g => g.appId === track.appId && g.enabled !== false);
              const isPlaying = track.state === 'PLAYING';
              const isResting = track.state === 'RESTING';
              const isBlocked = track.overlay === 'BLOCKED';

              const now = Date.now();
              const currentBlock = track.blocks[track.currentBlockIndex];
              const nextChangeUtc = currentBlock ? currentBlock.endUtc : now;
              const nextChangeSec = Math.max(0, Math.round((nextChangeUtc - now) / 1000));
              const nextMin = Math.floor(nextChangeSec / 60);
              const nextSec = nextChangeSec % 60;
              const countdownStr = `${nextMin}:${nextSec.toString().padStart(2, '0')}`;

              const creditedHours = (track.creditedSeconds / 3600).toFixed(1);
              const todayHours = (
                (track.todayCreditedSeconds !== undefined
                  ? track.todayCreditedSeconds
                  : track.creditedSeconds) / 3600
              ).toFixed(1);
              const targetHours = track.targetSeconds ? (track.targetSeconds / 3600).toFixed(1) : null;
              const progressPct = targetHours
                ? Math.min(100, Math.round((track.creditedSeconds / track.targetSeconds!) * 100))
                : null;

              return (
                <div
                  key={track.appId}
                  className="liquid-glass-card overflow-hidden flex flex-col"
                >
                  {/* Game Art Banner */}
                  <div className="h-28 relative overflow-hidden bg-slate-900/40">
                    {game?.headerImage && (
                      <img
                        src={game.headerImage}
                        alt={game.name}
                        onError={e => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                        className="w-full h-full object-cover opacity-60"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0C111C] via-[#0C111C]/40 to-transparent" />

                    {/* State Badge Overlay */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {isBlocked ? (
                        <span className="px-2.5 py-1 text-[11px] font-semibold bg-orange-500/90 text-white rounded-full flex items-center gap-1 shadow-[0_0_12px_rgba(251,146,60,0.4)]">
                          <AlertTriangle className="w-3 h-3" /> BLOCKED
                        </span>
                      ) : isPlaying ? (
                        <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/90 text-white rounded-full flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-100 shadow-[0_0_6px_#fff]" /> PLAYING
                        </span>
                      ) : isResting ? (
                        (() => {
                          const reason = currentBlock?.reason;
                          const isOffHours = reason === 'active_window';
                          const isDailyCap = reason === 'daily_cap';
                          const hasCatchupGoal = goals.some(g => g.appId === track.appId && g.status === 'ACTIVE');

                          if (isOffHours) {
                            return (
                              <span className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-500/90 text-white rounded-full flex items-center gap-1 shadow-[0_0_12px_rgba(99,102,241,0.4)]">
                                <Moon className="w-3 h-3" /> OFF HOURS
                              </span>
                            );
                          }
                          if (isDailyCap) {
                            return (
                              <span className="px-2.5 py-1 text-[11px] font-semibold bg-blue-500/90 text-white rounded-full flex items-center gap-1 shadow-[0_0_12px_rgba(59,130,246,0.4)]">
                                <CheckCircle className="w-3 h-3" /> {hasCatchupGoal ? 'DAILY GOAL REACHED' : 'DAILY LIMIT REACHED'}
                              </span>
                            );
                          }
                          return (
                            <span className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500/90 text-white rounded-full flex items-center gap-1 shadow-[0_0_12px_rgba(245,158,11,0.4)]">
                              <Clock className="w-3 h-3" /> RESTING
                            </span>
                          );
                        })()
                      ) : (
                        <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/10 text-slate-300 rounded-full">
                          {track.state}
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-2 left-3">
                      <h4 className="text-sm font-semibold text-white drop-shadow">
                        {game?.name || 'Game Not in Library'}
                      </h4>
                      <p className="text-[11px] text-slate-300 font-mono">
                        App ID: {track.appId}
                      </p>
                    </div>
                  </div>

                  {/* Track Details & Action Buttons */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Countdown to next change */}
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>
                          {isResting && currentBlock?.reason === 'active_window'
                            ? `plays again at ${new Date(currentBlock.endUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : isResting && currentBlock?.reason === 'daily_cap'
                            ? `plays again at ${new Date(currentBlock.endUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Next state transition:'}
                        </span>
                        <span className="font-mono text-purple-400 font-semibold">
                          {countdownStr}
                        </span>
                      </div>

                      {/* Quota Progress */}
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Credited playtime:</span>
                        <span className="font-mono text-slate-200">
                          {targetHours
                            ? `${creditedHours}h / ${targetHours}h (${progressPct}%)`
                            : `${todayHours}h today (Open-ended)`}
                        </span>
                      </div>

                      {progressPct !== null && (
                        <div className="w-full h-1.5 bg-[#1A2234] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#1A2234]">
                      {isResting && (
                        <button
                          onClick={() => skipRest(track.appId)}
                          className="flex-1 py-1.5 text-[11px] font-medium bg-[#1A2234] hover:bg-[#232B3D] text-slate-200 rounded-md transition-colors flex items-center justify-center gap-1"
                          title="Skip remaining rest and start playing immediately"
                        >
                          <FastForward className="w-3 h-3" />
                          Skip Rest
                        </button>
                      )}
                      {isPlaying && (
                        <>
                          <button
                            onClick={() => extendPlay(track.appId, 15 * 60)}
                            className="flex-1 py-1.5 text-[11px] font-medium bg-[#1A2234] hover:bg-[#232B3D] text-slate-300 rounded-md transition-colors"
                          >
                            +15m
                          </button>
                          <button
                            onClick={() => extendPlay(track.appId, 30 * 60)}
                            className="flex-1 py-1.5 text-[11px] font-medium bg-[#1A2234] hover:bg-[#232B3D] text-slate-300 rounded-md transition-colors"
                          >
                            +30m
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Steam Profile Hours & Verification (M10) */}
      <div className="liquid-glass-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-400" />
              Steam Profile Playtime Verification
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Live profile playtime from official Steam Web API (polled every 15m).
            </p>
          </div>

          <div className="flex items-center gap-3">
            {steamHours?.lastPollUtc ? (
              <span className="text-[11px] text-slate-500 font-mono">
                Polled {new Date(steamHours.lastPollUtc).toLocaleTimeString()}
              </span>
            ) : null}

            {steamHours?.hasApiKey && (
              <button
                onClick={handleRefreshHours}
                disabled={isRefreshingHours}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#1A2234] hover:bg-[#232D42] rounded-xl transition-colors border border-slate-700/50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-purple-400 ${
                    isRefreshingHours ? 'animate-spin' : ''
                  }`}
                />
                {isRefreshingHours ? 'Syncing...' : 'Refresh Hours'}
              </button>
            )}
          </div>
        </div>

        {/* State Banner */}
        {!steamHours || !steamHours.hasApiKey || steamHours.status === 'NO_KEY' ? (
          <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-purple-200">
                  Connect Steam Web API
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-xl">
                  Add your Steam Web API Key in Settings to verify live profile hours, track playtime gains since install, and detect profile sync lag automatically.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('settings')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white rounded-xl shadow-md transition-colors"
            >
              Configure in Settings
            </button>
          </div>
        ) : steamHours.status === 'PRIVATE_PROFILE' ? (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-xs text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">
                Steam Profile Game Details are Private
              </span>
              <p className="text-[11px] text-amber-300/80 mt-1">
                Steam returned your games list, but individual playtime is hidden. Set Game details to <strong>Public</strong> in your Steam Privacy Settings to display profile hours.
              </p>
            </div>
          </div>
        ) : steamHours.status === 'INVALID_KEY' ? (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Invalid Steam Web API Key</span>
                <span className="text-[11px] text-rose-300/80">
                  HTTP 403 Forbidden. Please verify or update your key in Settings.
                </span>
              </div>
            </div>
            <button
              onClick={() => navigate('settings')}
              className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs text-rose-200 rounded-lg transition-colors"
            >
              Open Settings
            </button>
          </div>
        ) : steamHours.status === 'RATE_LIMITED' ? (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Steam API rate limit reached. Backing off polling for 5 minutes.</span>
          </div>
        ) : steamHours.status === 'OFFLINE' ? (
          <div className="p-3 bg-slate-800 border border-slate-700 rounded-xl flex items-center gap-2 text-xs text-slate-300">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Offline: Showing cached profile hours.</span>
          </div>
        ) : null}

        {/* Per-Game Playtime Comparison Grid */}
        {games.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">
            No games added to HourForge. Add games from the Games tab to start tracking.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {games.map(game => {
              const data = steamHours?.games?.[game.appId];
              return (
                <div
                  key={game.appId}
                  className="bg-[#0B0E14] border border-[#1A2234] rounded-xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        game.headerImage ||
                        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appId}/header.jpg`
                      }
                      alt={game.name}
                      className="w-16 h-8 object-cover rounded border border-[#1A2234]"
                      onError={e => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="truncate">
                      <h4 className="text-xs font-semibold text-white truncate">
                        {game.name}
                      </h4>
                      <span className="text-[10px] text-slate-500 font-mono">
                        App ID: {game.appId}
                      </span>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-[#121723]/70 p-2.5 rounded-lg border border-[#1A2234]/60 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Steam Profile</span>
                      <span className="font-semibold text-white font-mono text-sm">
                        {data ? `${data.steamHours.toFixed(1)} h` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-purple-400 block">HF Credited</span>
                      <span className="font-semibold text-purple-300 font-mono text-sm">
                        {data ? `${data.hourforgeCreditedHours.toFixed(1)} h` : '0.0 h'}
                      </span>
                    </div>
                    <div className="pt-1 border-t border-[#1A2234]">
                      <span className="text-[10px] text-slate-500 block">Sync Baseline</span>
                      <span className="font-mono text-slate-300 text-xs">
                        {data ? `${data.baselineSteamHours.toFixed(1)} h` : '—'}
                      </span>
                    </div>
                    <div className="pt-1 border-t border-[#1A2234]">
                      <span className="text-[10px] text-emerald-400 block">Steam Gain</span>
                      <span className="font-mono text-emerald-300 font-medium text-xs">
                        {data ? `+${data.steamGainHours.toFixed(1)} h` : '+0.0 h'}
                      </span>
                    </div>
                  </div>

                  {/* Lag Alert Banner */}
                  {data?.isLagging && (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2 text-[11px] text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block">Steam may be lagging</span>
                        <span className="opacity-90 block text-[10px] mt-0.5 leading-snug">
                          Steam commits playtime to your profile when a session ends.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Catch-Up Goal Section (M11) */}
                  {(() => {
                    const goal = goals.find(g => g.appId === game.appId);
                    const report = pacingReports[game.appId];

                    if (!goal) {
                      return (
                        <button
                          type="button"
                          onClick={() => openGoalModal(game)}
                          className="w-full py-1.5 px-3 bg-[#1A2234] hover:bg-[#232D42] text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700/50 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Target className="w-3.5 h-3.5 text-purple-400" />
                          Set Catch-Up Goal
                        </button>
                      );
                    }

                    const progressPct = report && report.targetHours > 0
                      ? Math.min(100, Math.max(0, Math.round((report.currentEffectiveHours / report.targetHours) * 100)))
                      : 0;

                    return (
                      <div className="bg-[#121723] p-2.5 rounded-lg border border-[#1A2234] space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white flex items-center gap-1.5 text-[11px]">
                            <Target className="w-3.5 h-3.5 text-purple-400" />
                            Goal: {goal.targetHours}h by {goal.targetDate}
                          </span>
                          <button
                            type="button"
                            onClick={() => openGoalModal(game)}
                            className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                          >
                            Edit
                          </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-slate-400">
                            <span>{report && report.currentEffectiveHours !== undefined ? `${report.currentEffectiveHours.toFixed(1)}h` : '0.0h'}</span>
                            <span>{goal.targetHours}h ({progressPct}%)</span>
                          </div>
                          <div className="w-full bg-[#0B0E14] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-purple-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Pacing & Feasibility Display */}
                        {report && report.status === 'ACHIEVED' ? (
                          <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Target reached!
                          </div>
                        ) : report && report.status === 'MISSED_DEADLINE' ? (
                          <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded text-[10px] text-rose-300 space-y-1">
                            <span className="font-semibold block flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-400" />
                              Deadline passed ({goal.targetDate})
                            </span>
                            <span className="block opacity-90">
                              Missed by {report.remainingHours.toFixed(1)}h. Earliest feasible: {report.earliestFeasibleDate}.
                            </span>
                          </div>
                        ) : report && !report.isFeasible ? (
                          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-200 space-y-1">
                            <span className="font-semibold block flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              Not feasible by {goal.targetDate}
                            </span>
                            <span className="block text-slate-300">
                              Requires {report.requiredDailyHours.toFixed(1)}h/day (Daily cap is {report.profileDailyCapHours}h).
                            </span>
                            <span className="block text-amber-300 font-medium">
                              Earliest feasible: {report.earliestFeasibleDate}
                            </span>
                            {report.recommendedProfiles.length > 0 && report.recommendedProfiles[0] && (
                              <span className="block text-purple-300">
                                Recommended profile: {report.recommendedProfiles[0].name} ({report.recommendedProfiles[0].dailyCapHours}h cap)
                              </span>
                            )}
                          </div>
                        ) : report ? (
                          <div className="text-[10px] text-slate-400 flex items-center justify-between font-mono">
                            <span>Pace: <strong className="text-purple-300">{report.requiredDailyHours.toFixed(1)} h/day</strong></span>
                            <span>{report.daysRemaining}d left</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7-Day Playtime Recharts Visualizer */}
      <div className="liquid-glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            7-Day Playtime Trend
          </h3>
          <span className="text-xs text-slate-400">Credited Hours</span>
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} unit="h" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15,20,32,0.92)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  color: '#F1F5F9',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="hours" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="liquid-glass-card p-5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-purple-400" />
          Recent Activity (Last 50 Sessions)
        </h3>

        {history.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center">
            No completed sessions recorded yet.
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-2">
            {history.slice(-50).reverse().map((entry, idx) => {
              const game = games.find(g => g.appId === entry.appId);
              const durationMin = (entry.creditedSeconds / 60).toFixed(1);
              const dateStr = new Date(entry.startUtc).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 px-3 bg-[#0B0E14]/60 rounded-lg text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span className="font-medium text-slate-200">
                      {game?.name || `App ${entry.appId}`}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({entry.appId})
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
                    <span>{durationMin} min</span>
                    <span className="text-slate-600">·</span>
                    <span className="capitalize">{entry.source}</span>
                    <span className="text-slate-600">·</span>
                    <span>{dateStr}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Catch-Up Goal Modal (M11) */}
      {selectedGoalGame && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="liquid-glass-card-glow w-full max-w-lg p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A2234]">
              <div className="flex items-center gap-2.5">
                <Target className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Catch-Up Goal: {selectedGoalGame.name}
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    App ID: {selectedGoalGame.appId}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGoalGame(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1A2234] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Target Hours */}
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  Target Playtime Hours
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={goalTargetHours}
                  onChange={e => setGoalTargetHours(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  placeholder="e.g. 500"
                />
              </div>

              {/* Match Friend's Hours Helper (Clarification 3) */}
              <div className="p-3.5 bg-[#0B0E14] border border-[#1A2234] rounded-xl space-y-2.5">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-[11px]">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  Match Friend's Hours (Public Profile)
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Enter a friend's SteamID64 to set your target to their playtime. Friend's game details must be Public. SteamID is never stored or logged.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={friendSteamIdInput}
                    onChange={e => setFriendSteamIdInput(e.target.value)}
                    placeholder="17-digit SteamID64 (e.g. 76561198...)"
                    className="flex-1 bg-[#121723] border border-[#232B3D] focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCheckFriend}
                    disabled={isCheckingFriend || !friendSteamIdInput.trim()}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-xs font-medium text-white rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {isCheckingFriend ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Check
                  </button>
                </div>

                {friendCheckResult && (
                  <div
                    className={`p-2.5 rounded-lg border text-[11px] flex items-start gap-2 ${
                      friendCheckResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : friendCheckResult.isPrivate
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {friendCheckResult.success ? (
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    )}
                    <div>
                      <span className="font-semibold block">
                        {friendCheckResult.success
                          ? `Friend Playtime: ${friendCheckResult.friendHours}h`
                          : friendCheckResult.isPrivate
                          ? "Friend's Profile is Private"
                          : 'Check Failed'}
                      </span>
                      <span className="opacity-90 block mt-0.5">
                        {friendCheckResult.message}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Target Date */}
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  Target Deadline Date
                </label>
                <input
                  type="date"
                  value={goalTargetDate}
                  onChange={e => setGoalTargetDate(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              {/* Manual starting hours if no API key */}
              {!steamHours?.hasApiKey && (
                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1">
                    Current Starting Playtime (Manual)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={goalManualHours}
                    onChange={e => setGoalManualHours(e.target.value)}
                    className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                    placeholder="e.g. 10.0"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Steam Web API key not configured. Enter initial hours to track progress.
                  </span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#1A2234]">
              {goals.some(g => g.appId === selectedGoalGame.appId) ? (
                <button
                  type="button"
                  onClick={handleDeleteGoal}
                  className="px-3.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-xl transition-colors"
                >
                  Delete Goal
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGoalGame(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGoal}
                  disabled={!goalTargetDate || !parseFloat(goalTargetHours)}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-xs font-semibold text-white rounded-xl shadow-md transition-colors"
                >
                  Save Goal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
