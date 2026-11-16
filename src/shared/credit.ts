export const CREDIT_TEXT = 'Sculpted to Life by Arnav Sharma, Discord:- Lesserkeyofsolomon';
export const APP_REPO_URL = 'https://github.com/nxtArnav-sharma/Hour-Forge';
export const STEAM_API_KEY_HELP_URL = 'https://steamcommunity.com/dev/apikey';

/**
 * Exact whitelist of sanctioned external URLs.
 * Whole domains, arbitrary subpaths, and other protocols are strictly prohibited.
 */
export const ALLOWED_EXTERNAL_URLS: readonly string[] = [
  APP_REPO_URL,
  STEAM_API_KEY_HELP_URL
];

/**
 * Validates whether a requested external URL is sanctioned to open via shell.openExternal.
 * Strictly permits only exact full URL matches from ALLOWED_EXTERNAL_URLS.
 */
export function isAllowedExternalUrl(targetUrl: string): boolean {
  if (typeof targetUrl !== 'string' || !targetUrl.trim()) {
    return false;
  }

  return ALLOWED_EXTERNAL_URLS.includes(targetUrl.trim());
}
