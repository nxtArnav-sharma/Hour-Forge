import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteManager, WindowController } from '../../src/main/routeManager';
import { IPC_CHANNELS } from '../../src/shared/channels';
import { NavRoute } from '../../src/shared/routes';
import { getRouteForToast } from '../../src/main/notify';

class FakeBrowserWindow {
  private _destroyed = false;
  private _visible = true;
  private _minimized = false;
  private _focused = false;
  public webContents = {
    send: vi.fn()
  };

  constructor(options?: { visible?: boolean; minimized?: boolean; destroyed?: boolean }) {
    if (options?.visible !== undefined) this._visible = options.visible;
    if (options?.minimized !== undefined) this._minimized = options.minimized;
    if (options?.destroyed !== undefined) this._destroyed = options.destroyed;
  }

  isDestroyed(): boolean {
    return this._destroyed;
  }

  destroy(): void {
    this._destroyed = true;
  }

  isVisible(): boolean {
    return this._visible;
  }

  show(): void {
    this._visible = true;
  }

  isMinimized(): boolean {
    return this._minimized;
  }

  minimize(): void {
    this._minimized = true;
  }

  restore(): void {
    this._minimized = false;
    this._visible = true;
  }

  focus(): void {
    this._focused = true;
  }

  isFocused(): boolean {
    return this._focused;
  }
}

