# HourForge — Build Brief for Antigravity IDE

> [!NOTE]
> **Historical Document Notice**:
> This document is the original initial project build brief written on 13 Nov 2026. It is preserved for historical context.
> Note that it contains earlier ASF-era architecture text (which was superseded in DEC-001 by direct native Steamworks client IPC via `steamworks.js` when ASF standalone Steam logon blocked concurrent desktop client play), and the brief's source text was cut off after section 9.

*Steam playtime keeper on top of ArchiSteamFarm 7.0.0.8 · written 13 Nov 2026 · target: Windows 10/11 x64*

## 0. How to work on this brief (read first)

You are the lead engineer. Build the complete application described here, end to end, inside this workspace.

- Start in Planning mode. Before any code, produce an Implementation Plan artifact and a Task List artifact that follow the milestones in section 15. Then execute milestone by milestone, keeping the task list current.
- Never ask the user for Steam credentials, Steam Guard codes or an API key while developing. Everything Steam-facing must be testable against the built-in ASF Simulator (section 13). The user does the real-account test at the end using the checklist you generate.
- Facts marked VERIFIED in section 4 were checked against the official ASF wiki on 13 Nov 2026. Facts marked VERIFY AT BUILD TIME must be confirmed by you against the real binary (run it, read its Swagger spec at /swagger) before you depend on them. If reality differs from this brief, trust the binary, adapt, and log the difference in docs/DEVIATIONS.md.
- No placeholders, no TODO stubs, no lorem ipsum, no fake data in production paths. Mock data lives only in the simulator and tests.
- TypeScript strict mode everywhere, small typed modules, one English strings file for all UI text.
- If something is ambiguous, choose the safest sensible default, record it in docs/DECISIONS.md and keep going. Do not stall.
- Final deliverables: working source, tests, an NSIS installer, docs/USER\_GUIDE.md, docs/MANUAL\_TEST\_CHECKLIST.md, and a Walkthrough artifact with screenshots of every screen.

## 1. Mission and context

The user plays Wuthering Waves through the standalone Kuro launcher (easier pre-downloads), so the Steam copy no longer runs and the Steam hour counter has frozen. They want Steam hours to keep growing so they do not fall behind friends.

HourForge is a Windows tray application that supervises a bundled copy of ArchiSteamFarm (ASF) and uses it to report chosen Steam games as being played, on a human-looking schedule. It starts with Windows, signs in to Steam, briefly asks what to boost, then runs silently in the background.

Non-goals (do not build): trading-card farming, trading, key redemption (except the free-license helper in 3.2), anything that launches or modifies a real game, anything that touches the Steam desktop client, anti-cheat tricks, remote or multi-user control.

## 2. The four core requirements

### R1 — Starts with the PC and connects to Steam by itself

- Registers to launch at user logon, hidden, with the argument `--autostart`.
- On autostart: wait for network, start ASF, sign in with stored credentials or the saved session, and show state through the tray icon. No console window may ever appear.
- Acceptance: after a reboot with zero interaction, within 90 seconds of logon the tray shows Connected and the Launch Picker (R3) has appeared or auto-continued.

### R2 — Human-like grinding

- Alternating Play and Rest blocks of random length, for example 1 h play, 5 min rest, 2 h play, 1 h rest. Never a fixed pattern.
- Lengths are sampled at second resolution (a session is 1 h 07 m 42 s, not 1 h) from per-profile distributions (section 7).
- Optional daily active window, daily cap, boot jitter and weekend variation (section 7.5).
- Acceptance: a simulated 7-day run at 1000x speed has no two identical session lengths, every rest stays inside its profile bounds, the daily cap is never exceeded and no Play block starts inside a configured sleep window.

### R3 — Multi-game with three modes, chosen at launch

