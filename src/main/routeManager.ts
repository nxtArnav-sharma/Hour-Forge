import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/channels';
import { NavRoute, NavRouteSchema } from '../shared/routes';

export interface WindowController {
  getWindow: () => BrowserWindow | null;
  createWindow: (initialRoute?: string) => BrowserWindow;
}

export class RouteManager {
  private windowController: WindowController;
  private pendingRoute: NavRoute | null = null;
  private currentRoute: NavRoute = 'dashboard';
  private isRendererReady = false;

  constructor(windowController: WindowController) {
    this.windowController = windowController;
  }

  navigateTo(rawRoute: unknown): boolean {
    const parseResult = NavRouteSchema.safeParse(rawRoute);
    if (!parseResult.success) {
      return false;
    }
    const route = parseResult.data;
    this.currentRoute = route;

    const win = this.windowController.getWindow();
    if (win && !win.isDestroyed() && this.isRendererReady) {
      if (win.isMinimized()) {
        win.restore();
      }
      if (!win.isVisible()) {
        win.show();
      }
      win.focus();
      win.webContents.send(IPC_CHANNELS.EVENT_NAVIGATE, route);
      return true;
    }

    // Cold start or renderer not yet ready: buffer pending route
    this.pendingRoute = route;
    if (!win || win.isDestroyed()) {
      this.isRendererReady = false;
      this.windowController.createWindow();
    } else {
      if (win.isMinimized()) {
        win.restore();
      }
      if (!win.isVisible()) {
        win.show();
      }
      win.focus();
    }
    return true;
  }

  consumePendingRoute(): NavRoute | null {
    this.isRendererReady = true;
    const route = this.pendingRoute;
    this.pendingRoute = null;
    return route;
  }

  setRendererReady(ready = true): void {
    this.isRendererReady = ready;
  }

  onWindowDestroyed(): void {
    this.isRendererReady = false;
  }

  getPendingRoute(): NavRoute | null {
    return this.pendingRoute;
  }

  getCurrentRoute(): NavRoute {
    return this.currentRoute;
  }

  setCurrentRoute(rawRoute: unknown): boolean {
    const parseResult = NavRouteSchema.safeParse(rawRoute);
    if (!parseResult.success) return false;
    this.currentRoute = parseResult.data;
    return true;
  }

  isReady(): boolean {
    return this.isRendererReady;
  }
}
