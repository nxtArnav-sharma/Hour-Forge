import { Notification } from 'electron';
import { NavRoute } from '../shared/routes';

export type ToastType = 'auth_required' | 'blocked' | 'run_finished' | 'crash_loop' | 'steam_client';

export function getRouteForToast(type: ToastType): NavRoute {
  switch (type) {
    case 'blocked':
      return 'dashboard';
    case 'run_finished':
      return 'history';
    case 'steam_client':
    case 'auth_required':
      return 'settings';
    default:
      return 'dashboard';
  }
}

export class NotificationManager {
  private lastToastTime: Map<ToastType, number> = new Map();
  private onClickCallback?: (type: ToastType) => void;

  constructor(onClick?: (type: ToastType) => void) {
    this.onClickCallback = onClick;
  }

  showToast(type: ToastType, title: string, body: string): boolean {
    const now = Date.now();
    const last = this.lastToastTime.get(type) || 0;

    // Rate limit: at most one per type per 10 minutes (600,000ms)
    if (now - last < 10 * 60 * 1000) {
      return false;
    }

    this.lastToastTime.set(type, now);

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: `HourForge — ${title}`,
        body,
        silent: false
      });

      notif.on('click', () => {
        this.onClickCallback?.(type);
      });

      notif.show();
      return true;
    }

    return false;
  }
}