- Modes: SINGLE (one game), MULTI (several games at once, open-ended) and DEDICATED (an hour target per game, e.g. Wuthering Waves 1 h and NTE 2 h).
- Games are added by App ID or by pasting a Steam store URL. Name, developer and cover art come from the Steam store API.
- All tracks in a run start at the same instant T0. Every game has its own schedule and random seed, so their breaks are different even though they started together.
- A Launch Picker asks for the mode on every launch (section 8) and auto-continues with a default after a countdown, so unattended boots still work.
- Acceptance: a simulated DEDICATED run with WuWa 1 h + NTE 2 h starts both at T0, credits WuWa exactly 3600 s and NTE exactly 7200 s of confirmed play, shows different rest windows for each, and ends the run when both are done.

### R4 — Nice UI that keeps running silently

- Modern dashboard (section 9). Closing the window hides it to the tray and farming continues. Quit only from the tray menu, with confirmation when a run is active.
- Acceptance: close the window, wait 10 minutes, the tray tooltip still says Playing, ASF is still running and the renderer process is gone (memory freed).

## 3. Feature scope

### 3.1 MVP (must ship)

R1 to R4, first-run onboarding (account, Steam Guard, games, profile), humanization profiles, plan preview timeline, live dashboard, session history and stats, ownership check, tray and toasts, crash-safe resume, logs viewer, settings, installer.

### 3.2 Recommended extras (build right after the MVP; they are part of this brief)

1. Real-play mirror: watch the real game process (defaults for Wuthering Waves: `Wuthering Waves.exe` and `Client-Win64-Shipping.exe`, editable per game). While it runs, that game’s track is forced to Playing with no rests, so Steam hours mirror real sessions. When the process exits, the normal schedule resumes.
2. Free-license helper: if a game is not owned and is free to play, one button runs `addlicense <bot> app/<id>`.
3. Conflict handling: if the account is used elsewhere (a Steam game was launched), pause all tracks, show Blocked, resume automatically when free.
4. Presence selector (Online, Away, Busy, Snooze, Invisible) mapped to ASF OnlineStatus.
5. Discord webhook alerts: login problems, re-auth needed, run finished.
6. Power awareness: pause on sleep, reconnect on wake, optional keep-awake while a session is playing.
7. Plan reroll and manual edit of upcoming blocks.
8. Diagnostics export (zip with redacted logs).
9. Panic button: stop playing immediately and sign out.

### 3.3 Stretch (feature flags, off by default)

- Steam Web API sync: the user supplies an API key and SteamID64; show real Steam hours versus app-tracked hours (needs public game details).
- Friends race: compare hours with chosen friends whose game details are public.
- Multi-account: keep the data model account-ready; the UI stays single-account in v1.
- Recurring daily quotas and a deadline mode that compresses rests to finish by a given time.

## 4. Facts about ASF and the games

### 4.1 VERIFIED (ASF wiki and the user’s zip, 13 Nov 2026)

