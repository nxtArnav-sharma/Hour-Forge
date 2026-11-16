# HourForge

<div align="center">

**Autonomous Windows system tray supervisor and humanized Steam playtime scheduler.**

*Sculpted to Life by Arnav Sharma, Discord:- Lesserkeyofsolomon*

[![Release](https://img.shields.io/badge/release-v0.1.2-purple.svg)](https://github.com/nxtArnav-sharma/Hour-Forge/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue.svg)](https://github.com/nxtArnav-sharma/Hour-Forge)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/framework-Electron%2033-47848F.svg)](https://www.electronjs.org/)

</div>

---

## Table of Contents
- [Overview](#overview)
- [How It Works](#how-it-works)
- [Key Features](#key-features)
- [Operating Modes](#operating-modes)
- [Rhythm Profiles](#rhythm-profiles)
- [Architecture & Low-Power Design](#architecture--low-power-design)
- [Security & Privacy Design](#security--privacy-design)
- [Notes and risks](#notes-and-risks)
- [Installation](#installation)
- [Building from Source](#building-from-source)
- [Testing](#testing)
- [Author & Credits](#author--credits)
- [License](#license)

---

## Overview

**HourForge** is an autonomous Windows desktop supervisor designed to simulate authentic human gameplay patterns on Steam without requiring users to run resource-heavy 3D game engines.

Unlike raw idle bots that accumulate 24/7 continuous playtime—creating suspicious spikes that can trigger anti-cheat flags or profile suspicion—HourForge acts as an intelligent supervisor. It models realistic play sessions, organic break intervals, sleep schedules, and daily caps, keeping your Steam profile natural and balanced.

HourForge integrates directly with your already-running official Steam desktop client via local Steamworks IPC. **It never handles, asks for, or stores your Steam password or account login credentials.**

---

## How It Works

```
                                      +-------------------------------+
                                      |      Windows System Tray      |
                                      +---------------+---------------+
                                                      |
                                                      v
+-------------------------------+     +---------------+---------------+     +-------------------------------+
|      Liquid Glass UI          |     |    Main Process (Supervisor)  |     |      Atomic Store (Data)      |
|  React 18 + Tailwind + Lucide | <-> | - State Machine & Routing     | <-> | - atomicStore.ts              |
|  Acrylic / DWM Frameless      |     | - Zod Run Validation          |     | - Backup & Restore (Schema v1)|
+-------------------------------+     | - Discord RPC Service         |     +-------------------------------+
                                      +---------------+---------------+
                                                      |
                                      +---------------+---------------+
                                      |     Core Scheduling Engine    |
                                      | - Gaussian Session Lengths    |
                                      | - Poisson Break Intervals     |
                                      | - Daily Hour Cap Pacing       |
                                      +---------------+---------------+
                                                      |
                                      +---------------+---------------+
                                      |   SteamClientBackend Manager  |
                                      +---------------+---------------+
                                                      |
                                      +---------------+---------------+
                                      |   steamHelper.js (Process)    |
                                      | - Native Steamworks Client IPC|
                                      +---------------+---------------+
                                                      |
                                                      v
                                      +-------------------------------+
                                      | Official Steam Desktop Client |
                                      +-------------------------------+
```

1. **Local Steamworks Bridge**: HourForge launches lightweight, isolated helper processes that attach to your running Steam desktop client. Steam registers you as "In-Game" natively.
2. **Autonomous Supervisor**: The core engine alternates active play sessions and natural rest periods using seeded pseudo-random distribution models.
3. **Tray Daemon**: Minimizing or closing the window collapses HourForge into the Windows notification tray, halting renderer render trees and reducing CPU overhead to <0.05%.

---

## Key Features

- **Human Playtime Pacing**: Simulates genuine gaming habits using configurable Gaussian playtime distributions and Poisson rest intervals.
- **Goal-Oriented Catch-Up Planning**: Automatically recalculates required daily grinding hours based on target milestones and hard deadlines, incorporating an automatic 1-day safety buffer.
- **Steam Web API Synchronization**: Optional read-only verification that polls official Steam community servers to compare local session logs with Valve's public records.
- **Discord Rich Presence**: Custom Discord status integration featuring a rotating Fisher-Yates shuffle bag of gaming quotes, with toggleable visibility and run duration tracking.
- **Atomic, Portable Backup**: Schema v1 JSON export and restore enabling effortless profile and settings migration with strict zero-secret invariants.
- **Liquid Glass Interface**: High-performance Windows 11 acrylic backdrop material, custom frameless geometry, and accessible controls.

---

## Operating Modes

| Mode | Description | Track Limit | Behavior |
| :--- | :--- | :--- | :--- |
| **`SINGLE`** | Single Game Open-Ended | Exactly 1 | Executes standard daily human schedule without an end quota. Continues until manually stopped. |
| **`MULTI`** | Alternating Rotation | 2 to 10 | Rotates across multiple games across successive sessions, ensuring diverse library activity. |
| **`DEDICATED`** | Target Quota Accumulator | 1 to 10 | Farms an exact number of hours per game (e.g. 10.0h) and terminates automatically when finished. |
| **`CATCHUP`** | Dynamic Deadline Pacing | 1 to 10 | Calculates dynamic daily quotas to reach milestones before deadlines, adjusting for PC-off time. |

---

## Rhythm Profiles

HourForge ships with 6 behavioral presets calibrated to reflect real-world gamer habits:

- **Regular**: Balanced everyday player. Active window 09:00–02:00, daily cap 12 hours, realistic 60–120 minute sessions with 15–30 minute pauses.
- **Casual**: Light gaming sessions. Active window 17:00–23:00, daily cap 4 hours, frequent breaks.
- **Night Owl**: Evening-to-dawn schedule. Active window 21:00–05:00, late-night play blocks.
- **Marathon**: Extended multi-hour weekend gaming sessions with longer rest pauses.
- **Hardcore**: High daily playtime ceiling for dedicated grinders while maintaining minimal rest floors.
- **Fast Test**: Accelerated timing profile specifically calibrated for automated test suites and simulation checks.

---

## Architecture & Low-Power Design

HourForge was engineered with strict Windows resource constraints:

- **Process Lifecycle**: When the window is hidden to the system tray, Electron window instances are cleanly managed and UI timers are suspended. Hidden-to-tray CPU drops to **<0.05%** and memory consumption is kept minimal.
- **Helper Process Safety**: Helper processes are launched strictly from HourForge's install directory, validated before spawn, and verified before termination (`verifyIsHourForgeHelper`). Unrelated processes are never touched.
- **Zero Polling UI**: Event-driven IPC channels synchronize engine states to the React store only when active, eliminating unnecessary background rendering loops.

---

## Security & Privacy Design

HourForge observes the following privacy and operational principles:

1. **No Password Storage**: HourForge never requests, stores, or transmits your Steam account username or password.
2. **Strict External URL Whitelist**: The main process restricts `shell.openExternal` exclusively to the official GitHub repository and Valve's official API key registration page. Arbitrary URL redirects and non-HTTPS protocols are completely rejected.
3. **Zero Secret Persistence**: Exported backup files (JSON) contain profiles, games, and history—never personal secrets, passwords, or session tokens.
4. **Deterministic Testing**: The entire test suite uses injected mock clocks, deterministic RNG seeds, and fake backend adapters to produce consistent test runs.

---

## Notes and risks

- **Affiliation**: HourForge is an independent open-source project and is not affiliated with, endorsed by, or associated with Valve, Kuro Games, Hotta Studio, Impressions or Discord.
- **Terms of Service & Usage Risk**: Artificially increasing playtime may violate the terms of some services and could lead to action, at the user's own risk. HourForge is provided for personal scheduling and testing.

---

## Installation

### Official Releases
Download the latest installer (`HourForge-Setup-0.1.2.exe`) from the [Releases](https://github.com/nxtArnav-sharma/Hour-Forge/releases) page.

- **Unsigned Package Notice**: HourForge is free and open-source software built by an independent developer without an expensive code-signing certificate. Windows SmartScreen may show an *"Unknown Publisher"* warning. Click **More info** $\to$ **Run anyway** to install.
- **Per-User Installation**: Installs to `%LOCALAPPDATA%\Programs\HourForge` without requiring Administrator privileges (UAC).

---

## Building from Source

### Prerequisites
- Windows 10 (version 1809+) or Windows 11 (x64)
- Node.js 20.x or higher
- npm 10.x or higher

### Build Steps
```powershell
# Clone the repository
git clone https://github.com/nxtArnav-sharma/Hour-Forge.git
cd Hour-Forge

# Install exact pinned dependencies
npm ci

# Compile TypeScript and bundle with Vite
npm run build

# Package NSIS Windows installer
npm run dist
```

Packaged executables and setup files are output to `release/`.

---

## Testing

HourForge maintains a comprehensive suite of automated unit, integration, and security tests:

```powershell
# Run type checking
npm run typecheck

# Run complete Vitest suite
npm test
```

---

## Author & Credits

**HourForge** was designed and developed by:
- **Author**: Arnav Sharma
- **Discord**: `Lesserkeyofsolomon`
- **Repository**: [https://github.com/nxtArnav-sharma/Hour-Forge](https://github.com/nxtArnav-sharma/Hour-Forge)
- **Bug Reports**: [GitHub Issues](https://github.com/nxtArnav-sharma/Hour-Forge/issues)

---

## License

This project is licensed under the **Apache License, Version 2.0**.  
See the [LICENSE](LICENSE) file for the full license text.
