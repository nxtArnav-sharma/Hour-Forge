const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const screenshotsDir = path.resolve(__dirname, '../../docs/screenshots/before');
const brainDir = process.env.HOURFORGE_BRAIN_DIR || '';

fs.mkdirSync(screenshotsDir, { recursive: true });
if (brainDir) {
  try { fs.mkdirSync(brainDir, { recursive: true }); } catch (_) {}
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    frame: false,
    show: false,
    backgroundColor: '#0B0E14',
    webPreferences: {
      preload: path.resolve(__dirname, '../../dist/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const mockGames = [
    {
      appId: 3513350,
      name: 'Wuthering Waves',
      developer: 'Kuro Games',
      publisher: 'Kuro Games',
      headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3513350/header.jpg',
      processNames: ['Wuthering Waves.exe'],
      defaultHours: 1
    },
    {
      appId: 4508340,
      name: 'NTE: Neverness to Everness',
      developer: 'Hotta Studio',
      publisher: 'Perfect World Games',
      headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4508340/header.jpg',
      processNames: ['NTE.exe'],
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
    }
  ];

  const mockGoals = [
    {
      id: 'g1',
      appId: 3513350,
      targetHours: 100,
      targetDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      manualStartingHours: 10,
      userLabel: 'Catch Up with Guild'
    }
  ];

  const mockPacing = {
    appId: 3513350,
    targetHours: 100,
    targetDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    daysRemaining: 14,
    effectiveCurrentHours: 32.5,
    remainingHours: 67.5,
    requiredDailyHours: 4.8,
    status: 'ON_TRACK',
    projectedCompletionDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    profileDailyCapHours: 12,
    plannedVsActual: [
      { date: 'Day -3', plannedHours: 4.8, actualHours: 5.0 },
      { date: 'Day -2', plannedHours: 4.8, actualHours: 4.5 },
      { date: 'Day -1', plannedHours: 4.8, actualHours: 4.8 },
      { date: 'Today', plannedHours: 4.8, actualHours: 2.1 }
    ]
  };

  const mockHistory = [
    {
      id: 'h1',
      runId: 'r1',
      appId: 3513350,
      startUtc: Date.now() - 3600 * 1000 * 4,
      endUtc: Date.now() - 3600 * 1000 * 2,
      creditedSeconds: 7200,
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
          { id: 'b1', type: 'play', reason: 'sample', startUtc: Date.now() - 1800000, endUtc: Date.now() + 1800000, durationSec: 3600 },
          { id: 'b2', type: 'rest', reason: 'sample', startUtc: Date.now() + 1800000, endUtc: Date.now() + 2700000, durationSec: 900 }
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
          { id: 'b3', type: 'play', reason: 'sample', startUtc: Date.now() - 4200000, endUtc: Date.now() - 600000, durationSec: 3600 },
          { id: 'b4', type: 'rest', reason: 'sample', startUtc: Date.now() - 600000, endUtc: Date.now() + 600000, durationSec: 1200 }
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
  ipcMain.handle('steam:get-client-status', async () => ({
    isInstalled: true,
    isRunning: true,
    isLoggedOn: true,
    personaName: 'ForgeOperator'
  }));
  ipcMain.handle('steam:get-hours-status', async () => ({
    cachedHours: { 3513350: 32.5, 4508340: 15.0 },
    lastSyncUtc: Date.now() - 300000,
    backoffUntilUtc: null
  }));
  ipcMain.handle('steam:refresh-hours', async () => ({
    cachedHours: { 3513350: 32.5, 4508340: 15.0 },
    lastSyncUtc: Date.now(),
    backoffUntilUtc: null
  }));
  ipcMain.handle('goal:get-all', async () => mockGoals);
  ipcMain.handle('goal:save', async () => {});
  ipcMain.handle('goal:delete', async () => {});
  ipcMain.handle('goal:get-pacing', async () => mockPacing);
  ipcMain.handle('goal:check-friend', async () => ({ success: true, friendHours: 50.0 }));
  ipcMain.handle('backup:get-auto-list', async () => []);
  ipcMain.handle('backup:export', async () => ({ jsonString: '{}', filename: 'hourforge-backup.json' }));
  ipcMain.handle('backup:preview', async () => ({
    version: 1,
    exportDateUtc: new Date().toISOString(),
    itemCounts: { profiles: 2, games: 2, goals: 1, history: 1 },
    warnings: []
  }));
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

  async function snap(filename) {
    await sleep(500);
    const img = await win.webContents.capturePage();
    const p1 = path.join(screenshotsDir, filename);
    const p2 = path.join(brainDir, filename);
    fs.writeFileSync(p1, img.toPNG());
    try { fs.writeFileSync(p2, img.toPNG()); } catch (_) {}
    console.log(`Captured BEFORE screenshot: ${filename} (${img.getSize().width}x${img.getSize().height})`);
  }

  win.webContents.on('console-message', (_e, _lvl, message) => {
    console.log('[Renderer]', message);
  });

  async function clickNav(text) {
    await win.webContents.executeJavaScript(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes(${JSON.stringify(text)}));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`);
    await sleep(400);
  }

  // 1. Dashboard (running)
  win.show();
  await win.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'));
  await sleep(1000);
  await snap('dashboard_running.png');

  // 2. New Run
  await clickNav('New Run');
  await snap('new_run.png');

  // 3. Plan
  await clickNav('Plan');
  await snap('plan.png');

  // 4. Goals
  await clickNav('Goals');
  await snap('goals.png');

  // 5. Games
  await clickNav('Games');
  await snap('games.png');

  // 6. Profiles
  await clickNav('Profiles');
  await snap('profiles.png');

  // 7. History
  await clickNav('History');
  await snap('history.png');

  // 8. Logs
  await clickNav('Logs');
  await snap('logs.png');

  // 9. Settings
  await clickNav('Settings');
  await snap('settings.png');

  // 10. Empty Dashboard
  await clickNav('Dashboard');
  currentEngineState = { ...currentEngineState, status: 'IDLE', tracks: [] };
  await win.webContents.executeJavaScript(`(() => {
    const stopBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Stop Run'));
    if (stopBtn) stopBtn.click();
  })()`);
  await sleep(600);
  await snap('dashboard_empty.png');

  // 11. Auth Modal
  win.webContents.send('event:auth-required', { state: 'SteamGuard (2FA Mobile)' });
  await sleep(400);
  await snap('auth_modal.png');

  // 12. Onboarding
  currentSettings.firstRunCompleted = false;
  await win.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'));
  await sleep(800);
  await snap('onboarding.png');

  // 13. Launch Picker Card
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
  fs.writeFileSync(path.join(screenshotsDir, 'launch_picker_card.png'), cardImg.toPNG());
  try { fs.writeFileSync(path.join(brainDir, 'launch_picker_card.png'), cardImg.toPNG()); } catch (_) {}
  console.log(`Captured BEFORE screenshot: launch_picker_card.png`);
  cardWin.destroy();

  // Reset settings for benchmark
  currentSettings.firstRunCompleted = true;
  await win.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'));
  await sleep(800);

  // === BENCHMARKS ===
  console.log('\n--- STARTING 30-SECOND BENCHMARKS (BEFORE RESTYLE) ---');

  async function sampleProcessMetrics(seconds) {
    const samples = [];
    const intervalMs = 1000;
    const totalSamples = seconds;

    for (let i = 0; i < totalSamples; i++) {
      await sleep(intervalMs);
      const metrics = app.getAppMetrics();
      // Aggregate CPU% across all processes (browser, renderer, gpu)
      let totalCpu = 0;
      let totalMemoryBytes = 0;
      for (const m of metrics) {
        totalCpu += m.cpu.percentCPUUsage;
        totalMemoryBytes += (m.memory.workingSetSize * 1024); // KB to bytes
      }
      samples.push({
        cpu: totalCpu,
        ramMb: totalMemoryBytes / (1024 * 1024)
      });
      if ((i + 1) % 5 === 0) {
        process.stdout.write(` ${i + 1}s`);
      }
    }
    console.log('');
    const avgCpu = samples.reduce((acc, s) => acc + s.cpu, 0) / samples.length;
    const avgRam = samples.reduce((acc, s) => acc + s.ramMb, 0) / samples.length;
    const peakRam = Math.max(...samples.map(s => s.ramMb));
    return { avgCpu, avgRam, peakRam };
  }

  // State 1: Window hidden to tray
  console.log('1. Measuring Window Hidden to Tray (30s)...');
  win.hide();
  const hiddenBench = await sampleProcessMetrics(30);
  console.log(`Hidden: CPU=${hiddenBench.avgCpu.toFixed(2)}%, RAM=${hiddenBench.avgRam.toFixed(1)}MB (Peak=${hiddenBench.peakRam.toFixed(1)}MB)`);

  // State 2: Window open on Dashboard idle
  console.log('2. Measuring Window Open on Dashboard Idle (30s)...');
  currentEngineState = { runId: null, mode: 'DEDICATED', status: 'IDLE', tracks: [] };
  win.show();
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Dashboard'));
    if (btn) btn.click();
  `);
  const idleBench = await sampleProcessMetrics(30);
  console.log(`Idle: CPU=${idleBench.avgCpu.toFixed(2)}%, RAM=${idleBench.avgRam.toFixed(1)}MB (Peak=${idleBench.peakRam.toFixed(1)}MB)`);

  // State 3: Window open during running track
  console.log('3. Measuring Window Open During Running Track (30s)...');
  currentEngineState = {
    runId: 'run_bench',
    mode: 'DEDICATED',
    status: 'RUNNING',
    t0Utc: Date.now() - 1000,
    profileId: 'regular',
    runSeed: 'seed',
    lastSnapshotUtc: Date.now(),
    tracks: [
      { appId: 3513350, state: 'PLAYING', overlay: null, creditedSeconds: 120, targetSeconds: 3600, currentBlockIndex: 0, blocks: [] },
      { appId: 4508340, state: 'RESTING', overlay: null, creditedSeconds: 300, targetSeconds: 7200, currentBlockIndex: 0, blocks: [] }
    ]
  };
  win.webContents.send('event:engine-state', currentEngineState);
  const runningBench = await sampleProcessMetrics(30);
  console.log(`Running: CPU=${runningBench.avgCpu.toFixed(2)}%, RAM=${runningBench.avgRam.toFixed(1)}MB (Peak=${runningBench.peakRam.toFixed(1)}MB)`);

  const benchmarkResults = {
    timestamp: new Date().toISOString(),
    stage: 'BEFORE_RESTYLE',
    hidden: hiddenBench,
    idle: idleBench,
    running: runningBench
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../../docs/benchmarks_before.json'),
    JSON.stringify(benchmarkResults, null, 2)
  );

  console.log('\n--- ALL BEFORE SCREENSHOTS AND BENCHMARKS COMPLETE ---');
  win.destroy();
  app.quit();
});