- The supplied ASF-win-x64.zip is ASF 7.0.0.8 (Changelog.html inside it redirects to the 7.0.0.8 release tag, and the version string 7.0.0.8 is also embedded in the exe). SHA-256 of ArchiSteamFarm.exe, computed on 14 Nov 2026: `8ffc247e63ca4f4b5709913f80281ecd24dede5a4cb03c374ab438a87828f360` (size 45,184,684 bytes). Record exactly this value in asf.version.json. Manual.html, Changelog.html and ConfigGenerator.html in the zip are tiny redirect stubs, not offline docs, so do not rely on them; the exe's own /swagger endpoint is the interface reference. It contains ArchiSteamFarm.exe (self-contained single file of about 45 MB, runtime included), aspnetcorev2\_inprocess.dll, config/, logs/, plugins/ (ItemsMatcher, MobileAuthenticator, SteamTokenDumper), www/ (ASF-ui), UI.html, Manual.html, Changelog.html and LICENSE.txt (Apache-2.0).
- Commands can be sent over IPC without the command prefix. Used here: `play`, `reset`, `resume`, `pause`, `start`, `stop`, `status`, `owns`, `addlicense`, `input`, `encrypt`.
- `play <bots> <appIDs>` switches to manual mode and launches the given appIDs. The account must own a license for every appID, free-to-play games included. `reset` or `resume` goes back to normal. Steam allows at most 32 concurrent games, 31 if a custom game name is used.
- `GamesPlayedWhileIdle` only applies while the bot is idle (nothing to farm). It is not a control surface. Do not use it for scheduling.
- `input <bots> <Type> <Value>` works only in Headless mode. Types: Login, Password, SteamGuard (code from e-mail), SteamParentalCode, TwoFactorAuthentication (authenticator app code). Headless flow: `start` fails and the bot stops, then `input`, then `start` again.
- IPC is on by default and binds to loopback on port 1242. `config/IPC.config` sets the Kestrel endpoint URL. If `IPCPassword` is set, every call needs it, via the HTTP header `Authentication: <password>` or the query parameter `?password=` (needed for WebSockets from JavaScript). After 5 wrong attempts the caller gets a temporary 403. Swagger lives at `/swagger`, ASF-ui is served from `www/`.
- Command line: `--path <dir>` (ASF home), `--process-required` (do not exit when no bot is running), `--no-restart` (forces AutoRestart=false), `--system-required` (Windows: no sleep while ASF runs), `--cryptkey`. Quote paths that contain spaces.
- Password storage formats (PasswordFormat): 0 PlainText, 1 AES, 2 ProtectedDataForCurrentUser (Windows DPAPI), 3 EnvironmentVariable (SteamPassword holds the variable name), 4 File.
- OnlineStatus 7 means Invisible and RemoteCommunication 0 means None (confirmed by an example bot config). The other OnlineStatus values follow Steam’s persona states: 0 Offline, 1 Online, 2 Busy, 3 Away, 4 Snooze.
- AutoRestart: ASF restarts itself after updates and ASF.json edits unless disabled.

### 4.2 VERIFY AT BUILD TIME

1. Shape of `GET /Api/Bot/<name>` (expected: IsConnectedAndLoggedOn, IsPlayingPossible, KeepRunning, Nickname, SteamID) and of `POST /Api/Command` (expected body: a Command string). Read `/swagger`.
2. The WebSocket log stream at `/Api/NLog` (authenticate with `?password=`).
3. Whether, in V7, the bot keeps a refresh token after the first login so later boots need no code (check the UseLoginKeys docs).
4. Exact log lines for: password rejected, Steam Guard e-mail code needed, authenticator code needed, account in use elsewhere, rate limited. Put them in one file, `src/main/asf/logPatterns.ts`, with unit tests.
5. That every key in the generated JSON is valid for 7.0.0.8. Generate configs from a typed schema, never by string concatenation.
6. That `play` works while the bot config has `Paused: true`, and that `reset` with `Paused: true` leaves the account not playing anything.
7. That IPC commands are accepted without setting SteamOwnerID (if not, set SteamOwnerID to the account’s own SteamID64 after login).

### 4.3 The games (presets only)

- Wuthering Waves: App ID 3513350 (Kuro Games, free to play, on Steam since 28 Apr 2025).
- NTE: Neverness to Everness: App ID 4508340 (store title "NTE: Neverness to Everness", developer Hotta Studio, publisher Perfect World Games, free to play, on Steam since 7 to 8 July 2026). VERIFIED against the Steam store URL and third-party trackers on 14 Nov 2026. A different listing, App ID 4706890, is also titled "Neverness to Everness" and is NOT the game; never use it. The Add Game dialog must show developer and publisher precisely so the user can tell them apart.
- The Add Game dialog resolves any ID live from `https://store.steampowered.com/api/appdetails?appids=<id>` and shows name, developer and publisher so the user can confirm. Beware of similarly named store listings. Use the API’s header\_image for cover art.

## 5. Tech stack and repository layout

- Electron (current stable), TypeScript strict, Vite, React 18, Tailwind CSS, shadcn/ui (Radix), Framer Motion, lucide-react, Recharts, Zustand, zod, Vitest, Playwright, electron-builder (NSIS, per-user install, no admin rights).
- No native Node modules (avoid node-gyp on Windows). Persistence is JSON files with atomic writes (write a temp file, then rename).
- The engine lives in the Electron main process, so closing the window can never affect farming.

