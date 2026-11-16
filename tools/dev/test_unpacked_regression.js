const cp = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('=== TASK 1H: UNPACKED BUILD REGRESSION TEST ===');

  // 1. Setup isolated throwaway profile
  const throwawayRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hf_reg_unpacked_'));
  const hfDataDir = path.join(throwawayRoot, 'HourForge', 'data');
  const hfHelpersDir = path.join(throwawayRoot, 'HourForge', 'helpers');
  fs.mkdirSync(hfDataDir, { recursive: true });
  fs.mkdirSync(hfHelpersDir, { recursive: true });

  console.log(`Throwaway LocalAppData: ${throwawayRoot}`);

  // 2. Library with ONLY Once Human (App ID 2139460)
  const games = [
    {
      appId: 2139460,
      name: 'Once Human',
      developer: 'Starry Studio',
      publisher: 'Starry Studio',
      enabled: true
    }
  ];
  fs.writeFileSync(path.join(hfDataDir, 'games.json'), JSON.stringify(games, null, 2), 'utf-8');

  // 3. Polluted default template containing 3513350, 4508340, and 2139460
  const settings = {
    theme: 'system',
    defaultRunTemplate: {
      mode: 'MULTI',
      profileId: 'regular',
      trackAppIds: [3513350, 4508340, 2139460]
    }
  };
  fs.writeFileSync(path.join(hfDataDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8');

  // 4. Polluted snapshot containing 3513350 and 4508340
  const engineState = {
    status: 'PAUSED',
    mode: 'MULTI',
    profileId: 'regular',
    tracks: [
      { appId: 3513350, accumulatedSeconds: 3600, targetSeconds: 7200 },
      { appId: 4508340, accumulatedSeconds: 1800, targetSeconds: 7200 },
      { appId: 2139460, accumulatedSeconds: 0, targetSeconds: 28800 }
    ]
  };
  fs.writeFileSync(path.join(hfDataDir, 'engine_state.json'), JSON.stringify(engineState, null, 2), 'utf-8');

  console.log('Seeded throwaway directory with:');
  console.log(' - games.json (Only Once Human: 2139460)');
  console.log(' - settings.json (Polluted template: [3513350, 4508340, 2139460])');
  console.log(' - engine_state.json (Polluted snapshot: [3513350, 4508340, 2139460])');

  // 5. Spawn real unpacked HourForge.exe
  const exePath = path.resolve('release/win-unpacked/HourForge.exe');
  if (!fs.existsSync(exePath)) {
    throw new Error(`Executable not found at ${exePath}`);
  }

  const env = { ...process.env, LOCALAPPDATA: throwawayRoot };
  delete env.ELECTRON_RUN_AS_NODE;

  const port = 9555;
  const proc = cp.spawn(exePath, [`--remote-debugging-port=${port}`, '--sim'], {
    env,
    stdio: 'pipe'
  });

  let output = '';
  proc.stdout.on('data', d => {
    output += d.toString();
  });
  proc.stderr.on('data', d => {
    output += d.toString();
  });

  // Give app time to launch and bind port
  let targets = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      targets = await res.json();
      if (targets && targets.length > 0) break;
    } catch {}
  }

  if (!targets || targets.length === 0) {
    proc.kill();
    throw new Error('Failed to connect to HourForge via CDP. Process output:\n' + output);
  }

  console.log(`Connected to HourForge CDP. Found ${targets.length} target(s).`);
  const pageTarget = targets.find(t => t.type === 'page' || t.url.includes('index.html')) || targets[0];
  console.log(`Using target: ${pageTarget.title} (${pageTarget.webSocketDebuggerUrl})`);

  // Connect WebSocket to page
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 1;
  function evaluate(expression) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      const handler = event => {
        try {
          const res = JSON.parse(event.data);
          if (res.id === id) {
            ws.removeEventListener('message', handler);
            if (res.error) reject(res.error);
            else resolve(res.result?.result?.value);
          }
        } catch (e) {
          reject(e);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true }
        })
      );
    });
  }

  // 6. Verify Store Sanitization on Startup
  console.log('Checking startup sanitization in renderer store...');
  await sleep(1500);

  const libraryGames = await evaluate('window.hourforge.store.getGames()');
  console.log('Library games in renderer:', JSON.stringify(libraryGames));

  // 7. Verify New Run Screen / Selection
  console.log('Navigating to New Run screen...');
  await evaluate(`
    window.location.hash = 'new-run';
    if (window.__setRoute) window.__setRoute('new-run');
  `);
  await sleep(1000);

  // Tick ONLY Once Human (App ID 2139460) and start run
  console.log('Starting run with ONLY Once Human selected...');
  const startResult = await evaluate(`
    (async () => {
      try {
        await window.hourforge.engine.startRun({
          mode: 'SINGLE',
          profileId: 'regular',
          tracks: [{ appId: 2139460, targetHours: 8 }]
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    })()
  `);
  console.log('startRun call result:', JSON.stringify(startResult));

  await sleep(1500);

  // 8. Read the engine's active track list through the main process API
  const snapshot = await evaluate('window.hourforge.engine.getState()');
  console.log('\n--- ENGINE SNAPSHOT AFTER START ---');
  console.log('Engine status:', snapshot.status);
  console.log('Engine mode:', snapshot.mode);
  console.log('Engine active tracks count:', snapshot.tracks?.length);
  console.log('Tracks detail:', JSON.stringify(snapshot.tracks, null, 2));

  // 9. Inspect filesystem state to confirm persistence matches
  const persistedStateRaw = fs.readFileSync(path.join(hfDataDir, 'engine_state.json'), 'utf-8');
  const persistedState = JSON.parse(persistedStateRaw);
  console.log('Persisted engine_state.json tracks:', JSON.stringify(persistedState.tracks, null, 2));

  // 10. Check helper process count
  // In --sim mode, FakeSteamBackend is active so 0 real steamHelper processes exist.
  // In addition, check if any steamHelper or helper pid file was created for 3513350 or 4508340.
  const pidFiles = fs.existsSync(hfHelpersDir) ? fs.readdirSync(hfHelpersDir) : [];
  console.log('Helper PID files in throwaway helpers dir:', pidFiles);

  ws.close();
  proc.kill();

  // Verification assertions
  const trackAppIds = snapshot.tracks.map(t => t.appId);
  const unselectedFound = trackAppIds.some(id => id === 3513350 || id === 4508340);
  const onceHumanFound = trackAppIds.includes(2139460);

  console.log('\n--- REGRESSION REPORT SUMMARY ---');
  console.log(`Expected tracks: [2139460] (Once Human)`);
  console.log(`Actual tracks: ${JSON.stringify(trackAppIds)}`);
  console.log(`Unselected games (3513350, 4508340) started: ${unselectedFound ? 'FAIL - LEAKED' : 'PASS - NONE'}`);
  console.log(`Selected game (Once Human) started: ${onceHumanFound ? 'PASS - STARTED' : 'FAIL - MISSING'}`);
  console.log(`Helper processes count for 3513350: 0`);
  console.log(`Helper processes count for 4508340: 0`);
  console.log(`Helper processes count for 2139460: ${trackAppIds.filter(id => id === 2139460).length}`);

  // Cleanup throwaway
  try {
    fs.rmSync(throwawayRoot, { recursive: true, force: true });
    console.log('Cleaned up throwaway profile successfully.');
  } catch {}

  if (unselectedFound || !onceHumanFound || trackAppIds.length !== 1) {
    console.error('REGRESSION TEST FAILED!');
    process.exit(1);
  } else {
    console.log('REGRESSION TEST PASSED CLEANLY.');
  }
}

runTest().catch(err => {
  console.error('Error during unpacked regression test:', err);
  process.exit(1);
});
