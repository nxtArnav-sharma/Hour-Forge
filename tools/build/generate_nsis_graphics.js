const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function encodeBmp24(width, height, rgbaBuffer) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buf = Buffer.alloc(fileSize);

  // File header (14 bytes)
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);

  // DIB Header (40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-up
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelArraySize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Pixels (bottom-up, BGR)
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    const destRowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const srcOffset = (srcY * width + x) * 4;
      const r = rgbaBuffer[srcOffset];
      const g = rgbaBuffer[srcOffset + 1];
      const b = rgbaBuffer[srcOffset + 2];
      const destOffset = destRowOffset + x * 3;
      buf[destOffset] = b;
      buf[destOffset + 1] = g;
      buf[destOffset + 2] = r;
    }
  }
  return buf;
}

app.whenReady().then(async () => {
  try {
    const rootDir = path.resolve(__dirname, '../..');
    const sourceIconPath = path.join(rootDir, 'build/icon.png');
    const buildDir = path.join(rootDir, 'build');

    const iconBuffer = await fs.readFile(sourceIconPath);
    const iconDataUri = `data:image/png;base64,${iconBuffer.toString('base64')}`;

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: {
        offscreen: true,
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: transparent;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            gap: 20px;
            padding: 20px;
          }
          /* 164 x 314 Sidebar Container */
          .sidebar-card {
            width: 164px;
            height: 314px;
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: 24px 12px 16px 12px;
            background: linear-gradient(180deg, #07090E 0%, #101626 50%, #07090E 100%);
            border-right: 1px solid rgba(255, 255, 255, 0.08);
          }
          .sidebar-card::before {
            content: '';
            position: absolute;
            top: 25%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 140px;
            height: 140px;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.35) 0%, rgba(99, 102, 241, 0.12) 50%, transparent 75%);
            pointer-events: none;
          }
          .uninstaller::before {
            background: radial-gradient(circle, rgba(239, 68, 68, 0.25) 0%, rgba(168, 85, 247, 0.10) 50%, transparent 75%);
          }
          .icon-glass-plate {
            width: 104px;
            height: 104px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            z-index: 2;
          }
          .icon-img {
            width: 80px;
            height: 80px;
            object-fit: contain;
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5));
          }
          .branding {
            text-align: center;
            z-index: 2;
            margin-top: 8px;
          }
          .app-title {
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 0.12em;
            color: #FFFFFF;
            text-transform: uppercase;
            text-shadow: 0 2px 8px rgba(0,0,0,0.8);
          }
          .app-subtitle {
            font-size: 9px;
            font-weight: 500;
            color: #94A3B8;
            margin-top: 3px;
            letter-spacing: 0.04em;
          }
          .footer-badge {
            z-index: 2;
            padding: 4px 8px;
            background: rgba(139, 92, 246, 0.12);
            border: 1px solid rgba(139, 92, 246, 0.25);
            border-radius: 999px;
            font-size: 8px;
            font-weight: 600;
            color: #C4B5FD;
            letter-spacing: 0.04em;
            text-align: center;
          }
          .footer-badge-uninst {
            background: rgba(239, 68, 68, 0.10);
            border-color: rgba(239, 68, 68, 0.25);
            color: #FCA5A5;
          }

          /* 150 x 57 Header Container */
          .header-card {
            width: 150px;
            height: 57px;
            position: relative;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 14px;
            background: linear-gradient(90deg, #07090E 0%, #0F1422 60%, #151C2E 100%);
          }
          .header-card::before {
            content: '';
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            width: 50px;
            height: 50px;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%);
            pointer-events: none;
          }
          .header-icon {
            width: 40px;
            height: 40px;
            position: relative;
            z-index: 2;
            filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.7));
          }
        </style>
      </head>
      <body>
        <div id="installer-sidebar" class="sidebar-card">
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="icon-glass-plate">
              <img src="${iconDataUri}" class="icon-img" />
            </div>
            <div class="branding">
              <div class="app-title">HourForge</div>
              <div class="app-subtitle">Playtime Keeper</div>
            </div>
          </div>
          <div class="footer-badge">Steam Guard Safe</div>
        </div>

        <div id="uninstaller-sidebar" class="sidebar-card uninstaller">
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="icon-glass-plate" style="border-color: rgba(255,255,255,0.08);">
              <img src="${iconDataUri}" class="icon-img" />
            </div>
            <div class="branding">
              <div class="app-title">HourForge</div>
              <div class="app-subtitle">Uninstall Wizard</div>
            </div>
          </div>
          <div class="footer-badge footer-badge-uninst">Data Preserved</div>
        </div>

        <div id="installer-header" class="header-card">
          <img src="${iconDataUri}" class="header-icon" />
        </div>
      </body>
      </html>
    `;

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    // Wait for layout and image render
    await new Promise(r => setTimeout(r, 600));

    // Render elements to PNG buffers via element bounding rects
    const elements = [
      { id: 'installer-sidebar', file: 'installerSidebar.bmp', width: 164, height: 314 },
      { id: 'uninstaller-sidebar', file: 'uninstallerSidebar.bmp', width: 164, height: 314 },
      { id: 'installer-header', file: 'installerHeader.bmp', width: 150, height: 57 }
    ];

    for (const el of elements) {
      const rect = await win.webContents.executeJavaScript(`
        (() => {
          const domEl = document.getElementById("${el.id}");
          const r = domEl.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        })()
      `);

      const nativeImg = await win.webContents.capturePage({
        x: rect.x,
        y: rect.y,
        width: el.width,
        height: el.height
      });

      const rgba = nativeImg.toBitmap(); // raw BGRA or RGBA
      // Electron toBitmap() returns BGRA buffer on Windows, convert to RGBA
      const rgbaBuf = Buffer.alloc(el.width * el.height * 4);
      for (let i = 0; i < el.width * el.height; i++) {
        const b = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const r = rgba[i * 4 + 2];
        const a = rgba[i * 4 + 3];
        rgbaBuf[i * 4] = r;
        rgbaBuf[i * 4 + 1] = g;
        rgbaBuf[i * 4 + 2] = b;
        rgbaBuf[i * 4 + 3] = a;
      }

      const bmpBuf = encodeBmp24(el.width, el.height, rgbaBuf);
      const targetPath = path.join(buildDir, el.file);
      await fs.writeFile(targetPath, bmpBuf);

      // Also save PNG version for high-res preview/reference
      await fs.writeFile(path.join(buildDir, el.file.replace('.bmp', '.png')), nativeImg.toPNG());

      console.log(`Generated ${el.file} (${el.width}x${el.height}, ${bmpBuf.length} bytes)`);
    }

    win.destroy();
    app.quit();
  } catch (err) {
    console.error('Error generating NSIS graphics:', err);
    process.exit(1);
  }
});
