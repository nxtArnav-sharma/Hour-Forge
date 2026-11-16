import { describe, it, expect } from 'vitest';
import {
  CREDIT_TEXT,
  APP_REPO_URL,
  STEAM_API_KEY_HELP_URL,
  ALLOWED_EXTERNAL_URLS,
  isAllowedExternalUrl
} from '../../src/shared/credit';

describe('Author Credit & External URL Security Gate', () => {
  it('exports the exact author credit text', () => {
    expect(CREDIT_TEXT).toBe('Sculpted to Life by Arnav Sharma, Discord:- Lesserkeyofsolomon');
  });

  it('exports the exact project GitHub repository URL', () => {
    expect(APP_REPO_URL).toBe('https://github.com/nxtArnav-sharma/Hour-Forge');
  });

  it('exports the exact Steam Web API key help page URL', () => {
    expect(STEAM_API_KEY_HELP_URL).toBe('https://steamcommunity.com/dev/apikey');
  });

  it('exports the exact allowed external URLs list', () => {
    expect(ALLOWED_EXTERNAL_URLS).toEqual([
      'https://github.com/nxtArnav-sharma/Hour-Forge',
      'https://steamcommunity.com/dev/apikey'
    ]);
  });

  it('allows ONLY exact full URLs from the whitelist', () => {
    expect(isAllowedExternalUrl('https://github.com/nxtArnav-sharma/Hour-Forge')).toBe(true);
    expect(isAllowedExternalUrl('https://steamcommunity.com/dev/apikey')).toBe(true);
  });

  it('strictly rejects arbitrary sub-routes and whole domains outside the exact whitelist', () => {
    // Whole domain attempts or arbitrary Steam pages
    expect(isAllowedExternalUrl('https://steamcommunity.com')).toBe(false);
    expect(isAllowedExternalUrl('https://steamcommunity.com/')).toBe(false);
    expect(isAllowedExternalUrl('https://steamcommunity.com/app/2139460')).toBe(false);
    expect(isAllowedExternalUrl('https://store.steampowered.com')).toBe(false);
    expect(isAllowedExternalUrl('https://store.steampowered.com/app/2139460')).toBe(false);

    // Repository sub-routes not explicitly whitelisted
    expect(isAllowedExternalUrl('https://github.com/nxtArnav-sharma/Hour-Forge/issues')).toBe(false);
    expect(isAllowedExternalUrl('https://github.com/nxtArnav-sharma/Hour-Forge/releases')).toBe(false);
    expect(isAllowedExternalUrl('https://github.com/nxtArnav-sharma/Hour-Forge/')).toBe(false);
  });

  it('strictly rejects non-https protocols, malicious schemes, and unauthorized domains', () => {
    // Non-https
    expect(isAllowedExternalUrl('http://github.com/nxtArnav-sharma/Hour-Forge')).toBe(false);
    expect(isAllowedExternalUrl('http://steamcommunity.com/dev/apikey')).toBe(false);
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('data:text/html,<html></html>')).toBe(false);

    // Malicious or third-party domains
    expect(isAllowedExternalUrl('https://evil.com')).toBe(false);
    expect(isAllowedExternalUrl('https://attacker.github.io')).toBe(false);
    expect(isAllowedExternalUrl('https://github.com/attacker/malware')).toBe(false);
    expect(isAllowedExternalUrl('https://steamcommunity.com.attacker.com')).toBe(false);

    // Malformed and empty inputs
    expect(isAllowedExternalUrl('')).toBe(false);
    expect(isAllowedExternalUrl('   ')).toBe(false);
    expect(isAllowedExternalUrl('not a url')).toBe(false);
    expect(isAllowedExternalUrl(null as any)).toBe(false);
    expect(isAllowedExternalUrl(undefined as any)).toBe(false);
  });
});
