# Manual Test Checklist (docs/MANUAL_TEST_CHECKLIST.md)

This checklist is for the user to execute with a real Steam client and account at the conclusion of the build.

---

## Pre-Test Setup
- [ ] Install HourForge from generated NSIS installer (`release/HourForge-Setup-0.1.1.exe`) or run packaged build.
- [ ] Ensure official Steam Desktop Client is installed and signed in.
- [ ] Verify `%LOCALAPPDATA%/HourForge/helpers` directory exists.

---

## 1. Steam Desktop Client Detection & Onboarding
- [ ] Launch HourForge: verify Onboarding Wizard step 1 shows **Connected to Steam Client** with `Connected as <YourPersonaName>`.
- [ ] Confirm no Steam password, DPAPI credential prompt, or Steam Guard modal appears.
- [ ] Test with Steam closed: verify Onboarding displays `Steam Client Not Running`, and clicking **Open Steam Client** successfully launches Steam in `-silent` mode.
- [ ] Verify `credentials.bin` and any legacy `asf/` folder are absent from `%LOCALAPPDATA%/HourForge/` (eragicated on upgrade).

---

## 2. Helper Process Spawning & Steam Library Status
- [ ] Start a SINGLE run for Wuthering Waves (App ID `3513350`).
- [ ] Check Task Manager: confirm helper process is running with isolated cwd in `%TEMP%/hf_helper_3513350_*`.
- [ ] Check official Steam Library: confirm Wuthering Waves shows green/blue **Stop** button.
- [ ] Check personal Steam Community profile: confirm status shows **"In-Game: Wuthering Waves"**.
- [ ] Confirm helper works even though the game is **not** downloaded or installed locally.
- [ ] Pause or stop run: verify helper process terminates cleanly, `steam_appid.txt` and temporary folder are deleted, Steam Library returns to normal, and profile returns to "Online".

---

## 3. Single Game Mode & Open-Ended Display
- [ ] Start a SINGLE run: verify exactly 1 track is scheduled and executed.
- [ ] In Dashboard, verify open-ended track displays `${todayHours}h today (Open-ended)`.
- [ ] Confirm today's credited hours persist and update across sessions.

---

## 4. Multi-Game & Dedicated Quota Modes
- [ ] Start a DEDICATED run with Wuthering Waves (3513350) and Neverness to Everness (4508340) with 1h quota each.
- [ ] Verify two independent helper processes run concurrently.
- [ ] Confirm both games show as running or alternating according to scheduler rhythm.
- [ ] Confirm run completes automatically when quotas are met.

---

## 5. Steam Client Interruption & Sign-Out Handling
- [ ] While a run is active, completely exit the official Steam client.
- [ ] Verify HourForge detects Steam shutdown, helper process cleanly exits, and tracks pause.
- [ ] Verify system toast notification fires: `Steam Desktop Client Not Detected`.
- [ ] Restart Steam client: verify HourForge detects reconnection and resumes scheduled tracks automatically.

---

## 6. Tray & Silent Background Operation
- [ ] Close main window.
- [ ] Verify window disappears and renderer process terminates in Task Manager (<30 MB RAM).
- [ ] Verify tray icon remains active with dynamic tooltip.
- [ ] Verify playtime continues accumulating in background.
- [ ] Left-click tray icon: confirm dashboard re-opens instantly with accurate state.
- [ ] Right-click tray $\to$ **Panic Stop**: confirm all active tracks terminate immediately.

---

## 7. Autostart & Launch Picker Card
- [ ] Enable "Start with Windows" in Settings.
- [ ] Launch with `--autostart`: confirm no main window opens, Launch Picker Card appears near tray.
- [ ] Verify 60-second countdown runs and pauses on hover or input.
- [ ] Select SINGLE or DEDICATED and click **Start Run**: verify run begins cleanly.

---

## 8. Steam Hours Dashboard & Web API Verification (Milestone M10)
- [ ] In **Settings** $\to$ **Steam Web API & Profile Hours**, input valid 32-character Steam Web API key.
- [ ] Click **Test Connection**: verify green success banner with game count.
- [ ] Confirm 17-digit SteamID64 is auto-detected from local Steam client (or test manual override).
- [ ] Click **Save**: verify key is saved encrypted via Windows DPAPI (`steam-api-key.bin`), showing `●●●●●●●● (Windows DPAPI)`.
- [ ] Check logs (`logs` tab and log files): confirm API key and SteamID are never logged in plain text.
- [ ] In **Dashboard**, verify each tracked game displays:
  - Steam Profile hours (live from API)
  - HourForge Credited hours
  - Sync Baseline hours
  - Steam Gain since baseline (`+X.X h`)
