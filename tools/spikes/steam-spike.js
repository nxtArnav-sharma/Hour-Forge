const fs = require('fs');
const path = require('path');
const os = require('os');

const originalCwd = process.cwd();
const appId = parseInt(process.argv[2] || '3513350', 10);
const durationSec = parseInt(process.argv[3] || '60', 10);

console.log(`[STEAM_SPIKE] Starting spike for App ID: ${appId} (duration: ${durationSec}s)`);
console.log(`[STEAM_SPIKE] Process PID: ${process.pid}`);

// Create isolated temporary directory for steam_appid.txt
const tempDir = path.join(os.tmpdir(), `hourforge_spike_${Date.now()}`);
fs.mkdirSync(tempDir, { recursive: true });

const appIdFilePath = path.join(tempDir, 'steam_appid.txt');
fs.writeFileSync(appIdFilePath, String(appId), 'utf-8');

// Switch process cwd to tempDir so Steamworks finds steam_appid.txt locally
process.chdir(tempDir);
process.env.SteamAppId = String(appId);
process.env.SteamGameId = String(appId);

function cleanup() {
  try {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('[STEAM_SPIKE] Cleaned up temporary steam_appid directory.');
    }
  } catch (e) {
    // ignore
  }
}

let client = null;

function shutdownCleanly() {
  if (client && typeof client.shutdown === 'function') {
    try {
      client.shutdown();
      console.log('[STEAM_SPIKE] client.shutdown() called cleanly.');
    } catch (e) {
      // ignore
    }
  }
  cleanup();
}

process.on('exit', shutdownCleanly);
process.on('SIGINT', () => {
  console.log('[STEAM_SPIKE] Received SIGINT, exiting...');
  shutdownCleanly();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('[STEAM_SPIKE] Received SIGTERM, exiting...');
  shutdownCleanly();
  process.exit(0);
});

let steamworks;
try {
  steamworks = require('steamworks.js');
} catch (err) {
  console.error('[STEAM_SPIKE] Failed to require steamworks.js:', err.message || err);
  cleanup();
  process.exit(1);
}

try {
  console.log(`[STEAM_SPIKE] Initializing Steamworks API for App ID ${appId}...`);
  client = steamworks.init(appId);
  console.log('[STEAM_SPIKE] Steamworks API initialized successfully!');
} catch (err) {
  console.error('[STEAM_SPIKE] steamworks.init() error:', err.message || err);
  cleanup();
  process.exit(1);
}

// Inspect status flags (NO account name or SteamID logged)
try {
  const isInstalled = client.apps?.isAppInstalled?.(appId);
  const isSubscribed = client.apps?.isSubscribedApp?.(appId);
  console.log(`[STEAM_SPIKE] App ${appId} installed on local disk: ${Boolean(isInstalled)}`);
  console.log(`[STEAM_SPIKE] App ${appId} registered in account library: ${Boolean(isSubscribed)}`);
} catch (err) {
  console.warn('[STEAM_SPIKE] Warning reading status flags:', err.message || err);
}

console.log(`[STEAM_SPIKE] Helper process ACTIVE. Game ${appId} running in Steamworks session.`);

let elapsed = 0;
const interval = setInterval(() => {
  elapsed += 5;
  console.log(`[STEAM_SPIKE] Heartbeat: ${elapsed}s / ${durationSec}s active...`);
  if (elapsed >= durationSec) {
    console.log('[STEAM_SPIKE] Target duration reached. Shutting down cleanly...');
    clearInterval(interval);
    shutdownCleanly();
    process.exit(0);
  }
}, 5000);
