import React, { useEffect, useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { NavRail } from './components/NavRail';
import { CommandPalette } from './components/CommandPalette';
import { DashboardScreen } from './screens/DashboardScreen';
import { NewRunScreen } from './screens/NewRunScreen';
import { PlanScreen } from './screens/PlanScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { GamesScreen } from './screens/GamesScreen';
import { ProfilesScreen } from './screens/ProfilesScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { LogsScreen } from './screens/LogsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { OnboardingWizard } from './screens/OnboardingWizard';
import { LaunchPickerCard } from './components/LaunchPickerCard';
import { useStore, NavRoute } from './store/useStore';

export const App: React.FC = () => {
  const currentRoute = useStore(state => state.currentRoute);
  const navigate = useStore(state => state.navigate);
  const settings = useStore(state => state.settings);
  const isLoading = useStore(state => state.isLoading);
  const loadInitialData = useStore(state => state.loadInitialData);

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Global Keyboard Shortcuts (Ctrl+K, 1-9 navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle Command Palette with Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen(prev => !prev);
        return;
      }

      // If typing inside an input/textarea/select, do not trigger single-key nav
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      // Quick 1-9 route jumping
      const routeMap: Record<string, NavRoute> = {
        '1': 'dashboard',
        '2': 'new-run',
        '3': 'plan',
        '4': 'goals',
        '5': 'games',
        '6': 'profiles',
        '7': 'history',
        '8': 'logs',
        '9': 'settings'
      };

      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        window.hourforge?.system?.openLaunchPicker?.();
        return;
      }

      const targetRoute = routeMap[e.key];
      if (!isPaletteOpen && targetRoute) {
        e.preventDefault();
        navigate(targetRoute);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaletteOpen, navigate]);

  const isPickerCard = window.location.hash.startsWith('#launch-picker-card');
  if (isPickerCard) {
    return <LaunchPickerCard />;
  }

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-[#080B11] flex items-center justify-center text-slate-500 font-mono text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
          <span>Loading HourForge...</span>
        </div>
      </div>
    );
  }

  // Show onboarding wizard on initial launch before firstRunCompleted
  const showWizard = settings && settings.firstRunCompleted === false;

  return (
    <div className="h-screen w-screen flex flex-col liquid-glass-container text-[#F1F5F9] overflow-hidden select-none relative">
      <TitleBar />

      {showWizard ? (
        <OnboardingWizard />
      ) : (
        <div className="flex-1 flex overflow-hidden relative z-10">
          <NavRail />
          <main className="flex-1 flex flex-col overflow-hidden bg-transparent">
            {currentRoute === 'dashboard' && <DashboardScreen />}
            {currentRoute === 'new-run' && <NewRunScreen />}
            {currentRoute === 'plan' && <PlanScreen />}
            {currentRoute === 'goals' && <GoalsScreen />}
            {currentRoute === 'games' && <GamesScreen />}
            {currentRoute === 'profiles' && <ProfilesScreen />}
            {currentRoute === 'history' && <HistoryScreen />}
            {currentRoute === 'logs' && <LogsScreen />}
            {currentRoute === 'settings' && <SettingsScreen />}
          </main>
        </div>
      )}

      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
    </div>
  );
};
