const fs = require('fs');
const path = require('path');
const os = require('os');

const originalCwd = process.cwd();
const appId = parseInt(process.argv[2], 10);
const pidFilePath = process.argv[3];

if (!appId || isNaN(appId)) {
  console.error('[STEAM_HELPER] Invalid or missing App ID argument.');
  process.exit(1);
}

// Write pidfile immediately if requested
if (pidFilePath) {
  try {
    fs.mkdirSync(path.dirname(pidFilePath), { recursive: true });
    fs.writeFileSync(pidFilePath, String(process.pid), 'utf-8');
  } catch (err) {
    console.error('[STEAM_HELPER] Failed to write pidfile:', err.message);
  }
}

// Create dedicated temporary folder for steam_appid.txt
const tempDir = path.join(os.tmpdir(), `hf_helper_${appId}_${process.pid}_${Date.now()}`);
try {
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'steam_appid.txt'), String(appId), 'utf-8');
  process.chdir(tempDir);
} catch (err) {
  console.error('[STEAM_HELPER] Failed to setup temp steam_appid directory:', err.message);
}

process.env.SteamAppId = String(appId);
process.env.SteamGameId = String(appId);

let client = null;

function cleanup() {
  if (client && typeof client.shutdown === 'function') {
    try {
      client.shutdown();
    } catch (e) {
      // ignore
    }
    client = null;
  }

  try {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (e) {
    // ignore
  }

  if (pidFilePath && fs.existsSync(pidFilePath)) {
    try {
      fs.unlinkSync(pidFilePath);
    } catch (e) {
      // ignore
    }
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
process.on('message', msg => {
  if (msg === 'stop') {
    cleanup();
    process.exit(0);
  }
});

let steamworks;
try {
  steamworks = require('steamworks.js');
} catch (err) {
  console.error('[STEAM_HELPER] Failed to require steamworks.js:', err.message);
  cleanup();
  process.exit(1);
}

try {
  client = steamworks.init(appId);
  console.log(`[STEAM_HELPER] ACTIVE for App ID: ${appId} (PID: ${process.pid})`);
  if (process.send) {
    process.send({ type: 'ready', appId, pid: process.pid });
  }
} catch (err) {
  console.error(`[STEAM_HELPER] steamworks.init(${appId}) failed:`, err.message);
  cleanup();
  process.exit(2);
}

// Keep process active and check health
const healthInterval = setInterval(() => {
  // Callbacks are driven by steamworks.js internal interval
}, 1000);

