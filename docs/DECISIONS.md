# Architecture & Design Decisions (docs/DECISIONS.md)

## DEC-001: Replacement of Specification Milestones & Simulator Scope
- **Date**: 2026-11-14
- **Context**: The original specification file `docs/BUILD_BRIEF.md` (formerly `HourForge_Build_Brief_for_Antigravity_IDE_v2.md`) ended at section 9.6, omitting sections 10 through 15 that were referenced in section 0 ("section 13 ASF Simulator" and "section 15 milestones").
- **Decision**: Milestones M0 through M7 specified in `hourforge-implementation-plan.md` and `hourforge-task-list.md` officially replace the missing section 15. The standalone mock IPC HTTP + WebSocket simulator specified in Milestone M2 satisfies section 13.

## DEC-002: Security Architecture & Credential Protection
- **Date**: 2026-11-14
- **Context**: Hardened operational security for handling sensitive Steam credentials, Steam Guard codes, and local IPC authentication.
- **Decision**:
  1. **Zero Credential Logging**: Steam passwords, Steam Guard codes, and the random 40-character IPC password must never be printed to stdout, stderr, or log files.
  2. **Diagnostic Redaction**: All export routines (`exportDiagnostics`) must apply sanitization passes stripping tokens, passwords, and sensitive identifiers.
  3. **Strict Loopback Binding**: All ASF and Simulator IPC endpoints must bind explicitly to `127.0.0.1:<port>` (never `*` or `0.0.0.0`).
  4. **Renderer Isolation**: Electron browser windows must be configured with `contextIsolation: true` and `nodeIntegration: false`. No raw Node.js or Electron APIs exposed to the DOM.
  5. **Zod IPC Validation**: Every IPC message payload crossing `contextBridge` between renderer and main must be validated against Zod schemas.
  6. **DPAPI Credential Storage**: Passwords encrypted with Electron `safeStorage` (Windows DPAPI) and injected into child processes solely via transient environment variable `HF_STEAM_PWD_HOURFORGE`.

## DEC-003: Alpha Scope Boundary & Feature Deferrals
- **Date**: 2026-11-14
- **Context**: Ensuring timely delivery of the Alpha build focusing on core requirements R1 to R4 and MVP section 3.1.
- **Decision**:
  - Section 3.2 extras (Real-play mirror, Conflict handling, Presence selector, Discord webhooks, Power awareness, Plan reroll/manual edit, Panic button) and 3.3 stretch features (Web API sync, Friends race, Multi-account, Quotas) are deferred past Alpha.
  - The Free-license helper button will be evaluated during the Games screen build: included only if low complexity (`addlicense` IPC command), otherwise deferred.
  - Architecture and interfaces (`SteamBackend`, data models) remain forward-compatible with all deferred features.

## DEC-004: ASF Configuration & Bot Identity
- **Date**: 2026-11-14
- **Context**: ASF reserved names and file system safety.
- **Decision**: The internal bot name is hardcoded to `hourforge`. The configuration is generated as `config/hourforge.json` with `Paused: true`, `RemoteCommunication: 0`, and `PasswordFormat: 3`.

## DEC-005: Local Port Allocation
- **Date**: 2026-11-14
- **Context**: Avoiding port collisions on Windows loopback.
- **Decision**: HourForge selects an available port between `51000` and `51999` at runtime or initializes a configured default (`51242`), writing it into `config/IPC.config`.



## DEC-006: Contingency for `play` Command with `Paused: true`
- **Date**: 2026-11-14
- **Context**: Brief specifies bot runs with `Paused: true` to prevent card farming. If ASF refuses `play <appId>` while paused on a live signed-in session:
- **Decision**: HourForge will NOT apply any unpause workaround unilaterally. If live manual testing shows `play` fails while `Paused: true`, execution will immediately pause and ask the user for direction before making any configuration changes.