- [ ] Click **Refresh Hours**: verify button shows spinner, debounces rapid clicks, and updates timestamp.
- [ ] Test Private Profile scenario (temporarily set Steam Game details to Private in Steam Privacy Settings): verify Dashboard shows amber warning banner explaining profile privacy.
- [ ] Test Invalid Key scenario (save invalid dummy key): verify Dashboard and Settings report HTTP 403 Forbidden without leaking the raw key string.
- [ ] Test 429 Rate Limit scenario: verify backoff lengthens (30m $\to$ 60m $\to$ 120m cap), honors `Retry-After`, and manual Refresh button displays "Rate limited: retry in Xm" without bypassing the backoff.
- [ ] Confirm tracked-games filtering: verify only games currently added to HourForge are requested (`appids_filter`) and cached in `steam-hours-baselines.json`.
- [ ] Verify lag detection: if a track finishes a session and 30+ minutes pass without Steam profile catching up by $\ge 0.5$ hours, verify amber warning appears: *"Steam may be lagging. Steam commits playtime to your profile when a session ends."*
- [ ] Verify offline handling: disconnect network and click Refresh Hours; verify cached hours are preserved with offline indicator.


---

## 9. Catch-Up Goal & Playtime Pacing Verification (Milestone M11)
- [ ] On the **Dashboard**, click **Set Goal** on a game card.
- [ ] Configure target hours (e.g. 100h) and target date 30 days in future; click **Save Goal**.
- [ ] Verify Dashboard card renders progress bar, effective hours, remaining hours, and daily pace requirement.
- [ ] Test Friend Hours Matcher:
  - Enter a valid public SteamID64 $\to$ click **Fetch** $\to$ verify hours are retrieved and target hours auto-populate.
  - Enter a private profile SteamID64 $\to$ verify warning message explaining private game details.
  - Check log files and `goals.json` $\to$ verify friend's SteamID64 is never logged or written to disk.
- [ ] Test Feasibility Warnings & Cap Protection:
  - Select a profile with a 4-hour daily cap (e.g. Casual).
  - Set a goal requiring 10h/day (e.g. 50 hours in 5 days).
  - Verify warning appears: *"Not feasible by `<target date>`"*, displaying earliest feasible date and recommending *Grinder (16h)*.
  - Verify active profile cap is NOT raised automatically.
- [ ] Test Missed Deadline:
  - Set target date to yesterday (or advance system clock past deadline).
  - Verify status updates to `MISSED_DEADLINE` without application crash, dividing by zero, or deleting goal data.
- [ ] Verify Local Day Boundaries & Timezones:
  - Confirm date calculations and countdowns reflect local calendar day transitions without DST or timezone offsets corrupting day count.

### Dedicated Goals Screen & CATCHUP Run Verification
- [ ] Open the left rail navigation and click **Goals** (`Target` icon).
- [ ] Confirm screen displays top metrics: Active Goals, Overall Completion, Playtime Remaining, and Safety Buffer indicator.
- [ ] Verify each goal card renders an SVG Progress Ring with percentage and current/target hours.
- [ ] Verify Projected Finish Date and Pacing badge (*On Track* / *Behind by X.X h*).
- [ ] Verify Planned vs Actual Recharts bar chart renders planned quota bars vs actual credited playtime bars.
- [ ] Click **Start Catch-Up Run**: verify run launches in `CATCHUP` mode with daily quotas applied.
- [ ] Launch with `--autostart`: verify Launch Picker card displays `Catch-Up` mode chip alongside Dedicated, Single, and Multi.
- [ ] Test two simultaneous goals: configure goals on two games, start Catch-Up run, and confirm both accrue playtime concurrently without exceeding PC-on hours.
- [ ] Test unfeasible goal message: verify notice plainly states required hours/day and notes when >16h/day is far above typical human pattern without lecturing.

### Settings Backup & Restore (Milestone M12)
- [ ] Export Backup without history:
  - Navigate to **Settings** > **Backup & Restore**.
  - Click **Export Backup...** $\to$ choose save location.
  - Verify file saves as `hourforge-backup-<date>.json`.
  - Open file in text editor: confirm `schemaVersion: 1`, games, profiles, goals, and settings are exported.
  - **Privacy Check**: search exported file for `apiKey`, `steamId64Override`, `steamConnectedAccount`, `friendSteamId`, `password`, `credentials` $\to$ confirm 0 results.
- [ ] Export Backup with history:
  - Check **"Include historical session logs in export"** $\to$ click **Export Backup...**.
  - Verify exported JSON includes the `history` array of session logs.
