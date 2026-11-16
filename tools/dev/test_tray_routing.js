const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const esbuild = require('esbuild');

// Disable GPU hardware acceleration for headless/test stability on Windows
app.disableHardwareAcceleration();

// Compile RouteManager and channels from source with esbuild
const compiled = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../../src/main/routeManager.ts')],
  bundle: true,
  external: ['electron'],
  platform: 'node',
  format: 'cjs',
  write: false
});
const m = { exports: {} };
const fn = new Function('module', 'exports', 'require', compiled.outputFiles[0].text);
fn(m, m.exports, require);
const { RouteManager } = m.exports;

const compiledChannels = esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../../src/shared/channels.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
});
const mChannels = { exports: {} };
const fnChannels = new Function('module', 'exports', 'require', compiledChannels.outputFiles[0].text);
fnChannels(mChannels, mChannels.exports, require);
const { IPC_CHANNELS } = mChannels.exports;

// Use isolated test profile
const testDataDir = path.join(os.tmpdir(), 'hourforge_tray_routing_test_' + Date.now());
fs.mkdirSync(testDataDir, { recursive: true });
app.setPath('userData', testDataDir);

// Keep app running when all windows are closed (tray app behavior)
app.on('window-all-closed', () => {});

let mainWindow = null;
let routeManager = null;

function createTestMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../dist/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));

  mainWindow.on('close', e => {
    e.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
    mainWindow = null;
    routeManager.onWindowDestroyed();
  });

  return mainWindow;
}

// Mock IPC handlers that renderer screens need during loadInitialData and mounting
ipcMain.handle(IPC_CHANNELS.STORE_GET_SETTINGS, async () => ({
  firstRunCompleted: true,
  runMode: 'DEDICATED',
  profileId: 'regular',
  launchWithWindows: false,
  startMinimized: false,
  pauseOnBattery: true,
  theme: 'dark'
}));
ipcMain.handle(IPC_CHANNELS.STORE_GET_GAMES, async () => []);
ipcMain.handle(IPC_CHANNELS.STORE_GET_PROFILES, async () => []);
ipcMain.handle(IPC_CHANNELS.STORE_GET_HISTORY, async () => []);
ipcMain.handle(IPC_CHANNELS.ENGINE_GET_STATE, async () => ({ runId: null, mode: 'DEDICATED', status: 'IDLE', tracks: [] }));
ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_LOGS, async () => ({ engineLogs: [], helperLogs: [] }));
ipcMain.handle(IPC_CHANNELS.STEAM_GET_HOURS_STATUS, async () => null);
ipcMain.handle(IPC_CHANNELS.STEAM_GET_CLIENT_STATUS, async () => ({ isInstalled: true, isRunning: false, isLoggedOn: false, personaName: null }));
ipcMain.handle(IPC_CHANNELS.BACKUP_GET_AUTO_LIST, async () => []);
ipcMain.handle(IPC_CHANNELS.GOAL_GET_ALL, async () => []);
ipcMain.handle(IPC_CHANNELS.GOAL_GET_PACING, async () => null);

// The core route consumption handler under test
ipcMain.handle(IPC_CHANNELS.APP_CONSUME_PENDING_ROUTE, () => {
  return routeManager ? routeManager.consumePendingRoute() : null;
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRendererRoute(expectedRoute, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const route = await mainWindow.webContents.executeJavaScript('window.__HOURFORGE_ROUTE__');
        if (route === expectedRoute) return route;
      } catch (e) {
        // Context loading
      }
    }
    await sleep(60);
  }
  try {
    return await mainWindow.webContents.executeJavaScript('window.__HOURFORGE_ROUTE__');
  } catch (e) {
    return null;
  }
}