## DEC-007: Orphan Process Prevention Without Native Addons
- **Date**: 2026-11-14
- **Context**: `--process-required` flag is unrecognized by ASF 7.0.0.8. Need robust orphan prevention without native C++ addons (`node-gyp`).
- **Decision**: Win32 Job Objects require native bindings (`koffi`/`node-gyp`), which are forbidden by tech stack rules. Multi-layer orphan protection is implemented in pure TypeScript/Node:
  1. **PID Tracking & Startup Sweep**: Supervisor writes `asf.pid` on spawn. On every app launch, read `asf.pid` and run `taskkill /F /T /PID <pid>` if alive. Sweep running processes for `ArchiSteamFarm.exe` matching HourForge ASF directory and terminate stale orphans.
  2. **Lifecycle Exit Traps**: Register handlers on `app.on('before-quit')`, `process.on('exit')`, `SIGINT`, `SIGTERM`, `uncaughtException`. Issue graceful IPC `exit` with 5s timeout, falling back to synchronous `tree-kill` / `taskkill`.
  3. **Heartbeat & IPC Keep-Alive**: ASF supervisor monitors child process pipes and IPC health. If parent crashes ungracefully, ASF has no commands to run; next HourForge boot cleans it up.

## DEC-008: Tolerant Zod Schemas (`.passthrough()`) for ASF Responses
- **Date**: 2026-11-14
- **Context**: ASF OpenAPI/Swagger document generation crashed due to ILLink trimming in ASF 7.0.0.8.
- **Decision**: All Zod schemas validating ASF IPC payloads must call `.passthrough()` to allow unmodeled or future ASF fields without throwing runtime validation errors.

## DEC-009: ASF Process Exit Verification
- **Date**: 2026-11-14
- **Context**: Investigating process exit codes.
- **Decision**: ASF exits cleanly with exit code `0` when receiving IPC `exit` command (`{"Result":"<ASF> Done!","Message":"OK","Success":true}`). Exit code `1` in M0 was produced by PowerShell pipeline when `Get-Process ArchiSteamFarm` returned null after ASF had already shut down cleanly. Supervisor distinguishes between expected shutdown (exit code 0 or requested exit) and abnormal crash.

## DEC-010: Electron 33 Lifecycle & Upgrade Roadmap
- **Date**: 2026-11-14
- **Context**: Electron 33 is reached end-of-life (EOL) upstream.
- **Decision**: Alpha build proceeds with Electron 33.x for current Windows 10/11 x64 target. An upgrade to the active LTS release (e.g. Electron 34/35) is scheduled prior to public production distribution.

## DEC-011: Deferred Non-MVP UI Features Catalog
- **Date**: 2026-11-14
- **Context**: Documenting all deferred UI features from Section 8 and 9 of the build brief to ensure no scope item is silently dropped from post-Alpha roadmap:
  1. **Plan Screen Interactive Drag & Lock**: Direct mouse dragging of block boundaries with constraint enforcement and block pinning locks. (Alpha provides visual timeline and block inspector).
  2. **Discord Webhook Notifications**: Webhook URL configuration with test message dispatch. (Alpha relies on native Windows desktop toasts).
  3. **Steam Community Presence Selector**: UI control for switching between Invisible (`7`) and Online (`1`) persona states. (Alpha defaults to Online in config).
  4. **Steam Family View PIN**: Dedicated PIN entry dialog for accounts under Steam Family View.
  5. **Live Process Picker Dialog**: Window enumeration dialog for selecting game `.exe` process names from active tasks for mirror detection.
  6. **Onboarding Live Sign-in Gate**: Preventing completion of the wizard until a live connection to Steam network is authenticated. (Alpha saves credentials into Windows DPAPI and verifies via SimBackend).
  7. **Steam Hours Sync Card**: Live profile badge syncing Steam hours via public community XML / API (Section 3.3 stretch item).

