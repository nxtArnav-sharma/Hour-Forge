import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import {
  isPathInsideDirectory,
  cleanupPidFileWithVerification,
  filterStaleHourForgeHelperProcesses,
  ProcessInfo
} from '../../src/main/steam/processSweep';

describe('HourForge Helper Orphan Sweep & Segment Matching', () => {
  const helpersDir = 'C:\\Users\\User\\AppData\\Local\\HourForge\\helpers';
  const installDir = 'C:\\Users\\User\\AppData\\Local\\Programs\\HourForge';

  it('matches legitimate helper files inside HourForge helpers directory', () => {
    expect(
      isPathInsideDirectory(
        'C:\\Users\\User\\AppData\\Local\\HourForge\\helpers\\3513350.pid',
        helpersDir
      )
    ).toBe(true);
  });

  it('rejects near-miss folder names (helpers-old, helpers_backup, helpers2)', () => {
    // Near-miss: helpers-old
    expect(
      isPathInsideDirectory(
        'C:\\Users\\User\\AppData\\Local\\HourForge\\helpers-old\\3513350.pid',
        helpersDir
      )
    ).toBe(false);

    // Near-miss: helpers_backup
    expect(
      isPathInsideDirectory(
        'C:\\Users\\User\\AppData\\Local\\HourForge\\helpers_backup\\3513350.pid',
        helpersDir
      )
    ).toBe(false);

    // Near-miss: helpers2
    expect(
      isPathInsideDirectory(
        'C:\\Users\\User\\AppData\\Local\\HourForge\\helpers2\\3513350.pid',
        helpersDir
      )
    ).toBe(false);
  });

  it('rejects paths completely outside HourForge directory', () => {
    expect(
      isPathInsideDirectory(
        'C:\\Program Files (x86)\\Steam\\steam.exe',
        helpersDir
      )
    ).toBe(false);

    expect(
      isPathInsideDirectory(
        'C:\\Users\\User\\AppData\\Local\\OtherApp\\helpers\\3513350.pid',
        helpersDir
      )
    ).toBe(false);
  });

  it('handles case-insensitivity and mixed/normalised separators', () => {
    expect(
      isPathInsideDirectory(
        'c:/users/user/appdata/local/hourforge/helpers/3513350.pid',
        helpersDir
      )
    ).toBe(true);

    expect(
      isPathInsideDirectory(
        'C:\\USERS\\USER\\APPDATA\\LOCAL\\HOURFORGE\\HELPERS\\SUB\\HELPER.JS',
        'c:/users/user/appdata/local/hourforge/helpers'
      )
    ).toBe(true);

    expect(
      isPathInsideDirectory(
        'c:/users/user/appdata/local/hourforge/helpers/3513350.pid',
        'C:\\Users\\User\\AppData\\Local\\HourForge\\helpers\\'
      )
    ).toBe(true);
  });

  it('filters process lists to only kill HourForge helper processes', () => {
    const mockProcesses: ProcessInfo[] = [
      {
        pid: 1001,
        name: 'electron.exe',
        executablePath: 'C:\\Users\\User\\AppData\\Local\\Programs\\HourForge\\HourForge.exe',
        commandLine: '"C:\\Users\\User\\AppData\\Local\\Programs\\HourForge\\HourForge.exe" "C:\\Users\\User\\AppData\\Local\\HourForge\\helpers\\steamHelper.js" 3513350'
      },
      {
        pid: 1002,
        name: 'electron.exe',
        executablePath: 'C:\\Users\\User\\AppData\\Local\\Programs\\HourForge\\HourForge.exe',
        commandLine: '"C:\\Users\\User\\AppData\\Local\\Programs\\HourForge\\HourForge.exe" "C:\\Users\\User\\AppData\\Local\\HourForge\\helpers-old\\steamHelper.js" 3513350'
      },
      {
        pid: 1003,
        name: 'steam.exe',
        executablePath: 'C:\\Program Files (x86)\\Steam\\steam.exe',
        commandLine: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent'
      }
    ];

    const toKill = filterStaleHourForgeHelperProcesses(mockProcesses, helpersDir);
    expect(toKill.length).toBe(1);
    expect(toKill[0]!.pid).toBe(1001);
  });

  describe('cleanupPidFileWithVerification & Reused PID Safety', () => {
    let tmpDir: string;
    let pidFile: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-sweep-test-'));
      pidFile = path.join(tmpDir, '3513350.pid');
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('kills genuine helper process and unlinks pidfile', async () => {
      await fs.writeFile(pidFile, '5001');

      const killedPids: number[] = [];
      const mockGetProcessInfo = vi.fn().mockResolvedValue({
        executablePath: `${installDir}\\HourForge.exe`,
        commandLine: `"C:\\Users\\User\\AppData\\Local\\Programs\\HourForge\\HourForge.exe" "dist\\main\\steamHelper.js" 3513350`
      });
      const mockKill = vi.fn().mockImplementation((pid: number) => {
        killedPids.push(pid);
      });

      const res = await cleanupPidFileWithVerification({
        pidPath: pidFile,
        helpersDir: tmpDir,
        allowedDirs: [installDir],
        getProcessInfo: mockGetProcessInfo,
        killProcess: mockKill
      });

      expect(res.killedProcess).toBe(true);
      expect(res.deletedPidFile).toBe(true);
      expect(killedPids).toEqual([5001]);
      await expect(fs.access(pidFile)).rejects.toThrow();
    });

    it('DOES NOT kill unrelated program when PID was reused, but deletes stale pidfile', async () => {
      // Reused PID 5002 now belongs to notepad or chrome
      await fs.writeFile(pidFile, '5002');

      const killedPids: number[] = [];
      const mockGetProcessInfo = vi.fn().mockResolvedValue({
        executablePath: 'C:\\Windows\\System32\\notepad.exe',
        commandLine: 'notepad.exe C:\\notes.txt'
      });
      const mockKill = vi.fn().mockImplementation((pid: number) => {
        killedPids.push(pid);
      });

      const res = await cleanupPidFileWithVerification({
        pidPath: pidFile,
        helpersDir: tmpDir,
        allowedDirs: [installDir],
        getProcessInfo: mockGetProcessInfo,
        killProcess: mockKill
      });

      // Must NOT kill notepad!
      expect(res.killedProcess).toBe(false);
      expect(mockKill).not.toHaveBeenCalled();
      expect(killedPids.length).toBe(0);

      // Must clean up stale pidfile
      expect(res.deletedPidFile).toBe(true);
      await expect(fs.access(pidFile)).rejects.toThrow();
    });

    it('DOES NOT kill process whose command line contains steamHelper but executable is outside HourForge', async () => {
      await fs.writeFile(pidFile, '5003');

      const killedPids: number[] = [];
      const mockGetProcessInfo = vi.fn().mockResolvedValue({
        executablePath: 'C:\\Python310\\python.exe',
        commandLine: 'python.exe check_steamHelper.py'
      });
      const mockKill = vi.fn().mockImplementation((pid: number) => {
        killedPids.push(pid);
      });

      const res = await cleanupPidFileWithVerification({
        pidPath: pidFile,
        helpersDir: tmpDir,
        allowedDirs: [installDir],
        getProcessInfo: mockGetProcessInfo,
        killProcess: mockKill
      });

      expect(res.killedProcess).toBe(false);
      expect(mockKill).not.toHaveBeenCalled();
      expect(res.deletedPidFile).toBe(true);
      await expect(fs.access(pidFile)).rejects.toThrow();
    });

    it('deletes stale pidfile cleanly if PID no longer exists', async () => {
      await fs.writeFile(pidFile, '5004');

      const mockGetProcessInfo = vi.fn().mockResolvedValue(null);
      const mockKill = vi.fn();

      const res = await cleanupPidFileWithVerification({
        pidPath: pidFile,
        helpersDir: tmpDir,
        allowedDirs: [installDir],
        getProcessInfo: mockGetProcessInfo,
        killProcess: mockKill
      });

      expect(res.killedProcess).toBe(false);
      expect(mockKill).not.toHaveBeenCalled();
      expect(res.deletedPidFile).toBe(true);
      await expect(fs.access(pidFile)).rejects.toThrow();
    });
  });
});
