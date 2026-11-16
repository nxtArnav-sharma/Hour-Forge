const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const localAppData = process.env.LOCALAPPDATA;
const srcDir = path.join(localAppData, 'HourForge');
const backupDir = path.join(process.env.TEMP, 'HourForge_Safety_Backup');

if (fs.existsSync(srcDir)) {
  fs.cpSync(srcDir, backupDir, { recursive: true, force: true });
  console.log('Backed up LocalAppData to:', backupDir);
} else {
  console.log('No LocalAppData/HourForge found to backup');
}

const runBackupFile = path.join(process.env.TEMP, 'hkcu_run_backup.reg');
execSync(`reg export "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" "${runBackupFile}" /y`);
console.log('Exported HKCU Run key to:', runBackupFile);

const uninstallBackupFile = path.join(process.env.TEMP, 'hkcu_uninstall_backup.reg');
try {
  execSync(`reg export "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\302033df-5450-5b3d-a959-00a4e5f3ffa5" "${uninstallBackupFile}" /y`);
  console.log('Exported HKCU Uninstall key to:', uninstallBackupFile);
} catch (e) {
  console.log('No existing uninstall key found to export');
}