## DEC-012: Steam Desktop Client Backend & Steamworks.js Evaluation
- **Date**: 2026-11-14
- **Context**: User requirement: HourForge must connect to the local Steam Desktop Client directly so the user's Steam app displays the game as running (green/blue "Stop" button in library, "In-Game" status on profile) and counts playtime, eliminating the need for Steam account credentials, DPAPI credential storage, or Steam Guard codes in default flow.
- **Decision**:
  1. **Helper Process Architecture**: Steamworks SDK limits `SteamAPI_Init` to one App ID per process. HourForge runs one lightweight Node/Electron helper process per active game track with `SteamAppId` / `steam_appid.txt`.
  2. **Zero `node-gyp` Native Compilation**: Evaluated `steamworks.js` (0.4.0). Confirmed package includes prebuilt N-API native bindings for Windows x64 (`dist/win64/steamworksjs.win32-x64-msvc.node`). Requires no `node-gyp` compilation or external C++ build toolchains. Tested and verified loading cleanly under Electron Node (`ELECTRON_RUN_AS_NODE=1`).
  3. **Redistribution Licensing Position (Unverified, personal use only; review before any distribution)**:
     - Source relied on: Valve Steamworks SDK Documentation (partner.steamgames.com) regarding redistributing `steam_api[64].dll` alongside software integrating Steamworks.
     - `steamworks.js` is MIT licensed. It bundles Valve's dynamic link library `steam_api64.dll` inside `node_modules/steamworks.js/dist/win64/`.
     - HourForge will NOT extract or vendor raw Valve DLL files directly in the repository source tree (`vendor/` or `src/`). The dependency remains isolated strictly within the published `steamworks.js` npm module. Licensing status must be formally reviewed prior to any public distribution.
  4. **Native-Free Steam Client State Detection**:
     - Status of the Steam desktop client is detected directly via Windows Registry query without native addons:
       - Path: `HKCU\Software\Valve\Steam` -> `SteamPath`, `SteamExe`
       - Active State: `HKCU\Software\Valve\Steam\ActiveProcess` -> `pid` (process ID) and `ActiveUser` (account ID3). If `ActiveUser != 0`, Steam client is actively signed in.
       - Display Name: Read from `<SteamPath>\config\loginusers.vdf` parsing the most recent entry (`PersonaName`, `AccountName`).
     - Zero access or storage of user password data.


### DEC-013: Complete Removal of ArchiSteamFarm (ASF) and Legacy Credential Code (Milestone M9)
- **Context**: Milestone M8 successfully verified and implemented the direct Steam Desktop Client backend via `steamworks.js` helper processes. With direct Steam client integration active, games display as "In-Game" with the blue/green "Stop" button in the real Steam library without entering passwords or 2FA codes. ASF introduced unnecessary complexity, 20+ MB of bundled binaries, security surface (DPAPI passwords, 2FA modals), and process management fragility.
- **Decision**: Eradicate ASF entirely from HourForge:
  1. Deleted `src/main/asf/` (supervisor, configWriter, ipcClient, logPatterns, processSweep, backend).
  2. Deleted `tools/asf-sim/` and `tools/smoke_test_real_asf.ts`.
  3. Deleted `asf.version.json`, `vendor/asf/`, and `ASF-win-x64.zip` archives, removing `extraResources` from installer.
  4. Added `FakeSteamBackend` for in-memory testing and `--sim` dev runs.
  5. Purged DPAPI password storage methods (`setSteamPassword`, `getSteamPassword`) and removed `steamUsername`, `hasStoredPassword`, `ipcPort`, `ipcPassword`, `backend`, and `notifyOnAuth` from settings.
  6. Added automated upgrade cleanup in `AtomicStore.initialize()` to recursively delete `%LOCALAPPDATA%\HourForge\asf`, legacy config/db files (`ASF.json`, `IPC.config`, `hourforge.json`, `hourforge.db`, `asf.pid`), and securely wipe `credentials.bin` with random bytes before deletion.
  7. Repurposed `safeStorage` strictly for the upcoming Steam Web API key in M10.
  8. Updated Logs screen to display "Engine" and "Steam helper" tabs with per-helper output.

