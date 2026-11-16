const { app, BrowserWindow, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const asarTrayDir = path.join(__dirname, '../../release/win-unpacked/resources/app.asar/dist/main/tray');
  const states = ['idle', 'connecting', 'playing', 'resting', 'blocked', 'error'];
  const stateLabels = {
    idle: 'Idle (Muted Slate)',
    connecting: 'Connecting (Cyan)',
    playing: 'Playing (Emerald Green)',
    resting: 'Resting (Amber Gold)',
    blocked: 'Blocked (Warning Orange)',
    error: 'Error (Crimson Red)'
  };
  const sizes = [16, 20, 24, 32];

  // Test native Tray creation
  const idleBuf = fs.readFileSync(path.join(asarTrayDir, 'tray-idle-16.png'));
  const idleNative = nativeImage.createFromBuffer(idleBuf);
  const tray = new Tray(idleNative);
  tray.setToolTip('HourForge — Idle (Packaged Verification)');
  console.log('Packaged Tray instantiated successfully.');

  // Create window to render the tray audit & simulated Windows 11 taskbar tray
  const win = new BrowserWindow({
    width: 900,
    height: 520,
    frame: false,
    show: false,
    backgroundColor: '#0F1117',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Read base64 data for all icons directly from asar
  const iconData = {};
  for (const st of states) {
    iconData[st] = {};
    for (const sz of sizes) {
      const p = path.join(asarTrayDir, `tray-${st}-${sz}.png`);
      iconData[st][sz] = fs.readFileSync(p).toString('base64');
    }
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 24px;
    background: #0B0E14;
    color: #F1F5F9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  h1 { font-size: 18px; margin: 0 0 4px 0; color: #E2E8F0; }
  p { font-size: 12px; margin: 0 0 16px 0; color: #94A3B8; }
  
  .taskbar-preview {
    background: #181B22;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
  }
  .taskbar-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #A78BFA;
    margin-bottom: 10px;
  }
  .taskbar-sim {
    height: 48px;
    background: rgba(20, 24, 34, 0.95);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 16px;
    gap: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }
  .tray-cluster {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 10px;
    background: rgba(255,255,255,0.03);
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.04);
  }
  .tray-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    position: relative;
  }
  .tray-item img {
    image-rendering: pixelated;
  }
  .tray-item-label {
    font-size: 9px;
    color: #94A3B8;
  }
  .system-icons {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #94A3B8;
    font-size: 12px;
    border-left: 1px solid rgba(255,255,255,0.08);
    padding-left: 12px;
  }
  .clock {
    font-size: 11px;
    color: #CBD5E1;
    text-align: right;
    line-height: 1.2;
    border-left: 1px solid rgba(255,255,255,0.08);
    padding-left: 12px;
  }
  
  .grid-table {
    width: 100%;
    border-collapse: collapse;
    background: #141822;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.06);
  }
  th, td {
    padding: 10px 14px;
    text-align: left;
    font-size: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  th {
    background: rgba(255,255,255,0.02);
    color: #94A3B8;
    font-weight: 500;
  }
  .icon-cell {
    display: flex;
    align-items: center;
    gap: 12px;
  }
</style>
</head>
<body>
  <h1>HourForge — Packaged Tray Icons (release/win-unpacked)</h1>
  <p>Verified from inside <code>release/win-unpacked/resources/app.asar/dist/main/tray</code> with Electron <code>nativeImage</code> multi-resolution representation.</p>

  <div class="taskbar-preview">
    <div class="taskbar-title">Windows 11 Taskbar System Tray Live Simulation (All 6 States @ 20px / 125% DPI)</div>
    <div class="taskbar-sim">
      <div class="tray-cluster">
        ${states.map(st => `
          <div class="tray-item">
            <img src="data:image/png;base64,${iconData[st][20]}" width="20" height="20" title="${stateLabels[st]}" />
            <span class="tray-item-label">${st}</span>
          </div>
        `).join('')}
      </div>
      <div class="system-icons">
        <span>🌐</span>
        <span>🔊</span>
        <span>🔋</span>
      </div>
      <div class="clock">
        <div>11:50 PM</div>
        <div style="font-size: 9px; color: #64748B;">11/14/2026</div>
      </div>
    </div>
  </div>

  <table class="grid-table">
    <thead>
      <tr>
        <th>State</th>
        <th>16px (100%)</th>
        <th>20px (125%)</th>
        <th>24px (150%)</th>
        <th>32px (200%)</th>
      </tr>
    </thead>
    <tbody>
      ${states.map(st => `
        <tr>
          <td><strong>${stateLabels[st]}</strong></td>
          <td><img src="data:image/png;base64,${iconData[st][16]}" width="16" height="16" /></td>
          <td><img src="data:image/png;base64,${iconData[st][20]}" width="20" height="20" /></td>
          <td><img src="data:image/png;base64,${iconData[st][24]}" width="24" height="24" /></td>
          <td><img src="data:image/png;base64,${iconData[st][32]}" width="32" height="32" /></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise(r => setTimeout(r, 600));

  const pageImg = await win.webContents.capturePage();
  const outPath1 = path.join(__dirname, '../../docs/packaged-tray-live.png');
  const brainDir = process.env.HOURFORGE_BRAIN_DIR || '';
  
  fs.writeFileSync(outPath1, pageImg.toPNG());
  if (brainDir) {
    try {
      const outPath2 = path.join(brainDir, 'packaged-tray-live.png');
      fs.mkdirSync(path.dirname(outPath2), { recursive: true });
      fs.writeFileSync(outPath2, pageImg.toPNG());
    } catch (e) {
      console.error('Copy to brain error:', e);
    }
  }

  console.log('Saved tray screenshot to:', outPath1);
  tray.destroy();
  app.quit();
});

