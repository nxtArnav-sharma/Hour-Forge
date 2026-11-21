import React, { useState, useEffect } from 'react';
import { Minus, X, Hourglass, Search } from 'lucide-react';
import { useStore } from '../store/useStore';

export const TitleBar: React.FC = () => {
  const engineState = useStore(state => state.engineState);
  const storeVersion = useStore(state => state.appVersion);
  const [version, setVersion] = useState<string>(storeVersion);

  useEffect(() => {
    if (storeVersion) {
      setVersion(storeVersion);
      return;
    }
    window.hourforge?.app?.getVersion?.().then(v => {
      if (v) setVersion(v.startsWith('v') ? v : `v${v}`);
    }).catch(() => {});
  }, [storeVersion]);

  const isRunning = engineState?.status === 'RUNNING';
  const isPaused = engineState?.status === 'PAUSED';

  return (
    <header className="h-10 w-full bg-[#080B11]/80 border-b border-white/[0.08] flex items-center justify-between px-3.5 drag-region select-none z-50 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-purple-500/15 border border-purple-400/30 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.3)]">
          <Hourglass className="w-3 h-3 text-purple-300" />
        </div>
        <span className="text-xs font-semibold tracking-wider bg-gradient-to-r from-white via-slate-100 to-purple-300 bg-clip-text text-transparent font-sans">
          HOURFORGE
        </span>
        {version && <span className="text-[10px] text-slate-500 font-mono">{version}</span>}

        {/* Engine status indicator badge */}
        <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-white/[0.08]">
          <div className="flex items-center gap-1.5 px-2 py-0.5 liquid-glass-pill text-[11px] font-mono">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isRunning
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                  : isPaused
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                  : 'bg-slate-500'
              }`}
            />
            <span className={isRunning ? 'text-emerald-300 font-medium' : isPaused ? 'text-amber-300' : 'text-slate-400'}>
              {engineState?.status || 'IDLE'}
            </span>
          </div>
        </div>
      </div>

      {/* Center/Right Actions & Window Controls */}
      <div className="flex items-center gap-2 no-drag">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
          className="px-2 py-0.5 liquid-glass-pill text-[10px] font-mono text-slate-400 hover:text-white hover:border-purple-400/40 flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Command Palette (Ctrl+K)"
        >
          <Search className="w-2.5 h-2.5 text-purple-400" />
          <span>Ctrl+K</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => window.hourforge.system.minimize()}
            className="h-7 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            title="Minimize to Tray"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.hourforge.system.close()}
            className="h-7 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/80 transition-colors"
            title="Close to Tray"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
