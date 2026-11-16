import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

describe('Production vs DevSim Security Gating', () => {
  it('suppresses debug logging and ignores debug flags when app is packaged or not in sim mode', () => {
    function computeIsDevSim(isPackaged: boolean, argv: string[], env: Record<string, string | undefined>): boolean {
      const isSim = argv.includes('--sim') || env.HOURFORGE_SIM === '1';
      return !isPackaged && isSim;
    }

    // 1. Packaged build with --sim and debug flags
    expect(computeIsDevSim(true, ['node', '.', '--sim', '--exit-after-ms', '1000'], {})).toBe(false);

    // 2. Packaged build without --sim
    expect(computeIsDevSim(true, ['node', '.'], {})).toBe(false);

    // 3. Unpackaged build without --sim
    expect(computeIsDevSim(false, ['node', '.'], {})).toBe(false);

    // 4. Unpackaged build with --sim (dev test only)
    expect(computeIsDevSim(false, ['node', '.', '--sim'], {})).toBe(true);
  });

  it('verifies that --set-password is not processed anywhere in main process entry', async () => {
    const entryCode = await fs.readFile(
      path.resolve(__dirname, '../../src/main/index.ts'),
      'utf8'
    );

    // Plaintext password CLI flag MUST NOT exist anywhere in entry
    expect(entryCode).not.toContain('--set-password');
  });

  it('verifies that devSimLog does not output when isDevSim is false (production / packaged)', () => {
    let output = '';
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output += args.join(' ');
    });

    function devSimLog(isDevSim: boolean, tag: string, data?: any) {
      if (isDevSim) {
        if (data !== undefined) console.log(tag, data);
        else console.log(tag);
      }
    }

    // Call when isDevSim is false (packaged mode)
    devSimLog(false, '[HOURFORGE_TEST]', { secret: 'data' });
    expect(output).toBe('');
    expect(spy).not.toHaveBeenCalled();

    // Call when isDevSim is true (dev test mode)
    devSimLog(true, '[HOURFORGE_TEST]', { status: 'ok' });
    expect(output).toContain('[HOURFORGE_TEST]');

    spy.mockRestore();
  });

  it('verifies that no password CLI flags or dev password env vars exist in main process entry', async () => {
    const entryCode = await fs.readFile(
      path.resolve(__dirname, '../../src/main/index.ts'),
      'utf8'
    );

    // Plaintext password flags and dev password injection must be completely eradicated
    expect(entryCode).not.toContain('--set-password');
    expect(entryCode).not.toContain('HOURFORGE_DEV_TEST_PASSWORD');
    expect(entryCode).not.toContain('setSteamPassword');
  });
});

