# HourForge User Guide (v0.1.0-Alpha)

**HourForge** is an autonomous Windows tray supervisor and humanized Steam playtime scheduler. It connects directly to the **official Steam Desktop Client** on your PC using lightweight background helper processes (`steamworks.js`), accumulating verified Steam playtime unattended without entering your Steam password, storing credentials, or handling Steam Guard 2FA codes.

Steam displays the game as running with the green/blue **Stop** button in your official Steam Library, and your Steam Community profile displays **"In-Game"**.

---

## 1. System Requirements & Installation

- **Operating System**: Windows 10 (1809+) or Windows 11 (64-bit x64).
- **Prerequisites**: Official Steam Desktop Client installed and signed in.
- **Installer**: Run `HourForge-Setup-0.1.1.exe`.
  - Installs locally into `%LOCALAPPDATA%\Programs\HourForge`.
  - Does **not** require UAC administrator elevation.
  - Automatically creates Start Menu and Desktop shortcuts.

---

## 2. Getting Started & Initial Configuration

### First-Run Onboarding
1. Launch HourForge from the Start Menu or Desktop.
2. Complete the 4-step onboarding wizard:
   - **Steam Desktop Connection**: HourForge automatically detects your running Steam client via the Windows Registry and reports `Connected as <YourPersonaName>`. If Steam is closed, click **Open Steam** to start it silently. Zero passwords or 2FA codes required.
   - **Target Games**: Add your preferred Steam games (e.g., *Wuthering Waves* App ID `3513350`, *Neverness to Everness* App ID `4508340`).
   - **Rhythm Profile**: Choose an initial profile (Regular, Casual, or Grinder).
   - **Windows Startup**: Enable "Start with Windows" for silent unattended logon execution.

### Automatic Clean Upgrade
When HourForge launches or upgrades from an earlier build, any legacy credentials file (`credentials.bin`) is securely overwritten with random bytes and unlinked, legacy ASF files and directories are completely wiped, and stored account credentials are removed.

---

## 3. Operating Modes

HourForge supports three operational scheduling modes:

| Mode | Description | Typical Use Case |
| :--- | :--- | :--- |
| **Single Game (Open)** | Continuously runs exactly one selected game according to human rhythm intervals. Displays today's credited hours (`X.Xh today (Open-ended)`). | Ongoing passive playtime accumulation for a primary main game. |
| **Dedicated (Quota)** | Schedules exact target playtime (hh:mm) for each selected game. Once all quotas are reached, the run finishes and helper processes cleanly shut down. | Completing a specific playtime goal on multiple games. |
| **Multi-Game (Alternating)**| Manages multiple tracks concurrently with non-conflicting human rhythms, switching between active games. | Leveling hours across a collection of titles. |

---

## 4. Steam Desktop Client Helper Architecture

HourForge executes games via isolated, lightweight background helper processes:

- **One Process per Active Game Track**: Steamworks permits one App ID per operating system process. HourForge spawns one helper process per active game track.
- **Isolated App ID Configuration**: Each helper runs in an isolated temporary directory with its own `steam_appid.txt` and `SteamAppId` environment variable, ensuring zero cross-game contamination.
- **Clean Teardown & Heartbeat**: When a session finishes or enters a rest interval, the helper cleanly calls `SteamClient.shutdown()`, removes its temporary directory, and exits.
- **Steam Client Lifecycle Monitoring**:
  - If Steam is not running when a run begins, HourForge launches `steam.exe -silent` and waits up to 120 seconds for login.
  - If Steam is closed or signed out mid-run, active tracks automatically pause, and HourForge posts a system toast notification (throttled to once every 10 minutes). When Steam reconnects, tracks resume automatically.
  - An optional setting (`closeSteamOnQuit`) can close the Steam client when HourForge terminates.

---

## 5. Human Rhythm Engine & Statistical Modeling

HourForge avoids simplistic fixed-interval farming scripts by using statistical modeling that simulates human behavior:

