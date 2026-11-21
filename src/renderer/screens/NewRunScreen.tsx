import React, { useState, useEffect } from 'react';
import {
  Play,
  Dices,
  Target,
  Gamepad,
  Layers,
  Sparkles,
  Clock,
  TrendingUp,
  Sliders,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  AlertTriangle
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { RunMode, Block, CustomStep, CustomPattern } from '../../core/types';
import { BUILTIN_CUSTOM_PATTERN } from '../../core/profiles';
import { planTrackBlocks } from '../../core/planner';
import { Mulberry32 } from '../../core/rng';

export const NewRunScreen: React.FC = () => {
  const games = useStore(state => state.games);
  const profiles = useStore(state => state.profiles);
  const settings = useStore(state => state.settings);
  const goals = useStore(state => state.goals);
  const customPatterns = useStore(state => state.customPatterns);
  const saveCustomPattern = useStore(state => state.saveCustomPattern);
  const deleteCustomPattern = useStore(state => state.deleteCustomPattern);
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

  // Custom Pattern State
  const [selectedPatternId, setSelectedPatternId] = useState<string>('builtin-example');
  const [patternName, setPatternName] = useState<string>('My original example');
  const [patternSteps, setPatternSteps] = useState<CustomStep[]>([
    { type: 'play', minMin: 60, maxMin: 60 },
    { type: 'rest', minMin: 5, maxMin: 5 },
    { type: 'play', minMin: 120, maxMin: 120 },
    { type: 'rest', minMin: 60, maxMin: 60 }
  ]);
  const [customView, setCustomView] = useState<'simple' | 'advanced'>('advanced');
  const [sameEachTime, setSameEachTime] = useState<boolean>(true);
  const [simplePlayMin, setSimplePlayMin] = useState<number>(60);
  const [simplePlayMax, setSimplePlayMax] = useState<number>(60);
  const [simpleRestMin, setSimpleRestMin] = useState<number>(15);
  const [simpleRestMax, setSimpleRestMax] = useState<number>(15);

  const [dailyLimitEnabled, setDailyLimitEnabled] = useState<boolean>(false);
  const [dailyLimitHours, setDailyLimitHours] = useState<number>(12);

  const [activeWindowEnabled, setActiveWindowEnabled] = useState<boolean>(false);
  const [activeWindowStart, setActiveWindowStart] = useState<string>('09:00');
  const [activeWindowEnd, setActiveWindowEnd] = useState<string>('02:00');
  const [activeWindowJitter, setActiveWindowJitter] = useState<number>(15);
  const [customNotice, setCustomNotice] = useState<string | null>(null);

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

  // Sync custom pattern selection
  const activeCustomPattern = React.useMemo<CustomPattern>(() => {
    return {
      id: selectedPatternId,
      name: patternName.trim() || 'My Pattern',
      steps: patternSteps,
      dailyLimitHours: dailyLimitEnabled ? dailyLimitHours : undefined,
      activeWindow: activeWindowEnabled
        ? {
            start: activeWindowStart,
            end: activeWindowEnd,
            edgeJitterMin: activeWindowJitter
          }
        : undefined
    };
  }, [
    selectedPatternId,
    patternName,
    patternSteps,
    dailyLimitEnabled,
    dailyLimitHours,
    activeWindowEnabled,
    activeWindowStart,
    activeWindowEnd,
    activeWindowJitter
  ]);

  // Load a saved pattern into editor
  const handleSelectPattern = (id: string) => {
    setSelectedPatternId(id);
    const pat = customPatterns.find(p => p.id === id);
    if (pat) {
      setPatternName(pat.name);
      setPatternSteps(pat.steps.map(s => ({ ...s })));
      if (pat.dailyLimitHours !== undefined) {
        setDailyLimitEnabled(true);
        setDailyLimitHours(pat.dailyLimitHours);
      } else {
        setDailyLimitEnabled(false);
      }
      if (pat.activeWindow) {
        setActiveWindowEnabled(true);
        setActiveWindowStart(pat.activeWindow.start);
        setActiveWindowEnd(pat.activeWindow.end);
        setActiveWindowJitter(pat.activeWindow.edgeJitterMin ?? 15);
      } else {
        setActiveWindowEnabled(false);
      }
    }
  };

  const loadOriginalExample = () => {
    setPatternSteps([
      { type: 'play', minMin: 60, maxMin: 60 },
      { type: 'rest', minMin: 5, maxMin: 5 },
      { type: 'play', minMin: 120, maxMin: 120 },
      { type: 'rest', minMin: 60, maxMin: 60 }
    ]);
    setPatternName('My original example');
    setCustomNotice('Loaded original example pattern.');
    setTimeout(() => setCustomNotice(null), 3000);
  };

  const handleSavePattern = async (asNew: boolean = false) => {
    const trimmed = patternName.trim();
    if (!trimmed) {
      setCustomNotice('Pattern name cannot be empty.');
      return;
    }
    const isBuiltin = selectedPatternId === BUILTIN_CUSTOM_PATTERN.id;
    const targetId = asNew || isBuiltin ? `pat_${Date.now()}` : selectedPatternId;
    const newPat: CustomPattern = {
      id: targetId,
      name: trimmed,
      steps: patternSteps,
      dailyLimitHours: dailyLimitEnabled ? dailyLimitHours : undefined,
      activeWindow: activeWindowEnabled
        ? {
            start: activeWindowStart,
            end: activeWindowEnd,
            edgeJitterMin: activeWindowJitter
          }
        : undefined
    };
    try {
      await saveCustomPattern(newPat);
      setSelectedPatternId(targetId);
      setCustomNotice(asNew || isBuiltin ? 'Saved as new custom pattern.' : 'Pattern saved.');
      setTimeout(() => setCustomNotice(null), 3000);
    } catch (e: any) {
      setCustomNotice(e?.message || 'Failed to save pattern.');
    }
  };

  const handleDeletePattern = async () => {
    if (selectedPatternId === BUILTIN_CUSTOM_PATTERN.id) {
      setCustomNotice('Cannot delete the built-in pattern.');
      return;
    }
    await deleteCustomPattern(selectedPatternId);
    handleSelectPattern(BUILTIN_CUSTOM_PATTERN.id);
    setCustomNotice('Pattern deleted.');
    setTimeout(() => setCustomNotice(null), 3000);
  };

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

  // Live average play per day
  const avgPlayCalculation = React.useMemo(() => {
    let playMid = 0;
    let restMid = 0;
    for (const s of patternSteps) {
      const mid = (s.minMin + s.maxMin) / 2;
      if (s.type === 'play') playMid += mid;
      else restMid += mid;
    }
    const totalMid = playMid + restMid;
    if (totalMid === 0) return { hours: 0, isHigh: false };
    const fraction = playMid / totalMid;
    let dailyPlay = fraction * 24;
    if (dailyLimitEnabled && dailyLimitHours > 0) {
      dailyPlay = Math.min(dailyLimitHours, dailyPlay);
    }
    const hours = Math.round(dailyPlay * 10) / 10;
    return {
      hours,
      isHigh: hours > 16
    };
  }, [patternSteps, dailyLimitEnabled, dailyLimitHours]);

  const hasExactSteps = React.useMemo(() => {
    return patternSteps.some(s => s.minMin === s.maxMin);
  }, [patternSteps]);

  const showExactMultiTrackNotice = mode === 'CUSTOM' && selectedAppIds.length > 1 && hasExactSteps;

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
    } else if (mode === 'CUSTOM') {
      if (selectedAppIds.length < 1 || selectedAppIds.length > 10) return 'Select between 1 and 10 games for Custom mode';
      if (!patternName.trim()) return 'Enter a pattern name';
      if (patternName.trim().length > 40) return 'Pattern name must be 40 characters or fewer';
      if (patternSteps.length < 2 || patternSteps.length > 12) return 'Pattern must have between 2 and 12 steps';
      const hasPlay = patternSteps.some(s => s.type === 'play');
      const hasRest = patternSteps.some(s => s.type === 'rest');
      if (!hasPlay || !hasRest) return 'Pattern must have at least one play step and one rest step';
      for (let i = 0; i < patternSteps.length; i++) {
        const s = patternSteps[i]!;
        if (s.minMin > s.maxMin) return `Step ${i + 1}: Minimum duration cannot exceed maximum duration`;
        if (s.type === 'play') {
          if (s.minMin < 5 || s.maxMin > 480) return `Step ${i + 1}: Play steps must be between 5 and 480 minutes`;
        } else {
          if (s.minMin < 1 || s.maxMin > 60) return 'Breaks are limited to 60 minutes.';
        }
      }
    }
    return null;
  }, [enabledGames, selectedAppIds, mode, quotas, goals, patternName, patternSteps]);

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
          isFirstBlockOfRun: true,
          customPattern: mode === 'CUSTOM' ? activeCustomPattern : undefined
        },
        8
      );
    } catch {
      return [];
    }
  }, [selectedAppIds, mode, quotas, selectedProfile, previewSeed, activeCustomPattern]);

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
      profileId: selectedProfile.id,
      customPattern: mode === 'CUSTOM' ? activeCustomPattern : undefined
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
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
            },
            {
              id: 'CUSTOM' as RunMode,
              title: 'Custom (Your Pattern)',
              desc: 'You set the play and rest times.',
              icon: Sliders
            }
          ].map(m => {
            const Icon = m.icon;
            const isSelected = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => selectMode(m.id)}
                className={`p-3.5 rounded-2xl text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'liquid-glass-card-glow border-purple-400/60 shadow-[0_0_20px_rgba(139,92,246,0.25)]'
                    : 'liquid-glass-card'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`p-1.5 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-purple-500/25 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                        : 'bg-white/[0.04] text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-white leading-tight">{m.title}</h4>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{m.desc}</p>
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

        {showExactMultiTrackNotice && (
          <p className="text-xs text-slate-400 italic pt-1">
            Games start at different moments, so they never switch at the same time.
          </p>
        )}
      </div>

      {/* 3. Human Profile Selection OR Custom Play and Rest Times */}
      {mode !== 'CUSTOM' ? (
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
      ) : (
        <div className="space-y-4 liquid-glass-card p-5 rounded-2xl border border-white/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                3. Your play and rest times
              </label>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Define the repeating sequence of play and rest steps.
              </p>
            </div>

            {/* Pattern Selector & Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedPatternId}
                onChange={e => handleSelectPattern(e.target.value)}
                className="bg-[#0B0E14] border border-[#232B3D] text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500 font-medium"
              >
                {customPatterns.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.id === BUILTIN_CUSTOM_PATTERN.id ? '(Built-in)' : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleSavePattern(false)}
                disabled={selectedPatternId === BUILTIN_CUSTOM_PATTERN.id}
                className="px-2.5 py-1.5 text-xs liquid-glass-btn-secondary disabled:opacity-40 flex items-center gap-1"
                title={selectedPatternId === BUILTIN_CUSTOM_PATTERN.id ? 'Built-in pattern is read-only. Use Save As New.' : 'Save changes'}
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>

              <button
                type="button"
                onClick={() => handleSavePattern(true)}
                className="px-2.5 py-1.5 text-xs liquid-glass-btn-secondary flex items-center gap-1"
                title="Save as a new pattern"
              >
                Save as new
              </button>

              <button
                type="button"
                onClick={handleDeletePattern}
                disabled={selectedPatternId === BUILTIN_CUSTOM_PATTERN.id}
                className="px-2.5 py-1.5 text-xs text-rose-300 hover:text-rose-200 liquid-glass-btn-secondary disabled:opacity-40 flex items-center gap-1"
                title="Delete this pattern"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>

          {customNotice && (
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs flex items-center gap-2">
              <span>{customNotice}</span>
            </div>
          )}

          {/* Pattern Name & View Switcher */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Pattern Name:</span>
              <input
                type="text"
                maxLength={40}
                value={patternName}
                onChange={e => setPatternName(e.target.value)}
                placeholder="Pattern name"
                className="flex-1 bg-[#0B0E14] border border-[#232B3D] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <div className="bg-[#0B0E14] p-1 rounded-xl border border-white/[0.06] flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCustomView('simple')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    customView === 'simple'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Simple view
                </button>
                <button
                  type="button"
                  onClick={() => setCustomView('advanced')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    customView === 'advanced'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Advanced view
                </button>
              </div>

              <button
                type="button"
                onClick={loadOriginalExample}
                className="px-2.5 py-1 text-xs text-purple-300 hover:text-purple-200 liquid-glass-btn-secondary flex items-center gap-1"
                title="Reset to 60m play / 5m rest / 120m play / 60m rest"
              >
                <RotateCcw className="w-3 h-3" /> Load my original example
              </button>
            </div>
          </div>

          {/* View Content */}
          {customView === 'simple' ? (
            <div className="p-4 rounded-xl bg-black/20 border border-white/[0.06] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <span className="text-xs text-slate-300 font-medium">Simple 2-Step Cycle (Play & Rest)</span>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={sameEachTime}
                    onChange={e => {
                      const checked = e.target.checked;
                      setSameEachTime(checked);
                      if (checked) {
                        setSimplePlayMax(simplePlayMin);
                        setSimpleRestMax(simpleRestMin);
                        setPatternSteps([
                          { type: 'play', minMin: simplePlayMin, maxMin: simplePlayMin },
                          { type: 'rest', minMin: simpleRestMin, maxMin: simpleRestMin }
                        ]);
                      }
                    }}
                    className="rounded bg-[#080B11] border-white/20 text-purple-600 focus:ring-0"
                  />
                  <span>Same each time (exact minutes)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Play Range */}
                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <span className="text-xs font-semibold text-emerald-400 block">Play Duration (minutes)</span>
                  {sameEachTime ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Exact:</span>
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={simplePlayMin}
                        onChange={e => {
                          const val = Math.max(5, Math.min(480, parseInt(e.target.value) || 5));
                          setSimplePlayMin(val);
                          setSimplePlayMax(val);
                          setPatternSteps([
                            { type: 'play', minMin: val, maxMin: val },
                            { type: 'rest', minMin: simpleRestMin, maxMin: simpleRestMax }
                          ]);
                        }}
                        className="w-20 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                      />
                      <span className="text-xs text-slate-400">min (5 to 480)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Min:</span>
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={simplePlayMin}
                        onChange={e => {
                          const val = Math.max(5, Math.min(480, parseInt(e.target.value) || 5));
                          setSimplePlayMin(val);
                          setPatternSteps([
                            { type: 'play', minMin: val, maxMin: Math.max(val, simplePlayMax) },
                            { type: 'rest', minMin: simpleRestMin, maxMin: simpleRestMax }
                          ]);
                        }}
                        className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                      />
                      <span className="text-xs text-slate-400">Max:</span>
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={simplePlayMax}
                        onChange={e => {
                          const val = Math.max(simplePlayMin, Math.min(480, parseInt(e.target.value) || simplePlayMin));
                          setSimplePlayMax(val);
                          setPatternSteps([
                            { type: 'play', minMin: simplePlayMin, maxMin: val },
                            { type: 'rest', minMin: simpleRestMin, maxMin: simpleRestMax }
                          ]);
                        }}
                        className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                      />
                      <span className="text-xs text-slate-400">min</span>
                    </div>
                  )}
                </div>

                {/* Rest Range */}
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2">
                  <span className="text-xs font-semibold text-amber-400 block">Rest Duration (minutes)</span>
                  {sameEachTime ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Exact:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={simpleRestMin}
                        onChange={e => {
                          const val = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
                          setSimpleRestMin(val);
                          setSimpleRestMax(val);
                          setPatternSteps([
                            { type: 'play', minMin: simplePlayMin, maxMin: simplePlayMax },
                            { type: 'rest', minMin: val, maxMin: val }
                          ]);
                        }}
                        className="w-20 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                      />
                      <span className="text-xs text-slate-400">min (1 to 60)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Min:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={simpleRestMin}
                        onChange={e => {
                          const val = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
                          setSimpleRestMin(val);
                          setPatternSteps([
                            { type: 'play', minMin: simplePlayMin, maxMin: simplePlayMax },
                            { type: 'rest', minMin: val, maxMin: Math.max(val, simpleRestMax) }
                          ]);
                        }}
                        className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                      />
                      <span className="text-xs text-slate-400">Max:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={simpleRestMax}
                        onChange={e => {
                          const val = Math.max(simpleRestMin, Math.min(60, parseInt(e.target.value) || simpleRestMin));
                          setSimpleRestMax(val);
                          setPatternSteps([
                            { type: 'play', minMin: simplePlayMin, maxMin: simplePlayMax },
                            { type: 'rest', minMin: simpleRestMin, maxMin: val }
                          ]);
                        }}
                        className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                      />
                      <span className="text-xs text-slate-400">min</span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400">Breaks are limited to 60 minutes.</p>
                </div>
              </div>
            </div>
          ) : (
            /* Advanced View */
            <div className="space-y-3">
              <div className="space-y-2">
                {patternSteps.map((step, idx) => {
                  const isPlay = step.type === 'play';
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#080B11]/60 border border-white/[0.06] gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] font-mono text-slate-500 w-5">#{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...patternSteps];
                            const nextType = isPlay ? 'rest' : 'play';
                            next[idx] = {
                              type: nextType,
                              minMin: nextType === 'play' ? 60 : 15,
                              maxMin: nextType === 'play' ? 60 : 15
                            };
                            setPatternSteps(next);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                            isPlay
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {step.type}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 flex-1 max-w-xs justify-center">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">Min:</span>
                          <input
                            type="number"
                            min={isPlay ? 5 : 1}
                            max={isPlay ? 480 : 60}
                            value={step.minMin}
                            onChange={e => {
                              const v = parseInt(e.target.value) || (isPlay ? 5 : 1);
                              const clamped = Math.max(isPlay ? 5 : 1, Math.min(isPlay ? 480 : 60, v));
                              const next = [...patternSteps];
                              next[idx] = { ...step, minMin: clamped, maxMin: Math.max(clamped, step.maxMin) };
                              setPatternSteps(next);
                            }}
                            className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                          />
                        </div>
                        <span className="text-slate-600">to</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">Max:</span>
                          <input
                            type="number"
                            min={step.minMin}
                            max={isPlay ? 480 : 60}
                            value={step.maxMin}
                            onChange={e => {
                              const v = parseInt(e.target.value) || step.minMin;
                              const clamped = Math.max(step.minMin, Math.min(isPlay ? 480 : 60, v));
                              const next = [...patternSteps];
                              next[idx] = { ...step, maxMin: clamped };
                              setPatternSteps(next);
                            }}
                            className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                          />
                          <span className="text-[11px] text-slate-400">m</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (idx > 0) {
                              const next = [...patternSteps];
                              const temp = next[idx]!;
                              next[idx] = next[idx - 1]!;
                              next[idx - 1] = temp;
                              setPatternSteps(next);
                            }
                          }}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                          title="Move step up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (idx < patternSteps.length - 1) {
                              const next = [...patternSteps];
                              const temp = next[idx]!;
                              next[idx] = next[idx + 1]!;
                              next[idx + 1] = temp;
                              setPatternSteps(next);
                            }
                          }}
                          disabled={idx === patternSteps.length - 1}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                          title="Move step down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (patternSteps.length > 2) {
                              setPatternSteps(patternSteps.filter((_, i) => i !== idx));
                            }
                          }}
                          disabled={patternSteps.length <= 2}
                          className="p-1 text-slate-400 hover:text-rose-400 disabled:opacity-20"
                          title="Delete step"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Step Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (patternSteps.length < 12) {
                      setPatternSteps([...patternSteps, { type: 'play', minMin: 60, maxMin: 60 }]);
                    }
                  }}
                  disabled={patternSteps.length >= 12}
                  className="px-3 py-1.5 text-xs liquid-glass-btn-secondary flex items-center gap-1 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" /> Add play step
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (patternSteps.length < 12) {
                      setPatternSteps([...patternSteps, { type: 'rest', minMin: 15, maxMin: 15 }]);
                    }
                  }}
                  disabled={patternSteps.length >= 12}
                  className="px-3 py-1.5 text-xs liquid-glass-btn-secondary flex items-center gap-1 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" /> Add rest step
                </button>
                <span className="text-[11px] text-slate-500 ml-auto font-mono">
                  {patternSteps.length} / 12 steps
                </span>
              </div>
            </div>
          )}

          {/* Live average play per day */}
          <div className="p-3 rounded-xl bg-[#080B11]/60 border border-white/[0.06] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Average play per day:</span>
              <span className="font-mono text-purple-300 font-semibold">{avgPlayCalculation.hours} h</span>
            </div>
            {avgPlayCalculation.isHigh && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Far above a typical human pattern (16 h+ of play per day).</span>
              </div>
            )}
          </div>

          {/* Optional Toggles: Daily Limit & Active Window */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-[#080B11]/60 border border-white/[0.06] space-y-2">
              <label className="flex items-center justify-between cursor-pointer text-xs text-slate-300 font-medium">
                <span>Daily Limit Hours</span>
                <input
                  type="checkbox"
                  checked={dailyLimitEnabled}
                  onChange={e => setDailyLimitEnabled(e.target.checked)}
                  className="rounded bg-[#080B11] border-white/20 text-purple-600 focus:ring-0"
                />
              </label>
              {dailyLimitEnabled && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-400">Limit:</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={dailyLimitHours}
                    onChange={e => setDailyLimitHours(Math.max(1, Math.min(24, parseInt(e.target.value) || 1)))}
                    className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-400">hours / day</span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[#080B11]/60 border border-white/[0.06] space-y-2">
              <label className="flex items-center justify-between cursor-pointer text-xs text-slate-300 font-medium">
                <span>Active Window (Wake / Sleep)</span>
                <input
                  type="checkbox"
                  checked={activeWindowEnabled}
                  onChange={e => setActiveWindowEnabled(e.target.checked)}
                  className="rounded bg-[#080B11] border-white/20 text-purple-600 focus:ring-0"
                />
              </label>
              {activeWindowEnabled && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <span className="text-[11px] text-slate-400">From:</span>
                  <input
                    type="text"
                    value={activeWindowStart}
                    onChange={e => setActiveWindowStart(e.target.value)}
                    placeholder="09:00"
                    className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-400">To:</span>
                  <input
                    type="text"
                    value={activeWindowEnd}
                    onChange={e => setActiveWindowEnd(e.target.value)}
                    placeholder="02:00"
                    className="w-16 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-400">Jitter:</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={activeWindowJitter}
                    onChange={e => setActiveWindowJitter(Math.max(0, Math.min(15, parseInt(e.target.value) || 0)))}
                    className="w-12 bg-[#0B0E14] border border-[#232B3D] rounded px-2 py-1 text-xs text-white font-mono"
                  />
                  <span className="text-[11px] text-slate-400">m</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