describe('RouteManager (Task 1)', () => {
  let fakeWindow: FakeBrowserWindow | null = null;
  let createWindowMock: ReturnType<typeof vi.fn>;
  let windowController: WindowController;
  let routeManager: RouteManager;

  beforeEach(() => {
    fakeWindow = null;
    createWindowMock = vi.fn().mockImplementation(() => {
      fakeWindow = new FakeBrowserWindow({ visible: false });
      return fakeWindow as any;
    });

    windowController = {
      getWindow: () => fakeWindow as any,
      createWindow: createWindowMock
    };

    routeManager = new RouteManager(windowController);
  });

  it('handles cold start (destroyed window): creates window and buffers pendingRoute', () => {
    expect(fakeWindow).toBeNull();
    const success = routeManager.navigateTo('settings');

    expect(success).toBe(true);
    expect(createWindowMock).toHaveBeenCalledTimes(1);
    expect(routeManager.getPendingRoute()).toBe('settings');

    // Renderer pulls on mount
    const consumed = routeManager.consumePendingRoute();
    expect(consumed).toBe('settings');
    expect(routeManager.getPendingRoute()).toBeNull();
  });

  it('ensures pendingRoute is consumed exactly once', () => {
    routeManager.navigateTo('new-run');
    expect(routeManager.consumePendingRoute()).toBe('new-run');
    // Subsequent consume returns null (no replay)
    expect(routeManager.consumePendingRoute()).toBeNull();
  });

  it('handles warm (visible) window with ready renderer: restores, focuses, and sends navigate event', () => {
    fakeWindow = new FakeBrowserWindow({ visible: true, minimized: false });
    routeManager.setRendererReady(true);

    const success = routeManager.navigateTo('plan');

    expect(success).toBe(true);
    expect(createWindowMock).not.toHaveBeenCalled();
    expect(fakeWindow.isFocused()).toBe(true);
    expect(fakeWindow.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.EVENT_NAVIGATE, 'plan');
    expect(routeManager.getPendingRoute()).toBeNull();
  });

  it('handles hidden window: calls show(), focus(), and sends navigate event', () => {
    fakeWindow = new FakeBrowserWindow({ visible: false, minimized: false });
    routeManager.setRendererReady(true);

    const success = routeManager.navigateTo('goals');

    expect(success).toBe(true);
    expect(fakeWindow.isVisible()).toBe(true);
    expect(fakeWindow.isFocused()).toBe(true);
    expect(fakeWindow.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.EVENT_NAVIGATE, 'goals');
  });

  it('handles minimized window: calls restore(), focus(), and sends navigate event', () => {
    fakeWindow = new FakeBrowserWindow({ visible: false, minimized: true });
    routeManager.setRendererReady(true);

    const success = routeManager.navigateTo('history');

    expect(success).toBe(true);
    expect(fakeWindow.isMinimized()).toBe(false);
    expect(fakeWindow.isVisible()).toBe(true);
    expect(fakeWindow.isFocused()).toBe(true);
    expect(fakeWindow.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.EVENT_NAVIGATE, 'history');
  });

  it('handles two rapid clicks on cold start: updates to latest route without creating multiple windows', () => {
    expect(fakeWindow).toBeNull();

    routeManager.navigateTo('settings');
    routeManager.navigateTo('logs');

    expect(createWindowMock).toHaveBeenCalledTimes(1);
    expect(routeManager.getPendingRoute()).toBe('logs');

    // Consumed route is the latest one
    expect(routeManager.consumePendingRoute()).toBe('logs');
    expect(routeManager.consumePendingRoute()).toBeNull();
  });

  it('validates routes strictly with zod and rejects invalid routes', () => {
    expect(routeManager.navigateTo('not-a-route')).toBe(false);
    expect(routeManager.navigateTo('../../evil')).toBe(false);
    expect(routeManager.navigateTo('')).toBe(false);
    expect(routeManager.navigateTo(null)).toBe(false);
    expect(routeManager.navigateTo(123)).toBe(false);

    expect(createWindowMock).not.toHaveBeenCalled();
    expect(routeManager.getPendingRoute()).toBeNull();
  });

  it('resets renderer readiness when window is closed/destroyed', () => {
    fakeWindow = new FakeBrowserWindow({ visible: true });
    routeManager.setRendererReady(true);
    expect(routeManager.isReady()).toBe(true);

    // Simulate window destruction on close to tray
    fakeWindow.destroy();
    fakeWindow = null;
    routeManager.onWindowDestroyed();

    expect(routeManager.isReady()).toBe(false);

    // Next navigation triggers cold start buffer
    routeManager.navigateTo('games');
    expect(createWindowMock).toHaveBeenCalledTimes(1);
    expect(routeManager.getPendingRoute()).toBe('games');
  });

  it('tracks currentRoute across navigations and rejects invalid setCurrentRoute', () => {
    expect(routeManager.getCurrentRoute()).toBe('dashboard');

    routeManager.navigateTo('goals');
    expect(routeManager.getCurrentRoute()).toBe('goals');

    expect(routeManager.setCurrentRoute('games')).toBe(true);
    expect(routeManager.getCurrentRoute()).toBe('games');

    expect(routeManager.setCurrentRoute('invalid-route')).toBe(false);
    expect(routeManager.getCurrentRoute()).toBe('games');
  });

  it('supports all whitelisted routes', () => {
    const allRoutes: NavRoute[] = [
      'dashboard',
      'new-run',
      'plan',
      'goals',
      'games',
      'profiles',
      'history',
      'logs',
      'settings'
    ];

    fakeWindow = new FakeBrowserWindow({ visible: true });
    routeManager.setRendererReady(true);

    for (const route of allRoutes) {
      expect(routeManager.navigateTo(route)).toBe(true);
      expect(fakeWindow.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.EVENT_NAVIGATE, route);
    }
  });

  describe('Notification Click Routing (Brief 9.5)', () => {
    it('correctly maps each toast type to the expected destination route', () => {
      expect(getRouteForToast('blocked')).toBe('dashboard');
      expect(getRouteForToast('run_finished')).toBe('history');
      expect(getRouteForToast('steam_client')).toBe('settings');
      expect(getRouteForToast('auth_required')).toBe('settings');
      expect(getRouteForToast('crash_loop')).toBe('dashboard');
      expect(getRouteForToast('unknown_type' as any)).toBe('dashboard');
    });

    it('navigates warm window to settings on steam_client toast click', () => {
      fakeWindow = new FakeBrowserWindow({ visible: true });
      routeManager.setRendererReady(true);

      const targetRoute = getRouteForToast('steam_client');
      expect(targetRoute).toBe('settings');

      routeManager.navigateTo(targetRoute);
      expect(fakeWindow.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.EVENT_NAVIGATE, 'settings');
      expect(fakeWindow.isFocused()).toBe(true);
    });

    it('navigates cold window to history on run_finished toast click', () => {
      expect(fakeWindow).toBeNull();

      const targetRoute = getRouteForToast('run_finished');
      expect(targetRoute).toBe('history');

      routeManager.navigateTo(targetRoute);
      expect(createWindowMock).toHaveBeenCalledTimes(1);
      expect(routeManager.consumePendingRoute()).toBe('history');
    });

    it('navigates warm window to dashboard on blocked toast click', () => {
      fakeWindow = new FakeBrowserWindow({ visible: true });
      routeManager.setRendererReady(true);
      routeManager.navigateTo('games'); // initially on games

      const targetRoute = getRouteForToast('blocked');
      expect(targetRoute).toBe('dashboard');

      routeManager.navigateTo(targetRoute);
      expect(fakeWindow.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.EVENT_NAVIGATE, 'dashboard');
    });
  });
});
