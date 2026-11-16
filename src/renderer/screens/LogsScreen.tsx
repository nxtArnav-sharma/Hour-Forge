import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal, Search, Shield } from 'lucide-react';
import { useStore } from '../store/useStore';

export const LogsScreen: React.FC = () => {
  const engineLogs = useStore(state => state.engineLogs);
  const helperLogs = useStore(state => state.helperLogs);

  const [activeTab, setActiveTab] = useState<'engine' | 'helper'>('engine');
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const logEndRef = useRef<HTMLDivElement>(null);

  const logs = activeTab === 'engine' ? engineLogs : helperLogs;

  const filteredLogs = useMemo(() => {
    return logs.filter(line => {
      if (levelFilter !== 'ALL') {
        if (!line.toUpperCase().includes(levelFilter)) return false;
      }
      if (searchQuery.trim()) {
        if (!line.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [logs, levelFilter, searchQuery]);

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  const handleExportDiagnostics = () => {
    // Redact sensitive patterns (passwords, tokens, keys)
    const redact = (str: string) =>
      str
        .replace(/(key|token|password|secret|SteamID)=([^&\s]+)/gi, '$1=[REDACTED]')
        .replace(/guard[:=]\s*\S+/gi, 'guard:[REDACTED]');

    const redactedEngine = engineLogs.map(redact).join('\n');
    const redactedHelper = helperLogs.map(redact).join('\n');
    const dump = `=== HOURFORGE DIAGNOSTICS EXPORT (${new Date().toISOString()}) ===\n\n--- ENGINE LOGS ---\n${redactedEngine}\n\n--- STEAM HELPER LOGS ---\n${redactedHelper}`;

    const blob = new Blob([dump], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hourforge_diagnostics_${new Date().toISOString().slice(0, 10)}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-hidden p-6 flex flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-purple-400" />
            Diagnostic Logs Viewer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time inspection of HourForge scheduler, lifecycle events, and Steam helper processes.
          </p>
        </div>

        <button
          onClick={handleExportDiagnostics}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold liquid-glass-btn-primary"
        >
          <Shield className="w-4 h-4" />
          Export Redacted Diagnostics
        </button>
      </div>

      {/* Tabs and Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 liquid-glass-card p-3">
        <div className="flex items-center gap-1 bg-[#080B11]/80 p-1 rounded-xl border border-white/[0.08]">
          <button
            onClick={() => setActiveTab('engine')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'engine'
                ? 'bg-purple-600/30 text-white border border-purple-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Engine ({engineLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('helper')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'helper'
                ? 'bg-purple-600/30 text-white border border-purple-400/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Steam helper ({helperLogs.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Level Filter */}
          <div className="flex items-center gap-1 bg-[#0B0E14] p-1 rounded-lg border border-[#1A2234] text-xs">
            {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map(lvl => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                  levelFilter === lvl
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-[#0B0E14] border border-[#1A2234] rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>

          {/* Auto Scroll toggle */}
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
            />
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>

      {/* Terminal Output Window */}
      <div className="flex-1 liquid-glass-card p-4 overflow-y-auto font-mono text-[11px] leading-relaxed select-text space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600">
            No log output available for current filter.
          </div>
        ) : (
          filteredLogs.map((line, idx) => {
            const isError = line.includes('ERROR') || line.includes('FAIL') || line.includes('ERR');
            const isWarn = line.includes('WARN');
            const isInfo = line.includes('INFO');

            let colorClass = 'text-slate-300';
            if (isError) colorClass = 'text-rose-400 font-medium';
            else if (isWarn) colorClass = 'text-amber-300';
            else if (isInfo) colorClass = 'text-slate-400';

            return (
              <div key={idx} className={`${colorClass} hover:bg-white/5 py-0.5 px-1 rounded`}>
                {line}
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
