const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs/promises');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const rootDir = path.resolve(__dirname, '../..');
    const sourceIconPath = path.join(rootDir, 'assets/icon-source.png');
    const buildDir = path.join(rootDir, 'build');
    const trayDir = path.join(buildDir, 'tray');
    const docsDir = path.join(rootDir, 'docs');

    await fs.mkdir(buildDir, { recursive: true });
    await fs.mkdir(trayDir, { recursive: true });
    await fs.mkdir(docsDir, { recursive: true });

    console.log('Loading icon source from:', sourceIconPath);
    const sourceBuffer = await fs.readFile(sourceIconPath);
    const masterImg = nativeImage.createFromBuffer(sourceBuffer);
    const masterSize = masterImg.getSize();
    console.log(`Source icon dimensions: ${masterSize.width}x${masterSize.height}`);

    // 1. Generate standard App ICO with multiple resolutions (16, 24, 32, 48, 64, 128, 256)
    const icoSizes = [16, 24, 32, 48, 64, 128, 256];
    const icoImages = [];

    for (const size of icoSizes) {
      const resized = masterImg.resize({ width: size, height: size, quality: 'best' });
      const pngBuf = resized.toPNG();
      icoImages.push({ width: size, height: size, buffer: pngBuf });
    }

    // Also write build/icon.png (256x256) and build/icon-512.png
    await fs.writeFile(
      path.join(buildDir, 'icon.png'),
      masterImg.resize({ width: 256, height: 256, quality: 'best' }).toPNG()
    );
    await fs.writeFile(
      path.join(buildDir, 'icon-512.png'),
      masterImg.resize({ width: 512, height: 512, quality: 'best' }).toPNG()
    );

    // Pack into Windows ICO format
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // Reserved
    header.writeUInt16LE(1, 2); // Type 1 = Icon
    header.writeUInt16LE(icoImages.length, 4);

    let offset = 6 + icoImages.length * 16;
    const dirEntries = [];
    for (const img of icoImages) {
      const entry = Buffer.alloc(16);
      entry.writeUInt8(img.width === 256 ? 0 : img.width, 0);
      entry.writeUInt8(img.height === 256 ? 0 : img.height, 1);
      entry.writeUInt8(0, 2); // Colors
      entry.writeUInt8(0, 3); // Reserved
      entry.writeUInt16LE(1, 4); // Planes
      entry.writeUInt16LE(32, 6); // Bit count (32-bit RGBA)
      entry.writeUInt32LE(img.buffer.length, 8); // Size
      entry.writeUInt32LE(offset, 12); // Offset
      dirEntries.push(entry);
      offset += img.buffer.length;
    }

    const icoBuffer = Buffer.concat([header, ...dirEntries, ...icoImages.map(img => img.buffer)]);
    await fs.writeFile(path.join(buildDir, 'icon.ico'), icoBuffer);
    console.log(`Generated build/icon.ico (${icoBuffer.length} bytes, ${icoImages.length} resolutions)`);

    // 2. Offscreen rendering for crisp Tray Icons and Legibility Sheet
    const win = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: {
        offscreen: true,
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    const sourceDataUri = `data:image/png;base64,${sourceBuffer.toString('base64')}`;
    const sourceUri = sourceDataUri;

    const STATES = [
      { id: 'idle', label: 'Idle', color: '#94A3B8', desc: 'Muted Slate' },
      { id: 'connecting', label: 'Connecting', color: '#38BDF8', desc: 'Cyan Blue' },
      { id: 'playing', label: 'Playing', color: '#10B981', desc: 'Emerald Green' },
      { id: 'resting', label: 'Resting', color: '#F59E0B', desc: 'Amber Gold' },
      { id: 'blocked', label: 'Blocked', color: '#F97316', desc: 'Warning Orange' },
      { id: 'error', label: 'Error', color: '#EF4444', desc: 'Crimson Red' }
    ];
    const TRAY_SIZES = [16, 20, 24, 32];

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            margin: 0;
            padding: 24px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0B0E14;
            color: #E2E8F0;
          }
          h1 { margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: #FFFFFF; }
          p { margin: 0 0 20px 0; font-size: 12px; color: #94A3B8; }
          .taskbar-row {
            margin-bottom: 24px;
            padding: 16px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .taskbar-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 12px;
          }
          .grid {
            display: flex;
            gap: 20px;
            align-items: center;
          }
          .icon-cell {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
          }
          .icon-label { font-size: 10px; font-weight: 500; }
          .size-row {
            display: flex;
            gap: 12px;
            align-items: flex-end;
          }
          .bg-dark { background: #18181B; }
          .bg-light { background: #E2E8F0; color: #0F172A; }
          .bg-light .taskbar-title { color: #1E293B; }
          .bg-light .icon-label { color: #334155; }
          .bg-acrylic {
            background: linear-gradient(135deg, #1E1B4B 0%, #0F172A 50%, #1E293B 100%);
          }
        </style>
      </head>
      <body>
        <div id="contact-sheet">
          <h1>HourForge Tray Icon Legibility & Status Dots Audit</h1>
          <p>Master Source: assets/icon-source.png &bull; Target Sizes: 16px, 20px, 24px, 32px &bull; High Contrast Halo & Status Badges</p>

          <div class="taskbar-row bg-dark">
            <div class="taskbar-title">Windows 11 Dark Taskbar (#18181B) &mdash; 1x and 2x Magnified</div>
            <div class="grid" id="grid-dark"></div>
          </div>

          <div class="taskbar-row bg-light">
            <div class="taskbar-title">Windows 11 Light Taskbar (#E2E8F0) &mdash; 1x and 2x Magnified</div>
            <div class="grid" id="grid-light"></div>
          </div>

          <div class="taskbar-row bg-acrylic">
            <div class="taskbar-title">Windows 11 Translucent / Mica Taskbar &mdash; 1x and 2x Magnified</div>
            <div class="grid" id="grid-acrylic"></div>
          </div>
        </div>

        <script>
          const sourceUri = "${sourceUri}";
          const states = ${JSON.stringify(STATES)};
          const sizes = ${JSON.stringify(TRAY_SIZES)};

          function renderIconToCanvas(size, stateColor) {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            return new Promise(resolve => {
              const img = new Image();
              img.onload = () => {
                // Draw base hourglass
                ctx.drawImage(img, 0, 0, size, size);

                // Calculate status dot position and size
                // Dot placed at bottom-right
                let dotRadius, cx, cy, haloRadius;
                if (size === 16) {
                  dotRadius = 2.4;
                  haloRadius = 3.6;
                  cx = 12.6;
                  cy = 12.6;
                } else if (size === 20) {
                  dotRadius = 3.0;
                  haloRadius = 4.4;
                  cx = 15.6;
                  cy = 15.6;
                } else if (size === 24) {
                  dotRadius = 3.6;
                  haloRadius = 5.2;
                  cx = 18.6;
                  cy = 18.6;
                } else { // 32
                  dotRadius = 4.8;
                  haloRadius = 6.8;
                  cx = 25.0;
                  cy = 25.0;
                }

                // 1. Dark high-contrast halo (ensures dot pops on light and dark backgrounds)
                ctx.beginPath();
                ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
                ctx.fillStyle = '#0B0E14';
                ctx.fill();

                // 2. Main status dot circle
                ctx.beginPath();
                ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
                ctx.fillStyle = stateColor;
                ctx.fill();

                // 3. Subtle inner glass specular highlight
                ctx.beginPath();
                ctx.arc(cx - dotRadius * 0.35, cy - dotRadius * 0.35, dotRadius * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.fill();

                resolve(canvas);
              };
              img.src = sourceUri;
            });
          }

          async function buildAll() {
            window.renderedIcons = {};
            for (const st of states) {
              window.renderedIcons[st.id] = {};
              for (const sz of sizes) {
                const cvs = await renderIconToCanvas(sz, st.color);
                window.renderedIcons[st.id][sz] = cvs.toDataURL('image/png');
              }
            }

            // Populate preview grids
            const containerIds = ['grid-dark', 'grid-light', 'grid-acrylic'];
            for (const gridId of containerIds) {
              const grid = document.getElementById(gridId);
              for (const st of states) {
                const cell = document.createElement('div');
                cell.className = 'icon-cell';

                const sizeRow = document.createElement('div');
                sizeRow.className = 'size-row';

                // Render 16, 24, 32 at 1x
                for (const sz of [16, 24, 32]) {
                  const img = document.createElement('img');
                  img.src = window.renderedIcons[st.id][sz];
                  img.width = sz;
                  img.height = sz;
                  img.title = st.label + ' ' + sz + 'px';
                  sizeRow.appendChild(img);
                }

                // Render 32 at 2x (zoomed to 64px)
                const zoomImg = document.createElement('img');
                zoomImg.src = window.renderedIcons[st.id][32];
                zoomImg.width = 48;
                zoomImg.height = 48;
                zoomImg.style.imageRendering = 'pixelated';
                zoomImg.title = st.label + ' 32px (magnified)';
                sizeRow.appendChild(zoomImg);

                const lbl = document.createElement('div');
                lbl.className = 'icon-label';
                lbl.textContent = st.label;

                cell.appendChild(sizeRow);
                cell.appendChild(lbl);
                grid.appendChild(cell);
              }
            }
            window.renderComplete = true;
          }

          buildAll();
        </script>
      </body>
      </html>
    `;

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    // Wait until rendering completes
    for (let i = 0; i < 50; i++) {
      const done = await win.webContents.executeJavaScript('Boolean(window.renderComplete)');
      if (done) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // Extract rendered PNG data URLs from offscreen window
    const renderedIcons = await win.webContents.executeJavaScript('window.renderedIcons');

    for (const [stateId, sizeMap] of Object.entries(renderedIcons)) {
      for (const [sz, dataUri] of Object.entries(sizeMap)) {
        const base64Data = dataUri.replace(/^data:image\/png;base64,/, '');
        const outPath = path.join(trayDir, `tray-${stateId}-${sz}.png`);
        await fs.writeFile(outPath, Buffer.from(base64Data, 'base64'));
      }
    }
    console.log(`Generated ${Object.keys(renderedIcons).length * TRAY_SIZES.length} tray icon variants in build/tray/`);

    // Capture Legibility Contact Sheet
    await new Promise(r => setTimeout(r, 200));
    const legibilityPage = await win.webContents.capturePage({ x: 0, y: 0, width: 1160, height: 780 });
    const legibilityPng = legibilityPage.toPNG();
    const legibilityDocPath = path.join(docsDir, 'tray-icons-legibility.png');
    await fs.writeFile(legibilityDocPath, legibilityPng);
    console.log(`Saved tray icons legibility audit sheet to ${legibilityDocPath} (${legibilityPng.length} bytes)`);

    // Copy to brain screenshots directory if exists
    const brainScreenshotsDir = process.env.HOURFORGE_BRAIN_DIR || '';
    if (brainScreenshotsDir) {
      try {
        await fs.mkdir(brainScreenshotsDir, { recursive: true });
        await fs.writeFile(path.join(brainScreenshotsDir, 'tray-icons-legibility.png'), legibilityPng);
      } catch (e) {
        // Ignore optional artifact copy
      }
    }
      console.log('Copied legibility audit screenshot to brain screenshots');
    } catch {
      // ignore
    }

    win.destroy();
    app.quit();
  } catch (err) {
    console.error('Failed generating icons:', err);
    process.exit(1);
  }
});