## DEC-014: Steam Web API Playtime Dashboard & Lag Detection (Milestone M10)
- **Date**: 2026-11-14
- **Context**: Milestone M10 delivers live profile playtime verification against official Steam Web API (`IPlayerService/GetOwnedGames/v1`) without requiring passwords or scraping unauthenticated public profiles.
- **Decision**:
  1. **Strict Endpoint Isolation**:
     - HourForge queries ONLY `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` with parameters `include_played_free_games=1` and `include_appinfo=1`. No other Steam endpoints or external hosts are accessed.
     - Built using native Node/Electron global `fetch` — zero new dependencies or native node-gyp packages.
  2. **Zero-Secret Logging & DPAPI Storage**:
     - Steam Web API key is stored encrypted on disk via Windows DPAPI (`safeStorage`) in `steam-api-key.bin`.
     - API key, SteamID64, and raw authorization headers are never logged, exported in diagnostics, or exposed in plain text.
  3. **Dual SteamID64 Resolution**:
     - Primary: Auto-detected from `<SteamPath>\config\loginusers.vdf` (where `SteamPath` is read from `HKCU\Software\Valve\Steam` registry), parsing the most recent logged-in user block.
     - Fallback: Calculated from `HKCU\Software\Valve\Steam\ActiveProcess` `ActiveUser` DWORD (`76561197960265728 + ActiveUser`) when file is missing or unreadable.
     - Manual override: User can provide an explicit 17-digit SteamID64 in Settings.
  4. **Polling Interval, Debounce, & 429 Backoff**:
     - Polled every 15 minutes in background (`900,000 ms`).
     - If HTTP 429 (Rate Limit) is received, polling automatically backs off to 5 minutes (`300,000 ms`).
     - Manual "Refresh Hours" in UI is debounced by 10 seconds.
  5. **Private Profile & Error Handling**:
     - If Steam returns 200 OK with empty `{ response: {} }`, profile Game details are set to Private. HourForge displays an informative banner guiding user to set Steam privacy settings to Public.
     - If network unreachable, status transitions to `OFFLINE` and presents cached playtime from `steam-hours-baselines.json`.
  6. **Session-Aware Playtime Lag Detection**:
     - Steam commits accumulated playtime to user profiles upon session termination.
     - While track is actively running/playing, lag detection is suppressed.
     - If track is idle and at least 30 minutes have elapsed since session termination:
       - If `(creditedSinceBaseline - steamGainHours) >= 0.5` hours, card displays:
         *"Steam may be lagging. Steam commits playtime to your profile when a session ends."*


---

## DEC-015: Catch-Up Goal (R5), Hours Accounting & Pacing Feasibility

