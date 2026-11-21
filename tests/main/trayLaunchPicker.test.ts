import { describe, it, expect, vi } from 'vitest';
import { TrayManager, TrayManagerCallbacks } from '../../src/main/tray';
import { IPC_CHANNELS } from '../../src/shared/channels';

describe('Tray Launch Picker & Startup Toggle (Task B)', () => {
  it('defines IPC channels for launch picker and settings updates', () => {
    expect(IPC_CHANNELS.SYSTEM_OPEN_LAUNCH_PICKER).toBe('system:open-launch-picker');
    expect(IPC_CHANNELS.EVENT_SETTINGS_UPDATED).toBe('event:settings-updated');
  });

  it('TrayManager initializes with callbacks including launch picker and startup toggle', () => {
    const fakeEngine: any = {
      pauseAll: vi.fn(),
      resumeAll: vi.fn(),
      stopRun: vi.fn()
    };

    const callbacks: TrayManagerCallbacks = {
      onToggleWindow: vi.fn(),
      onOpenDashboard: vi.fn(),
      onOpenSettings: vi.fn(),
      onStartNewRun: vi.fn(),
      onOpenLaunchPicker: vi.fn(),
      onToggleStartupPicker: vi.fn()
    };

    const tray = new TrayManager(fakeEngine, callbacks);
    expect(tray).toBeDefined();

    // Verify toggle method works and updates internal state
    tray.setStartupPickerEnabled(false);
    expect((tray as any).isStartupPickerEnabled).toBe(false);

    tray.setStartupPickerEnabled(true);
    expect((tray as any).isStartupPickerEnabled).toBe(true);
  });
});
