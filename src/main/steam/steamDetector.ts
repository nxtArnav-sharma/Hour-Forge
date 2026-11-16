import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SteamInstallInfo {
  steamPath: string;
  steamExe: string;
}

export interface SteamClientStatus {
  isInstalled: boolean;
  isRunning: boolean;
  isLoggedOn: boolean;
  pid: number;
  activeUser: number;
  personaName: string | null;
  accountName?: string | null;
  steamId64?: string | null;
}

export interface SteamDetectorDeps {
  queryRegistry?: (key: string) => Promise<Record<string, string | number>>;
  isProcessRunning?: (pid: number) => boolean;
  readFile?: (filePath: string) => Promise<string>;
  spawnProcess?: (exe: string, args: string[]) => void;
}

export function parseLoginUsersVdf(content: string): {
  personaName: string | null;
  accountName: string | null;
  steamId64: string | null;
} {
  // Matches each user block in loginusers.vdf
  const userBlockRegex = /"(\d{15,25})"\s*\{([^}]+)\}/g;
  let mostRecentUser: {
    personaName: string | null;
    accountName: string | null;
    steamId64: string | null;
    timestamp: number;
  } | null = null;

  let match: RegExpExecArray | null;
  while ((match = userBlockRegex.exec(content)) !== null) {
    const steamId64 = match[1] || null;
    const blockBody = match[2] || '';
    const personaMatch = /"PersonaName"\s+"([^"]+)"/i.exec(blockBody);
    const accountMatch = /"AccountName"\s+"([^"]+)"/i.exec(blockBody);
    const mostRecentMatch = /"MostRecent"\s+"([^"]+)"/i.exec(blockBody);
    const timestampMatch = /"timestamp"\s+"([^"]+)"/i.exec(blockBody);

    const personaName = personaMatch ? personaMatch[1]!.trim() : null;
    const accountName = accountMatch ? accountMatch[1]!.trim() : null;
    const isMostRecent = mostRecentMatch ? mostRecentMatch[1] === '1' : false;
    const timestamp = timestampMatch ? parseInt(timestampMatch[1]!, 10) || 0 : 0;

    if (isMostRecent) {
      return { personaName, accountName, steamId64 };
    }

    if (!mostRecentUser || timestamp > mostRecentUser.timestamp) {
      mostRecentUser = { personaName, accountName, steamId64, timestamp };
    }
  }

  if (mostRecentUser) {
    return {
      personaName: mostRecentUser.personaName,
      accountName: mostRecentUser.accountName,
      steamId64: mostRecentUser.steamId64
    };
  }

  // Fallback: simple first PersonaName match
  const fallbackPersona = /"PersonaName"\s+"([^"]+)"/i.exec(content);
  return {
    personaName: fallbackPersona ? fallbackPersona[1]!.trim() : null,
    accountName: null,
    steamId64: null
  };
}

export function defaultQueryRegistry(key: string): Promise<Record<string, string | number>> {
  return new Promise(resolve => {
    execFile('reg', ['query', key], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        return resolve({});
      }

      const results: Record<string, string | number> = {};
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('HKEY_')) continue;

        // Formats: ValueName REG_SZ ValueData or ValueName REG_DWORD 0x123
        const parts = trimmed.split(/\s{2,}/);
        if (parts.length >= 3) {
          const name = parts[0]!;
          const type = parts[1]!;
          const data = parts.slice(2).join(' ');

          if (type.includes('DWORD')) {
            results[name] = parseInt(data, 16) || 0;
          } else {
            results[name] = data;
          }
        }
      }
      resolve(results);
    });
  });
}

export class SteamDetector {
  private queryRegistry: (key: string) => Promise<Record<string, string | number>>;
  private isProcessRunning: (pid: number) => boolean;
  private readFile: (filePath: string) => Promise<string>;
  private spawnProcess: (exe: string, args: string[]) => void;

  constructor(deps: SteamDetectorDeps = {}) {
    this.queryRegistry = deps.queryRegistry || defaultQueryRegistry;
    this.isProcessRunning =
      deps.isProcessRunning ||
      ((pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      });
    this.readFile = deps.readFile || (p => fs.promises.readFile(p, 'utf-8'));
    this.spawnProcess =
      deps.spawnProcess ||
      ((exe, args) => {
        spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
      });
  }

  async getInstallInfo(): Promise<SteamInstallInfo | null> {
    const reg = await this.queryRegistry('HKCU\\Software\\Valve\\Steam');
    const steamPath = (reg['SteamPath'] as string) || '';
    const steamExe = (reg['SteamExe'] as string) || '';

    if (!steamPath || !steamExe) {
      return null;
    }

    return {
      steamPath: path.normalize(steamPath),
      steamExe: path.normalize(steamExe)
    };
  }

  async getStatus(): Promise<SteamClientStatus> {
    const install = await this.getInstallInfo();
    if (!install) {
      return {
        isInstalled: false,
        isRunning: false,
        isLoggedOn: false,
        pid: 0,
        activeUser: 0,
        personaName: null
      };
    }

    const activeReg = await this.queryRegistry('HKCU\\Software\\Valve\\Steam\\ActiveProcess');
    const pid = typeof activeReg['pid'] === 'number' ? activeReg['pid'] : 0;
    const activeUser = typeof activeReg['ActiveUser'] === 'number' ? activeReg['ActiveUser'] : 0;

    const isRunning = pid > 0 && this.isProcessRunning(pid);
    const isLoggedOn = isRunning && activeUser !== 0;

    let personaName: string | null = null;
    let accountName: string | null = null;
    let steamId64: string | null = null;

    if (isLoggedOn) {
      try {
        const vdfPath = path.join(install.steamPath, 'config', 'loginusers.vdf');
        const vdfContent = await this.readFile(vdfPath);
        const parsed = parseLoginUsersVdf(vdfContent);
        personaName = parsed.personaName;
        accountName = parsed.accountName;
        steamId64 = parsed.steamId64;
      } catch {
        // file missing or unreadable
      }

      // Mathematical derivation fallback if ActiveUser DWORD is non-zero
      if (!steamId64 && activeUser > 0) {
        try {
          steamId64 = (BigInt('76561197960265728') + BigInt(activeUser)).toString();
        } catch {
          // ignore
        }
      }
    }

    return {
      isInstalled: true,
      isRunning,
      isLoggedOn,
      pid,
      activeUser,
      personaName,
      accountName,
      steamId64
    };
  }

  async launchSteam(silent: boolean = true): Promise<boolean> {
    const install = await this.getInstallInfo();
    if (!install || !install.steamExe) {
      return false;
    }

    const args = silent ? ['-silent'] : [];
    try {
      this.spawnProcess(install.steamExe, args);
      return true;
    } catch {
      return false;
    }
  }

  async waitForLogin(timeoutSec: number = 120, pollIntervalMs: number = 2000): Promise<SteamClientStatus> {
    const startTime = Date.now();
    const timeoutMs = timeoutSec * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getStatus();
      if (status.isLoggedOn) {
        return status;
      }
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    return this.getStatus();
  }
}

