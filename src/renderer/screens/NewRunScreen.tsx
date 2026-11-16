import React, { useState, useEffect } from 'react';
import {
  Play,
  Dices,
  Target,
  Gamepad,
  Layers,
  Sparkles,
  Clock,
  TrendingUp
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { RunMode, Block } from '../../core/types';
import { planTrackBlocks } from '../../core/planner';
import { Mulberry32 } from '../../core/rng';

export const NewRunScreen: React.FC = () => {
  const games = useStore(state => state.games);
  const profiles = useStore(state => state.profiles);
  const settings = useStore(state => state.settings);
  const goals = useStore(state => state.goals);
  const pacingReports = useStore(state => state.pacingReports);
  const startRun = useStore(state => state.startRun);
  const navigate = useStore(state => state.navigate);

  const enabledGames = React.useMemo(() => games.filter(g => g.enabled !== false), [games]);

  const [mode, setMode] = useState<RunMode>('DEDICATED');
  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([]);
  const [quotas, setQuotas] = useState<Record<number, number>>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string>('regular');
  const [previewSeed, setPreviewSeed] = useState<number>(Date.now());
  const [countdown, setCountdown] = useState<number | null>(
    settings?.launchPickerCountdownSec ? settings.launchPickerCountdownSec : null
  );
  const [initializedFromTemplate, setInitializedFromTemplate] = useState<boolean>(false);

  // Initialize selection from default template if present and valid in library
  useEffect(() => {
    if (!initializedFromTemplate && enabledGames.length > 0) {
      if (settings?.defaultTemplate?.appIds) {
        const valid = settings.defaultTemplate.appIds.filter(id => enabledGames.some(g => g.appId === id));
        if (valid.length > 0) {
          setSelectedAppIds(valid);
          if (settings.defaultTemplate.targets) {
            const initialQuotas: Record<number, number> = {};
            for (const id of valid) {
              if (settings.defaultTemplate.targets[id]) {
                initialQuotas[id] = settings.defaultTemplate.targets[id] / 3600;
              }
            }
            setQuotas(initialQuotas);
          }
        }
      }
      setInitializedFromTemplate(true);
    }
  }, [enabledGames, settings, initializedFromTemplate]);

  // Auto-start countdown logic
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c === null || c <= 1) {
          clearInterval(timer);
          if (validationError === null) {
            handleStart();
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const selectedProfile = profiles.find(p => p.id === selectedProfileId) || profiles[0]!;

  // Validation logic
  const validationError = React.useMemo<string | null>(() => {
    if (enabledGames.length === 0) return 'Add a game first (library is empty)';
    if (selectedAppIds.length === 0) return 'Select at least one game';
    if (mode === 'SINGLE') {
      if (selectedAppIds.length !== 1) return 'Select exactly 1 game for Single Game mode';
    } else if (mode === 'MULTI') {
      if (selectedAppIds.length < 2 || selectedAppIds.length > 10) return 'Select between 2 and 10 games for Multi-Game mode';
    } else if (mode === 'DEDICATED') {
      if (selectedAppIds.length < 1 || selectedAppIds.length > 10) return 'Select between 1 and 10 games';
      for (const id of selectedAppIds) {
        const q = quotas[id];
        if (typeof q !== 'number' || isNaN(q) || q <= 0) {
          const gName = enabledGames.find(g => g.appId === id)?.name || `App ${id}`;
          return `Enter target hours (> 0) for ${gName}`;
        }
      }
    } else if (mode === 'CATCHUP') {
      if (selectedAppIds.length < 1 || selectedAppIds.length > 10) return 'Select between 1 and 10 games';
      for (const id of selectedAppIds) {
        if (!goals.some(g => g.appId === id)) {
          const gName = enabledGames.find(g => g.appId === id)?.name || `App ${id}`;
          return `Game ${gName} has no active Catch-Up Goal`;
        }
      }
    }
    return null;
  }, [enabledGames, selectedAppIds, mode, quotas, goals]);

  // Live selection summary
  const summaryText = React.useMemo(() => {
    const names = selectedAppIds
      .map(id => enabledGames.find(g => g.appId === id)?.name)
      .filter(Boolean) as string[];

    if (names.length === 0) return 'No games selected';
    if (names.length === 1) return `1 game selected: ${names[0]}`;
    return `${names.length} games selected: ${names.join(', ')}`;
  }, [selectedAppIds, enabledGames]);

  // Generate live Gantt preview blocks for first selected track
  const previewBlocks = React.useMemo<Block[]>(() => {
    if (selectedAppIds.length === 0 || !selectedProfile) return [];
    const firstAppId = selectedAppIds[0]!;
    const quotaHours = mode === 'DEDICATED' ? quotas[firstAppId] || 1 : undefined;
    const quotaSec = quotaHours ? quotaHours * 3600 : undefined;

    const rng = new Mulberry32(previewSeed);
    try {
      return planTrackBlocks(
        rng,
        {
          profile: selectedProfile,
          quotaSeconds: quotaSec,
          startTimeUtc: Date.now(),
          isFirstBlockOfRun: true
        },
        8
      );
    } catch {
      return [];
    }
  }, [selectedAppIds, mode, quotas, selectedProfile, previewSeed]);

  const selectMode = (newMode: RunMode) => {
    setMode(newMode);
    if (newMode === 'CATCHUP') {
      const goalAppIds = goals.map(g => g.appId).filter(id => enabledGames.some(g => g.appId === id));
      if (goalAppIds.length > 0) {
        setSelectedAppIds(goalAppIds);
      }
    } else if (newMode === 'SINGLE' && selectedAppIds.length > 1) {
      setSelectedAppIds([selectedAppIds[0]!]);
    }
  };

  const toggleGame = (appId: number) => {
    if (mode === 'SINGLE') {
      setSelectedAppIds([appId]);
      return;
    }
    if (selectedAppIds.includes(appId)) {
      setSelectedAppIds(selectedAppIds.filter(id => id !== appId));
      setQuotas(prev => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
    } else {
      setSelectedAppIds([...selectedAppIds, appId]);
    }
  };

  const setGameQuota = (appId: number, hours: number) => {
    setQuotas(prev => ({ ...prev, [appId]: hours }));
  };

  const handleStart = async () => {
    if (validationError !== null) return;

    const tracks = selectedAppIds.map(appId => {
      if (mode === 'CATCHUP') {
        const goal = goals.find(g => g.appId === appId);
        const rep = pacingReports[appId];
        return {
          appId,
          targetHours: rep ? rep.remainingHours : (goal ? goal.targetHours : 10),
          dailyQuotaHours: rep ? rep.targetDailyHoursToday : undefined
        };
      }
      return {
        appId,
        targetHours: mode === 'DEDICATED' ? quotas[appId] : undefined
      };
    });

    await startRun({
      mode,
      tracks,
      profileId: selectedProfile.id
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Configure New Run</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Select games, operating mode, and humanized schedule profile.
          </p>
        </div>

        {countdown !== null && countdown > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs font-mono text-purple-300">
            <Clock className="w-3.5 h-3.5" />
            <span>Auto-starting in {countdown}s</span>
            <button
              onClick={() => setCountdown(null)}
              className="ml-2 text-slate-400 hover:text-white underline text-[11px]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* 1. Run Mode Selection Cards */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          1. Select Operating Mode
        </label>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            {
              id: 'DEDICATED' as RunMode,
              title: 'Dedicated (Quota)',
              desc: 'Farms exact target hours for each game and stops when complete.',
              icon: Target
            },
            {
              id: 'CATCHUP' as RunMode,
              title: 'Catch-Up (Goal)',
              desc: 'Plays daily quotas with 1-day safety buffer to reach deadline.',
              icon: TrendingUp
            },
            {
              id: 'SINGLE' as RunMode,
              title: 'Single Game (Open)',
              desc: 'Farms one game continuously on a human daily rhythm.',
              icon: Gamepad
            },
            {
              id: 'MULTI' as RunMode,
              title: 'Multi-Game (Alternating)',
              desc: 'Rotates multiple games on independent schedules continuously.',
              icon: Layers
            }
          ].map(m => {
            const Icon = m.icon;
            const isSelected = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => selectMode(m.id)}
                className={`p-4 rounded-2xl text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'liquid-glass-card-glow border-purple-400/60 shadow-[0_0_20px_rgba(139,92,246,0.25)]'
                    : 'liquid-glass-card'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div
                    className={`p-2 rounded-xl transition-all ${
                      isSelected ? 'bg-purple-500/25 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.4)]' : 'bg-white/[0.04] text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">{m.title}</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Game Selection & Quota Configuration */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          2. Select Games & Targets
        </label>
        {enabledGames.length === 0 ? (
          <div className="liquid-glass-card p-8 text-center space-y-3">
            <Gamepad className="w-10 h-10 text-slate-500 mx-auto" />
            <h3 className="text-sm font-semibold text-white">Your Games Library is Empty</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Add Steam games to your library before starting a grinding run.
            </p>
            <button
              onClick={() => navigate('games')}
              className="px-5 py-2 text-xs font-semibold liquid-glass-btn-primary mx-auto"
            >
              Add a Game First
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {enabledGames.map(game => {
              const isSelected = selectedAppIds.includes(game.appId);
              const quotaVal = quotas[game.appId];

              return (
                <div
                  key={game.appId}
                  className={`p-3.5 rounded-2xl transition-all flex items-center justify-between ${
                    isSelected
                      ? 'liquid-glass-card-glow border-purple-400/40 shadow-[0_0_15px_rgba(139,92,246,0.18)]'
                      : 'liquid-glass-card'
                  }`}
                >
                  <div
                    onClick={() => toggleGame(game.appId)}
                    className="flex items-center gap-3 cursor-pointer flex-1"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded-md bg-[#080B11] border-white/20 text-purple-600 focus:ring-0"
                    />
                    <div>
                      <h4 className="text-sm font-medium text-white">{game.name}</h4>
                      <p className="text-[11px] text-slate-400 font-mono">App ID {game.appId}</p>
                    </div>
                  </div>

                  {isSelected && mode === 'DEDICATED' && (
                    <div className="flex items-center gap-1.5 ml-4">
                      <span className="text-xs text-slate-400">Target:</span>
                      <input
                        type="number"
                        min={0.5}
                        max={24}
                        step={0.5}
                        placeholder="hrs"
                        value={quotaVal !== undefined ? quotaVal : ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          if (isNaN(val) || val <= 0) {
                            setQuotas(prev => {
                              const next = { ...prev };
                              delete next[game.appId];
                              return next;
                            });
                          } else {
                            setGameQuota(game.appId, Math.min(24, val));
                          }
                        }}
                        className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded-md px-2 py-1 text-xs font-mono text-right text-white focus:outline-none focus:border-purple-500"
                      />
                      <span className="text-xs text-slate-400">hrs</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Human Profile Selection */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          3. Human Rhythm Profile
        </label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {profiles.map(p => {
            const isSelected = selectedProfileId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProfileId(p.id)}
                className={`p-3 rounded-2xl text-center transition-all ${
                  isSelected
                    ? 'liquid-glass-card-glow border-purple-400/60 shadow-[0_0_15px_rgba(139,92,246,0.2)]'
                    : 'liquid-glass-card'
                }`}
              >
                <div className="text-xs font-semibold text-white mb-1 truncate">{p.name}</div>
                <div className="text-[10px] text-slate-400">
                  {p.session.minMin}-{p.session.maxMin}m play
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Live Gantt Plan Preview with Reroll */}
      <div className="liquid-glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Live Gantt Plan Preview
            </h3>
          </div>
          <button
            onClick={() => setPreviewSeed(Date.now() + Math.random())}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-200 liquid-glass-btn-secondary"
          >
            <Dices className="w-3.5 h-3.5 text-purple-400" />
            Reroll Plan
          </button>
        </div>

        {/* Visual Timeline Bar */}
        <div className="space-y-2">
          <div className="h-9 w-full bg-[#080B11]/80 rounded-xl p-1 flex gap-1 overflow-hidden border border-white/[0.06]">
            {previewBlocks.map((b, idx) => {
              const isPlay = b.type === 'play';
              return (
                <div
                  key={idx}
                  style={{ flex: Math.max(1, b.durationSec) }}
                  className={`h-full min-w-[40px] rounded-lg flex items-center justify-center text-[10px] font-mono px-1 truncate transition-all ${
                    isPlay
                      ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                      : 'bg-amber-500/20 border border-amber-400/40 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                  }`}
                  title={`${isPlay ? 'PLAY' : 'REST'}: ${(b.durationSec / 60).toFixed(0)}m`}
                >
                  <span className="truncate font-medium">{isPlay ? 'PLAY' : 'REST'} ({(b.durationSec / 60).toFixed(0)}m)</span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between text-[11px] text-slate-500 font-mono">
            <span>Now (T0)</span>
            <span>Projected schedule horizon (~8-12 hours)</span>
          </div>
        </div>
      </div>

      {/* Start Button & Summary */}
      <div className="pt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-mono text-slate-300 font-medium">
            {summaryText}
          </span>
          {validationError && (
            <span className="text-[11px] text-amber-400 font-medium">
              {validationError}
            </span>
          )}
        </div>
        <button
          onClick={handleStart}
          disabled={validationError !== null}
          className="flex items-center gap-2 px-7 py-3 text-sm font-semibold liquid-glass-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={validationError || 'Start Grinding Run'}
        >
          <Play className="w-4 h-4 fill-white" />
          Start Grinding Run
        </button>
      </div>
    </div>
  );
};