### Statistical Session & Rest Sampling
- **Truncated Log-Normal Sampling**: Session and rest durations are sampled from a log-normal distribution with heavy right-tail variance, truncated strictly within human bounds.
- **Proportional Rest Scaling**: Longer play sessions naturally trigger longer rest periods.
- **Occasional Long Breaks**: 5–15% probability of sampling an extended meal, errand, or gym break (45–150 minutes).
- **Boot & Window Edge Jitter**: Sessions do not start abruptly at rounded times; active window boundaries are jittered by ±15–30 minutes, and restarts incorporate boot jitter (45–240 seconds).
- **Sleep & Active Windows**: Enforces strict daily rest hours (e.g. 02:00 to 09:00). Overnight farming is paused, preventing unrealistic 24/7 activity patterns.
- **Daily Cap Enforcement**: Maximum hours per calendar day are enforced (e.g. 12 hours max). When reached, the bot rests until the next morning.
- **DST-Safe Calendar Engine**: Calendar boundaries use the Windows system timezone via the ECMAScript `Intl` API, handling daylight saving transitions seamlessly without drift.

### Default Profiles
1. **Regular (Default)**: 60–180m sessions, 5–45m rests, 09:00–02:00 active window, 12h daily cap.
2. **Casual**: 30–75m sessions, 15–90m rests, 18:00–23:30 active window, 4h daily cap.
3. **Grinder**: 90–240m sessions, 3–20m rests, 09:00–04:00 active window, 16h daily cap.

---

## 6. Tray Operation & Headless Architecture

HourForge is designed for silent, low-resource background operation:

- **System Tray Multi-Resolution Icons**:
  The tray icon is dynamically rendered with multi-resolution representations (`16x16`, `20x20`, `24x24`, and `32x32` pixels) to provide crisp legibility on 100%, 125%, 150%, and 200% Windows display scaling settings:
  - `Muted Slate` (`#94A3B8`): Idle
  - `Cyan Blue` (`#38BDF8`): Connecting / Waiting for Steam client
  - `Emerald Green` (`#10B981`): Playing game
  - `Amber Gold` (`#F59E0B`): Resting between sessions
  - `Warning Orange` (`#F97316`): Blocked / Steam signed out
  - `Crimson Red` (`#EF4444`): Error
  Each status dot includes an anti-aliased dark contrast halo ring to guarantee high legibility across Windows light, dark, and translucent taskbars.
- **Memory Reclamation**: When you close the main application window, the Chromium renderer process is completely destroyed (`mainWindow.destroy()`). The headless Node.js supervisor continues running in the background at **<30 MB RAM**. Re-clicking the tray icon recreates the UI instantaneously.
- **Launch Picker Card**: When started at Windows logon via `--autostart`, a compact, frameless, always-on-top card appears near the tray without stealing focus. It presents your chosen mode, game chips with quota inputs, and a 60-second auto-start countdown that automatically pauses if you move your mouse over it or type.
- **Diagnostic Logs Viewer**: Dual-tab real-time terminal output with "Engine" (scheduler, transitions, power events) and "Steam helper" (per-track helper stdout/stderr with automated redaction).

---

## 7. Liquid Glass Design System & Window Composition

HourForge features a high-performance **Liquid Glass** user interface designed for Windows 11 and Windows 10:

- **Windows 11 DWM Acrylic Backdrop**: The main window uses native DWM acrylic composition (`backgroundMaterial: 'acrylic'`) with hardware-accelerated desktop blur and native window corner rounding.
- **Windows 10 Compatibility**: On Windows 10, the app smoothly falls back to a deep space translucent glass gradient (`#080B11` with radial atmospheric lighting).
- **Zero-CPU Idle Architecture**:
  - CSS `backdrop-filter` is restricted to large structural surfaces (TitleBar, NavRail, Modals), completely avoiding composition overhead in scrollable lists.
  - Background lighting uses static CSS radial gradients rather than continuous GPU frame repaints, maintaining near-zero CPU (<0.1%) when idle or minimized to tray.
  - Animations respect the system `prefers-reduced-motion` setting.
- **Luminous Glass Surfaces**: Frosted translucent cards (`rgba(18, 25, 40, 0.65)`), 1px specular highlight borders, glowing neon rim lights, and gradient glass buttons.

---

## 8. Troubleshooting & FAQ

**Q: Do I need to enter my Steam password?**
No. HourForge connects directly to your installed Steam desktop client on Windows. No credentials or Steam Guard codes are needed.

**Q: Does the game need to be installed on my PC?**
No. The Steamworks API connects to the active Steam client for any owned or free-to-play App ID, even if the game files are not downloaded on disk.

