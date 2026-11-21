# Changelog

All notable changes to HourForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-11-21

### Added
- **Custom Operating Mode (`CUSTOM`)**:
  - Full support for arbitrary sequences of play and rest steps (2 to 12 steps per pattern).
  - Exact durations (e.g. 60m play / 5m rest / 120m play / 60m rest) or bounded variable ranges sampled via log-normal distribution.
  - Simple view (single play/rest configuration) and Advanced view (ordered step list with reordering, step additions, and deletions).
  - Cyclic pattern repeats, optional daily limits (1–24 hours), and wake/sleep active windows with edge jitter.
  - Live average play-per-day indicator with high-playtime caution (16h+ warning banner).
  - Multi-track independent offset handling with boot jitter (45–420s) preventing synchronized boundary switches.
  - Interruption and sleep recovery advancing tracks to the next rest step on gaps >= 30 minutes.
  - Backup Schema v2 support with backward-compatible import/export of saved custom patterns (up to 20 patterns).
- **Launch Picker in System Tray**:
  - Direct *"Launch Picker..."* entry in the system tray menu opening the card on demand in manual mode (no 60s countdown, focused immediately).
  - Multi-monitor positioning nearest cursor clamped to the display's usable work area.
  - Checkbox toggle *"Show Launch Picker at startup"* in tray and Settings screen, persisting preference and allowing silent background startup when unticked.
  - Global keyboard shortcut `Ctrl+Shift+L` and Command Palette action to open Launch Picker manually.
  - Warning banner when opening Launch Picker while another run is active.
- **Single Source of Truth for Version & Author Credit**:
  - Dynamic window title-bar version label sourced from `app.getVersion()` via IPC/preload bridge.
  - Sidebar footer and About screen author credit locked to canonical constant `CREDIT_TEXT` (*"Sculpted to Life by Arnav Sharma, Discord:- Lesserkeyofsolomon"*).

### Changed
- **Universal 60-Minute Rest Ceiling**:
  - Hard 60-minute ceiling (`MAX_BREAK_SECONDS = 3600`) applied across all sampler presets, preventing runaway multi-hour breaks.
  - Backup importer automatically clamps legacy or third-party rest steps exceeding 60 minutes.

### Fixed
- **Process Termination Notice**:
  - Removed outdated legacy ArchiSteamFarm references from tray quit confirmation dialog and documentation.

---

## [0.1.2] - 2026-11-16

### Added
- **Author Credit & About Screen**: Hardcoded author credit (*"Sculpted to Life by Arnav Sharma, Discord:- Lesserkeyofsolomon"*) and GitHub repository link (`https://github.com/nxtArnav-sharma/Hour-Forge`) across Settings "About" glass card, sidebar footer (`NavRail`), final onboarding step, Command Palette, and Windows executable/installer metadata.
- **External URL Security Gate**: Strict main-process whitelist (`isAllowedExternalUrl`) for external URL handling, restricting `shell.openExternal` exclusively to the official GitHub repository and Steam domains.
- **Run Track Zod Schema Validation**: Main-process validation (`validateRunOptions`) ensuring all run start requests originate strictly from enabled games in the library, rejecting unselected, disabled, duplicate, or out-of-bounds tracks before modifying engine state.

### Fixed
- **Unselected Games Run Bug**: Fixed critical bug where hardcoded initial state in `NewRunScreen` and `LaunchPickerCard` caused unselected default games (e.g. 3513350, 4508340) to start alongside the user's selected library game.
- **Helper Process Leak on Start**: Engine now sweeps and terminates any previous helper processes before starting a new run.
- **Store Upgrade Sanitization**: Automatically purges stale template app IDs and orphan snapshot tracks on store initialization.

---

## [0.1.1] - 2026-11-16

### Added
- **Discord Rich Presence Redesign**: Simplified 2-option radio group (*"HourForge Rich Presence"* vs *"Keep my usual Discord status"*) replacing confusing multi-checkbox settings.
- **Humorous Status Shuffle Bag**: Rotating status lines on a 20–40 minute Fisher-Yates shuffle bag, preserving run start timestamps across rotations and app restarts.
- **Optimized Media Assets**: Sharp-processed high-DPI and standard-DPI Phoebe character artwork for Discord settings cards.

### Fixed
- **Tray Menu Navigation Routing**: Fixed tray menu routing table and cold-start tray click handling to ensure windows restore to the expected screen.
- **Tooling & Build Organization**: Regrouped development scripts into `tools/dev/` and `tools/build/`, purging dead scratch files.

---

## [0.1.0-alpha] - 2026-11-15

> *Binary archive: the source in this repository does not correspond to this build.*  
> SHA-256: `0fca3046135a3e708d5135935d92df3e42d22852328ebfc57fc920c05b1a28b4`

### Added
- **Steam Desktop Client Backend**: Local Steamworks integration through headless helper processes communicating directly with the running Steam desktop client. Zero password or bot setup required.
- **Humanised Schedules**: Autonomous playtime pacing across multiple operating modes (`SINGLE`, `MULTI`, `DEDICATED`, `CATCHUP`) with organic rest intervals, session bounds, and active windows.
- **Catch-Up Goals**: Target playtime pacing with dynamic daily quotas and a 1-day safety buffer before deadlines.
- **Steam Hours Dashboard**: Read-only profile playtime polling, local vs Steam Web API tracking, and lag detection.
- **Backup and Restore**: Schema v1 atomic JSON settings export and restore with strict zero-secret storage invariants.
- **Liquid Glass UI**: Windows 11 acrylic backdrop material, frameless rounded window presentation, and low-power hidden-to-tray lifecycle.
- **Discord Presence**: Rich Presence support with three toggles.

### Known Issues
- **Tray Settings Bug**: Clicking Settings from the system tray menu opens Dashboard rather than Settings (fixed in 0.1.1).
