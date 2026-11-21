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
  AlertCircle,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { RunMode } from '../../core/types';

export const LaunchPickerCard: React.FC = () => {
  const games = useStore(state => state.games);
  const profiles = useStore(state => state.profiles);
  const settings = useStore(state => state.settings);
  const goals = useStore(state => state.goals);
  const customPatterns = useStore(state => state.customPatterns);
  const engineState = useStore(state => state.engineState);
  const pacingReports = useStore(state => state.pacingReports);
  const startRun = useStore(state => state.startRun);
  const stopRun = useStore(state => state.stopRun);
  const navigate = useStore(state => state.navigate);

  const enabledGames = React.useMemo(() => games.filter(g => g.enabled !== false), [games]);

  const [mode, setMode] = useState<RunMode>('DEDICATED');
  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([]);
  const [quotas, setQuotas] = useState<Record<number, { hours: number; minutes: number }>>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string>('regular');
  const [selectedPatternId, setSelectedPatternId] = useState<string>('builtin-example');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [confirmStopActiveRun, setConfirmStopActiveRun] = useState<boolean>(false);

  // Manual mode detection: URL hash or IPC mode event
  const [isManualMode, setIsManualMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (window.location.hash || '').includes('mode=manual');
    }
    return false;
  });

  // Countdown timer state (only in autostart mode)
  const initialCountdown = settings?.launchPickerCountdownSec ?? 60;
  const [countdown, setCountdown] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && (window.location.hash || '').includes('mode=manual')) {
      return null;
    }
    return initialCountdown;
  });
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const isTypingRef = useRef<boolean>(false);

  useEffect(() => {
    const unsub = window.hourforge?.system?.onLaunchPickerMode?.(m => {
      if (m === 'manual') {
        setIsManualMode(true);
        setCountdown(null);
      } else {
        setIsManualMode(false);
        setCountdown(initialCountdown);
      }
    });
    return () => unsub?.();
  }, [initialCountdown]);

  // Esc key closes window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.hourforge.system.close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  // Countdown effect: pauses on hover or typing (autostart mode only)
  useEffect(() => {
    if (isManualMode || isPaused || countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(c => {
        if (c === null || c <= 1) {
          clearInterval(timer);
          handleAutoStartDefault();
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isManualMode, isPaused, countdown]);

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
        const customPat = settings.defaultTemplate.customPatternId
          ? customPatterns.find(p => p.id === settings.defaultTemplate?.customPatternId)
          : undefined;

        await startRun({
          mode: settings.defaultTemplate.mode || 'DEDICATED',
          tracks,
          profileId: prof.id,
          customPattern: customPat
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
    } else if (mode === 'CUSTOM') {
      if (selectedAppIds.length < 1 || selectedAppIds.length > 10) return 'Select 1-10 games for Custom mode';
      if (customPatterns.length === 0) return 'Create a pattern on the New Run screen first';
    }
    return null;
  }, [enabledGames, selectedAppIds, mode, quotas, goals, customPatterns]);

  const handleStartCustom = async () => {
    if (validationError !== null) return;

    // Check if run active
    const isRunActive = engineState && (engineState.status === 'RUNNING' || engineState.status === 'PAUSED');
    if (isRunActive && !confirmStopActiveRun) {
      setConfirmStopActiveRun(true);
      return;
    }

    if (confirmStopActiveRun) {
      await stopRun();
    }

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

    const customPat = mode === 'CUSTOM'
      ? customPatterns.find(p => p.id === selectedPatternId) || customPatterns[0]
      : undefined;

    await startRun({
      mode,
      tracks,
      profileId: prof.id,
      customPattern: customPat
    });
    window.hourforge.system.close();
  };

  const isRunActive = engineState && (engineState.status === 'RUNNING' || engineState.status === 'PAUSED');

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        if (!isTypingRef.current) setIsPaused(false);
      }}
      className="w-full h-full liquid-glass-container border border-white/[0.12] rounded-2xl flex flex-col justify-between p-4 shadow-2xl select-none text-[#F1F5F9] backdrop-blur-xl"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold tracking-wider text-white">
            HOURFORGE LAUNCH PICKER
          </span>
        </div>

        <div className="flex items-center gap-2">
          {countdown !== null && (
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
          )}

          <button
            onClick={() => window.hourforge.system.close()}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#1A2234]"
            title="Dismiss / Stay Idle (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Run Banner */}
      {isRunActive && (
        <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>A run is currently active. Starting a new run will stop the current session.</span>
        </div>
      )}

      {/* Confirmation to stop current run */}
      {confirmStopActiveRun && (
        <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
          <p className="text-amber-300 font-medium">Stop the current run and start this one?</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartCustom}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs"
            >
              Yes, stop and start
            </button>
            <button
              onClick={() => setConfirmStopActiveRun(false)}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { id: 'DEDICATED' as RunMode, label: 'Dedicated', icon: Target },
              { id: 'CATCHUP' as RunMode, label: 'Catch-Up', icon: TrendingUp },
              { id: 'SINGLE' as RunMode, label: 'Single', icon: Gamepad },
              { id: 'MULTI' as RunMode, label: 'Multi', icon: Layers },
              { id: 'CUSTOM' as RunMode, label: 'Custom', icon: Sliders }
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
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold">{m.label}</span>
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
            <div className="p-4 rounded-xl border border-white/10 text-center text-xs text-slate-400 space-y-2">
              <p>No games in library.</p>
              <button
                onClick={() => {
                  navigate('games');
                  window.hourforge.system.close();
                }}
                className="px-3 py-1.5 text-xs liquid-glass-btn-primary"
              >
                Add a game first
              </button>
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
                        className="rounded bg-[#080B11] border-white/20 text-purple-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      {game.headerImage ? (
                        <img
                          src={game.headerImage}
                          alt={game.name}
                          onError={e => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                          className="w-10 h-6 object-cover rounded bg-slate-800"
                        />
                      ) : (
                        <div className="w-10 h-6 bg-slate-800 rounded flex items-center justify-center text-[9px] text-slate-500 font-mono">
                          {game.appId}
                        </div>
                      )}
                      <div className="truncate max-w-[150px]">
                        <span className="font-medium text-white block truncate">{game.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">App {game.appId}</span>
                      </div>
                    </div>

                    {isSelected && mode === 'DEDICATED' && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={24}
                          value={q?.hours ?? 1}
                          onFocus={() => {
                            isTypingRef.current = true;
                            setIsPaused(true);
                          }}
                          onBlur={() => {
                            isTypingRef.current = false;
                          }}
                          onChange={e => setGameHours(game.appId, parseInt(e.target.value) || 0)}
                          className="w-10 bg-[#0B0E14] border border-[#232B3D] rounded px-1.5 py-0.5 text-[11px] font-mono text-right text-white focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">h</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={q?.minutes ?? 0}
                          onFocus={() => {
                            isTypingRef.current = true;
                            setIsPaused(true);
                          }}
                          onBlur={() => {
                            isTypingRef.current = false;
                          }}
                          onChange={e => setGameMinutes(game.appId, parseInt(e.target.value) || 0)}
                          className="w-10 bg-[#0B0E14] border border-[#232B3D] rounded px-1.5 py-0.5 text-[11px] font-mono text-right text-white focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">m</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Profile or Custom Pattern Dropdown */}
        {mode === 'CUSTOM' ? (
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
              Custom Pattern
            </span>
            {customPatterns.length === 0 ? (
              <p className="text-xs text-amber-400">Create a pattern on the New Run screen first</p>
            ) : (
              <select
                value={selectedPatternId}
                onChange={e => setSelectedPatternId(e.target.value)}
                className="w-full bg-[#121723] border border-[#232B3D] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
              >
                {customPatterns.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
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
        )}
      </div>

      {/* Action Buttons Footer */}
      <div className="pt-3 border-t border-[#1A2234] flex items-center justify-between gap-2">
        <button
          onClick={() => window.hourforge.system.close()}
          className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-[#1A2234] transition-colors"
        >
          {isManualMode ? 'Cancel' : 'Skip (Stay Idle)'}
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
            <span>{isManualMode ? 'Start Run' : 'Start Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
