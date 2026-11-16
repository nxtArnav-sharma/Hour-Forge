import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Target,
  Gamepad,
  Layers,
  Clock,
  Play,
  X,
  TrendingUp
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

  const [mode, setMode] = useState<RunMode>('DEDICATED');
  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([3513350, 4508340]);
  const [quotas, setQuotas] = useState<Record<number, { hours: number; minutes: number }>>({
    3513350: { hours: 1, minutes: 0 },
    4508340: { hours: 2, minutes: 0 }
  });
  const [selectedProfileId, setSelectedProfileId] = useState<string>('regular');

  // Countdown timer state
  const initialCountdown = settings?.launchPickerCountdownSec ?? 60;
  const [countdown, setCountdown] = useState<number>(initialCountdown);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const isTypingRef = useRef<boolean>(false);

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
    // Default action: resume previous run if snapshot exists, otherwise default template
    const snapshot = await window.hourforge.engine.getState();
    if (snapshot && (snapshot.status === 'RUNNING' || snapshot.status === 'PAUSED')) {
      await window.hourforge.engine.resumeAll();
      window.hourforge.system.close();
      return;
    }

    // Start default template: Dedicated WuWa 1h + NTE 2h on Regular profile
    const prof = profiles.find(p => p.id === 'regular') || profiles[0]!;
    await startRun({
      mode: 'DEDICATED',
      tracks: [
        { appId: 3513350, targetHours: 1 },
        { appId: 4508340, targetHours: 2 }
      ],
      profileId: prof.id
    });
    window.hourforge.system.close();
  };

  const selectMode = (newMode: RunMode) => {
    setMode(newMode);
    if (newMode === 'CATCHUP') {
      const goalAppIds = goals.map(g => g.appId);
      if (goalAppIds.length > 0) {
        setSelectedAppIds(goalAppIds);
      }
    } else if (newMode === 'SINGLE' && selectedAppIds.length > 1) {
      setSelectedAppIds([selectedAppIds[0]!]);
    }
  };

  const handleStartCustom = async () => {
    const prof = profiles.find(p => p.id === selectedProfileId) || profiles[0]!;
    const effectiveAppIds = mode === 'SINGLE' ? selectedAppIds.slice(0, 1) : selectedAppIds;
    const tracks = effectiveAppIds.map(appId => {
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

  const toggleGame = (appId: number) => {
    if (mode === 'SINGLE') {
      setSelectedAppIds([appId]);
      return;
    }
    if (selectedAppIds.includes(appId)) {
      if (selectedAppIds.length > 1) {
        setSelectedAppIds(selectedAppIds.filter(id => id !== appId));
      }
    } else {
      setSelectedAppIds([...selectedAppIds, appId]);
    }
  };

  const setGameHours = (appId: number, hours: number) => {
    const current = quotas[appId] || { hours: 1, minutes: 0 };
    setQuotas({ ...quotas, [appId]: { ...current, hours: Math.max(0, Math.min(24, hours)) } });
  };

  const setGameMinutes = (appId: number, minutes: number) => {
    const current = quotas[appId] || { hours: 1, minutes: 0 };
    setQuotas({ ...quotas, [appId]: { ...current, minutes: Math.max(0, Math.min(59, minutes)) } });
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
          <div className="space-y-1.5">
            {games.map(game => {
              const isSelected = selectedAppIds.includes(game.appId);
              const q = quotas[game.appId] || { hours: 1, minutes: 0 };

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
                        value={q.hours}
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
                        value={q.minutes}
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

        <button
          onClick={handleStartCustom}
          disabled={selectedAppIds.length === 0}
          className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold liquid-glass-btn-primary"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          Start Now
        </button>
      </div>
    </div>
  );
};

