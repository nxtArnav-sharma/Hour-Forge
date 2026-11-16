import React, { useState, useEffect } from 'react';
import {
  Settings,
  Power,
  Bell,
  Sliders,
  ExternalLink,
  CheckCircle,
  Save,
  Monitor,
  AlertTriangle,
  RefreshCw,
  Key,
  ShieldCheck,
  Trash2,
  Download,
  Upload,
  Archive,
  RotateCcw,
  FileCheck,
  X,
  Radio
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { AppSettings } from '../../shared/models';
import { BackupPreview, AutoBackupInfo } from '../../shared/backupSchema';
import happyPheobe1x from '../assets/ads/Happy_Pheobe_80.png';
import happyPheobe2x from '../assets/ads/Happy_Pheobe_160.png';
import pheobeSob1x from '../assets/ads/Pheobe_Sob_80.png';
import pheobeSob2x from '../assets/ads/Pheobe_Sob_160.png';

export const SettingsScreen: React.FC = () => {
  const settings = useStore(state => state.settings);
  const saveSettings = useStore(state => state.saveSettings);
  const testSteamApiKey = useStore(state => state.testSteamApiKey);
  const saveSteamApiKey = useStore(state => state.saveSteamApiKey);
  const removeSteamApiKey = useStore(state => state.removeSteamApiKey);
  const loadInitialData = useStore(state => state.loadInitialData);

  const [formSettings, setFormSettings] = useState<AppSettings | null>(settings);
  const [isSaved, setIsSaved] = useState(false);
  const [steamStatus, setSteamStatus] = useState<{
    isInstalled: boolean;
    isRunning: boolean;
    isLoggedOn: boolean;
    personaName: string | null;
    steamId64?: string | null;
  } | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  // Steam Web API state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [steamIdInput, setSteamIdInput] = useState(settings?.steamId64Override || '');
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
  } | null>(null);
  const [keySaveMessage, setKeySaveMessage] = useState<string | null>(null);

  // Backup & Restore state (M12)
  const [includeHistoryInExport, setIncludeHistoryInExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [autoBackups, setAutoBackups] = useState<AutoBackupInfo[]>([]);
  const [isLoadingAutoBackups, setIsLoadingAutoBackups] = useState(false);

  // Import preview modal state
  const [pendingImportFile, setPendingImportFile] = useState<{ filename: string; content: string } | null>(null);
  const [importPreview, setImportPreview] = useState<BackupPreview | null>(null);
  const [importMode, setImportMode] = useState<'MERGE' | 'REPLACE'>('MERGE');
  const [isApplyingImport, setIsApplyingImport] = useState(false);
  const [importModalError, setImportModalError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setFormSettings(settings);
      setSteamIdInput(settings.steamId64Override || '');
    }
  }, [settings]);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const s = await window.hourforge.steam.getClientStatus();
        if (mounted) setSteamStatus(s);
      } catch {
        // ignore
      }
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 2500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  if (!formSettings) return null;

  const handleLaunchSteam = async () => {
    setIsLaunching(true);
    try {
      await window.hourforge.steam.launchClient();
    } catch {
      // ignore
    }
    setTimeout(() => setIsLaunching(false), 3000);
  };

  const handleDiscordModeSelect = async (mode: 'hourforge' | 'none') => {
    if (!formSettings) return;
    const updated = { ...formSettings, discordPresenceMode: mode };
    setFormSettings(updated);
    await saveSettings(updated);
  };

  const handleTestKey = async () => {
    if (!apiKeyInput.trim() && !formSettings.hasSteamApiKey) {
      setTestResult({
        success: false,
        message: 'Please enter a Steam Web API key to test.'
      });
      return;
    }
    setIsTestingKey(true);
    setTestResult(null);
    try {
      const res = await testSteamApiKey(apiKeyInput.trim(), steamIdInput.trim() || undefined);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Connection failed.'
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      await saveSteamApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      setKeySaveMessage('API key encrypted and saved securely!');
      setTimeout(() => setKeySaveMessage(null), 3500);
    } catch (err: any) {
      setKeySaveMessage(`Failed to save key: ${err?.message || 'Error'}`);
    }
  };

  const handleRemoveApiKey = async () => {
    try {
      await removeSteamApiKey();
      setApiKeyInput('');
      setTestResult(null);
      setKeySaveMessage('API key removed.');
      setTimeout(() => setKeySaveMessage(null), 3000);
    } catch (err: any) {
      setKeySaveMessage(`Failed to remove key: ${err?.message || 'Error'}`);
    }
  };

  const handleSave = async () => {
    const updated: AppSettings = {
      ...formSettings,
      steamId64Override: steamIdInput.trim() || undefined
    };
    await saveSettings(updated);
    setFormSettings(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const refreshAutoBackups = async () => {
    setIsLoadingAutoBackups(true);
    try {
      const list = await window.hourforge.backup.getAutoBackups();
      setAutoBackups(list || []);
    } catch {
      // ignore
    } finally {
      setIsLoadingAutoBackups(false);
    }
  };

  useEffect(() => {
    refreshAutoBackups();
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setBackupNotice(null);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const defaultFilename = `hourforge-backup-${dateStr}.json`;
      const savePath = await window.hourforge.backup.selectSavePath(defaultFilename);
      if (!savePath) {
        setIsExporting(false);
        return;
      }
      const res = await window.hourforge.backup.exportBackup(includeHistoryInExport, savePath);
      setBackupNotice({
        type: 'success',
        message: `Backup exported to ${res.filename}`
      });
      await refreshAutoBackups();
    } catch (err: any) {
      setBackupNotice({
        type: 'error',
        message: err?.message || 'Export failed'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectImport = async () => {
    setBackupNotice(null);
    setImportModalError(null);
    try {
      const file = await window.hourforge.backup.selectImportFile();
      if (!file) return;

      const preview = await window.hourforge.backup.previewImport(file.content);
      setPendingImportFile(file);
      setImportPreview(preview);
      setImportMode('MERGE');
    } catch (err: any) {
      setBackupNotice({
        type: 'error',
        message: err?.message || 'Failed to inspect backup file'
      });
    }
  };

  const handleApplyImport = async () => {
    if (!pendingImportFile) return;
    setIsApplyingImport(true);
    setImportModalError(null);
    try {
      await window.hourforge.backup.applyImport(pendingImportFile.content, importMode);
      await loadInitialData();
      await refreshAutoBackups();
      setPendingImportFile(null);
      setImportPreview(null);
      setBackupNotice({
        type: 'success',
        message: `Backup restored successfully in ${importMode} mode.`
      });
    } catch (err: any) {
      setImportModalError(err?.message || 'Failed to apply backup');
    } finally {
      setIsApplyingImport(false);
    }
  };

  const handleRestoreAutoBackup = async (filename: string) => {
    if (
      !window.confirm(
        `Restore rolling snapshot "${filename}"? An automatic backup of current state will be created first.`
      )
    ) {
      return;
    }
    setBackupNotice(null);
    try {
      await window.hourforge.backup.restoreAutoBackup(filename);
      await loadInitialData();
      await refreshAutoBackups();
      setBackupNotice({
        type: 'success',
        message: `Restored snapshot "${filename}"`
      });
    } catch (err: any) {
      setBackupNotice({
        type: 'error',
        message: err?.message || 'Failed to restore snapshot'
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" />
            Application Settings
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure Steam client connection, Windows startup, power saving, and notifications.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold liquid-glass-btn-primary"
        >
          {isSaved ? <CheckCircle className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
          {isSaved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Steam Desktop Client Connection Card */}
        <div className="liquid-glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <Monitor className="w-4 h-4 text-purple-400" />
              Steam Desktop Client Connection
            </div>
            {steamStatus?.isLoggedOn ? (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3" />
                Connected as {steamStatus.personaName || 'User'}
              </span>
            ) : steamStatus?.isRunning ? (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                Steam Running (Signed Out)
              </span>
            ) : (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full">
                Steam Not Running
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="p-3 bg-[#0B0E14] border border-[#1A2234] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Steam Application Status
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {steamStatus?.isLoggedOn
                    ? `Communicating via local Steamworks IPC pipe.`
                    : steamStatus?.isRunning
                    ? 'Sign in to Steam on your desktop to enable playtime accumulation.'
                    : 'Steam desktop client is closed.'}
                </span>
              </div>
              <button
                onClick={handleLaunchSteam}
                disabled={isLaunching}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg transition-colors"
              >
                {isLaunching ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <ExternalLink className="w-3 h-3" />
                )}
                Open Steam
              </button>
            </div>

            <label className="flex items-center justify-between p-3 bg-[#0B0E14]/60 border border-[#1A2234] rounded-xl cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Start Steam Automatically
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Launches Steam with -silent on boot if not already running.
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.startSteamAutomatically !== false}
                onChange={e =>
                  setFormSettings({
                    ...formSettings,
                    startSteamAutomatically: e.target.checked
                  })
                }
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-[#0B0E14]/60 border border-[#1A2234] rounded-xl cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Close Steam when HourForge Quits
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Terminates the Steam desktop client process when quitting HourForge.
                </span>
              </div>
              <input
                type="checkbox"
                checked={Boolean(formSettings.closeSteamOnQuit)}
                onChange={e =>
                  setFormSettings({
                    ...formSettings,
                    closeSteamOnQuit: e.target.checked
                  })
                }
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
            </label>
          </div>
        </div>

        {/* Steam Web API Card */}
        <div className="liquid-glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <Key className="w-4 h-4 text-purple-400" />
              Steam Web API & Profile Hours
            </div>
            {formSettings.hasSteamApiKey ? (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                DPAPI Encrypted
              </span>
            ) : (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 rounded-full">
                Not Configured
              </span>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Connect your Steam Web API key to verify and compare profile playtime against HourForge credited hours. Polled every 15 minutes. Key is encrypted with Windows DPAPI and never logged or exported.
            </p>

            <div className="flex items-center justify-between p-2.5 bg-[#0B0E14] border border-[#1A2234] rounded-xl text-xs">
              <span className="text-slate-400 text-[11px]">Need an API key?</span>
              <a
                href="https://steamcommunity.com/dev/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-[11px] font-medium"
              >
                steamcommunity.com/dev/apikey
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {formSettings.hasSteamApiKey && (
              <div className="flex items-center justify-between p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                <div>
                  <span className="text-xs font-medium text-purple-300 block">
                    Saved API Key
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                    ●●●●●●●●●●●●●●●● (Windows DPAPI)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveApiKey}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                {formSettings.hasSteamApiKey ? 'Update API Key' : 'Enter Steam Web API Key'}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="32-character hexadecimal key"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  className="flex-1 bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-xs font-medium text-white rounded-xl transition-colors"
                >
                  Save
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                SteamID64 (Account ID)
              </label>
              <input
                type="text"
                placeholder={
                  steamStatus?.steamId64
                    ? `Auto-detected: ${steamStatus.steamId64}`
                    : 'Auto-detected when Steam is running, or enter 17-digit ID'
                }
                value={steamIdInput}
                onChange={e => setSteamIdInput(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#232B3D] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Leave blank to automatically use the currently logged-in Steam account.
              </span>
            </div>

            <div className="pt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTestingKey}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#1A2234] hover:bg-[#232D42] rounded-xl transition-colors border border-slate-700/50"
              >
                {isTestingKey ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                )}
                {isTestingKey ? 'Testing...' : 'Test Connection'}
              </button>

              {keySaveMessage && (
                <span className="text-xs text-emerald-400 font-medium">
                  {keySaveMessage}
                </span>
              )}
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  testResult.success
                    ? testResult.message?.includes('Private')
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  testResult.message?.includes('Private') ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  ) : (
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  )
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                )}
                <div>
                  <span className="font-semibold block">
                    {testResult.success
                      ? testResult.message?.includes('Private')
                        ? 'Profile Game Details Private'
                        : 'Connection Successful'
                      : 'Connection Failed'}
                  </span>
                  <span className="text-[11px] opacity-90 block mt-0.5">
                    {testResult.message}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Windows Startup & Tray Lifecycle */}
        <div className="liquid-glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Sliders className="w-4 h-4 text-purple-400" />
            Windows Autostart & Lifecycle (R1, R4)
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-[#080B11]/60 border border-white/[0.08] rounded-xl cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Start with Windows (Silent Logon)
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Launches HourForge silently into system tray on Windows boot (R1).
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.startWithWindows}
                onChange={e =>
                  setFormSettings({ ...formSettings, startWithWindows: e.target.checked })
                }
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-[#080B11]/60 border border-white/[0.08] rounded-xl cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Close Window to Tray
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Closing window destroys renderer process to free RAM while engine farms (R4).
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.closeToTray}
                onChange={e =>
                  setFormSettings({ ...formSettings, closeToTray: e.target.checked })
                }
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
            </label>
          </div>
        </div>

        {/* Power Management */}
        <div className="liquid-glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Power className="w-4 h-4 text-purple-400" />
            Power & Sleep Management
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-[#080B11]/60 border border-white/[0.08] rounded-xl cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Keep PC Awake During Play Sessions
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Uses Electron powerSaveBlocker to prevent PC sleeping while active.
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.keepAwake}
                onChange={e =>
                  setFormSettings({ ...formSettings, keepAwake: e.target.checked })
                }
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-[#080B11]/60 border border-white/[0.08] rounded-xl cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Pause & Freeze Credit on System Sleep
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Detects sleep gaps and freezes quota credit without penalty.
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.pauseOnSleep}
                onChange={e =>
                  setFormSettings({ ...formSettings, pauseOnSleep: e.target.checked })
                }
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
            </label>
          </div>
        </div>

        {/* Notifications */}
        <div className="liquid-glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Bell className="w-4 h-4 text-purple-400" />
            Notifications & Alerts
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-[#080B11]/60 border border-white/[0.08] rounded-xl cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Notify when Blocked / Steam Signed Out
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Fires Windows toast notification if Steam desktop client signs out.
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyOnBlocked}
                onChange={e =>
                  setFormSettings({ ...formSettings, notifyOnBlocked: e.target.checked })
                }
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-[#080B11]/60 border border-white/[0.08] rounded-xl cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Notify on Run Finished
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Fires Windows toast notification when a quota run completes.
                </span>
              </div>
              <input
                type="checkbox"
                checked={formSettings.notifyOnFinish}
                onChange={e =>
                  setFormSettings({ ...formSettings, notifyOnFinish: e.target.checked })
                }
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
            </label>
          </div>
        </div>

        {/* Discord Rich Presence (Task 2) */}
        <div className="liquid-glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <Radio className="w-4 h-4 text-purple-400" />
              Discord Rich Presence
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
              Pure-JS IPC
            </span>
          </div>

          <div className="p-3 bg-[#080B11]/60 border border-white/[0.08] rounded-xl text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-200 block font-semibold mb-1">
              Visibility Notice
            </strong>
            HourForge broadcasts active gameplay presence locally over Discord&apos;s IPC pipe. Active presence displays the current game title and rotating witty status lines while preserving your session elapsed timer.
          </div>

          {/* Two-option Radio Card Group */}
          <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Discord Rich Presence Mode">
            {/* Option 1: HourForge Rich Presence (recommended) */}
            <div
              role="radio"
              tabIndex={0}
              aria-checked={(formSettings.discordPresenceMode ?? 'hourforge') === 'hourforge'}
              onClick={() => handleDiscordModeSelect('hourforge')}
              onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleDiscordModeSelect('hourforge');
                }
              }}
              className={`relative flex items-center gap-4 p-3.5 rounded-xl border transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${
                (formSettings.discordPresenceMode ?? 'hourforge') === 'hourforge'
                  ? 'bg-purple-950/25 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.12)]'
                  : 'bg-[#080B11]/60 border-white/[0.08] hover:border-white/[0.15] opacity-80 hover:opacity-100'
              }`}
            >
              <img
                src={happyPheobe1x}
                srcSet={`${happyPheobe1x} 1x, ${happyPheobe2x} 2x`}
                alt="Happy Phoebe"
                width={72}
                height={72}
                className="w-[72px] h-[72px] object-contain rounded-lg flex-shrink-0 pointer-events-none"
                style={{ aspectRatio: '1 / 1' }}
              />
              <div className="flex-1 min-w-0 pr-6">
                <span className="text-xs font-semibold text-slate-200 block mb-1">
                  HourForge Rich Presence (recommended)
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Shows what you&apos;re farming, with a funny line that changes now and then. Includes funny lines for you and free publicity for us &lt;3 Please use this!!! We are free software, and every status helps people find us. Your Discord friends and shared servers can see the game name.
                </p>
              </div>
              <div
                className={`absolute top-3.5 right-3.5 w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                  (formSettings.discordPresenceMode ?? 'hourforge') === 'hourforge'
                    ? 'border-purple-400 bg-purple-500/20'
                    : 'border-slate-600 bg-transparent'
                }`}
              >
                {(formSettings.discordPresenceMode ?? 'hourforge') === 'hourforge' && (
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                )}
              </div>
            </div>

            {/* Option 2: Keep my usual Discord status */}
            <div
              role="radio"
              tabIndex={0}
              aria-checked={formSettings.discordPresenceMode === 'none'}
              onClick={() => handleDiscordModeSelect('none')}
              onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleDiscordModeSelect('none');
                }
              }}
              className={`relative flex items-center gap-4 p-3.5 rounded-xl border transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${
                formSettings.discordPresenceMode === 'none'
                  ? 'bg-purple-950/25 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.12)]'
                  : 'bg-[#080B11]/60 border-white/[0.08] hover:border-white/[0.15] opacity-80 hover:opacity-100'
              }`}
            >
              <img
                src={pheobeSob1x}
                srcSet={`${pheobeSob1x} 1x, ${pheobeSob2x} 2x`}
                alt="Sad Phoebe"
                width={72}
                height={72}
                className="w-[72px] h-[72px] object-contain rounded-lg flex-shrink-0 pointer-events-none"
                style={{ aspectRatio: '1 / 1' }}
              />
              <div className="flex-1 min-w-0 pr-6">
                <span className="text-xs font-semibold text-slate-200 block mb-1">
                  Keep my usual Discord status
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  It&apos;s okay, we understand. Don&apos;t worry, we will stay quiet. HourForge will not set any Discord status. Note: HourForge does not run the game itself, so Discord will usually show no game activity.
                </p>
              </div>
              <div
                className={`absolute top-3.5 right-3.5 w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                  formSettings.discordPresenceMode === 'none'
                    ? 'border-purple-400 bg-purple-500/20'
                    : 'border-slate-600 bg-transparent'
                }`}
              >
                {formSettings.discordPresenceMode === 'none' && (
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Backup & Restore (M12) */}
        <div className="liquid-glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <Archive className="w-4 h-4 text-purple-400" />
              Backup &amp; Restore
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
              Schema v1
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Export or restore your tracked games, human profiles, default templates, catch-up goals, and optional session history.
            <strong className="text-slate-300 font-semibold block mt-1">
              Zero secret leaks: Steam API keys, SteamIDs, passwords, and friend IDs are strictly omitted from backups.
            </strong>
          </p>

          {backupNotice && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                backupNotice.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {backupNotice.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{backupNotice.message}</span>
            </div>
          )}

          {/* Export section */}
          <div className="p-4 bg-[#0B0E14]/60 border border-[#1A2234] rounded-xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-medium text-slate-200 block">Export Configuration</span>
                <span className="text-[11px] text-slate-500 block">
                  Saves a portable .json backup to your chosen folder.
                </span>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting ? 'Exporting...' : 'Export Backup...'}
              </button>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-[#1A2234]/60">
              <input
                type="checkbox"
                checked={includeHistoryInExport}
                onChange={e => setIncludeHistoryInExport(e.target.checked)}
                className="rounded bg-[#0B0E14] border-[#232B3D] text-purple-600 focus:ring-0"
              />
              <span className="text-xs text-slate-400">
                Include historical session logs in export (increases file size)
              </span>
            </label>
          </div>

          {/* Import section */}
          <div className="p-4 bg-[#0B0E14]/60 border border-[#1A2234] rounded-xl flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-xs font-medium text-slate-200 block">Import &amp; Restore</span>
              <span className="text-[11px] text-slate-500 block">
                Load a previously saved backup file. You can preview changes and choose Merge or Replace.
              </span>
            </div>
            <button
              type="button"
              onClick={handleSelectImport}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1A2234] hover:bg-[#232B3D] text-slate-200 border border-[#232B3D] rounded-lg text-xs font-medium transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-purple-400" />
              Import Backup...
            </button>
          </div>

          {/* Rolling backups section */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                Automatic Rolling Backups (Last 5)
              </span>
              <button
                type="button"
                onClick={refreshAutoBackups}
                disabled={isLoadingAutoBackups}
                className="text-slate-400 hover:text-purple-400 text-[11px] flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingAutoBackups ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {autoBackups.length === 0 ? (
              <div className="p-3 bg-[#0B0E14]/30 border border-[#1A2234] rounded-xl text-center text-xs text-slate-500">
                No automatic snapshots yet. Snapshots are created automatically before imports.
              </div>
            ) : (
              <div className="space-y-1.5">
                {autoBackups.map(b => (
                  <div
                    key={b.filename}
                    className="flex items-center justify-between p-2.5 bg-[#0B0E14]/40 border border-[#1A2234] rounded-xl text-xs hover:border-[#232B3D] transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="text-slate-300 font-mono text-[11px]">{b.filename}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(b.createdAtUtc).toLocaleString()} &bull; {(b.sizeBytes / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestoreAutoBackup(b.filename)}
                      className="px-2.5 py-1 bg-[#1A2234] hover:bg-purple-600/30 hover:text-purple-300 text-slate-300 border border-[#232B3D] rounded-lg text-[11px] transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Preview Modal */}
      {importPreview && pendingImportFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="liquid-glass-card-glow p-6 w-full max-w-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A2234]">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Preview Backup Import</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImportPreview(null);
                  setPendingImportFile(null);
                  setImportModalError(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#0B0E14]/60 border border-[#1A2234] rounded-xl p-3 text-xs space-y-1">
              <div className="text-slate-200 font-mono font-medium">{pendingImportFile.filename}</div>
              <div className="text-slate-500 text-[11px] flex items-center gap-3">
                <span>Schema v{importPreview.schemaVersion}</span>
                <span>Exported: {new Date(importPreview.exportedAtUtc).toLocaleString()}</span>
                {importPreview.appVersion && <span>App: v{importPreview.appVersion}</span>}
              </div>
            </div>

            {/* Diffs Summary */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Detected Changes &amp; Contents
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-[#0B0E14]/40 border border-[#1A2234] rounded-xl space-y-1">
                  <div className="font-semibold text-slate-300">Games ({importPreview.games.totalInBackup})</div>
                  <div className="text-[11px] space-y-0.5">
                    <span className="text-emerald-400 block">+{importPreview.games.toAdd.length} to add</span>
                    <span className="text-blue-400 block">{importPreview.games.toUpdate.length} to update</span>
                    <span className="text-slate-500 block">{importPreview.games.unchanged.length} unchanged</span>
                  </div>
                </div>

                <div className="p-3 bg-[#0B0E14]/40 border border-[#1A2234] rounded-xl space-y-1">
                  <div className="font-semibold text-slate-300">Profiles ({importPreview.profiles.totalInBackup})</div>
                  <div className="text-[11px] space-y-0.5">
                    <span className="text-emerald-400 block">+{importPreview.profiles.toAdd.length} to add</span>
                    <span className="text-blue-400 block">{importPreview.profiles.toUpdate.length} to update</span>
                    <span className="text-slate-500 block">{importPreview.profiles.unchanged.length} unchanged</span>
                  </div>
                </div>

                <div className="p-3 bg-[#0B0E14]/40 border border-[#1A2234] rounded-xl space-y-1">
                  <div className="font-semibold text-slate-300">Catch-Up Goals ({importPreview.goals.totalInBackup})</div>
                  <div className="text-[11px] space-y-0.5">
                    <span className="text-emerald-400 block">+{importPreview.goals.toAdd.length} to add</span>
                    <span className="text-blue-400 block">{importPreview.goals.toUpdate.length} to update</span>
                    <span className="text-slate-500 block">{importPreview.goals.unchanged.length} unchanged</span>
                  </div>
                </div>

                <div className="p-3 bg-[#0B0E14]/40 border border-[#1A2234] rounded-xl space-y-1">
                  <div className="font-semibold text-slate-300">Session History</div>
                  <div className="text-[11px] text-slate-400 pt-1">
                    {importPreview.historyCount} session record(s) included
                  </div>
                </div>
              </div>
            </div>

            {/* Mode Selection */}
            <div className="space-y-2 pt-2 border-t border-[#1A2234]">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Import Mode
              </span>

              <label className="flex items-start gap-3 p-3 bg-[#0B0E14]/60 border border-[#1A2234] rounded-xl cursor-pointer hover:border-purple-500/40 transition-colors">
                <input
                  type="radio"
                  name="importMode"
                  value="MERGE"
                  checked={importMode === 'MERGE'}
                  onChange={() => setImportMode('MERGE')}
                  className="mt-0.5 text-purple-600 focus:ring-0"
                />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-200">Merge (Recommended)</div>
                  <div className="text-slate-400 text-[11px]">
                    Keeps existing games and profiles. Adds new items and updates matching IDs. Preserves existing Steam API keys and settings not in backup.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 bg-[#0B0E14]/60 border border-[#1A2234] rounded-xl cursor-pointer hover:border-purple-500/40 transition-colors">
                <input
                  type="radio"
                  name="importMode"
                  value="REPLACE"
                  checked={importMode === 'REPLACE'}
                  onChange={() => setImportMode('REPLACE')}
                  className="mt-0.5 text-purple-600 focus:ring-0"
                />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-rose-300">Replace All</div>
                  <div className="text-slate-400 text-[11px]">
                    Overwrites all current games, profiles, goals, and history with backup contents. An automatic safety snapshot of current data is created before replacing.
                  </div>
                </div>
              </label>
            </div>

            {importModalError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{importModalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setImportPreview(null);
                  setPendingImportFile(null);
                  setImportModalError(null);
                }}
                disabled={isApplyingImport}
                className="px-4 py-2 bg-[#1A2234] hover:bg-[#232B3D] text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                disabled={isApplyingImport}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-900/30 transition-colors flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {isApplyingImport ? 'Restoring...' : `Apply ${importMode === 'MERGE' ? 'Merge' : 'Replace'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
