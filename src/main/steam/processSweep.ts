import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';

export interface ProcessInfo {
  pid: number;
  name?: string;
  executablePath?: string;
  commandLine?: string;
}

/**
 * Checks whether `childPath` resides strictly inside `parentDir` comparing whole path segments.
 * Case-insensitive, separator-agnostic.
 * E.g., ".../HourForge/helpers/3513350.pid" inside ".../HourForge/helpers" -> TRUE
 * E.g., ".../HourForge/helpers-old/3513350.pid" inside ".../HourForge/helpers" -> FALSE
 */
export function isPathInsideDirectory(childPath: string, parentDir: string): boolean {
  if (!childPath || !parentDir) return false;
  const normChild = path.normalize(path.resolve(childPath)).toLowerCase();
  const normParent = path.normalize(path.resolve(parentDir)).toLowerCase();

  const rel = path.relative(normParent, normChild);
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Verifies whether a running process is genuinely an HourForge helper:
 * 1. Executable path is inside one of HourForge's allowed install / runtime directories (or matches HourForge.exe).
 * 2. Command line explicitly contains "steamHelper".
 * Prevents killing unrelated processes if OS reuses a PID.
 */
export function verifyIsHourForgeHelper(
  proc: { executablePath?: string; commandLine?: string } | null,
  allowedDirs: string[]
): boolean {
  if (!proc || !proc.commandLine) return false;

  // 1. Command line MUST contain steamHelper (case-insensitive)
  const normCmd = proc.commandLine.toLowerCase();
  if (!normCmd.includes('steamhelper')) {
    return false;
  }

  // 2. Executable path check: must be inside an allowed HourForge directory
  if (proc.executablePath) {
    const isInsideAllowed = allowedDirs.some(dir =>
      isPathInsideDirectory(proc.executablePath!, dir)
    );
    if (isInsideAllowed) return true;

    // Check if the executable filename itself is HourForge.exe or electron.exe
    const exeName = path.basename(proc.executablePath).toLowerCase();
    if (exeName === 'hourforge.exe') {
      return true;
    }
  }

  return false;
}

/**
 * Native-free query for Windows process info using PowerShell CIM query.
 */
export function queryWindowsProcessInfo(
  pid: number
): Promise<{ executablePath?: string; commandLine?: string } | null> {
  return new Promise(resolve => {
    const psCmd = `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object ProcessId, ExecutablePath, CommandLine | ConvertTo-Json -Compress`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { timeout: 3000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          return resolve(null);
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve({
            executablePath: parsed.ExecutablePath || undefined,
            commandLine: parsed.CommandLine || undefined
          });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Cleans up a pidfile: verifies the process is an HourForge helper before killing.
 * If process is unrelated (reused PID) or already dead, deletes the pidfile and DOES NOT kill.
 */
export async function cleanupPidFileWithVerification(options: {
  pidPath: string;
  helpersDir: string;
  allowedDirs: string[];
  getProcessInfo?: (pid: number) => Promise<{ executablePath?: string; commandLine?: string } | null>;
  killProcess?: (pid: number) => void;
}): Promise<{ deletedPidFile: boolean; killedProcess: boolean }> {
  const { pidPath, helpersDir, allowedDirs } = options;
  const getProcessInfo = options.getProcessInfo || queryWindowsProcessInfo;
  const killProcess =
    options.killProcess ||
    (pid => {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    });

  if (!isPathInsideDirectory(pidPath, helpersDir)) {
    return { deletedPidFile: false, killedProcess: false };
  }

  if (!fs.existsSync(pidPath)) {
    return { deletedPidFile: false, killedProcess: false };
  }

  let pid = 0;
  try {
    const content = await fs.promises.readFile(pidPath, 'utf-8');
    pid = parseInt(content.trim(), 10);
  } catch {
    // If unreadable, remove stale file
    try {
      await fs.promises.unlink(pidPath);
    } catch {}
    return { deletedPidFile: true, killedProcess: false };
  }

  let killed = false;
  if (pid && !isNaN(pid) && pid > 0) {
    try {
      const procInfo = await getProcessInfo(pid);
      if (procInfo && verifyIsHourForgeHelper(procInfo, allowedDirs)) {
        killProcess(pid);
        killed = true;
      }
    } catch {
      // ignore query error
    }
  }

  // Always unlink stale pidfile
  try {
    await fs.promises.unlink(pidPath);
  } catch {}

  return { deletedPidFile: true, killedProcess: killed };
}

/**
 * Filters a list of running processes to identify ONLY those helper instances
 * whose script path or working directory strictly resides inside HourForge's own directory.
 */
export function filterStaleHourForgeHelperProcesses(
  processes: ProcessInfo[],
  hourforgeHelpersDir: string
): ProcessInfo[] {
  return processes.filter(proc => {
    if (proc.executablePath && isPathInsideDirectory(proc.executablePath, hourforgeHelpersDir)) {
      return true;
    }

    if (proc.commandLine) {
      const tokens = proc.commandLine.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      for (const token of tokens) {
        const clean = token.replace(/^"(.*)"$/, '$1');
        if (clean.includes('helpers') && isPathInsideDirectory(clean, hourforgeHelpersDir)) {
          return true;
        }
      }
    }

    return false;
  });
}
