import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Target,
  Gamepad,
  Layers,
  Clock,
  Play,
  X,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { RunMode } from '../../core/types';

export const LaunchPickerCard: React.FC = () => {
  const games = useStore(state => state.games);
  const profiles = useStore(state => state.profiles);
  const settings = useStore(state => state.settings);
  const goals = useStore(state => state.goals);
  const pacingReports = useStore(state => state.pacingReports);
  const startRun = useStore(state => state.startRun);

  const enabledGames = React.useMemo(() => games.filter(g => g.enabled !== false), [games]);

  const [mode, setMode] = useState<RunMode>('DEDICATED');
  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([]);
  const [quotas, setQuotas] = useState<Record<number, { hours: number; minutes: number }>>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string>('regular');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Countdown timer state
  const initialCountdown = settings?.launchPickerCountdownSec ?? 60;
  const [countdown, setCountdown] = useState<number>(initialCountdown);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const isTypingRef = useRef<boolean>(false);

  // Preselect from default template only if present and valid in library
  useEffect(() => {
    if (enabledGames.length > 0 && settings?.defaultTemplate?.appIds) {
      const valid = settings.defaultTemplate.appIds.filter(id => enabledGames.some(g => g.appId === id));
      if (valid.length > 0) {
        setSelectedAppIds(valid);
        if (settings.defaultTemplate.targets) {
          const initQ: Record<number, { hours: number; minutes: number }> = {};
          for (const id of valid) {
            const sec = settings.defaultTemplate.targets[id] || 0;
            initQ[id] = { hours: Math.floor(sec / 3600), minutes: Math.round((sec % 3600) / 60) };
          }
          setQuotas(initQ);
        }
      }
    }
  }, [enabledGames, settings]);

  // Countdown effect: pauses on hover or typing
  useEffect(() => {
    if (isPaused || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          handleAutoStartDefault();
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused, countdown]);

  const handleAutoStartDefault = async () => {
    // 1. Resume previous run if snapshot exists AND all tracks exist in enabled games
    const snapshot = await window.hourforge.engine.getState();
    if (snapshot && (snapshot.status === 'RUNNING' || snapshot.status === 'PAUSED')) {
      const allExist = snapshot.tracks.length > 0 && snapshot.tracks.every(t =>
        enabledGames.some(g => g.appId === t.appId)
      );
      if (allExist) {
        await window.hourforge.engine.resumeAll();
        window.hourforge.system.close();
        return;
      }
    }

    // 2. Default template from settings ONLY if present and valid in library
    if (settings?.defaultTemplate?.appIds && settings.defaultTemplate.appIds.length > 0) {
      const valid = settings.defaultTemplate.appIds.filter(id =>
        enabledGames.some(g => g.appId === id)
      );
      if (valid.length > 0) {
        const prof = profiles.find(p => p.id === (settings.defaultTemplate?.profileId || 'regular')) || profiles[0]!;
        const tracks = valid.map(appId => ({
          appId,
          targetHours: settings.defaultTemplate?.targets?.[appId]
            ? settings.defaultTemplate.targets[appId] / 3600
            : 1
        }));
        await startRun({
          mode: settings.defaultTemplate.mode || 'DEDICATED',
          tracks,
          profileId: prof.id
        });
        window.hourforge.system.close();
        return;
      }
    }

    // Otherwise show notice and wait for user
    setIsPaused(true);
    setStatusNotice('No saved run or valid template found. Select games below.');
  };

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

  const setGameHours = (appId: number, hours: number) => {
    const current = quotas[appId] || { hours: 0, minutes: 0 };
    setQuotas({ ...quotas, [appId]: { ...current, hours: Math.max(0, Math.min(24, hours)) } });
  };

  const setGameMinutes = (appId: number, minutes: number) => {
    const current = quotas[appId] || { hours: 0, minutes: 0 };
    setQuotas({ ...quotas, [appId]: { ...current, minutes: Math.max(0, Math.min(59, minutes)) } });
  };

  const validationError = React.useMemo<string | null>(() => {
    if (enabledGames.length === 0) return 'Library is empty';
    if (selectedAppIds.length === 0) return 'Select at least one game';
    if (mode === 'SINGLE') {
      if (selectedAppIds.length !== 1) return 'Select exactly 1 game for Single Game';
    } else if (mode === 'MULTI') {
      if (selectedAppIds.length < 2 || selectedAppIds.length > 10) return 'Select 2-10 games for Multi-Game';
    } else if (mode === 'DEDICATED') {
      if (selectedAppIds.length < 1 || selectedAppIds.length > 10) return 'Select 1-10 games';
      for (const id of selectedAppIds) {
        const q = quotas[id];
        const total = q ? q.hours + q.minutes / 60 : 0;
        if (total <= 0) {
          const gName = enabledGames.find(g => g.appId === id)?.name || `App ${id}`;
          return `Enter hours (> 0) for ${gName}`;
        }
      }
    } else if (mode === 'CATCHUP') {
      if (selectedAppIds.length < 1 || selectedAppIds.length > 10) return 'Select 1-10 games';
      for (const id of selectedAppIds) {
        if (!goals.some(g => g.appId === id)) {
          const gName = enabledGames.find(g => g.appId === id)?.name || `App ${id}`;
          return `${gName} has no active Goal`;
        }
      }
    }
    return null;
  }, [enabledGames, selectedAppIds, mode, quotas, goals]);

  const handleStartCustom = async () => {
    if (validationError !== null) return;
    const prof = profiles.find(p => p.id === selectedProfileId) || profiles[0]!;
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
      const q = quotas[appId] || { hours: 1, minutes: 0 };
      const totalHours = q.hours + q.minutes / 60;
      return {
        appId,
        targetHours: mode === 'DEDICATED' ? totalHours : undefined
      };
    });

    await startRun({
      mode,
      tracks,
      profileId: prof.id
    });
    window.hourforge.system.close();
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        if (!isTypingRef.current) setIsPaused(false);
      }}
      className="w-full h-full liquid-glass-container border border-white/[0.12] rounded-2xl flex flex-col justify-between p-4 shadow-2xl select-none text-[#F1F5F9] backdrop-blur-xl"
    >
      {/* Header bar with countdown */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold tracking-wider text-white">
            HOURFORGE LAUNCH PICKER
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
              isPaused
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>{isPaused ? 'Paused' : `${countdown}s`}</span>
          </div>

          <button
            onClick={() => window.hourforge.system.close()}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#1A2234]"
            title="Dismiss / Stay Idle"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Content Form */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
        {/* 1. Mode Cards */}
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
            Operating Mode
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'DEDICATED' as RunMode, label: 'Dedicated', icon: Target },
              { id: 'CATCHUP' as RunMode, label: 'Catch-Up', icon: TrendingUp },
              { id: 'SINGLE' as RunMode, label: 'Single', icon: Gamepad },
              { id: 'MULTI' as RunMode, label: 'Multi', icon: Layers }
            ].map(m => {
              const Icon = m.icon;
              const isSelected = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => selectMode(m.id)}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-center transition-all ${
                    isSelected
                      ? 'liquid-glass-card-glow border-purple-400/60 text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]'
                      : 'liquid-glass-card text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[11px] font-semibold">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Game Chips with cover art & hh:mm inputs */}
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
            Select Games & Quotas
          </span>
          {enabledGames.length === 0 ? (
            <div className="p-4 rounded-xl border border-white/10 text-center text-xs text-slate-400">
              No games in library. Open HourForge to add games.
            </div>
          ) : (
            <div className="space-y-1.5">
              {enabledGames.map(game => {
                const isSelected = selectedAppIds.includes(game.appId);
                const q = quotas[game.appId];

                return (
                  <div
                    key={game.appId}
                    className={`p-2 rounded-xl transition-all flex items-center justify-between text-xs ${
                      isSelected
                        ? 'liquid-glass-card-glow border-purple-400/50 shadow-sm'
                        : 'liquid-glass-card'
                    }`}
                  >
                    <div
                      onClick={() => toggleGame(game.appId)}
                      className="flex items-center gap-2.5 cursor-pointer flex-1"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
                      />
                      {game.headerImage && (
                        <img
                          src={game.headerImage}
                          alt={game.name}
                          className="w-12 h-6 object-cover rounded"
                        />
                      )}
                      <div>
                        <h5 className="font-semibold text-white leading-tight">{game.name}</h5>
                        <span className="text-[10px] text-slate-400 font-mono">App {game.appId}</span>
                      </div>
                    </div>

                    {/* per-game hh:mm inputs for Dedicated */}
                    {isSelected && mode === 'DEDICATED' && (
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <input
                          type="number"
                          min={0}
                          max={24}
                          placeholder="h"
                          value={q?.hours !== undefined ? q.hours : ''}
                          onFocus={() => {
                            isTypingRef.current = true;
                            setIsPaused(true);
                          }}
                          onBlur={() => {
                            isTypingRef.current = false;
                          }}
                          onChange={e => setGameHours(game.appId, parseInt(e.target.value) || 0)}
                          className="w-10 bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded px-1.5 py-0.5 text-right text-white"
                        />
                        <span>h</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          step={15}
                          placeholder="m"
                          value={q?.minutes !== undefined ? q.minutes : ''}
                          onFocus={() => {
                            isTypingRef.current = true;
                            setIsPaused(true);
                          }}
                          onBlur={() => {
                            isTypingRef.current = false;
                          }}
                          onChange={e => setGameMinutes(game.appId, parseInt(e.target.value) || 0)}
                          className="w-10 bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded px-1.5 py-0.5 text-right text-white"
                        />
                        <span>m</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Profile Dropdown */}
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
            Human Rhythm Profile
          </span>
          <select
            value={selectedProfileId}
            onChange={e => setSelectedProfileId(e.target.value)}
            className="w-full bg-[#121723] border border-[#232B3D] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.session.minMin}-{p.session.maxMin}m sessions, {p.dailyCapHours || 12}h cap)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Action Buttons Footer */}
      <div className="pt-3 border-t border-[#1A2234] flex items-center justify-between gap-2">
        <button
          onClick={() => window.hourforge.system.close()}
          className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-[#1A2234] transition-colors"
        >
          Skip (Stay Idle)
        </button>

        <div className="flex items-center gap-2">
          {validationError && (
            <span className="text-[10px] text-amber-400 font-medium truncate max-w-[180px]">
              {validationError}
            </span>
          )}
          <button
            onClick={handleStartCustom}
            disabled={validationError !== null}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold liquid-glass-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            Start Now
          </button>
        </div>
      </div>
    </div>
  );
};
