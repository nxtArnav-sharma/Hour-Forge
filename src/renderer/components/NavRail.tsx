import React from 'react';
import {
  LayoutDashboard,
  PlayCircle,
  CalendarClock,
  Target,
  Gamepad2,
  Sliders,
  History,
  Terminal,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useStore, NavRoute } from '../store/useStore';

interface NavItem {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'new-run', label: 'New Run', icon: PlayCircle },
  { id: 'plan', label: 'Plan & Timeline', icon: CalendarClock },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'games', label: 'Games Library', icon: Gamepad2 },
  { id: 'profiles', label: 'Profiles', icon: Sliders },
  { id: 'history', label: 'History & Stats', icon: History },
  { id: 'logs', label: 'Logs Viewer', icon: Terminal },
  { id: 'settings', label: 'Settings', icon: Settings }
];

export const NavRail: React.FC = () => {
  const currentRoute = useStore(state => state.currentRoute);
  const navigate = useStore(state => state.navigate);
  const engineState = useStore(state => state.engineState);
  const [collapsed, setCollapsed] = React.useState(false);

  const isRunning = engineState?.status === 'RUNNING';

  return (
    <aside
      className={`h-full bg-[#0C101A]/60 border-r border-white/[0.08] backdrop-blur-md flex flex-col justify-between transition-all duration-200 select-none ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <div className="flex flex-col py-3">
        <nav className="flex flex-col gap-1 px-2">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = currentRoute === item.id;
            const isDashboardWithRun = item.id === 'dashboard' && isRunning;

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600/30 via-indigo-600/20 to-transparent text-white border-l-2 border-purple-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    isActive
                      ? 'text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)] scale-105'
                      : 'text-slate-400'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}

                {/* Running status dot on Dashboard */}
                {isDashboardWithRun && (
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Collapse toggle button */}
      <div className="p-3 border-t border-white/[0.08] flex justify-end">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-colors"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
};
