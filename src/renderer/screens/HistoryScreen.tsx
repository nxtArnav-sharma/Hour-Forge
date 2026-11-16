import React, { useState, useMemo } from 'react';
import { History, Download, Search, Filter, Clock, Flame } from 'lucide-react';
import { useStore } from '../store/useStore';

export const HistoryScreen: React.FC = () => {
  const history = useStore(state => state.history);
  const games = useStore(state => state.games);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGameFilter, setSelectedGameFilter] = useState<number | 'ALL'>('ALL');

  // Compute stats
  const stats = useMemo(() => {
    const totalSec = history.reduce((acc, h) => acc + h.creditedSeconds, 0);
    const totalHours = (totalSec / 3600).toFixed(1);
    const totalSessions = history.length;

    const gameHours: Record<number, number> = {};
    for (const h of history) {
      gameHours[h.appId] = (gameHours[h.appId] || 0) + h.creditedSeconds;
    }
    let topAppId: number | null = null;
    let maxSec = 0;
    for (const [idStr, sec] of Object.entries(gameHours)) {
      if (sec > maxSec) {
        maxSec = sec;
        topAppId = parseInt(idStr, 10);
      }
    }
    const topGame = topAppId ? games.find(g => g.appId === topAppId) : null;

    return {
      totalHours,
      totalSessions,
      topGameName: topGame?.name || 'None'
    };
  }, [history, games]);

  // Filtered entries
  const filteredHistory = useMemo(() => {
    return history
      .filter(entry => {
        if (selectedGameFilter !== 'ALL' && entry.appId !== selectedGameFilter) {
          return false;
        }
        if (searchQuery.trim()) {
          const game = games.find(g => g.appId === entry.appId);
          const q = searchQuery.toLowerCase();
          const matchName = game?.name.toLowerCase().includes(q);
          const matchAppId = entry.appId.toString().includes(q);
          const matchSource = entry.source.toLowerCase().includes(q);
          if (!matchName && !matchAppId && !matchSource) return false;
        }
        return true;
      })
      .reverse();
  }, [history, games, selectedGameFilter, searchQuery]);

  const handleExportCsv = () => {
    if (history.length === 0) return;
    const headers = ['AppId', 'GameName', 'StartTimeUtc', 'CreditedSeconds', 'DurationMinutes', 'Source'];
    const rows = history.map(h => {
      const g = games.find(game => game.appId === h.appId);
      return [
        h.appId,
        `"${g?.name || 'Unknown'}"`,
        new Date(h.startUtc).toISOString(),
        h.creditedSeconds,
        (h.creditedSeconds / 60).toFixed(1),
        h.source
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hourforge_history_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-purple-400" />
            History & Session Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete verifiable log of every completed playtime session and exportable metrics.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={history.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold liquid-glass-btn-primary"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="liquid-glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Total Playtime Farmed</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">
            {stats.totalHours} <span className="text-sm font-normal text-slate-400">hours</span>
          </div>
        </div>

        <div className="liquid-glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Completed Sessions</span>
            <Flame className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">
            {stats.totalSessions} <span className="text-sm font-normal text-slate-400">sessions</span>
          </div>
        </div>

        <div className="liquid-glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Most Played Game</span>
            <History className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-white truncate">
            {stats.topGameName}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search sessions by game, App ID, or reason..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#121723] border border-[#1A2234] focus:border-purple-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={selectedGameFilter}
            onChange={e =>
              setSelectedGameFilter(
                e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10)
              )
            }
            className="bg-[#121723] border border-[#1A2234] text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none"
          >
            <option value="ALL">All Games</option>
            {games.map(g => (
              <option key={g.appId} value={g.appId}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="liquid-glass-card overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.03] text-slate-400 font-medium">
              <th className="py-3 px-4">Game</th>
              <th className="py-3 px-4">App ID</th>
              <th className="py-3 px-4">Start Time</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">End Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1A2234] font-mono">
            {filteredHistory.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                  No session logs found matching criteria.
                </td>
              </tr>
            ) : (
              filteredHistory.map((h, idx) => {
                const g = games.find(game => game.appId === h.appId);
                const durMin = (h.creditedSeconds / 60).toFixed(1);
                const dateStr = new Date(h.startUtc).toLocaleString();

                return (
                  <tr key={idx} className="hover:bg-[#161C2B] transition-colors">
                    <td className="py-3 px-4 font-sans font-medium text-slate-200">
                      {g?.name || 'Unknown Game'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">{h.appId}</td>
                    <td className="py-3 px-4 text-slate-400">{dateStr}</td>
                    <td className="py-3 px-4 text-purple-400 font-semibold">{durMin} min</td>
                    <td className="py-3 px-4 capitalize text-slate-300 font-sans">{h.source}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
