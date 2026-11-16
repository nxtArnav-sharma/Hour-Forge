import { app } from 'electron';

export class AutostartManager {
  static isEnabled(): boolean {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  }

  static setEnabled(enabled: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      args: ['--autostart'],
      name: 'HourForge'
    });
  }
}

