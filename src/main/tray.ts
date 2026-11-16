import { Tray, Menu, nativeImage, NativeImage, app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { HourForgeEngine } from './engine/engine';
import { RunStateSnapshot } from '../shared/models';

export type TrayIconState = 'idle' | 'connecting' | 'playing' | 'resting' | 'blocked' | 'error';

const STATE_COLORS: Record<TrayIconState, string> = {
  idle: '#94A3B8',       // Muted slate
  connecting: '#38BDF8', // Cyan blue
  playing: '#10B981',    // Emerald green
  resting: '#F59E0B',    // Amber gold
  blocked: '#F97316',    // Warning orange
  error: '#EF4444'       // Crimson red
};

export function createTrayIcon(state: TrayIconState): NativeImage {
  const trayIcon = nativeImage.createEmpty();
  const sizes = [16, 20, 24, 32];

  for (const size of sizes) {
    const candidatePaths = [
      path.join(__dirname, `../../build/tray/tray-${state}-${size}.png`),
      path.join(__dirname, `tray/tray-${state}-${size}.png`),
      path.join(__dirname, `../tray/tray-${state}-${size}.png`),
      path.join(process.resourcesPath || '', `build/tray/tray-${state}-${size}.png`),
      path.join(process.resourcesPath || '', `tray/tray-${state}-${size}.png`)
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const buf = fs.readFileSync(p);
          trayIcon.addRepresentation({
            scaleFactor: size / 16,
            width: size,
            height: size,
            buffer: buf
          });
          break;
        } catch {
          // ignore
        }
      }
    }
  }

  if (trayIcon.isEmpty()) {
    const color = STATE_COLORS[state] || '#94A3B8';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#0B0E14"/>
      <circle cx="25" cy="25" r="5" fill="${color}"/>
    </svg>`;
    const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return nativeImage.createFromDataURL(uri);
  }

  return trayIcon;
}

export interface TrayManagerCallbacks {
  onToggleWindow: () => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  onStartNewRun: () => void;
}

export class TrayManager {
  private tray: Tray | null = null;
  private engine: HourForgeEngine;
  private onToggleWindow: () => void;
  private onOpenDashboard: () => void;
  private onOpenSettings: () => void;
  private onStartNewRun: () => void;

  constructor(
    engine: HourForgeEngine,
    callbacks: TrayManagerCallbacks
  ) {
    this.engine = engine;
    this.onToggleWindow = callbacks.onToggleWindow;
    this.onOpenDashboard = callbacks.onOpenDashboard;
    this.onOpenSettings = callbacks.onOpenSettings;
    this.onStartNewRun = callbacks.onStartNewRun;
  }

  initialize(): void {
    if (this.tray) return;

    const icon = createTrayIcon('idle');
    this.tray = new Tray(icon);
    this.tray.setToolTip('HourForge — Idle');

    this.tray.on('click', () => {
      this.onToggleWindow();
    });

    this.updateMenu();
  }

  updateState(snapshot: RunStateSnapshot): void {
    if (!this.tray) return;

    let iconState: TrayIconState = 'idle';
    let tooltip = 'HourForge — Idle';

    if (snapshot.status === 'RUNNING') {
      const activeTracks = snapshot.tracks;
      const playingCount = activeTracks.filter(t => t.state === 'PLAYING').length;
      const restingCount = activeTracks.filter(t => t.state === 'RESTING').length;

      if (playingCount > 0) {
        iconState = 'playing';
        tooltip = `HourForge · Playing ${playingCount} game${playingCount > 1 ? 's' : ''}`;
      } else if (restingCount > 0) {
        iconState = 'resting';
        tooltip = `HourForge · Resting (${restingCount} track${restingCount > 1 ? 's' : ''})`;
      }

      // Check overlays
      const isBlocked = activeTracks.some(t => t.overlay === 'BLOCKED');
      if (isBlocked) {
        iconState = 'blocked';
        tooltip = 'HourForge · Blocked (Account in use)';
      }
    } else if (snapshot.status === 'STARTING') {
      iconState = 'connecting';
      tooltip = 'HourForge · Connecting to Steam';
    } else if (snapshot.status === 'PAUSED') {
      iconState = 'idle';
      tooltip = 'HourForge · Paused';
    }

    this.tray.setImage(createTrayIcon(iconState));
    this.tray.setToolTip(tooltip);
    this.updateMenu(snapshot);
  }

  private updateMenu(snapshot?: RunStateSnapshot): void {
    if (!this.tray) return;

    const isRunning = snapshot?.status === 'RUNNING';
    const isPaused = snapshot?.status === 'PAUSED';

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Dashboard',
        click: () => this.onOpenDashboard()
      },
      { type: 'separator' },
      {
        label: isPaused ? 'Resume All' : 'Pause All',
        enabled: isRunning || isPaused,
        click: () => {
          if (isPaused) {
            this.engine.resumeAll();
          } else {
            this.engine.pauseAll();
          }
        }
      },
      {
        label: 'Start New Run',
        click: () => this.onStartNewRun()
      },
      {
        label: 'Panic Stop',
        enabled: isRunning || isPaused,
        click: async () => {
          await this.engine.stopRun();
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => this.onOpenSettings()
      },
      {
        label: 'Quit',
        click: async () => {
          if (isRunning) {
            const res = await dialog.showMessageBox({
              type: 'question',
              buttons: ['Stop and Quit', 'Cancel'],
              defaultId: 0,
              cancelId: 1,
              title: 'Quit HourForge',
              message: 'A grinding run is currently active. Quitting will stop playing and close ArchiSteamFarm.',
              detail: 'Are you sure you want to quit?'
            });

            if (res.response !== 0) return;
          }

          await this.engine.stopRun();
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(menu);
  }

  hasTray(): boolean {
    return this.tray !== null && !this.tray.isDestroyed();
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
