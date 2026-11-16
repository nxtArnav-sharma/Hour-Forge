const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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
    name: 'Harmless Test App',
    developer: 'Test Dev',
    publisher: 'Test Pub',
    headerImage: '',
    processNames: ['test.exe'],
    defaultHours: 2
  }
];

const mockProfiles = [
  {
    id: 'regular',
    name: 'Regular Gamer (8h)',
    dailyCapHours: 8,
    sessionMinMinutes: 45,
    sessionMaxMinutes: 90,
    restMinMinutes: 15,
    restMaxMinutes: 30,
    activeWindowStart: '09:00',
    activeWindowEnd: '23:00',
    bootJitterMinMinutes: 5,
    bootJitterMaxMinutes: 15
  }
];

let currentEngineState = { runId: null, mode: 'DEDICATED', status: 'IDLE', tracks: [] };
let currentSettings = {
  firstRunCompleted: true,
  runMode: 'DEDICATED',
  profileId: 'regular',
  launchWithWindows: false,
  startMinimized: false,
  pauseOnBattery: true,
  theme: 'dark'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.on('window-all-closed', e => {
  // Prevent quitting so destroyed window state can be benchmarked
});

app.whenReady().then(async () => {
  ipcMain.handle('store:get-settings', async () => currentSettings);
  ipcMain.handle('store:save-settings', async (_e, s) => { currentSettings = { ...currentSettings, ...s }; });
  ipcMain.handle('store:get-games', async () => mockGames);
  ipcMain.handle('store:get-profiles', async () => mockProfiles);
  ipcMain.handle('store:get-history', async () => []);
  ipcMain.handle('engine:get-state', async () => currentEngineState);
  ipcMain.handle('engine:start-run', async () => {});
  ipcMain.handle('engine:stop-run', async () => { currentEngineState = { ...currentEngineState, status: 'IDLE', tracks: [] }; });
  ipcMain.handle('engine:pause-all', async () => { currentEngineState.status = 'PAUSED'; });
  ipcMain.handle('engine:resume-all', async () => { currentEngineState.status = 'RUNNING'; });
  ipcMain.handle('engine:get-logs', async () => ({ engineLogs: [], helperLogs: {} }));
  ipcMain.handle('steam:get-client-status', async () => ({ isInstalled: true, isRunning: true, isLoggedOn: true, personaName: 'ForgeOperator' }));
  ipcMain.handle('steam:get-hours-status', async () => ({ cachedHours: { 3513350: 32.5, 4508340: 15.0 }, status: 'SYNCED', lastPolledUtc: Date.now() }));
  ipcMain.handle('goal:get-all', async () => []);
  ipcMain.handle('goal:get-pacing-reports', async () => ({}));
  ipcMain.handle('store:list-automatic-backups', async () => []);

  let win = new BrowserWindow({
    width: 1100,
    height: 720,
    frame: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, '../../dist/preload/index.js'),
      backgroundThrottling: true,
      sandbox: false,
      contextIsolation: true
    }
  });

  await win.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'));
  await sleep(1000);

  async function sampleProcessMetrics(seconds) {
    const samples = [];
    const processSamples = {};

    for (let i = 0; i < seconds; i++) {
      await sleep(1000);
      const metrics = app.getAppMetrics();
      let totalCpu = 0;
      let totalMemoryBytes = 0;

      for (const m of metrics) {
        const type = m.type;
        const ramMb = (m.memory.workingSetSize * 1024) / (1024 * 1024);
        totalCpu += m.cpu.percentCPUUsage;
        totalMemoryBytes += (m.memory.workingSetSize * 1024);

        if (!processSamples[type]) {
          processSamples[type] = { cpuSum: 0, ramSum: 0, count: 0 };
        }
        processSamples[type].cpuSum += m.cpu.percentCPUUsage;
        processSamples[type].ramSum += ramMb;
        processSamples[type].count += 1;
      }

      samples.push({
        cpu: totalCpu,
        ramMb: totalMemoryBytes / (1024 * 1024)
      });
      if ((i + 1) % 5 === 0) process.stdout.write(` ${i + 1}s`);
    }
    console.log('');

    const avgCpu = samples.reduce((acc, s) => acc + s.cpu, 0) / samples.length;
    const avgRam = samples.reduce((acc, s) => acc + s.ramMb, 0) / samples.length;
    const peakRam = Math.max(...samples.map(s => s.ramMb));

    const breakdown = {};
    for (const [type, data] of Object.entries(processSamples)) {
      breakdown[type] = {
        avgCpu: data.cpuSum / data.count,
        avgRam: data.ramSum / data.count
      };
    }

    return { avgCpu, avgRam, peakRam, breakdown };
  }

  console.log('--- STARTING 30-SECOND BENCHMARKS ---');

  // State 1A: Window Hidden (win.hide(), renderer paused, no IPC events)
  console.log('1A. Measuring Window Hidden (30s)...');
  win.hide();
  const hiddenBench = await sampleProcessMetrics(30);
  console.log(`Hidden: CPU=${hiddenBench.avgCpu.toFixed(2)}%, RAM=${hiddenBench.avgRam.toFixed(1)}MB (Peak=${hiddenBench.peakRam.toFixed(1)}MB)`);
  console.log('Breakdown:', JSON.stringify(hiddenBench.breakdown));

  // State 2: Dashboard idle
  console.log('2. Measuring Window Open on Dashboard Idle (30s)...');
  currentEngineState = { runId: null, mode: 'DEDICATED', status: 'IDLE', tracks: [] };
  win.show();
  await win.webContents.executeJavaScript(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Dashboard'));
    if (btn) btn.click();
  `);
  const idleBench = await sampleProcessMetrics(30);
  console.log(`Idle: CPU=${idleBench.avgCpu.toFixed(2)}%, RAM=${idleBench.avgRam.toFixed(1)}MB (Peak=${idleBench.peakRam.toFixed(1)}MB)`);
  console.log('Breakdown:', JSON.stringify(idleBench.breakdown));

  // State 3: Running track
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
  console.log('Breakdown:', JSON.stringify(runningBench.breakdown));

  // State 1B: Window Destroyed (Closed to tray, exact real app architecture)
  console.log('1B. Measuring Closed to Tray (Window Destroyed, 30s)...');
  win.destroy();
  win = null;
  const closedTrayBench = await sampleProcessMetrics(30);
  console.log(`Closed to Tray: CPU=${closedTrayBench.avgCpu.toFixed(2)}%, RAM=${closedTrayBench.avgRam.toFixed(1)}MB (Peak=${closedTrayBench.peakRam.toFixed(1)}MB)`);
  console.log('Breakdown:', JSON.stringify(closedTrayBench.breakdown));

  const benchmarkResults = {
    timestamp: new Date().toISOString(),
    stage: 'AFTER_M13B_FINAL_OPTIMIZATION',
    hidden: hiddenBench,
    closedToTray: closedTrayBench,
    idle: idleBench,
    running: runningBench
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../../docs/benchmarks_after.json'),
    JSON.stringify(benchmarkResults, null, 2)
  );

  console.log('--- ALL BENCHMARKS COMPLETE ---');
  app.quit();
});