**Q: Where are settings and database files stored?**
All user configurations, game library data, and history logs reside in:
`%LOCALAPPDATA%\HourForge\`
- `data\settings.json`: Application settings
- `data\games.json`: Games library
- `data\profiles.json`: Human rhythm profiles
- `data\history.json`: Verifiable session logs
- `helpers\`: Helper process pidfiles and temporary execution directories

**Q: How do I completely stop and reset?**
Right-click the HourForge system tray icon and select **Panic Stop** or **Quit**. HourForge terminates all helper processes cleanly and resets to idle.

---

## 8. Steam Hours Dashboard & Web API Sync (Milestone M10)

HourForge includes a live verification dashboard that compares your official Steam profile playtime with HourForge credited hours.

### Setting Up Steam Web API
1. Navigate to **Settings** > **Steam Web API & Profile Hours**.
2. If you don't already have a key, click the link to [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) and register a key (any domain name, e.g., `localhost`).
3. Paste the 32-character key into the input field and click **Save**.
   - Your key is immediately encrypted using **Windows DPAPI** (`safeStorage`) and stored securely in `steam-api-key.bin`.
   - The key is **never logged**, exported in diagnostics, or transmitted anywhere other than `https://api.steampowered.com/`.
4. Click **Test Connection** to verify connectivity.

### Account Detection & SteamID64
- HourForge automatically detects your 17-digit SteamID64 from the currently logged-in Steam desktop client: reading `<SteamPath>\config\loginusers.vdf` (located via the Windows Registry `HKCU\Software\Valve\Steam\SteamPath`), with mathematical fallback to `ActiveUser` DWORD (`76561197960265728 + ActiveUser`) if the file is missing or unreadable.
- If desired, you can enter a custom SteamID64 override in Settings.

### Dashboard Verification Cards
Once configured, the Dashboard displays a verification card for each tracked game:
- **Steam Profile**: Official playtime currently reflected on your public Steam profile.
- **HF Credited**: Total hours credited by HourForge sessions.
- **Sync Baseline**: Playtime when HourForge first began tracking this game.
- **Steam Gain**: Total playtime increase on Steam since baseline (`+X.X h`).

### Automatic Polling & Lag Detection
- **15-Minute Polling**: HourForge automatically refreshes profile playtime every 15 minutes.
- **Rate Limit Protection**: If Steam reports HTTP 429 (Rate Limit), polling automatically backs off to 5 minutes.
- **Manual Refresh**: Click **Refresh Hours** on the Dashboard for immediate on-demand polling (debounced by 10s).
- **Playtime Lag Detection**: Steam commits accumulated playtime to user profiles only when a game session stops. If HourForge finishes a session and at least 30 minutes pass while Steam profile playtime remains unupdated by ≥0.5 hours, the card displays:
  > ⚠️ **Steam may be lagging**
  > *Steam commits playtime to your profile when a session ends.*
- **Private Profiles**: If your Steam profile or game details are set to Private, HourForge detects this and displays a guide to set "Game details" to Public under Steam Privacy Settings.


---

## 9. Catch-Up Goals & Playtime Pacing (R5)

