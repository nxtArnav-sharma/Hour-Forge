import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import pkg from '../../package.json';
import { CREDIT_TEXT, APP_REPO_URL } from '../../src/shared/credit';
import { BackupService } from '../../src/main/store/backupService';

describe('Version & Credit Single Source of Truth (Task 3)', () => {
  it('package.json defines a valid semver version string', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('CREDIT_TEXT matches canonical text exactly without drift', () => {
    expect(CREDIT_TEXT).toBe('Sculpted to Life by Arnav Sharma, Discord:- Lesserkeyofsolomon');
  });

  it('APP_REPO_URL points to canonical repository', () => {
    expect(APP_REPO_URL).toBe('https://github.com/nxtArnav-sharma/Hour-Forge');
  });

  it('BackupService falls back to package.json version when electron app is unavailable', async () => {
    const fakeStore: any = { dataDir: 'C:\\fake\\path', getSettings: async () => ({}) };
    const svc = new BackupService({ store: fakeStore });
    expect((svc as any).appVersion).toBe(pkg.version);
  });

  it('TitleBar.tsx and SettingsScreen.tsx do not contain hardcoded version literals', () => {
    const titleBarSrc = fs.readFileSync(path.join(__dirname, '../../src/renderer/components/TitleBar.tsx'), 'utf-8');
    const settingsSrc = fs.readFileSync(path.join(__dirname, '../../src/renderer/screens/SettingsScreen.tsx'), 'utf-8');

    // Should not contain hardcoded "v0.1.0", "v0.1.1", "v0.1.2", "v0.1.3"
    expect(titleBarSrc).not.toMatch(/v0\.1\.[0-3]/);
    expect(settingsSrc).not.toMatch(/v0\.1\.[0-3]/);
  });

  it('NavRail.tsx renders CREDIT_TEXT as title and info tooltip', () => {
    const navRailSrc = fs.readFileSync(path.join(__dirname, '../../src/renderer/components/NavRail.tsx'), 'utf-8');
    expect(navRailSrc).toContain('title={CREDIT_TEXT}');
    expect(navRailSrc).toContain('Sculpted to Life by Arnav Sharma');
    expect(navRailSrc).toContain('Discord:- Lesserkeyofsolomon');
  });
});
