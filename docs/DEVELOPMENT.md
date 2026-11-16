# HourForge — Developer & Contributor Guide

## Setup notes

### Prerequisites
- **Operating System**: Windows 10 (Build 19041+) or Windows 11 x64.
- **Node.js**: Node.js 20 LTS or higher (tested with Node 20.x, 22.x, 26.x x64).
- **npm**: npm 10+ (bundled with Node.js).
- **Steam Desktop Client**: Installed and running locally for live Steamworks client IPC.

### Initial Setup
Clone the repository and install locked dependencies:

```bash
npm ci
```

### Manual Electron Binary Installation (Fallback)
If `npm ci` skips lifecycle scripts (e.g. under npm `allow-scripts` policies), the Electron binary zip will be placed in `%LOCALAPPDATA%\electron\Cache\` but will not automatically extract into `node_modules/electron/dist`. To manually extract and configure:

```powershell
# 1. Create target dist directory
New-Item -ItemType Directory -Force node_modules/electron/dist

# 2. Extract cached binary archive using Windows built-in tar
$zip = (Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-*.zip").FullName
tar -xf "$zip" -C node_modules/electron/dist

# 3. Create path pointer
Set-Content -Path node_modules/electron/path.txt -Value "electron.exe" -NoNewline
```

Verify the installation by running `npm run typecheck` and `npm test`.

### Build & Test Commands
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`)
- **Unit Tests**: `npm test` (`vitest run` — 18 suites, 125 deterministic tests)
- **Production Build**: `npm run build` (builds `dist/main`, `dist/preload`, `dist/renderer`)
- **Installer Package**: `npm run dist` (produces `release/HourForge-Setup-<version>.exe`)