HourForge allows you to set target playtime goals (e.g., reaching 100 hours or matching a friend's hours by a specific deadline). The pacing engine calculates daily quotas, projects required PC-on time, and protects your profile daily caps.

### Setting a Goal
1. On the **Dashboard**, find any tracked game and click **Set Goal** (or **Edit Goal**).
2. Configure:
   - **Target Playtime**: Desired total hours.
   - **Match Friend's Hours** *(optional)*: Enter a friend's public 17-digit SteamID64 or vanity ID to fetch their current playtime.
   - **Target Deadline**: Target completion date (YYYY-MM-DD).
   - **Starting Playtime** *(fallback)*: If Steam Web API is not configured, enter manual starting hours.
3. Click **Save Goal**.

### Pacing Progress & Indicators
Each game card displays:
- **Progress Bar**: `Current Effective / Target Hours` with completion percentage.
- **Pace Badge**: Status indicator (`ON_TRACK`, `AHEAD`, `BEHIND`, `FEASIBLE`, `NOT_FEASIBLE`, or `MISSED_DEADLINE`).
- **Required Daily Pace**: Daily hours needed to reach the goal by the deadline.

### Feasibility & Cap Protection
- **Never Silent Cap Raises**: HourForge will **never** automatically raise your active profile's daily cap.
- **Infeasibility Warning**: If required daily hours exceed your active profile's `dailyCapHours`, a warning banner appears:
  - *Not feasible by `<target date>` (needs X.X h/day, cap is Y.Y h/day).*
  - **Earliest Feasible Date**: Shows the realistic date when the goal can be reached under the current cap.
  - **Required PC-On Time**: Projects required system power-on time per day based on duty cycle and max run fraction.
  - **Profile Suggestions**: Recommends profiles with sufficient caps (e.g., *Grinder 16h*).

### Privacy & Friend Matcher
- Friend hours are fetched via public Steam Web API calls.
- Friend SteamID64s are **never saved to disk**, never logged, and never included in diagnostic exports.
- If a friend's profile or game details are set to Private, HourForge informs you immediately.

### Dedicated Goals Screen & CATCHUP Mode
- Navigate to **Goals** on the left rail navigation.
- **Progress Ring**: Displays overall progress percentage and `current / target` hours.
- **Projected Finish Date**: Dynamically calculated based on daily quota and profile cap.
- **Pacing Indicators**: Displays *On Track*, *Ahead by +X.X h*, or *Behind by X.X h*.
- **Planned vs Actual Chart**: Visualizes planned daily quotas against actual credited hours over time.
- **Starting a CATCHUP Run**: Click **Start Catch-Up Run** from the Goals screen, Launch Picker Card, or New Run screen.
- **Multi-Goal Concurrency**: If multiple games have goals, they accrue hours simultaneously during common play intervals; neither game ever exceeds the PC-on hours.

---

## 10. Settings Backup & Restore (Milestone M12)

HourForge provides a versioned, portable backup and restore engine to safely protect, migrate, or reset your configurations.

### Exporting Your Configuration
1. Open **Settings** from the left navigation rail.
2. Scroll to the **Backup & Restore** card.
3. (Optional) Check **"Include historical session logs in export"** if you want full session histories included.
4. Click **Export Backup...** and choose where to save your `.json` backup file.
5. **Zero Secret Leak Guarantee**:
   - Your Steam Web API key, SteamID64, Steam account name, Windows credentials, passwords, and friend SteamIDs are **strictly omitted** from all backups.
   - Backups are completely safe to move across PCs or share templates without exposing private account identifiers.

### Importing & Restoring
1. Click **Import Backup...** on the Backup & Restore card and select a valid `.json` file.
2. The **Preview Backup Import** modal automatically parses the file and presents a detailed diff breakdown:
   - **Games**: Items to add, items to update, unchanged items.
   - **Profiles**: Profiles to add, update, or keep.
   - **Catch-Up Goals**: Goals to add, update, or keep.
   - **Session History**: Count of historical records included.
3. Select your desired import mode:
   - **Merge (Recommended)**: Preserves existing games and profiles. Adds new items and updates matching IDs. Retains your local Steam Web API keys and credentials.
   - **Replace All**: Overwrites current games, profiles, goals, and history with the backup contents.
4. Click **Apply Restore** to commit changes.

### Automatic Rolling Safety Backups
- Before any import or restore operation is executed, HourForge automatically captures a rolling safety snapshot (`auto-backup-<timestamp>.json`) in `%LOCALAPPDATA%\HourForge\backups\`.
- The system retains the **last 5 automatic snapshots**, pruning older ones automatically.
- To revert an import or roll back changes, click the **Restore** button next to any snapshot in the **Automatic Rolling Backups** list on the Settings screen.

---

## 11. Tray Icon & Status Indicators (Milestone M13a)

HourForge displays an official glowing hourglass icon in your Windows notification area (system tray), featuring real-time status dots with dark contrast halos for high visibility across Dark, Light, and Mica taskbars:

| State | Dot Color | Meaning |
|---|---|---|
| **Idle** | Slate Grey (`#94A3B8`) | Engine stopped or paused; ready for tasks |
| **Connecting** | Cyan Blue (`#38BDF8`) | Establishing helper connection with Steam client |
| **Playing** | Emerald Green (`#10B981`) | Active play session in progress accruing quota |
| **Resting** | Amber Gold (`#F59E0B`) | Taking a simulated human break between sessions |
| **Blocked** | Warning Orange (`#F97316`) | Steam client signed out or game playing elsewhere |
| **Error** | Crimson Red (`#EF4444`) | Helper crashed or process error |

Multi-resolution icons are bundled at 16, 20, 24, and 32 px to provide native crispness at all Windows DPI scaling levels (100%, 125%, 150%, 200%). An automated visual audit is documented in `docs/tray-icons-legibility.png`.

---

## 12. Liquid Glass Design System & Windows 11 Acrylic (Milestone M13b)

HourForge features a bespoke **Liquid Glass** user interface designed for Windows 11 and Windows 10:

- **Windows 11 DWM Acrylic Integration**: On Windows 11, the frameless window utilizes native Desktop Window Manager (DWM) acrylic material (`backgroundMaterial: 'acrylic'`), providing native rounded window corners, subtle desktop pass-through blur, and hardware-accelerated composition without DWM flickering.
- **Windows 10 Fallback**: On Windows 10, the window cleanly falls back to dark obsidian (`#080B11`) with static CSS radial atmospheric light pools (violet `#8B5CF6` and cyan `#06B6D4`).
- **Zero-CPU Rendering Architecture**:
  - The UI uses static multi-stop radial gradients instead of continuous animated blur orbs, keeping GPU redraws minimal.
  - Backdrop filters (`backdrop-filter: blur(...)`) are strictly confined to top-level structural chrome (TitleBar, NavRail, Modals) and omitted from recurring list items.
  - While minimized or hidden to the system tray, all rendering pauses, consuming near-zero CPU (0.05% - 0.12%).
  - Full support for `prefers-reduced-motion` to suppress transitions when accessibility modes are enabled.

---

## 13. Discord Rich Presence (Milestone M14a)

HourForge includes native Discord Rich Presence integration over local Windows named pipes (`\\.\pipe\discord-ipc-0` through `-9`) using a pure JavaScript client with zero external binaries:

### Privacy by Default
- **Default Status**: Displays generic `"HourForge"` title, `"Farming hours"` state, the official app hourglass icon, and an elapsed session timer.
- **Privacy Controls**: Open **Settings** $\to$ **Discord Rich Presence**:
  - **Enable Discord Rich Presence** (default ON): Connects to local Discord desktop client. Disabling immediately disconnects and clears your activity.
  - **Show Game Titles** (default OFF): When enabled, displays the names of games currently being farmed (e.g. `"Playing Counter-Strike 2"`).
  - **Show Accrued Playtime** (default OFF): When enabled, displays total credited session hours (e.g. `"HourForge · 14.5h accrued"`).
- **Zero Disruption**: If Discord is closed or restarting, HourForge suppresses all errors and toasts, retrying quietly with stepped backoff (15s $\to$ 20s $\to$ 25s $\to$ 30s) and automatically reconnecting when Discord opens.

---

## 14. Packaged Windows Installer & Setup (Milestone M14b)

HourForge is distributed as a self-contained, per-user Windows executable (`HourForge-Setup-<version>.exe`):

### Installation
1. Run `HourForge-Setup-<version>.exe`.
2. **Windows SmartScreen Notice**:
   - Because HourForge is an open-source tool built without an expensive commercial code-signing certificate ($400+/year), Windows SmartScreen will display an **"Unknown Publisher"** advisory dialog.
   - Click **"More info"**, then click **"Run anyway"** to proceed with the setup.
3. Choose your desired installation folder (defaults to `%LOCALAPPDATA%\Programs\hourforge`). No administrator permissions or UAC prompts are required.
4. Finish Page Options:
   - **Launch HourForge**: Starts the application immediately.
   - **Start HourForge with Windows**: Configures HourForge to launch silently into your system tray on Windows boot.

### Uninstallation
1. Open Windows **Installed apps** (or run `Uninstall HourForge.exe` from the install folder).
2. **Preserve User Data Option**:
   - The uninstaller will ask: *"Do you want to delete all HourForge user data, settings, goals, and history?"*
   - Clicking **"No"** (the default button) preserves your profiles, tracked games, and goal records in `%LOCALAPPDATA%\HourForge`.
   - Clicking **"Yes"** performs a complete, permanent scrub of all app files and data.
3. The uninstaller cleanly removes the Windows startup registry entry and all application binaries.