- [ ] Import Preview Modal & Diffs:
  - Click **Import Backup...** $\to$ select previously exported backup file.
  - Verify preview modal appears displaying:
    - Backup filename, schema version, export timestamp.
    - Diffs breakdown: Games to add/update/unchanged, Profiles to add/update/unchanged, Goals to add/update/unchanged, History count.
- [ ] Test Merge Mode:
  - In HourForge, add a temporary local game (e.g. 480).
  - Open Import Backup modal $\to$ select **Merge (Recommended)** $\to$ click **Apply Merge**.
  - Verify temporary game remains intact, and backup games/profiles/goals are added/updated.
  - Confirm Steam Web API key and local credentials remain unchanged.
- [ ] Test Replace Mode:
  - Open Import Backup modal $\to$ select **Replace All** $\to$ click **Apply Replace**.
  - Verify games, profiles, goals, and history are replaced with backup contents.
- [ ] Test Automatic Rolling Backups & Restore:
  - Verify an auto-snapshot appears under **Automatic Rolling Backups (Last 5)** on the Settings screen.
  - Click **Restore** next to a rolling snapshot $\to$ confirm dialog $\to$ verify state reverts to snapshot.
  - Confirm `%LOCALAPPDATA%\HourForge\backups\` maintains at most 5 files, pruning oldest.
- [ ] Error Handling & Version Guard:
  - Attempt to import a non-JSON or corrupted file $\to$ verify descriptive error banner without crash.
  - Edit a backup file to set `"schemaVersion": 99` $\to$ attempt import $\to$ verify clean rejection message prompting app update.
  - Attempt to import while a run is active $\to$ verify rejection with "Cannot restore backup while a run is active. Stop the run first."

### Friend Privacy & Secret Defense Verification
- [ ] Match friend hours in Goals screen: confirm friend SteamID returns playtime hours without displaying or saving friend profile persona name.
- [ ] Check `goals.json` on disk: verify friend persona names and friend SteamIDs never appear.
- [ ] Test value secret scanner: create a game or profile containing a 17-digit SteamID (`7656119...`) or 32-hex key $\to$ attempt export $\to$ verify export throws security violation.

### Icon Pipeline & System Tray Legibility (Milestone M13a)
- [ ] Inspect `docs/tray-icons-legibility.png`:
  - Verify all 6 states (`Idle`, `Connecting`, `Playing`, `Resting`, `Blocked`, `Error`) render cleanly across Dark, Light, and Mica taskbars.
  - Confirm dark contrast halo around status dot ensures 100% legibility on light (#E2E8F0) and dark (#18181B) backgrounds.
  - Check 16px, 20px, 24px, and 32px scales for crisp rendering.
- [ ] Run application:
  - Verify taskbar icon displays official hourglass.
  - Verify system tray icon displays hourglass with real-time status dots (grey when idle, green when playing, amber when resting).
- [ ] Verify `build/icon.ico` contains multi-resolution icon layers (16 to 256 px).

---

## 11. Liquid Glass UI & Packaged Tray Verification (Milestone M13b)
- [ ] **Packaged Tray Icon Execution**:
  - Run `release\win-unpacked\HourForge.exe`.
  - Confirm system tray displays official HourForge hourglass with status dot.
  - Inspect `docs/packaged-tray-live.png` for multi-resolution DPI verification (100%, 125%, 150%, 200%).
- [ ] **Windows 11 DWM Acrylic Composition**:
  - Launch HourForge on Windows 11: verify frameless window has native acrylic desktop translucency and rounded DWM corners.
  - Verify no black flicker or clipping during window drag or resizing.
  - Launch on Windows 10: verify smooth fallback to deep space translucent `#080B11` with radial atmospheric glow.
- [ ] **Liquid Glass Visual Audit**:
  - Inspect all screens: Dashboard (running/empty), New Run, Plan & Timeline, Goals, Games Library, Profiles, History, Logs, Settings, Onboarding Wizard, Launch Picker Card.
  - Verify frosted glass cards (`rgba(18, 25, 40, 0.65)`), 1px specular borders, subtle glowing rim lights, and gradient glass buttons.
- [ ] **Low-Resource & Zero-CPU Performance**:
  - Open Task Manager $\to$ Details $\to$ observe `HourForge.exe` CPU usage while window is open and idle on Dashboard: verify CPU is $<0.5\%$.
  - Close main window to tray: observe `HourForge.exe` in background: verify CPU is $\approx 0.0\%$ and RAM remains $<35$ MB.
  - Inspect `docs/BENCHMARKS.md` for 30-second continuous metric validation across hidden, idle, and running states.

---