app.whenReady().then(async () => {
  routeManager = new RouteManager({
    getWindow: () => mainWindow,
    createWindow: () => createTestMainWindow()
  });

  console.log('\n========================================================================================');
  console.log('                 REAL UNPACKED --SIM ROUTE MANAGER VERIFICATION TABLE                   ');
  console.log('========================================================================================');
  console.log(
    'Trigger'.padEnd(28) + ' | ' +
    'Window State'.padEnd(22) + ' | ' +
    'Expected Route'.padEnd(15) + ' | ' +
    'Actual Route'.padEnd(15) + ' | Result'
  );
  console.log('-----------------------------+------------------------+-----------------+-----------------+--------');

  const results = [];

  async function recordTest(trigger, windowState, expectedRoute, actionFn) {
    await actionFn();
    const actualRoute = await waitForRendererRoute(expectedRoute);
    const pass = actualRoute === expectedRoute;
    const resultStr = pass ? 'PASS' : 'FAIL';
    console.log(
      trigger.padEnd(28) + ' | ' +
      windowState.padEnd(22) + ' | ' +
      expectedRoute.padEnd(15) + ' | ' +
      String(actualRoute).padEnd(15) + ' | ' + resultStr
    );
    results.push({ trigger, windowState, expectedRoute, actualRoute, pass });
  }

  async function destroyWindowCleanly() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
      mainWindow = null;
      routeManager.onWindowDestroyed();
      await sleep(250);
    }
  }

  try {
    // 1. Tray: Open Dashboard (Cold)
    await recordTest('Tray: Open Dashboard', 'Cold', 'dashboard', async () => {
      await destroyWindowCleanly();
      routeManager.navigateTo('dashboard');
    });

    // 2. Tray: Open Dashboard (Warm, from settings)
    await recordTest('Tray: Open Dashboard', 'Warm (from settings)', 'dashboard', async () => {
      routeManager.navigateTo('settings');
      await waitForRendererRoute('settings');
      routeManager.navigateTo('dashboard');
    });

    // 3. Tray: Settings (Cold)
    await recordTest('Tray: Settings', 'Cold', 'settings', async () => {
      await destroyWindowCleanly();
      routeManager.navigateTo('settings');
    });

    // 4. Tray: Settings (Warm, from dashboard)
    await recordTest('Tray: Settings', 'Warm (from dashboard)', 'settings', async () => {
      routeManager.navigateTo('dashboard');
      await waitForRendererRoute('dashboard');
      routeManager.navigateTo('settings');
    });

    // 5. Tray: Start New Run (Cold)
    await recordTest('Tray: Start New Run', 'Cold', 'new-run', async () => {
      await destroyWindowCleanly();
      routeManager.navigateTo('new-run');
    });

    // 6. Tray: Start New Run (Warm, from history)
    await recordTest('Tray: Start New Run', 'Warm (from history)', 'new-run', async () => {
      routeManager.navigateTo('history');
      await waitForRendererRoute('history');
      routeManager.navigateTo('new-run');
    });

    // 7. Tray: Left-Click Toggle (Warm, on goals)
    await recordTest('Tray: Left-Click Toggle', 'Warm (on goals)', 'goals', async () => {
      routeManager.navigateTo('goals');
      await waitForRendererRoute('goals');
      // Simulate left click toggle: window is visible, click hides it
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      }
      await sleep(150);
      // Second left click toggle: window is hidden, click restores and shows it
      mainWindow.show();
      mainWindow.focus();
    });

    // 8. Tray: Left-Click Toggle (Cold, window destroyed)
    await recordTest('Tray: Left-Click Toggle', 'Cold (window destroyed)', 'dashboard', async () => {
      await destroyWindowCleanly();
      // Left click when window destroyed triggers createMainWindow() opening default Dashboard
      createTestMainWindow();
    });

    // 9. Second Instance Launch (Warm, on games)
    await recordTest('Second Instance Launch', 'Warm (on games)', 'games', async () => {
      routeManager.navigateTo('games');
      await waitForRendererRoute('games');
      // Second instance fires: createTestMainWindow() restores/focuses without route change
      createTestMainWindow();
    });

    console.log('========================================================================================\n');

    const allPassed = results.every(r => r.pass);
    if (!allPassed) {
      console.error('One or more tray routing tests failed!');
      process.exit(1);
    } else {
      console.log(`All ${results.length} real tray routing integration tests PASSED.`);
      process.exit(0);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
});
