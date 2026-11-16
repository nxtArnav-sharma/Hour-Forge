const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

// Ensure docs/screenshots directory exists
const screenshotsDir = path.resolve(__dirname, '../../docs/screenshots');

app.whenReady().then(async () => {
  await fs.mkdir(screenshotsDir, { recursive: true });

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    frame: false,
    show: true,
    backgroundColor: '#0B0E14',
    webPreferences: {
      preload: path.resolve(__dirname, '../../dist/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Mock handlers needed by preload
  const mockGames = [
    {
      appId: 3513350,
      name: 'Wuthering Waves',
      developer: 'Kuro Games',
      publisher: 'Kuro Games',
      headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3513350/header.jpg',
      processNames: ['Wuthering Waves.exe', 'Client-Win64-Shipping.exe'],
      defaultHours: 1
    },
    {
      appId: 4508340,
      name: 'NTE: Neverness to Everness',
      developer: 'Hotta Studio',
      publisher: 'Perfect World Games',
      headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4508340/header.jpg',
      processNames: ['NTE.exe', 'NevernessToEverness.exe'],
      defaultHours: 2
    }
  ];

  const mockProfiles = [
    {
      id: 'regular',
      name: 'Regular (Default)',
      session: { minMin: 60, maxMin: 180 },
      rest: { minMin: 5, maxMin: 45, longChance: 0.15, longMinMin: 45, longMaxMin: 150 },
      restScalesWithSession: true,
      bootJitterSec: { min: 45, max: 240 },
      activeWindow: { start: '09:00', end: '02:00', edgeJitterMin: 15 },
      dailyCapHours: 12,
      weekendSessionBoost: 1.2
    },
    {
      id: 'casual',
      name: 'Casual',
      session: { minMin: 30, maxMin: 75 },
      rest: { minMin: 15, maxMin: 90, longChance: 0.3, longMinMin: 60, longMaxMin: 240 },
      restScalesWithSession: false,
      bootJitterSec: { min: 60, max: 420 },
      activeWindow: { start: '18:00', end: '23:30', edgeJitterMin: 20 },
      dailyCapHours: 4,
      weekendSessionBoost: 1.5
    },
    {
      id: 'grinder',
      name: 'Grinder',
      session: { minMin: 90, maxMin: 240 },
      rest: { minMin: 3, maxMin: 20, longChance: 0.05, longMinMin: 20, longMaxMin: 60 },
      restScalesWithSession: true,
      bootJitterSec: { min: 30, max: 180 },
      activeWindow: { start: '09:00', end: '04:00', edgeJitterMin: 15 },
      dailyCapHours: 16,
      weekendSessionBoost: 1.0
    }
  ];

  const mockHistory = [
    {
      id: 'h1',
      runId: 'r1',
      appId: 3513350,
      startUtc: Date.now() - 3600 * 1000 * 4,
      endUtc: Date.now() - 3600 * 1000 * 2,
      creditedSeconds: 7200,
      source: 'schedule'
    },
    {
      id: 'h2',
      runId: 'r1',
      appId: 4508340,
      startUtc: Date.now() - 3600 * 1000 * 2,
      endUtc: Date.now() - 3600 * 1000 * 1,
      creditedSeconds: 3600,
      source: 'schedule'
    }
  ];

  let currentSettings = {
    startWithWindows: true,
    startHidden: false,
    closeToTray: true,
    theme: 'dark',
    steamUsername: 'forge_operator',
    hasStoredPassword: true,
    onlineStatus: 1,
    launchPickerCountdownSec: 60,
    notifyOnAuth: true,
    notifyOnBlocked: true,
    notifyOnFinish: true,
    notifyOnCrashLoop: true,
    keepAwake: true,
    pauseOnSleep: true,
    ipcPort: 51242,
    ipcPassword: 'mock-ipc-password',
    firstRunCompleted: true
  };

  let currentEngineState = {
    runId: 'run_mock_demo',
    mode: 'DEDICATED',
    status: 'RUNNING',
    t0Utc: Date.now() - 1800 * 1000,
    profileId: 'regular',
    runSeed: 'seed_demo',
    lastSnapshotUtc: Date.now(),
    tracks: [
      {
        appId: 3513350,
        state: 'PLAYING',
        overlay: null,
        creditedSeconds: 1800,
        targetSeconds: 3600,
        currentBlockIndex: 0,
        blocks: [
          {
            id: 'b1',
            type: 'play',
            reason: 'sample',
            startUtc: Date.now() - 1800 * 1000,
            endUtc: Date.now() + 1800 * 1000,
            durationSec: 3600
          },
          {
            id: 'b2',
            type: 'rest',
            reason: 'sample',
            startUtc: Date.now() + 1800 * 1000,
            endUtc: Date.now() + 2700 * 1000,
            durationSec: 900
          }
        ]
      },
      {
        appId: 4508340,
        state: 'RESTING',
        overlay: null,
        creditedSeconds: 3600,
        targetSeconds: 7200,
        currentBlockIndex: 1,
        blocks: [
          {
            id: 'b3',
            type: 'play',
            reason: 'sample',
            startUtc: Date.now() - 4200 * 1000,
            endUtc: Date.now() - 600 * 1000,
            durationSec: 3600
          },
          {
            id: 'b4',
            type: 'rest',
            reason: 'sample',
            startUtc: Date.now() - 600 * 1000,
            endUtc: Date.now() + 600 * 1000,
            durationSec: 1200
          }
        ]
      }
    ]
  };

  // Register mock IPC handlers
  ipcMain.handle('store:get-settings', async () => currentSettings);
  ipcMain.handle('store:save-settings', async (_e, s) => { currentSettings = s; });
  ipcMain.handle('store:get-games', async () => mockGames);
  ipcMain.handle('store:add-game', async () => {});
  ipcMain.handle('store:remove-game', async () => {});
  ipcMain.handle('store:get-profiles', async () => mockProfiles);
  ipcMain.handle('store:save-profile', async () => {});
  ipcMain.handle('store:get-history', async () => mockHistory);
  ipcMain.handle('engine:get-state', async () => currentEngineState);
  ipcMain.handle('engine:start-run', async () => {});
  ipcMain.handle('engine:stop-run', async () => {
    currentEngineState = { ...currentEngineState, status: 'IDLE', tracks: [] };
  });
  ipcMain.handle('engine:pause-all', async () => {});
  ipcMain.handle('engine:resume-all', async () => {});
  ipcMain.handle('engine:track-action', async () => {});
  ipcMain.handle('steam:resolve-app', async () => mockGames[0]);
  ipcMain.handle('steam:submit-auth', async () => {});
  ipcMain.handle('steam:add-free-license', async () => {});
  ipcMain.handle('system:get-logs', async () => ({
    engineLogs: [
      `[${new Date().toISOString()}] [INFO] HourForge engine initialized.`,
      `[${new Date().toISOString()}] [INFO] Windows autostart verified (R1).`,
      `[${new Date().toISOString()}] [INFO] Transitioned App 3513350 to PLAYING (duration 3600s).`,
      `[${new Date().toISOString()}] [INFO] Transitioned App 4508340 to RESTING (duration 1200s).`
    ],
    helperLogs: [
      `[${new Date().toISOString()}] [Helper 3513350] Connecting to Steam client via steamworks.js...`,
      `[${new Date().toISOString()}] [Helper 3513350] ACTIVE for App ID: 3513350 (PID: 12480)`,
      `[${new Date().toISOString()}] [Helper 3513350] Heartbeat OK.`
    ]
  }));
  ipcMain.on('system:minimize', () => {});
  ipcMain.on('system:close', () => {});

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Helper to capture active window
  async function snap(filename) {
    await sleep(400); // Allow render/animation to settle
    const img = await win.webContents.capturePage();
    const filePath = path.join(screenshotsDir, filename);
    await fs.writeFile(filePath, img.toPNG());
    console.log(`Saved screenshot: ${filename} (${img.getSize().width}x${img.getSize().height})`);
  }

  // Helper to execute renderer script to navigate
  async function navigate(route) {
    await win.webContents.executeJavaScript(`window.__setRoute?.('${route}') || (window.location.hash = '${route}')`);
  }

  // 1. Capture Dashboard with 2 running tracks
  await win.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'));
  await sleep(1000);
  await snap('dashboard_running.png');

  // 2. Capture New Run screen
  await win.webContents.executeJavaScript(`window.location.hash = 'new-run'`);
  await win.webContents.executeJavaScript(`
    // Trigger store navigation
    const store = document.querySelector('body');
  `);
  // Click on nav rail items
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Run'));
    if (btn) btn.click();
  `);
  await snap('new_run.png');

  // 3. Capture Plan View
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Plan'));
    if (btn) btn.click();
  `);
  await snap('plan.png');

  // 4. Capture Games screen
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Games'));
    if (btn) btn.click();
  `);
  await snap('games.png');

  // 5. Capture Profiles screen
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Profiles'));
    if (btn) btn.click();
  `);
  await snap('profiles.png');

  // 6. Capture History screen
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('History'));
    if (btn) btn.click();
  `);
  await snap('history.png');

  // 7. Capture Logs screen
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Logs'));
    if (btn) btn.click();
  `);
  await snap('logs.png');

  // 8. Capture Settings screen
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Settings'));
    if (btn) btn.click();
  `);
  await snap('settings.png');

  // 9. Capture Empty-State Dashboard
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Dashboard'));
    if (btn) btn.click();
  `);
  // Set engine state to IDLE
  await win.webContents.executeJavaScript(`
    // Stop run button
    const stopBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Stop Run'));
    if (stopBtn) stopBtn.click();
  `);
  await sleep(500);
  await snap('dashboard_empty.png');

  // 10. Capture Steam Guard Modal
  // Re-open dashboard and trigger authRequired event
  win.webContents.send('event:auth-required', { state: 'SteamGuard (2FA Mobile)' });
  await sleep(400);
  await snap('auth_modal.png');

  // 11. Capture Onboarding Screen
  currentSettings.firstRunCompleted = false;
  await win.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'));
  await sleep(800);
  await snap('onboarding.png');

  // 12. Capture Launch Picker Card
  const cardWin = new BrowserWindow({
    width: 440,
    height: 620,
    frame: false,
    show: true,
    backgroundColor: '#0B0E14',
    webPreferences: {
      preload: path.resolve(__dirname, '../../dist/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  await cardWin.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'), {
    hash: 'launch-picker-card'
  });
  await sleep(800);
  const cardImg = await cardWin.webContents.capturePage();
  await fs.writeFile(path.join(screenshotsDir, 'launch_picker_card.png'), cardImg.toPNG());
  console.log(`Saved screenshot: launch_picker_card.png (${cardImg.getSize().width}x${cardImg.getSize().height})`);

  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
  app.quit();
});

