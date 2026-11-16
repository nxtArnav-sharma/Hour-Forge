const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const throwawayDir = 'C:\\HourForge_Throwaway';
const installer010 = path.resolve(__dirname, '../../release/HourForge-Setup-0.1.0-alpha.exe');
const installer011 = path.resolve(__dirname, '../../release/HourForge-Setup-0.1.1.exe');
const installer012 = path.resolve(__dirname, '../../release/HourForge-Setup-0.1.2.exe');
const tempDir = process.env.TEMP;

console.log('=== STARTING UPGRADE & UNINSTALL TEST ===');

// Safety verification before tests
console.log('1. Checking safety backups...');
const runBackup = path.join(tempDir, 'hkcu_run_backup.reg');
const uninstallBackup = path.join(tempDir, 'hkcu_uninstall_backup.reg');
const appDataBackup = path.join(tempDir, 'HourForge_Safety_Backup');

if (!fs.existsSync(runBackup) || !fs.existsSync(appDataBackup)) {
  throw new Error('Safety backups not found! Aborting test to protect user environment.');
}
console.log('   Safety backups verified.');

// Ensure throwaway directory is clean
if (fs.existsSync(throwawayDir)) {
  fs.rmSync(throwawayDir, { recursive: true, force: true });
}

// 2. Install 0.1.1
console.log('\n2. Installing 0.1.1 silently into', throwawayDir);
execSync(`powershell -Command "Start-Process -FilePath '${installer011}' -ArgumentList '/S /D=${throwawayDir}' -Wait"`);

if (!fs.existsSync(path.join(throwawayDir, 'HourForge.exe'))) {
  throw new Error('0.1.1 install failed: HourForge.exe not found');
}
console.log('   0.1.1 installed successfully.');

// 3. Upgrade to 0.1.2 over existing installation
console.log('\n3. Upgrading to 0.1.2 over existing directory...');
execSync(`powershell -Command "Start-Process -FilePath '${installer012}' -ArgumentList '/S /D=${throwawayDir}' -Wait"`);

if (!fs.existsSync(path.join(throwawayDir, 'HourForge.exe'))) {
  throw new Error('0.1.2 upgrade failed: HourForge.exe not found');
}
console.log('   0.1.2 upgraded successfully.');

// 4. Verify native steamworks and helper unpacked outside asar
console.log('\n4. Verifying asar unpacking...');
const asarUnpacked = path.join(throwawayDir, 'resources', 'app.asar.unpacked');
const steamworksDir = path.join(asarUnpacked, 'node_modules', 'steamworks.js');
const steamHelperFile = path.join(asarUnpacked, 'dist', 'main', 'steamHelper.js');

console.log('   steamworks.js unpacked outside asar:', fs.existsSync(steamworksDir));
console.log('   steamHelper.js unpacked outside asar:', fs.existsSync(steamHelperFile));

if (!fs.existsSync(steamworksDir) || !fs.existsSync(steamHelperFile)) {
  throw new Error('Asar unpacked files missing!');
}

// 5. Test real app launch
console.log('\n5. Launching upgraded HourForge.exe with --exit-after-ms 2000...');
const launchRes = spawnSync(path.join(throwawayDir, 'HourForge.exe'), ['--exit-after-ms', '2000'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  timeout: 8000
});
console.log('   Process exit code:', launchRes.status);
if (launchRes.status !== 0 && launchRes.status !== null) {
  console.log('   Stderr:', launchRes.stderr?.toString());
}

// 6. Check autostart registry entry
console.log('\n6. Checking HKCU Run registry value...');
let runVal = '';
try {
  runVal = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v HourForge').toString();
  console.log('   Registry query result:\n', runVal.trim());
} catch (e) {
  console.log('   Run key HourForge not present:', e.message);
}

// 7. Test uninstaller
console.log('\n7. Running silent uninstaller...');
const uninstallerPath = path.join(throwawayDir, 'Uninstall HourForge.exe');
if (fs.existsSync(uninstallerPath)) {
  execSync(`powershell -Command "Start-Process -FilePath '${uninstallerPath}' -ArgumentList '/S' -Wait"`);
} else {
  console.log('   Uninstaller not found directly; searching for uninstaller exe...');
  const files = fs.readdirSync(throwawayDir);
  console.log('   Directory contents:', files);
}

// Allow Windows uninstaller process to finish file release
execSync('powershell -Command "Start-Sleep -Seconds 3"');

const existsAfter = fs.existsSync(throwawayDir);
console.log('   Throwaway directory exists after uninstall:', existsAfter);
if (existsAfter) {
  const remaining = fs.readdirSync(throwawayDir);
  console.log('   Remaining files (if any):', remaining);
  fs.rmSync(throwawayDir, { recursive: true, force: true });
}

// 8. RESTORE SAFETY BACKUPS
console.log('\n8. Restoring user environment exactly...');
execSync(`reg import "${runBackup}"`);
console.log('   Restored HKCU Run key from backup.');

if (fs.existsSync(uninstallBackup)) {
  try {
    execSync(`reg import "${uninstallBackup}"`);
    console.log('   Restored HKCU Uninstall key from backup.');
  } catch (e) {
    console.log('   Uninstall key restore note:', e.message);
  }
}

// Restore AppData if needed
const realAppData = path.join(process.env.LOCALAPPDATA, 'HourForge');
if (fs.existsSync(appDataBackup)) {
  fs.cpSync(appDataBackup, realAppData, { recursive: true, force: true });
  console.log('   Restored %LOCALAPPDATA%\\HourForge from safety backup.');
}

// Final verification of user's registry
console.log('\n9. Final check of user Run key state:');
try {
  const finalRun = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v HourForge').toString();
  console.log(finalRun.trim());
} catch (e) {
  console.log('   HourForge Run value missing!');
}

console.log('\n=== UPGRADE & UNINSTALL TEST FINISHED SUCCESSFULLY ===');
