import React, { useState, useMemo } from 'react';
import {
  Target,
  Play,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  TrendingUp,
  Tag,
  X
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';
import { useStore } from '../store/useStore';
import { useNumberTween } from '../hooks/useNumberTween';
import { CatchUpGoal } from '../../shared/models';
import { getGoalPlannedVsActual } from '../../core/goalPacing';

export const GoalsScreen: React.FC = () => {
  const goals = useStore(state => state.goals);
  const pacingReports = useStore(state => state.pacingReports);
  const games = useStore(state => state.games);
  const profiles = useStore(state => state.profiles);
  const history = useStore(state => state.history);
  const engineState = useStore(state => state.engineState);
  const startRun = useStore(state => state.startRun);
  const saveGoal = useStore(state => state.saveGoal);
  const deleteGoal = useStore(state => state.deleteGoal);
  const refreshPacingReport = useStore(state => state.refreshPacingReport);
  const checkFriendHours = useStore(state => state.checkFriendHours);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<CatchUpGoal | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<number>(0);
  const [targetHoursInput, setTargetHoursInput] = useState<string>('100');
  const [targetDateInput, setTargetDateInput] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [manualStartingHours, setManualStartingHours] = useState<string>('0');
  const [userLabelInput, setUserLabelInput] = useState<string>('');
  const [friendSteamId, setFriendSteamId] = useState<string>('');
  const [friendLoading, setFriendLoading] = useState<boolean>(false);
  const [friendResult, setFriendResult] = useState<{
    success: boolean;
    friendHours?: number;
    isPrivate?: boolean;
    message?: string;
  } | null>(null);

  // Calculate summary metrics
  const summary = useMemo(() => {
    let totalTarget = 0;
    let totalEffective = 0;
    let totalRemaining = 0;

    for (const g of goals) {
      const rep = pacingReports[g.appId];
      totalTarget += g.targetHours;
      if (rep) {
        totalEffective += rep.currentEffectiveHours;
        totalRemaining += rep.remainingHours;
      }
    }

    const avgCompletion = totalTarget > 0
      ? Math.min(100, Math.round((totalEffective / totalTarget) * 100))
      : 0;

    return {
      activeCount: goals.length,
      avgCompletion,
      totalRemaining: Math.round(totalRemaining * 10) / 10,
      totalTarget: Math.round(totalTarget * 10) / 10
    };
  }, [goals, pacingReports]);

  const tweenedAvg = useNumberTween(summary.avgCompletion);
  const tweenedRemaining = useNumberTween(summary.totalRemaining);
  const tweenedActive = useNumberTween(summary.activeCount);

  const openNewGoalModal = () => {
    setEditingGoal(null);
    setSelectedAppId(games[0]?.appId || 0);
    setTargetHoursInput('100');
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setTargetDateInput(d.toISOString().slice(0, 10));
    setManualStartingHours('0');
    setUserLabelInput('');
    setFriendSteamId('');
    setFriendResult(null);
    setIsModalOpen(true);
  };

  const openEditGoalModal = (g: CatchUpGoal) => {
    setEditingGoal(g);
    setSelectedAppId(g.appId);
    setTargetHoursInput(g.targetHours.toString());
    setTargetDateInput(g.targetDate);
    setManualStartingHours((g.manualStartingHours || 0).toString());
    setUserLabelInput(g.userLabel || '');
    setFriendSteamId('');
    setFriendResult(null);
    setIsModalOpen(true);
  };

  const handleFetchFriend = async () => {
    if (!friendSteamId.trim()) return;
    setFriendLoading(true);
    setFriendResult(null);
    try {
      const res = await checkFriendHours(selectedAppId, friendSteamId.trim());
      setFriendResult(res);
      if (res.success && res.friendHours !== undefined) {
        setTargetHoursInput(Math.ceil(res.friendHours).toString());
      }
    } catch {
      setFriendResult({ success: false, message: 'Friend hours check failed.' });
    } finally {
      setFriendLoading(false);
    }
  };

  const handleSaveGoal = async () => {
    const hours = parseFloat(targetHoursInput);
    if (isNaN(hours) || hours <= 0) return;

    const goalToSave: CatchUpGoal = {
      id: editingGoal?.id || `goal_${selectedAppId}`,
      appId: selectedAppId,
      targetHours: hours,
      targetDate: targetDateInput,
      createdAtUtc: editingGoal?.createdAtUtc || Date.now(),
      manualStartingHours: parseFloat(manualStartingHours) || 0,
      userLabel: userLabelInput.trim() || undefined,
      friendHours: friendResult?.friendHours !== undefined ? friendResult.friendHours : editingGoal?.friendHours,
      status: 'ACTIVE'
    };

    await saveGoal(goalToSave);
    await refreshPacingReport(selectedAppId);
    setIsModalOpen(false);
  };

  const handleDeleteGoal = async (id: string, appId: number) => {
    if (window.confirm('Delete this Catch-Up Goal?')) {
      await deleteGoal(id);
      await refreshPacingReport(appId);
    }
  };

  const handleStartCatchupRun = async (appId?: number) => {
    const prof = profiles.find(p => p.id === 'regular') || profiles[0]!;
    const targetsToRun = appId
      ? goals.filter(g => g.appId === appId)
      : goals;

    if (targetsToRun.length === 0) return;

    const tracks = targetsToRun.map(g => {
      const rep = pacingReports[g.appId];
      return {
        appId: g.appId,
        targetHours: rep ? rep.remainingHours : g.targetHours,
        dailyQuotaHours: rep ? rep.targetDailyHoursToday : undefined
      };
    });

    await startRun({
      mode: 'CATCHUP',
      tracks,
      profileId: prof.id
    });
  };

  const isRunning = engineState?.status === 'RUNNING';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0E14] text-[#E6EAF2] overflow-y-auto p-6 space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Target className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold tracking-tight text-white">Playtime Goals & Catch-Up Pacing</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Humanized pacing engine with daily quotas, 1-day safety buffer, and profile daily cap protection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {goals.length > 0 && !isRunning && (
            <button
              onClick={() => handleStartCatchupRun()}
              className="flex items-center gap-2 px-4 py-2 liquid-glass-btn-primary text-xs font-semibold"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Catch-Up Run ({goals.length} {goals.length === 1 ? 'Goal' : 'Goals'})</span>
            </button>
          )}

          <button
            onClick={openNewGoalModal}
            className="flex items-center gap-1.5 px-3.5 py-2 liquid-glass-btn-secondary text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Goal</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Strip */}
      <div className="grid grid-cols-4 gap-4">
        <div className="liquid-glass-card p-4">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Goals</span>
          <div className="text-2xl font-bold font-mono text-white mt-1">{Math.round(tweenedActive)}</div>
          <span className="text-[11px] text-slate-400">Tracked games</span>
        </div>

        <div className="liquid-glass-card p-4">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Overall Completion</span>
          <div className="text-2xl font-bold font-mono text-purple-400 mt-1">{Math.round(tweenedAvg)}%</div>
          <span className="text-[11px] text-slate-400">Total progress towards targets</span>
        </div>

        <div className="liquid-glass-card p-4">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Playtime Remaining</span>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">{tweenedRemaining.toFixed(1)} h</div>
          <span className="text-[11px] text-slate-400">Across all active goals</span>
        </div>

        <div className="liquid-glass-card p-4">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pacing Rules</span>
          <div className="text-xs font-semibold text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>1-Day Safety Buffer Active</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-0.5">±12% daily human variance</span>
        </div>
      </div>

      {/* Empty State */}
      {goals.length === 0 && (
        <div className="liquid-glass-card border-dashed p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-12">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-400/30 flex items-center justify-center text-purple-400 mb-4 shadow-[0_0_20px_rgba(168,85,247,0.3)]">
            <Target className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-white mb-1.5">No Playtime Goals Set</h2>
          <p className="text-xs text-slate-400 max-w-sm mb-5 leading-relaxed">
            Set target playtime and a target date for any game. HourForge will calculate daily quotas, project completion dates, and enforce your profile daily caps.
          </p>
          <button
            onClick={openNewGoalModal}
            className="flex items-center gap-2 px-5 py-2.5 liquid-glass-btn-primary text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Create Your First Goal</span>
          </button>
        </div>
      )}

      {/* Goals List */}
      <div className="space-y-6">
        {goals.map(goal => {
          const game = games.find(g => g.appId === goal.appId);
          const report = pacingReports[goal.appId];
          const currentHours = report?.currentEffectiveHours ?? (goal.manualStartingHours || 0);
          const targetHours = goal.targetHours;
          const percent = targetHours > 0 ? Math.min(100, Math.round((currentHours / targetHours) * 100)) : 0;
          const isFinished = percent >= 100;

          // Chart data
          const chartData = report
            ? getGoalPlannedVsActual(goal, report, history, Date.now())
            : [];

          // Progress ring math
          const radius = 38;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (percent / 100) * circumference;

          return (
            <div
              key={goal.id}
              className="liquid-glass-card p-5 space-y-5"
            >
              {/* Goal Card Header */}
              <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3.5">
                  {game?.headerImage ? (
                    <img
                      src={game.headerImage}
                      alt={game.name}
                      className="w-16 h-10 object-cover rounded-xl border border-white/[0.1]"
                    />
                  ) : (
                    <div className="w-16 h-10 bg-white/[0.05] rounded-xl flex items-center justify-center text-slate-400 text-xs font-mono font-bold">
                      {goal.appId}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{game?.name || `App ID ${goal.appId}`}</h3>
                      <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-[#1A2234]">
                        {goal.appId}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span>Target: <strong className="text-white font-mono">{goal.targetHours} h</strong></span>
                      <span>•</span>
                      <span>Deadline: <strong className="text-white font-mono">{goal.targetDate}</strong></span>
                      {goal.userLabel && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-purple-400">
                            <Tag className="w-3 h-3" />
                            <span>{goal.userLabel}</span>
                          </span>
                        </>
                      )}
                      {goal.friendHours !== undefined && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400">
                            Benchmark: <strong className="text-slate-300 font-mono">{goal.friendHours}h</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badge & Actions */}
                <div className="flex items-center gap-2.5">
                  {report && (
                    <div
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                        report.paceStatus === 'ACHIEVED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : report.paceStatus === 'AHEAD'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : report.paceStatus === 'ON_TRACK'
                          ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                          : report.paceStatus === 'BEHIND'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {report.paceStatus === 'ACHIEVED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {report.paceStatus === 'AHEAD' && <TrendingUp className="w-3.5 h-3.5" />}
                      {report.paceStatus === 'ON_TRACK' && <Clock className="w-3.5 h-3.5" />}
                      {report.paceStatus === 'BEHIND' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {(report.paceStatus === 'NOT_FEASIBLE' || report.paceStatus === 'MISSED_DEADLINE') && (
                        <AlertCircle className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {report.paceStatus === 'ACHIEVED' && 'Goal Achieved'}
                        {report.paceStatus === 'AHEAD' && `Ahead (+${report.paceDifferenceHours} h)`}
                        {report.paceStatus === 'ON_TRACK' && 'On Track'}
                        {report.paceStatus === 'BEHIND' && `Behind by ${Math.abs(report.paceDifferenceHours)} h`}
                        {report.paceStatus === 'NOT_FEASIBLE' && `Not Feasible (needs ${report.requiredDailyHours} h/d)`}
                        {report.paceStatus === 'MISSED_DEADLINE' && 'Missed Deadline'}
                      </span>
                    </div>
                  )}

                  {!isRunning && !isFinished && (
                    <button
                      onClick={() => handleStartCatchupRun(goal.appId)}
                      className="p-1.5 rounded-lg bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30 transition-colors"
                      title="Start Catch-Up Run for this game"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}

                  <button
                    onClick={() => openEditGoalModal(goal)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A2234] transition-colors"
                    title="Edit Goal"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteGoal(goal.id, goal.appId)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Delete Goal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Progress Ring & Core Pacing Info */}
              <div className="grid grid-cols-12 gap-5 items-center">
                {/* SVG Progress Ring */}
                <div className="col-span-3 flex items-center justify-center p-3 bg-[#0D111A] border border-[#1A2234] rounded-xl">
                  <div className="relative flex items-center justify-center">
                    <svg width="100" height="100" className="transform -rotate-90">
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        stroke="#1E2738"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        stroke="#A855F7"
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-500 ease-out"
                      />
                    </svg>

                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-base font-bold font-mono text-white">{percent}%</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {currentHours.toFixed(1)} / {targetHours}h
                      </span>
                    </div>
                  </div>
                </div>

                {/* Key Metrics Strip */}
                <div className="col-span-9 grid grid-cols-4 gap-3">
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Remaining</span>
                    <div className="text-lg font-bold font-mono text-white mt-0.5">
                      {report ? `${report.remainingHours.toFixed(1)} h` : '—'}
                    </div>
                    <span className="text-[10px] text-slate-400">To reach target</span>
                  </div>

                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Today's Quota</span>
                    <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">
                      {report ? `${report.targetDailyHoursToday.toFixed(1)} h` : '—'}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      ±12% variance ({report?.variationPct !== undefined ? `${(report.variationPct * 100).toFixed(0)}%` : '0%'})
                    </span>
                  </div>

                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Projected Finish</span>
                    <div className="text-sm font-bold font-mono text-cyan-400 mt-1">
                      {report ? report.projectedFinishDate : '—'}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {report ? `${report.daysRemaining} days remaining` : '—'}
                    </span>
                  </div>

                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">PC-On Needed</span>
                    <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
                      {report ? `${report.requiredPcOnHoursPerDay.toFixed(1)} h/d` : '—'}
                    </div>
                    <span className="text-[10px] text-slate-400">@ 80% duty cycle</span>
                  </div>
                </div>
              </div>

              {/* Feasibility Alert Banner (Item 4: plainly state required hours/day, no lecturing) */}
              {report && !report.isFeasible && report.feasibilityNotice && (
                <div className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-xl text-xs space-y-2">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-rose-300 font-semibold block">Goal Not Feasible Under Current Cap</strong>
                      <p className="text-rose-200/90 mt-0.5">{report.feasibilityNotice}</p>
                    </div>
                  </div>

                  {report.recommendedProfiles.length > 0 && (
                    <div className="flex items-center gap-2 pt-1 border-t border-rose-500/20 text-[11px] text-slate-300">
                      <span className="text-slate-400">Suggested profile with matching cap:</span>
                      {report.recommendedProfiles.map(p => (
                        <span
                          key={p.id}
                          className="px-2 py-0.5 rounded bg-purple-950/50 border border-purple-500/30 text-purple-300 font-medium"
                        >
                          {p.name} ({p.dailyCapHours}h/day cap)
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Planned vs Actual Recharts Visualizer */}
              {chartData.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                      Daily Playtime: Planned vs Actual (Hours)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Cap: {report?.profileDailyCapHours}h/day
                    </span>
                  </div>

                  <div className="h-36 w-full bg-[#0D111A] border border-[#1A2234] rounded-xl p-2.5">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1A2234" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#6B7690"
                          fontSize={10}
                          tickLine={false}
                          axisLine={{ stroke: '#1A2234' }}
                        />
                        <YAxis
                          stroke="#6B7690"
                          fontSize={10}
                          tickLine={false}
                          axisLine={{ stroke: '#1A2234' }}
                          tickFormatter={val => `${val}h`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#121723',
                            borderColor: '#232B3D',
                            borderRadius: '8px',
                            fontSize: '11px',
                            color: '#E6EAF2'
                          }}
                          formatter={(value: any, name: any) => [
                            `${value} h`,
                            name === 'plannedHours' ? 'Planned Quota' : 'Actual Credited'
                          ]}
                          labelFormatter={(label: any) => `Date: ${label}`}
                        />
                        <Legend
                          verticalAlign="top"
                          height={20}
                          formatter={(value: string) => (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {value === 'plannedHours' ? 'Planned Quota' : 'Actual Credited'}
                            </span>
                          )}
                        />
                        <Bar dataKey="plannedHours" fill="#8B5CF6" radius={[3, 3, 0, 0]} barSize={14} />
                        <Bar dataKey="actualHours" fill="#06B6D4" radius={[3, 3, 0, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Goal Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="liquid-glass-card-glow p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A2234]">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-400" />
                <h2 className="text-sm font-bold text-white">
                  {editingGoal ? 'Edit Catch-Up Goal' : 'Create Catch-Up Goal'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#1A2234]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Game Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target Game</label>
                <select
                  value={selectedAppId}
                  onChange={e => setSelectedAppId(parseInt(e.target.value, 10))}
                  disabled={editingGoal !== null}
                  className="w-full bg-[#0D111A] border border-[#1A2234] rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500"
                >
                  {games.map(g => (
                    <option key={g.appId} value={g.appId}>
                      {g.name} ({g.appId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Friend Hours Matcher */}
              <div className="p-3 bg-[#0D111A] border border-[#1A2234] rounded-xl space-y-2">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>Match Friend's Hours (Optional)</span>
                </span>
                <p className="text-[10px] text-slate-400">
                  Enter a friend's public 17-digit SteamID64 or vanity ID. Their ID is never stored on disk.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={friendSteamId}
                    onChange={e => setFriendSteamId(e.target.value)}
                    placeholder="76561198..."
                    className="flex-1 bg-[#121723] border border-[#1A2234] rounded-lg px-3 py-1.5 text-white font-mono text-xs outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleFetchFriend}
                    disabled={friendLoading || !friendSteamId.trim()}
                    className="px-3 py-1.5 bg-[#1E2738] hover:bg-[#28344B] disabled:opacity-50 text-white rounded-lg font-semibold text-[11px] transition-colors"
                  >
                    {friendLoading ? 'Fetching...' : 'Fetch'}
                  </button>
                </div>

                {friendResult && (
                  <div
                    className={`p-2 rounded text-[11px] ${
                      friendResult.success
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    }`}
                  >
                    {friendResult.success ? (
                      <span>
                        Found {friendResult.friendHours} hours on profile. Target set!
                      </span>
                    ) : (
                      <span>{friendResult.message || 'Could not fetch friend hours.'}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Goal Label / Note (Optional) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Goal Label / Note (Optional)
                </label>
                <input
                  type="text"
                  value={userLabelInput}
                  onChange={e => setUserLabelInput(e.target.value)}
                  placeholder="e.g. Rival benchmark, Summer catch-up"
                  className="w-full bg-[#0B0E14] border border-[#232B3D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Target Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target Hours</label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={targetHoursInput}
                    onChange={e => setTargetHoursInput(e.target.value)}
                    className="w-full bg-[#0D111A] border border-[#1A2234] rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target Date</label>
                  <input
                    type="date"
                    value={targetDateInput}
                    onChange={e => setTargetDateInput(e.target.value)}
                    className="w-full bg-[#0D111A] border border-[#1A2234] rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Manual Starting Hours (Fallback when no API key) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Manual Starting Hours (API Key Fallback)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualStartingHours}
                  onChange={e => setManualStartingHours(e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-[#0D111A] border border-[#1A2234] rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-purple-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Used if Steam Web API is not configured or offline.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1A2234]">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A2234] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGoal}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
              >
                Save Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
