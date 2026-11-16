import React, { useState, useEffect } from 'react';
import {
  Flame,
  Gamepad2,
  Sliders,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Monitor
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { CREDIT_TEXT } from '../../shared/credit';

export const OnboardingWizard: React.FC = () => {
  const settings = useStore(state => state.settings);
  const saveSettings = useStore(state => state.saveSettings);
  const games = useStore(state => state.games);
  const profiles = useStore(state => state.profiles);

  const [step, setStep] = useState<number>(1);
  const [selectedProfileId, setSelectedProfileId] = useState('regular');
  const [autostartChecked, setAutostartChecked] = useState(true);
  const [steamStatus, setSteamStatus] = useState<{
    isInstalled: boolean;
    isRunning: boolean;
    isLoggedOn: boolean;
    personaName: string | null;
  } | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkSteam = async () => {
      try {
        const s = await window.hourforge.steam.getClientStatus();
        if (mounted) setSteamStatus(s);
      } catch {
        // ignore
      }
    };

    checkSteam();
    const timer = setInterval(checkSteam, 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const handleLaunchSteam = async () => {
    setIsLaunching(true);
    try {
      await window.hourforge.steam.launchClient();
    } catch {
      // ignore
    }
    setTimeout(() => setIsLaunching(false), 4000);
  };

  const handleFinish = async () => {
    if (!settings) return;

    await saveSettings({
      ...settings,
      startWithWindows: autostartChecked,
      startSteamAutomatically: true,
      closeSteamOnQuit: false,
      firstRunCompleted: true
    });
  };

  const canProceedFromStep2 = Boolean(steamStatus?.isLoggedOn);

  return (
    <div className="fixed inset-0 bg-[#080B11]/90 backdrop-blur-md z-50 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-xl liquid-glass-card-glow p-8 shadow-2xl flex flex-col justify-between min-h-[480px]">
        {/* Step Indicator Header */}
        <div>
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <Flame className="w-5 h-5 text-purple-400" />
              <span className="text-sm font-bold tracking-wider text-white">
                HOURFORGE SETUP
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Step {step} of 4
            </span>
          </div>

          {/* STEP 1: Welcome */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="w-12 h-12 bg-purple-500/15 border border-purple-400/30 rounded-2xl flex items-center justify-center text-purple-300 mb-2 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                <Flame className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white">Welcome to HourForge</h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                HourForge connects directly to your local Steam Desktop Client. Your games appear running with green "Stop" buttons in your Steam Library and "In-Game" status on your profile.
              </p>
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>No account credentials, passwords, or Steam Guard codes required</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Humanized random sessions with realistic break intervals</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Silent logon and tray execution from Windows boot (R1)</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Steam Client Connection */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 mb-2">
                <Monitor className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white">Connect Steam Desktop Client</h2>
              <p className="text-xs text-slate-400">
                HourForge automatically communicates with your running Steam desktop client via the official Steamworks IPC pipe.
              </p>

              <div className="pt-2">
                {steamStatus?.isLoggedOn ? (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/40 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2.5 text-emerald-400 font-semibold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      Connected as {steamStatus.personaName || 'Steam User'}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Steam desktop client is active and signed in. HourForge is ready to schedule your playtime.
                    </p>
                  </div>
                ) : steamStatus?.isRunning ? (
                  <div className="p-4 bg-amber-950/20 border border-amber-500/40 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                      <AlertTriangle className="w-4 h-4" />
                      Steam Client Running (Signed Out)
                    </div>
                    <p className="text-xs text-slate-300">
                      Steam is running on this PC, but no active user is signed in. Please sign in to your Steam desktop client to continue.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-[#0B0E14] border border-[#1A2234] rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-300">
                        <span className="font-semibold block text-slate-200">Steam Client Not Detected</span>
                        Launch the Steam desktop application to continue.
                      </div>
                      <button
                        onClick={handleLaunchSteam}
                        disabled={isLaunching}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
                      >
                        {isLaunching ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5" />
                        )}
                        Open Steam
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Games Library */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 mb-2">
                <Gamepad2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white">Configured Games</h2>
              <p className="text-xs text-slate-400">
                HourForge comes pre-configured with Wuthering Waves and Neverness to Everness.
              </p>

              <div className="space-y-2 pt-2">
                {games.map(g => (
                  <div
                    key={g.appId}
                    className="flex items-center justify-between p-3 bg-[#0B0E14] border border-[#1A2234] rounded-xl"
                  >
                    <div>
                      <h4 className="text-xs font-semibold text-white">{g.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">App ID: {g.appId}</p>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Preferences & Autostart */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 mb-2">
                <Sliders className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white">Rhythm & Boot Behavior</h2>
              <p className="text-xs text-slate-400">
                Choose default human schedule and enable silent boot with Windows.
              </p>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Human Profile Preset</label>
                  <select
                    value={selectedProfileId}
                    onChange={e => setSelectedProfileId(e.target.value)}
                    className="w-full bg-[#0B0E14] border border-[#232B3D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.session.minMin}-{p.session.maxMin}m sessions)
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center justify-between p-3 bg-[#0B0E14] border border-[#1A2234] rounded-xl cursor-pointer">
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">
                      Start HourForge with Windows (R1)
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Runs silently in system tray upon user logon.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autostartChecked}
                    onChange={e => setAutostartChecked(e.target.checked)}
                    className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
                  />
                </label>

                <div className="p-3 bg-[#0B0E14]/80 border border-white/[0.08] rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[11px] font-medium text-slate-300 block">{CREDIT_TEXT}</span>
                    <span className="text-[10px] text-slate-500 font-mono block">Free and open source software</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-[#1A2234] mt-6">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-[#1A2234] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && !canProceedFromStep2}
              className={`flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg shadow-md transition-colors ${
                step === 2 && !canProceedFromStep2
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'text-white bg-purple-600 hover:bg-purple-500'
              }`}
            >
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-1.5 px-6 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md transition-colors"
            >
              Complete Setup & Launch
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