```
hourforge/
  vendor/asf/ASF-win-x64.zip      user-supplied; SHA-256 of the exe recorded in asf.version.json
  src/core/      pure TypeScript, no Electron or fs imports: rng, profiles, planner, track state machine, clock
  src/main/      Electron main: asf/ (supervisor, config writer, ipc client, log parser), engine/, tray, autostart, power, store, notify, mirror
  src/preload/   typed contextBridge API
  src/renderer/  React app
  src/shared/    types, zod schemas, channel names
  tools/asf-sim/ ASF Simulator (mock IPC server)
  tests/         unit, sim, e2e
  docs/
```

## 6. Architecture and ASF integration

### 6.1 Processes

The main process owns everything: the ASF child process, the engine, storage and the tray. The renderer is only a view and may be destroyed while the window is hidden. ASF is a child of main.

### 6.2 Backend abstraction

All Steam access goes through one interface, so ASF can be swapped later and tests can use a simulator:

```ts
interface SteamBackend {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<BackendStatus>;             // connected, loggedOn, playingPossible, nickname, steamId
  setPlaying(appIds: number[]): Promise<void>;  // empty array means play nothing
  owns(appIds: number[]): Promise<Record<number, boolean>>;
  addFreeLicense(appId: number): Promise<void>;
  submitAuth(type: AuthInputType, value: string): Promise<void>;
  onEvent(cb: (e: BackendEvent) => void): () => void;
}
```

`AsfBackend` and `SimBackend` implement it.

### 6.3 Files on disk

- Per-user install. On first run extract the bundled zip to `%LOCALAPPDATA%/HourForge/asf/`. That folder is ASF’s home: run ASF with it as the working directory, no --path needed.
- When the bundled ASF version changes: stop ASF, extract the new binaries over the old ones, never overwrite `config/` or `logs/`.
- After extraction delete `plugins/ArchiSteamFarm.OfficialPlugins.ItemsMatcher` and `plugins/ArchiSteamFarm.OfficialPlugins.SteamTokenDumper` (not needed). Keep MobileAuthenticator.
- Refuse to start if the SHA-256 of ArchiSteamFarm.exe differs from the recorded value (catches corruption).

### 6.4 Supervising ASF

