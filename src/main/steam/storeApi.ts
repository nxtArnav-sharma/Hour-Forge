import https from 'https';

export interface SteamAppDetails {
  appId: number;
  name: string;
  developer: string;
  publisher: string;
  headerImage: string;
  isFree: boolean;
}

/**
 * Extracts a numeric Steam App ID from either a raw ID string or a Steam store URL.
 */
export function parseAppId(input: string): number | null {
  const trimmed = input.trim();
  // Check raw number
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // Check store URL (e.g. https://store.steampowered.com/app/3513350/Wuthering_Waves/)
  const match = trimmed.match(/store\.steampowered\.com\/app\/(\d+)/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Resolves App details live from the official Steam Store API.
 */
export async function resolveSteamApp(appId: number): Promise<SteamAppDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;

  return new Promise(resolve => {
    https
      .get(url, { headers: { 'User-Agent': 'HourForge/0.1.0' } }, res => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const appData = json[String(appId)];
            if (!appData || !appData.success || !appData.data) {
              resolve(null);
              return;
            }

            const d = appData.data;
            const developer = (d.developers && d.developers[0]) || 'Unknown Developer';
            const publisher = (d.publishers && d.publishers[0]) || 'Unknown Publisher';
            const headerImage =
              d.header_image ||
              `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

            resolve({
              appId,
              name: d.name || `App ${appId}`,
              developer,
              publisher,
              headerImage,
              isFree: Boolean(d.is_free)
            });
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => {
        resolve(null);
      });
  });
}

