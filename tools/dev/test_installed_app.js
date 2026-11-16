const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testInstalledApp() {
  const exePath = 'C:\\HourForge_Throwaway\\HourForge.exe';
  if (!fs.existsSync(exePath)) {
    throw new Error(`Executable not found at ${exePath}`);
  }

  console.log('Testing installed app at:', exePath);

  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  return new Promise((resolve, reject) => {
    const child = spawn(exePath, ['--exit-after-ms', '3000'], {
      env: cleanEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => {
      stdout += d.toString();
      process.stdout.write(d);
    });

    child.stderr.on('data', d => {
      stderr += d.toString();
      process.stderr.write(d);
    });

    const timeout = setTimeout(() => {
      console.log('Force killing after timeout...');
      child.kill();
      resolve({ stdout, stderr, timedOut: true });
    }, 6000);

    child.on('close', code => {
      clearTimeout(timeout);
      console.log(`\nInstalled HourForge process exited with code: ${code}`);
      resolve({ stdout, stderr, code, timedOut: false });
    });

    child.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

testInstalledApp()
  .then(res => {
    console.log('Installed app test completed successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Installed app test failed:', err);
    process.exit(1);
  });

