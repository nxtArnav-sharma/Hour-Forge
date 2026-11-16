import React, { useState, useEffect, useRef } from 'react';
import { Search, LayoutDashboard, PlayCircle, Calendar, Target, Gamepad2, Users, History, Terminal, Settings, Pause, Square } from 'lucide-react';
import { useStore } from '../store/useStore';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Actions';
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  shortcut?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = useStore(state => state.navigate);
  const engineState = useStore(state => state.engineState);
  const stopRun = useStore(state => state.stopRun);
  const pauseAll = useStore(state => state.pauseAll);
  const resumeAll = useStore(state => state.resumeAll);

  const isRunning = engineState?.status === 'RUNNING';
  const isPaused = engineState?.status === 'PAUSED';

  const commands: CommandItem[] = [
    // Navigation
    {
      id: 'nav-dashboard',
      title: 'Go to Dashboard',
      category: 'Navigation',
      icon: LayoutDashboard,
      action: () => { navigate('dashboard'); onClose(); },
      shortcut: '1'
    },
    {
      id: 'nav-new-run',
      title: 'Go to New Run',
      category: 'Navigation',
      icon: PlayCircle,
      action: () => { navigate('new-run'); onClose(); },
      shortcut: '2'
    },
    {
      id: 'nav-plan',
      title: 'Go to Plan & Timeline',
      category: 'Navigation',
      icon: Calendar,
      action: () => { navigate('plan'); onClose(); },
      shortcut: '3'
    },
    {
      id: 'nav-goals',
      title: 'Go to Catch-Up Goals',
      category: 'Navigation',
      icon: Target,
      action: () => { navigate('goals'); onClose(); },
      shortcut: '4'
    },
    {
      id: 'nav-games',
      title: 'Go to Games Library',
      category: 'Navigation',
      icon: Gamepad2,
      action: () => { navigate('games'); onClose(); },
      shortcut: '5'
    },
    {
      id: 'nav-profiles',
      title: 'Go to Human Profiles',
      category: 'Navigation',
      icon: Users,
      action: () => { navigate('profiles'); onClose(); },
      shortcut: '6'
    },
    {
      id: 'nav-history',
      title: 'Go to Session History',
      category: 'Navigation',
      icon: History,
      action: () => { navigate('history'); onClose(); },
      shortcut: '7'
    },
    {
      id: 'nav-logs',
      title: 'Go to Live Logs',
      category: 'Navigation',
      icon: Terminal,
      action: () => { navigate('logs'); onClose(); },
      shortcut: '8'
    },
    {
      id: 'nav-settings',
      title: 'Go to Settings',
      category: 'Navigation',
      icon: Settings,
      action: () => { navigate('settings'); onClose(); },
      shortcut: '9'
    },

    // Actions
    ...(isRunning ? [
      {
        id: 'action-pause',
        title: 'Pause All Tracks',
        category: 'Actions' as const,
        icon: Pause,
        action: () => { pauseAll(); onClose(); }
      },
      {
        id: 'action-stop',
        title: 'Panic Stop (Stop Run)',
        category: 'Actions' as const,
        icon: Square,
        action: () => { stopRun(); onClose(); }
      }
    ] : isPaused ? [
      {
        id: 'action-resume',
        title: 'Resume All Tracks',
        category: 'Actions' as const,
        icon: PlayCircle,
        action: () => { resumeAll(); onClose(); }
      },
      {
        id: 'action-stop',
        title: 'Stop Run',
        category: 'Actions' as const,
        icon: Square,
        action: () => { stopRun(); onClose(); }
      }
    ] : [
      {
        id: 'action-start',
        title: 'Configure & Start New Run',
        category: 'Actions' as const,
        icon: PlayCircle,
        action: () => { navigate('new-run'); onClose(); }
      }
    ])
  ];

  const filtered = commands.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="liquid-glass-card-glow w-full max-w-xl overflow-hidden shadow-2xl border border-white/15"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-white/[0.02]">
          <Search className="w-5 h-5 text-purple-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or screen name..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching commands or screens found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-purple-600/30 text-white border border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                      : 'text-slate-300 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-purple-500/30 text-purple-200' : 'bg-white/5 text-slate-400'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-white">{item.title}</div>
                      <div className="text-[10px] text-slate-400">{item.category}</div>
                    </div>
                  </div>

                  {item.shortcut && (
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 rounded">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-white/5 bg-black/20 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Navigate with ↑ ↓ · Select with ↵</span>
          <span>HourForge Command Palette</span>
        </div>
      </div>
    </div>
  );
};