- Spawn `ArchiSteamFarm.exe --process-required --no-restart` with `windowsHide: true`, cwd = ASF home, and the password environment variable (6.5) set only for that child.
- Pipe stdout and stderr into the app log (ring buffer in memory plus a rotating file).
- Restart on crash with backoff 2 s, 4 s, 8 s, up to 60 s. After 10 consecutive failures within 5 minutes enter the Error state and send a toast.
- On quit: send `exit` through IPC, wait up to 5 s, then kill the process tree. Keep a pid file; on startup kill any leftover ASF from the same folder.
- Wait for internet before starting (HEAD request to https://api.steampowered.com every 5 s, backing off to 60 s). Show the Offline state meanwhile.

### 6.5 Generated configuration (typed, validated, written only while ASF is stopped)

`ASF.json`: Headless=true, IPC=true, IPCPassword=random 40 characters (regenerated per install), AutoRestart=false, UpdateChannel=0 (no self-update; HourForge ships a fixed ASF), UpdatePeriod=0, Statistics=false, ConnectionTimeout=90, LoginLimiterDelay=10, CurrentCulture=en-US.

`IPC.config`: one Kestrel HTTP endpoint on `http://127.0.0.1:<port>`, where the port is a free one from 51000 to 51999 saved in settings. Never bind to `*`.

Bot file `config/hourforge.json`. The ASF bot name is always the fixed string `hourforge`, never the Steam account name, because ASF reserves some names (`ASF`, and the files `example` and `minimal` are ignored) and Steam logins can contain characters that make poor file names. Every IPC path and command in this brief that says `<bot>` or `<name>` means `hourforge`. Contents:

- Enabled=true, SteamLogin=the account name.
- PasswordFormat=3 and SteamPassword=the environment variable name `HF_STEAM_PWD_HOURFORGE`. HourForge never writes the real password to disk in plain text: it keeps it encrypted with Electron safeStorage (Windows DPAPI) and injects it into the ASF child’s environment at spawn.
- OnlineStatus from Settings (default 1, Online).
- Paused=true, so card farming can never start by itself. GamesPlayedWhileIdle stays empty.
- RemoteCommunication=0, so ASF does not join Steam groups or talk to remote listing services.
- SteamParentalCode only if the user entered one. Leave UseLoginKeys at its ASF default.

### 6.6 Controlling what counts as played

- Use `play <bot> <id1,id2,...>` to set exactly the games that should count right now. Use `reset <bot>` for play nothing (with Paused=true nothing else starts).
- Each `play` call replaces the whole set, so the TransitionQueue is the only code path allowed to call it.
- All changes go through that one serialized queue: compute the desired set, diff against the last confirmed set, debounce 3 s so near-simultaneous boundaries become a single call, retry with backoff, then confirm via status polling. Hard cap 32 games; do not use a custom game name.

### 6.7 Sign-in and Steam Guard (headless)

States: AWAITING\_PASSWORD, AWAITING\_STEAMGUARD (e-mail code), AWAITING\_2FA (authenticator code), AWAITING\_PARENTAL, BAD\_CREDENTIALS, RATE\_LIMITED, LOGGED\_ON.

- Detect them from the log stream and status polling, using the pattern file from 4.2.
- The UI shows a modal asking for the right code. Submit with `input <bot> <Type> <Value>`, then `start <bot>`.
- A button Enter Steam Guard code manually is always available while not logged on, in case a log pattern is missed.
- Never log passwords or codes. The Advanced screen has Open ASF web UI, which opens the IPC URL in the default browser and offers to copy the IPC password.

### 6.8 Health monitoring

- Poll `GET /Api/Bot/<name>` every 15 s and keep a WebSocket on `/Api/NLog` (reconnect with backoff).
- If three polls in a row fail, treat ASF as down and let the supervisor restart it.
- If the bot reports that playing is not possible (account in use elsewhere), put all tracks in BLOCKED, keep polling every 15 s, and resume automatically when free.

## 7. Humanization and scheduling engine

### 7.1 Vocabulary

- Run: one execution started from the Launch Picker (mode, tracks, profile, seed).
- Track: one game inside a run. Each track has its own RNG, block list and state.
- Block: a Play or Rest interval with a planned start, end and duration.
- Credited time: seconds during which the backend confirmed the game was in the played set, the bot was signed in and playing was possible. Quotas and statistics use credited time, never planned time.
- Clock: an injected interface (now, sleep) so tests can run days in seconds.

### 7.2 Profile parameters

```ts
interface HumanProfile {
  id: string;
  name: string;
  session: { minMin: number; maxMin: number };                 // minutes
  rest: { minMin: number; maxMin: number; longChance: number; longMinMin: number; longMaxMin: number };
  restScalesWithSession: boolean;                              // a longer session tends to be followed by a longer rest
  bootJitterSec: { min: number; max: number };                 // delay before the first Play after T0
  activeWindow?: { start: string; end: string; edgeJitterMin: number };  // local HH:mm, may wrap past midnight
  dailyCapHours?: number;                                      // per track, per local day
  weekendSessionBoost?: number;                                // session length multiplier on Saturday and Sunday
}
```

Built-in presets (read-only; users edit copies):

| Preset | Session | Rest | Long rest | Active window | Daily cap |
| --- | --- | --- | --- | --- | --- |
| Casual | 45 to 120 min | 5 to 30 min | 15 % chance, 45 to 120 min | 10:00 to 01:00 | 8 h |
| Regular (default) | 60 to 180 min | 5 to 45 min | 20 % chance, 60 to 150 min | 09:00 to 02:00 | 12 h |
| Grinder | 90 to 240 min | 3 to 20 min | 10 % chance, 30 to 90 min | 09:00 to 04:00 | 16 h |
| Weekend warrior | 30 to 90 min, x1.8 on Sat and Sun | 10 to 60 min | 25 % chance, 60 to 180 min | 12:00 to 02:00 | 10 h |
| Fast test (hidden) | 2 to 4 min | 1 to 2 min | none | none | none |

The user’s own example (1 h play, 5 min rest, 2 h play, 1 h rest) fits inside Regular.

### 7.3 Sampling rules (implement exactly)

1. RNG: a seedable PRNG (mulberry32 or xoshiro128), never Math.random inside src/core. The run seed is random per run and stored. Track seed = hash32(runSeed, appId).
2. Session length: truncated log-normal. Median = min + 0.4 x (max - min), sigma = 0.45. Draw X = median x exp(sigma x N(0,1)); redraw until min <= X <= max (after 20 failed draws fall back to a uniform draw). Round to whole seconds. The weekend boost scales min, median and max before truncation.
3. Rest length: with probability longChance draw uniformly in \[longMin, longMax\]. Otherwise draw a truncated log-normal in \[rest.min, rest.max\] with median = min + 0.3 x (max - min) and sigma 0.6. If restScalesWithSession, multiply the draw by clamp(0.6 + 0.8 x (session - sessionMin) / (sessionMax - sessionMin), 0.6, 1.4) and clamp again to the allowed range. Hard floor 60 s.

### 7.4 Planning

Open-ended runs (SINGLE and MULTI without targets): plan lazily, always keeping the next 6 blocks per track, and replan on every block completion, settings change or reroll.

Quota runs (DEDICATED, or SINGLE with a target): each track has a target of Q seconds of credited time. The planner works like this:

1. remaining = Q - credited.
2. Draw a session s. If s >= remaining, set s = remaining; this is the final block.
3. Tail rule: if remaining - s < sessionMin, either absorb the tail (s = remaining) when that keeps s <= 1.25 x sessionMax, or shrink s so that exactly sessionMin remains.
4. If Q < sessionMin the whole quota is a single block.
5. After every non-final session draw a rest. No rest after the final block.
6. The active window and daily cap still apply, so a long quota spreads across days by itself.

After any interruption (disconnect, BLOCKED, sleep) replan from the remaining credited quota; the unplayed part of the interrupted block returns to the pool. Show both net hours (credited) and the projected wall-clock finish for each track.

### 7.5 Daily rhythm options

- Active window: Play blocks may only exist inside it. A block that would cross the end is cut there (the end is jittered by up to edgeJitterMin minutes either way), then the track rests until the next window start, also jittered. Windows may wrap past midnight and use local time; compute them with the local calendar, never by adding 24 h, so daylight-saving changes stay correct.
- Daily cap: credited Play seconds per track per local day never exceed dailyCapHours. At the cap the current block ends and the track rests until the next day boundary (setting, default 05:00) plus its boot jitter.
- Boot jitter: each track’s first Play starts at T0 plus a per-track random delay in \[bootJitter.min, bootJitter.max\] (default 45 to 420 s), so it looks like someone launching a game rather than a script.
- Weekend boost: multiplies session lengths on Saturday and Sunday.

### 7.6 Several games at once

- Every track owns its own RNG instance. Never share one.
- Same T0, different boot jitter and block lengths: a 1 h and a 2 h target start together but never rest at the same moments.
- Collision avoidance: after planning, if a boundary (start or end of any block) of one track is within 20 s of a boundary of another track, move the later-planned track’s boundary by a random 20 to 90 s while keeping its length limits. The TransitionQueue (6.6) still merges transitions that land within 3 s of each other.

### 7.7 Track state machine

States: PLANNED, WAITING\_START, PLAYING, RESTING, DONE, STOPPED. Overlays that freeze credit: BLOCKED (account in use), SUSPENDED (offline, ASF down, PC asleep), MIRRORING (real game process running), USER\_PAUSED.

- The engine ticks every second from a monotonic clock and also reads the wall clock. If the wall clock jumps forward by more than 60 s beyond the monotonic delta, treat the gap as sleep: SUSPENDED for the gap, nothing credited.
- Credit only while the backend confirms the game is in the played set, the bot is signed in and playing is possible.
- After BLOCKED or SUSPENDED ends, continue the interrupted block for its remaining duration. If the interruption lasted more than 30 minutes, draw a fresh rest first and then replan.
- MIRRORING forces PLAYING with no rests and is credited as source mirror. When the real process exits, start a freshly drawn Rest, then resume the plan.
- User actions: Pause, Resume, Skip rest (start Play now), Extend play by 15, 30 or 60 min, End track now, Reroll plan, Stop run.

### 7.8 Accounting and crash safety

- SessionLog entries: runId, appId, startUtc, endUtc, source (schedule, mirror or manual) and creditedSeconds. Append one when a block ends or is interrupted.
- Save a RunSnapshot to run-state.json every 30 s and on every transition (atomic write). On launch, if an unfinished snapshot exists, the Launch Picker offers Resume previous run and shows what remains. Downtime between the last snapshot and the resume is never credited.
- Steam appears to commit playtime when a play session ends (ASF issue reports describe hours increasing after ASF stops playing), so the profile counter can lag behind. Rest blocks are therefore also the moments when hours get committed.

### 7.9 Required planner tests

Bounds respected over 10,000 draws; same seed gives the same plan and different seeds differ; quota exact to the second; tail rule; active window wrapping past midnight; a daylight-saving day; daily cap; boundary collision avoidance across three tracks; a 7-day simulation at 1000x with the R2 and R3 acceptance assertions.

## 8. Launch flow and run modes

### 8.1 Start-up sequence

1. Single-instance lock. A second launch focuses the first one and shows its window.
2. Load settings and state. With `--autostart` stay hidden.
3. Wait for network, start ASF, sign in (R1). The tray shows Connecting.
4. When signed in (or after 20 s if sign-in needs the user) show the Launch Picker. On autostart it is a small always-on-top frameless card near the tray, shown without stealing focus; on a manual launch it is the New Run screen.
5. Countdown: default 60 s (10 to 300 s, or Off to wait forever). It pauses while the pointer is over the card or the user is typing. When it ends the default action runs: Resume previous run if one exists, otherwise start the default Run Template.

### 8.2 Launch Picker contents

- Three large cards: Single boost, Multi boost, Dedicated hours. Smaller options: Resume last run (when available) and Skip (stay idle).
- Below the selected card: game chips with cover art (the library plus an Add game button), a profile dropdown and, for Dedicated, an hours field per game (hh:mm). A live Plan Preview timeline with a Reroll button.
- Checkboxes: Save as default template; Do not ask again (always run the default). Settings can turn asking back on.
- Primary button Start (sets T0 to now). Secondary button Start in 5 minutes.

### 8.3 Run lifecycle

Created, then Starting (T0 set), then Running, then Finished or Stopped. DEDICATED finishes when every track is DONE; SINGLE and MULTI run until stopped. On finish: a toast, an optional Discord message, the tray returns to Idle, and an optional setting restarts the default template after a chosen delay (off by default).

### 8.4 Mode summary

| Mode | Games | Hour targets | Ends when | Scheduling |
| --- | --- | --- | --- | --- |
| SINGLE | 1 | optional | stopped, or target reached | one track |
| MULTI | 2 to 10 | none | stopped by the user | independent tracks, same T0 |
| DEDICATED | 1 to 10 | per game | all targets reached | independent tracks, same T0, quota planner |

Hard cap 32 concurrent games (Steam); the UI limit is 10.

## 9. UI and UX specification

### 9.1 Look and feel

- Window 1100 x 720 by default, minimum 960 x 640, remembers size and position. Frameless with a custom title bar (drag area, minimize, close = hide to tray).
- Dark theme by default, with light and system options. Tokens:

| Token | Value |
| --- | --- |
| background | #0B0E14 |
| surface | #121723 |
| elevated | #1A2132 |
| border | #232B3D |
| text | #E6EAF2 |
| text-secondary | #9AA6BD |
| muted | #6B7690 |
| accent gradient | #7C5CFF to #22D3EE |
| success, warning, danger, info | #34D399, #FBBF24, #F87171, #60A5FA |

- State colours: Playing = success with a soft glow, Resting = warning, Blocked = orange, Offline = muted grey, Error = danger.
- Fonts: Inter for the UI and JetBrains Mono for timers and logs, both bundled as woff2 (no CDN). Tabular numerals for every ticking number so layouts never jitter.
- Cards radius 14 px, controls 10 px, soft shadows; glass blur only on the Launch Picker. Motion 150 to 250 ms ease-out through Framer Motion; honour prefers-reduced-motion.

### 9.2 Layout

Left rail (icons plus labels; collapses below 1000 px): Dashboard, New Run, Plan, Games, Profiles, History, Logs, Settings. Top bar: account chip (avatar, name, connection pill), global state pill and a Pause or Resume all button.

### 9.3 Screens

1. Dashboard. A header strip with run name, mode badge, elapsed time and global state. One card per track: cover art, name and App ID, state chip, a large countdown (for example Resting, play resumes in 12:41), a progress ring (credited versus target) or today’s hours for open-ended runs, and a mini bar of the previous and next blocks. Track actions: Skip rest, Extend, Pause, Remove. Below: a Recharts bar chart (today and last 7 days, credited hours per game) and an activity feed of the last 50 events. Empty state: a large Start a run call to action.
2. New Run. The full-page Launch Picker (8.2).
3. Plan. A Gantt timeline with 24 h and 7 d zoom, one lane per track, Play blocks coloured per game, Rest blocks hatched, a now line and hover tooltips with exact times. Actions: Reroll all or one track, edit a block by dragging its edges (profile bounds enforced), lock a block.
4. Games. A library grid. The Add Game dialog takes an App ID or store URL and shows a live preview with name, developer, publisher, cover, an Owned badge and the free-license button. Per-game settings: real-play mirror process names (with a Pick from running processes button), default hours, enable switch.
5. Profiles. Preset list and an editor with a live preview: a histogram of 1,000 sampled sessions and rests plus a sample-day timeline. Validation messages for impossible ranges.
6. History and Stats. Totals per game (today, 7 days, 30 days, all time, app-tracked), a session table with filters, CSV export. The Steam hours sync card appears only when its stretch flag is on.
7. Logs. Tabs App and ASF, level filter, search, auto-scroll, Copy, Export diagnostics.
8. Settings. General (launch with Windows, start hidden, close to tray, theme). Steam account (username, password update, sign out, presence, Family View PIN). Launch behaviour (picker on or off, countdown, default template). Notifications (toasts, Discord webhook with a Test button). Power (keep awake, pause on sleep). Advanced (ASF version and path, Open ASF web UI, reset ASF config, feature flags, About).
9. Onboarding wizard, first run only: Welcome, Account (username and password with the safeStorage note), Steam Guard (modal when needed), Games (one-click cards for Wuthering Waves 3513350 and NTE 4508340, plus Add by ID), Profile and autostart toggle, Done. It cannot continue until sign-in succeeds; adding games can be skipped.

### 9.4 Tray

- Icon variants: idle grey, connecting blue, playing green dot, resting amber, blocked orange, error red.
- Tooltip: HourForge · Playing 2 games · next change in 12 m.
- Left click toggles the window. Menu: Open dashboard, a disabled status line, Pause or Resume all, Start new run, Panic stop, Settings, Quit.

### 9.5 Notifications

Native toasts for: sign-in needed, blocked and resumed, run finished, ASF crash loop. At most one per type per 10 minutes. Clicking a toast opens the relevant screen.

### 9.6 Quality bar

Keyboard navigable with visible focus, aria labels, contrast of at least 4.5:1, skeleton loaders, empty states, friendly inline errors with a details disclosure, no layout shift when timers tick, no unhandled promise rejections.
