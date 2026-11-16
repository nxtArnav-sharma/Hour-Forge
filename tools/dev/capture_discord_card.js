const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const artifactPath = process.env.HOURFORGE_ARTIFACT_DIR
  ? path.join(process.env.HOURFORGE_ARTIFACT_DIR, 'settings_discord_card.png')
  : null;
const docsPath = path.resolve(__dirname, '../../docs/screenshots/settings_discord_card.png');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: true,
    backgroundColor: '#080B11',
    webPreferences: {
      preload: path.resolve(__dirname, '../../dist/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

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
    discordPresenceMode: 'hourforge',
    firstRunCompleted: true
  };

  ipcMain.handle('store:get-settings', async () => currentSettings);
  ipcMain.handle('store:save-settings', async (_e, s) => { currentSettings = s; return { ok: true }; });
  ipcMain.handle('store:get-games', async () => []);
  ipcMain.handle('store:get-profiles', async () => []);
  ipcMain.handle('store:get-goals', async () => []);
  ipcMain.handle('store:get-history', async () => []);
  ipcMain.handle('engine:get-state', async () => ({ status: 'IDLE', mode: 'DEDICATED', tracks: [] }));
  ipcMain.handle('steam:get-client-status', async () => ({
    isInstalled: true,
    isRunning: true,
    isLoggedOn: true,
    personaName: 'ForgeOperator'
  }));
  ipcMain.handle('steam:get-hours-status', async () => ({
    cachedHours: {},
    lastSyncUtc: Date.now(),
    backoffUntilUtc: null
  }));
  ipcMain.handle('goal:get-all', async () => []);
  ipcMain.handle('backup:get-auto-list', async () => []);
  ipcMain.handle('system:get-logs', async () => ({ engineLogs: [], helperLogs: [] }));
  ipcMain.handle('app:consumePendingRoute', async () => 'settings');
  ipcMain.on('system:minimize', () => {});
  ipcMain.on('system:close', () => {});

  await win.loadFile(path.resolve(__dirname, '../../dist/renderer/index.html'));
  await new Promise(r => setTimeout(r, 1200));

  const rect = await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const allCards = Array.from(document.querySelectorAll('.liquid-glass-card'));
      const discordCard = allCards.find(c => c.textContent.includes('Discord Rich Presence'));
      if (!discordCard) return resolve(null);
      discordCard.scrollIntoView({ behavior: 'instant', block: 'center' });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const r = discordCard.getBoundingClientRect();
          resolve({
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height)
          });
        });
      });
    })
  `);

  console.log('Scrolled card rect after RAF:', rect);
  await new Promise(r => setTimeout(r, 600));

  const cardImg = await win.webContents.capturePage({
    x: Math.max(0, rect.x - 4),
    y: Math.max(0, rect.y - 4),
    width: rect.width + 8,
    height: rect.height + 8
  });

  await fs.mkdir(path.dirname(docsPath), { recursive: true });
  await fs.writeFile(docsPath, cardImg.toPNG());
  if (artifactPath) {
    await fs.writeFile(artifactPath, cardImg.toPNG());
  }
  console.log('SUCCESS: Saved card screenshot, size:', cardImg.getSize());

  win.close();
  app.quit();
});