- **Context**: Milestone M11 introduces Catch-Up Goals where players specify a target playtime (e.g. 100 hours or matching a friend's hours) and target date. Steam commits playtime only on session exit and sync may lag or fail. Pacing must avoid double counting, preserve profile caps, protect user privacy, and handle timezone/DST shifts cleanly.
- **Decisions**:
  1. **Hours Accounting Formula**:
     - `effectiveHours = (goal.lastSyncedSteamHours ?? goal.manualStartingHours ?? 0) + creditedSinceSync`
     - `remainingHours = Math.max(0, targetHours - effectiveHours)`
     - This guarantees smooth progress accumulation between Steam sync cycles without waiting for Steam Web API commits.
  2. **Baseline Reset 30-Minute Idle Rule**:
     - When fresh Steam playtime is polled, `goal.lastSyncedSteamHours` baseline is updated ONLY if the game track is not currently running AND has been idle for at least 30 minutes (`now - lastSessionEndTimeUtc >= 30m`).
     - If the track is running or recently stopped, baseline reset is deferred. This prevents premature sync resets and double counting during Steam's profile commit lag.
     - Without an API key, manual starting hours plus credited hours are used continuously.
  3. **Strict Profile Cap Protection & Feasibility Analysis**:
     - Goals never raise profile daily caps silently.
     - Feasibility check: `requiredDailyHours = remainingHours / remainingCalendarDays`. If `requiredDailyHours > activeProfile.dailyCapHours`, the goal is marked `isFeasible = false`.
     - The engine computes:
       - Earliest feasible date: `today + ceil(remainingHours / activeProfile.dailyCapHours) days`.
       - Required PC-on hours per day: `requiredDailyHours / (dutyCycleFraction * maxDailyRunFraction)`.
       - Alternative profile recommendations: scans configured profiles for those whose `dailyCapHours >= requiredDailyHours` (e.g. Grinder 16h).
  4. **Friend Hours Matcher Privacy**:
     - Friend's playtime is queried using standard public `GetOwnedGames` via the existing Steam Web API key.
     - If friend profile or game details are private, a friendly notification is shown.
     - Friend SteamID64 is used in-memory for the lookup and NEVER persisted in `goals.json`, exported in diagnostics, or logged.
  5. **Timezone & Calendar Day Calculation**:
     - Calendar day differences and date additions use midday UTC alignment (`Date.UTC(year, month, day, 12, 0, 0)`). This prevents DST drift and day boundary truncation across any IANA timezone (including `Asia/Kolkata` UTC+5:30 and US Eastern UTC-4/UTC-5).
  6. **Missed Deadlines**:
     - If target date passes while the PC is powered off, status transitions to `MISSED_DEADLINE` without crashing or division by zero, offering earliest feasible date projection calculated from the current date.
  7. **1-Day Safety Buffer & ±12% Daily Variation**:
     - Daily target pacing targets completion 1 full calendar day before the goal deadline (`effectiveDays = Math.max(1, daysRemaining - 1)`).
     - Base daily quota varies deterministically by ±12% (`variationPct = -0.12 + prng.next() * 0.24`), seeded per calendar day, clamped so daily quota never exceeds profile cap or remaining hours.
  8. **Planner Daily Quota Feeding**:
     - `PlanOptions.dailyQuotaSeconds` and `TrackStateMachine.dailyQuotaSeconds` feed directly into `planTrackBlocks`.
     - When `todayCreditedSeconds >= dailyQuotaSeconds`, the planner schedules rest blocks until the next day boundary (05:00 local time) with `reason: 'daily_cap'`.
  9. **CATCHUP Run Mode & Concurrent Goal Accrual**:
     - Added `RunMode = 'CATCHUP'` selectable via Launch Picker, New Run screen, and dedicated Goals screen.
     - Runs with multiple simultaneous goals accrue playtime concurrently during shared play blocks; no track ever exceeds elapsed wall-clock PC-on hours.
  10. **Dedicated Goals Screen & Non-Lecturing Feasibility Notices**:
      - Dedicated `GoalsScreen` with circular SVG progress ring, projected finish date, on track / behind badge, and a planned-vs-actual Recharts bar chart.
      - Feasibility notices plainly state required hours/day and note when >16h/day or >24h/day is far above a typical human pattern without lecturing.

---

## DEC-016: Settings Backup Schema v1, Privacy Invariant, and Mid-Day Reboot Quota Handling
- **Context**: Milestone M12 requires a reliable, portable configuration backup and restore system (Settings, Games, Profiles, Catch-Up Goals, and optional Session History) while guaranteeing privacy (no secrets exported), non-destructive merges, automatic rollbacks, and clear handling of mid-day reboots.
- **Decision**:
  1. **Schema Versioning & Validation**:
     - Standardized `schemaVersion: 1` validated using Zod (`BackupFileSchema`).
     - Backups with future schema versions (`schemaVersion > 1`) are cleanly rejected during preview with a message instructing the user to update HourForge.
  2. **Strict Privacy Invariant & Secret Erasure**:
     - Steam Web API key, SteamID64, account name, stored credentials, and family PIN are erased from export data.
     - Friend SteamID64 is never stored in `goals.json` and never included in backups (only public persona name and playtime hours).
     - Automated verification scanner (`BackupService.assertNoSecrets`) scans all serialized export strings for forbidden fields (`apiKey`, `hasSteamApiKey`, `steamConnectedAccount`, `steamId64Override`, `friendSteamId`, `password`, `familyPin`) before delivery.
  3. **Automatic Rolling Backups & Pruning**:
     - Before any import or restore operation (Merge or Replace), an automatic snapshot (`auto-backup-<timestamp>.json`) is created in `<dataDir>/backups/`.
     - Rolling backups are pruned automatically to keep exactly the 5 newest snapshots; older snapshots are safely unlinked.
  4. **Merge vs. Replace Modes**:
     - **Merge (Default)**: Combines imported games, profiles, goals, and history with local database. Preserves local entries, updates matching IDs, and retains local secrets and Steam Web API keys.
     - **Replace**: Atomically replaces games, profiles, goals, and history with backup contents after taking an automatic safety snapshot.
  5. **Mid-Day Reboot Quota Invariant**:
     - During an active run, `dailyQuotaSeconds` and `todayCreditedSeconds` are persisted in `TrackSnapshot`.
     - On mid-day system restart or app reboot (within the same calendar day before 05:00 local time), `todayCreditedSeconds` and `dailyQuotaSeconds` are restored from the snapshot without re-running pacing formulas. This prevents quota swings or double-counting mid-day.
     - When the clock crosses the 05:00 local day boundary (or if the PC was rebooted into a new day), `TrackStateMachine.tick` detects the day rollover, resets `todayCreditedSeconds = 0`, calls `getDailyQuotaSeconds` to calculate a fresh quota for the new calendar day, and generates new plan blocks.

---

## DEC-017: Friend Privacy Hardening, Strict Backup Validation, and M13a Icon Pipeline
- **Context**: Milestone M12 acceptance fixes and M13a icon pipeline. Friend privacy required complete elimination of persona names from storage and exports. Backup security required deep value scanning for secret patterns and strict schema validation. M13a required generating official multi-resolution ICO and tray icons with status badges.
- **Decision**:
  1. **Complete Friend Identifying Data Removal**:
     - Removed `friendPersonaName` entirely from models, stores, IPC channels, and schemas.
     - Kept `friendHours` and optional user-typed `userLabel` only.
     - `AtomicStore.getGoals()` migrates legacy `goals.json` by purging `friendPersonaName` on load.
     - `GoalManager.checkFriendHours()` queries only public playtime via `GetOwnedGames` and no longer calls `GetPlayerSummaries`.
  2. **Comprehensive Secret Value Scanning**:
     - `BackupService.assertNoSecrets()` scans all serialized string values for:
       - SteamID64 patterns (`/\b7656119\d{10}\b/`).
       - 32-hex API key patterns (`/\b[0-9a-fA-F]{32}\b/`).
       - Active Steam API key and SteamID strings.
     - Throws a security violation and blocks export if planted in profile names, game titles, or goal labels.
  3. **Strict Backup Validation Beyond Types**:
     - Added 2 MB file size limit (`MAX_BACKUP_SIZE_BYTES`).
     - Added `.strict()` across all Zod schemas to reject unknown/injected properties.
     - Enforced domain constraints: `dailyCapHours` (1-24), `min <= max` for session, rest, and boot jitter, valid `HH:mm` active window times, positive integer appIDs, array length limits.
  4. **Active Run Import Protection & Safety Snapshots**:
     - Refuses Merge, Replace, and rolling restore operations while engine is `RUNNING`, `STARTING`, or `PAUSED` ("Cannot restore backup while a run is active. Stop the run first.").
     - `restoreAutomaticBackup()` captures an automatic rolling safety snapshot prior to restoring.
  5. **M13a Icon Pipeline**:
     - Sourced master icon from `assets/icon-source.png`.
     - Generated `build/icon.ico` packing 7 resolutions (16, 24, 32, 48, 64, 128, 256) for Windows EXE, installer, window titlebars, and taskbars.
     - Generated 24 tray icon variants (`build/tray/`) covering 6 states (`idle`, `connecting`, `playing`, `resting`, `blocked`, `error`) across 4 DPI scales (16, 20, 24, 32px).
     - Applied dark contrast halo (`#0B0E14`) around status dots ensuring crisp legibility on dark, light, and mica taskbars.
     - Automated legibility audit sheet generated at `docs/tray-icons-legibility.png`.
  6. **M13b Liquid Glass UI Overhaul & Windows 11 DWM Acrylic Spike**:
     - **Windows 11 DWM Acrylic**: Configured `backgroundMaterial: 'acrylic'` and `backgroundColor: '#080B11'` on frameless windows. Hardware DWM acrylic applies smooth native corner rounding and desktop blur.
     - **Windows 10 Fallback**: On Windows 10, Electron ignores `backgroundMaterial` and smoothly falls back to `#080B11` with static CSS radial light pools.
     - **Packaged Tray Icon Verification**: Confirmed all 24 tray icons are packaged into `release/win-unpacked/resources/app.asar/dist/main/tray/`. Electron's `nativeImage.addRepresentation` reads directly from asar via patched fs; verified via live simulation screenshot `docs/packaged-tray-live.png`.
     - **Zero-CPU Idle Optimization**: Replaced continuous GPU blur keyframe animations with static CSS radial gradients on `.liquid-glass-container`. Confirmed CPU remains near zero (0.05% - 0.1%) when idle or hidden to tray.
     - **Selective Backdrop Blur**: Restyle limits CSS `backdrop-filter` strictly to top-level structural surfaces (TitleBar, NavRail, Modals), keeping list cards on GPU-friendly translucent background fills (`rgba(18, 25, 40, 0.65)`).
     - **Zero Protocol/Data Drift**: No changes to IPC channels, store schemas, or engine models; all existing screens and features fully functional.

---

## DEC-018: Discord Rich Presence (M14a) and NSIS Packaged Installer (M14b)
- **Context**: Milestone M14 required local Discord Rich Presence via IPC without native compilation, and a full per-user Windows NSIS installer with dark glass branding, autostart checkboxes, and clean uninstallation.
- **Decision**:
  1. **Pure-JS Discord RPC**:
     - Pinned `@xhayper/discord-rpc@1.5.1` communicating over Windows named pipe (`\\.\pipe\discord-ipc-0` through `-9`).
     - Zero native C++ or `node-gyp` dependencies; compiles cleanly into `dist/main/index.js`.
     - Pinned application client ID `1421390654935662665`.
     - Quiet connection backoff: on connection failure or closed Discord, retries quietly every 15s $\to$ 20s $\to$ 25s $\to$ 30s cap with zero thrown errors, toast notifications, or error log clutter.
     - Privacy defaults: presence is generic by default ("HourForge" / "Farming hours", large asset "hourforge", elapsed timer). Game names and credited hours are strictly hidden unless explicitly enabled in Settings (`discordShowGameNames`, `discordShowHours`).
     - Toggling `discordRpcEnabled: false` immediately clears activity and destroys the connection.
  2. **Installer Architecture & Per-User Configuration**:
     - Configured `nsis` in `package.json` with `oneClick: false`, `perMachine: false`, and `allowToChangeInstallationDirectory: true`.
     - Installs per-user without requiring Windows UAC administrator elevation (default `%LOCALAPPDATA%\Programs\hourforge`).
  3. **Installer Graphics & Dark Glass Simulation**:
     - Generated NSIS Modern UI 2 bitmaps via `tools/build/generate_nsis_graphics.js` using master icon pipeline and 24-bit uncompressed BMP encoder:
       - `installerSidebar.bmp`: 164 x 314 px (154,542 bytes).
       - `uninstallerSidebar.bmp`: 164 x 314 px (154,542 bytes).
       - `installerHeader.bmp`: 150 x 57 px (25,818 bytes).
     - **NSIS GDI Limitations**: Windows NSIS dialogs use legacy Win32 GDI controls that cannot render hardware DWM acrylic or dynamic desktop transparency. The "dark glass" aesthetic is simulated by baking deep obsidian gradients (`#07090E` to `#101626`), radial purple glows, and specular border highlights directly into the 24-bit bitmaps.
  4. **Custom Welcome & SmartScreen Advisory**:
     - Welcome page explicitly advises users about Windows SmartScreen: because the build is not signed with an expensive commercial EV certificate, SmartScreen may display an "Unknown Publisher" prompt; instructions direct users to click "More info" and "Run anyway".
  5. **Finish Page Checkboxes & Windows Autostart**:
     - Finish page features two checkboxes:
       - "Launch HourForge" (default checked)
       - "Start HourForge with Windows" (default checked)
     - Checking autostart writes the HKCU Run registry value: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\HourForge = "<installDir>\HourForge.exe" --autostart`.
  6. **Clean Uninstallation with User Data Protection**:
     - Uninstaller deletes the HKCU autostart registry entry.
     - Uninstaller prompts the user: *"Do you want to delete all HourForge user data, settings, goals, and history?"* with **'No' as the default focused button** (`MB_DEFBUTTON2`), guaranteeing user data is kept by default.
     - In silent uninstallation (`/S`), user data is preserved by default unless `--delete-app-data` is explicitly passed.


---

## DEC-019: RouteManager and Tray Navigation Architecture
- **Date**: 2026-11-15
- **Context**: Clicking "Settings" on the system tray menu opened "Dashboard" instead of Settings. Root cause analysis revealed three architectural defects:
  1. `src/main/index.ts` (lines 92–97 in 0.1.0-alpha): `createMainWindow(initialRoute?: string)` checked `mainWindow && !mainWindow.isDestroyed()` and immediately returned after focus/restore, ignoring `initialRoute`.
  2. `src/renderer/App.tsx` & `src/renderer/store/useStore.ts` (line 74 in 0.1.0-alpha): On cold start, the renderer never inspected `window.location.hash` and hardcoded `currentRoute: 'dashboard'`.
  3. `src/main/tray.ts` (line 143 in 0.1.0-alpha): The "Open Dashboard" context menu item called `onToggleWindow()` instead of a dedicated navigation callback, and no IPC channel existed to push route changes to a warm window.
- **Decision**:
  1. **Canonical Route Whitelist (`src/shared/routes.ts`)**:
     - Strict Zod enum schema `NavRouteSchema` whitelisting: `'dashboard' | 'new-run' | 'plan' | 'goals' | 'games' | 'profiles' | 'history' | 'logs' | 'settings'`.
  2. **Dedicated RouteManager (`src/main/routeManager.ts`)**:
     - Centralizes all internal routing for cold starts, warm windows, and background toasts.
     - **Warm Window**: Calls `restore()`, `show()`, `focus()`, and sends `IPC_CHANNELS.EVENT_NAVIGATE` (`event:navigate`) with validated route.
     - **Cold Window**: Sets `pendingRoute`, initializes window, and renderer pulls via `IPC_CHANNELS.APP_CONSUME_PENDING_ROUTE` (`app:consumePendingRoute`) before initial render, ensuring zero flash of the dashboard.
     - Pending routes are consumed exactly once.
     - Tracks `currentRoute` across route updates and window lifecycle.
  3. **Preserved Routes on Toggle & Second-Instance**:
     - Tray left-click toggle shows/hides/restores the window without altering the active route.
     - Second-instance launch focuses existing window without resetting its active route.
  4. **Notification Routing per Brief 9.5**:
     - `blocked` toast -> `dashboard`
     - `run_finished` toast -> `history`
     - `steam_client` / `auth_required` toasts -> `settings`
     - Default -> `dashboard`


---

## DEC-020: Discord Rich Presence Redesign and Simplified Privacy Settings
- **Date**: 2026-11-16
- **Context**: Version 0.1.0-alpha presented three confusing boolean checkboxes for Discord Rich Presence (`discordRpcEnabled`, `discordShowGameNames`, `discordShowHours`). Playtime hours were also awkwardly embedded in presence details, and repetitive status lines lacked personality.
- **Decision**:
  1. **Two-Option Radio Group**:
     - Collapsed the 3 boolean settings into a single property: `discordPresenceMode: 'hourforge' | 'none'` (default `'hourforge'`).
     - Backups and local settings migrate legacy keys seamlessly: `discordRpcEnabled: false` $\to$ `'none'`; all other cases $\to$ `'hourforge'`. Legacy keys are stripped to satisfy `.strict()` schema enforcement on import.
  2. **Presence Details**:
     - Single active game: displays the full game title (clamped $\le 100$ characters).
     - Multiple active games: displays `"Farming Multiple Games"`.
     - Idle engine: clears activity card.
  3. **Rotating Status Lines (Shuffle Bag)**:
     - Authored humorous lines in `src/main/discord/presenceLines.ts` comprising neutral and cheeky categories (`INCLUDE_CHEEKY_LINES = true`).
     - Implemented `PresenceLineRotator` using a Fisher-Yates shuffle bag rotating every 20–40 minutes with injected RNG.
     - Enforced boundary guarantee: refills never repeat the previous bag's last drawn line.
     - Preserves `startTimestamp` across line rotations so the elapsed run timer on Discord never resets.
     - When engine is paused: status line is strictly `"Paused (touching grass, apparently)"`.
  4. **Rate Limit & Update Coalescing**:
     - Coalesces rapid engine updates to at most 1 update per 15 seconds, preventing Discord local pipe throttling.
  5. **Settings UI**:
     - Replaced checkboxes with a Liquid Glass radio-card group featuring optimized Phoepe artwork (`Happy_Pheobe.png` for HourForge Presence, `Pheobe_Sob.png` for Invisible).
     - Fixed aspect ratios and explicit dimensions prevent layout shift.