## 12. Discord Rich Presence Verification (Task 2 Redesign)
- [ ] **Two-Option Liquid Glass Settings**:
  - Open **Settings** $\to$ **Discord Rich Presence**.
  - Verify two radio cards are displayed with Phoebe artwork:
    - **HourForge Presence (Recommended)** with `Happy_Pheobe.png`
    - **No Presence (Invisible)** with `Pheobe_Sob.png`
  - Confirm clicking each card toggles selection and radio button with no layout shift.
- [ ] **Presence Content & Details**:
  - With **HourForge Presence** active, start a Single game run (e.g. Wuthering Waves):
    - Check Discord profile: verify details displays `"Wuthering Waves"`.
    - Verify state displays a rotating witty status line from the shuffle bag (e.g. `"Hours don't forge themselves"`).
    - Verify elapsed timer runs from session start.
  - Start a Multi-game run (2+ games):
    - Verify details displays `"Farming Multiple Games"`.
  - Pause the run:
    - Verify state displays `"Paused (touching grass, apparently)"`.
- [ ] **No Presence Toggle**:
  - Select **No Presence (Invisible)** $\to$ click **Save Settings**:
    - Verify Discord activity card clears and disappears immediately.
- [ ] **Discord Client Lifecycle & Rate Limiting**:
  - Rapidly pause and resume the run 4 times within 5 seconds $\to$ confirm Discord updates are coalesced to at most 1 update per 15 seconds.
  - Close desktop Discord $\to$ verify HourForge continues running quietly without popup toasts.
  - Re-open Discord $\to$ verify presence reconnects within 15–30 seconds.

---

## 13. NSIS Packaged Installer Verification (Milestone M14b)
- [ ] **SmartScreen Warning Handling**:
  - Double-click `release\HourForge-Setup-<version>.exe`.
  - Windows SmartScreen displays "Windows protected your PC / Unknown Publisher".
  - Click **"More info"**, then **"Run anyway"**.
- [ ] **Per-User Installer Flow**:
  - Verify installer opens without requesting Windows UAC administrator elevation.
  - Check Welcome page: verify custom branding, dark glass sidebar image (164x314), and SmartScreen advisory text.
  - Check Destination Directory page: confirm default path is `%LOCALAPPDATA%\Programs\hourforge`. Verify changing path works.
  - Check Finish page:
    - Verify dark glass sidebar, custom completion text.
    - Confirm two checkboxes are visible and checked by default: **"Launch HourForge"** and **"Start HourForge with Windows"**.
- [ ] **Windows Autostart Entry**:
  - Complete installation with "Start HourForge with Windows" checked.
  - Open PowerShell and run: `Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' | Select-Object -ExpandProperty HourForge`.
  - Confirm entry points to `"<installDir>\HourForge.exe" --autostart`.
- [ ] **Steamworks Native Extraction**:
  - Inspect `<installDir>\resources\app.asar.unpacked\`:
    - Confirm `steamworks.js` native binaries (`steam_api64.dll`, `steamworksjs.win32-x64-msvc.node`) are present outside the ASAR archive.
    - Confirm `steamHelper.js` is present outside ASAR.
- [ ] **Uninstaller Execution & User Data Prompt**:
  - Launch `Uninstall HourForge.exe` from the install directory or Windows Settings.
  - Verify prompt: *"Do you want to delete all HourForge user data, settings, goals, and history?"*.
  - Choose **"No"** (default focused button):
    - Verify all application binaries are removed.
    - Verify autostart registry entry in `HKCU\...\Run` is removed.
    - Verify user data folder `%LOCALAPPDATA%\HourForge\` is preserved with settings, games, goals, and history intact.


---

## 14. System Tray Navigation Routing Verification (Task 1)
- [ ] **Tray "Open Dashboard"**:
  - Right-click tray icon $\to$ click **Open Dashboard**:
    - Verify window restores and navigates directly to **Dashboard** screen.
    - Test from cold start (window previously closed) and warm state (window open on Settings).
- [ ] **Tray "Settings"**:
  - Right-click tray icon $\to$ click **Settings**:
    - Verify window restores and navigates directly to **Settings** screen (does NOT open Dashboard).
    - Test from cold start (window closed) and warm state (window on Dashboard).
- [ ] **Tray "Start New Run"**:
  - Right-click tray icon $\to$ click **Start New Run**:
    - Verify window opens directly on **New Run** configuration screen.
- [ ] **Tray Left-Click Toggle**:
  - Open window to **Goals** screen.
  - Left-click tray icon $\to$ confirm window minimizes/hides.
  - Left-click tray icon again $\to$ confirm window restores, remaining on **Goals** screen (not reset to Dashboard).
- [ ] **Second Instance Focus**:
  - With HourForge open on **Games** screen, launch another instance (or shortcut).
  - Confirm existing window gains focus without resetting active route from **Games**.
