# Specification Deviations & Real ASF Behavior (docs/DEVIATIONS.md)

This log records observed differences between the build brief specification and the real ArchiSteamFarm 7.0.0.8 binary, verified empirically during Milestone M0 on 2026-11-14.

---

## DEV-001: Command-Line Flag `--process-required` Unrecognized
- **Brief Specification**: Section 4.1 & 6.4: Spawn `ArchiSteamFarm.exe --process-required --no-restart`.
- **Observed Reality**: ASF 7.0.0.8 prints: `WARN|ASF|ParseArgs() Unknown command-line argument: --process-required`.
- **Adaptation**: Launch ASF with `--no-restart` only. Process supervision and keep-alive are fully handled by HourForge's supervisor process manager.

## DEV-002: Swagger Schema Generator Fails at Runtime
- **Brief Specification**: Section 4.1 & 4.2: Inspect `/swagger` and `/swagger/v1/swagger.json`.
- **Observed Reality**:
  - Swagger UI is rendered using Scalar at `/swagger/`.
  - The OpenAPI spec is served at `/swagger/ASF/swagger.json`.
  - However, fetching `/swagger/ASF/swagger.json` crashes inside ASF with `System.NotSupportedException: The deserialization constructor for type 'SteamKit2.Discovery.SmartCMServerList' contains parameters with null names. This might happen because the parameter names have been trimmed by ILLink.` followed by a `TypeLoadException`.
- **Adaptation**: Endpoints were verified empirically via live REST calls and WebSocket streams. HourForge uses strictly typed Zod and TypeScript schemas mirroring the verified real payloads.

## DEV-003: `GET /Api/Bot/<name>` Response Hierarchy
- **Brief Specification**: Section 4.2 item 1 implies bot properties may be directly on `Result`.
- **Observed Reality**: The response payload is nested under the bot name:
  ```json
  {
    "Result": {
      "hourforge": {
        "BotName": "hourforge",
        "IsConnectedAndLoggedOn": false,
        "IsPlayingPossible": true,
        "KeepRunning": true,
        "Nickname": null,
        "SteamID": 0,
        "BotConfig": { "UseLoginKeys": true, ... }
      }
    },
    "Message": "OK",
    "Success": true
  }
  ```
- **Adaptation**: IPC client response parser accesses `response.Result[botName]` directly.

## DEV-004: Working Directory & `--path` Handling
- **Brief Specification**: Section 6.3 & 6.4: cwd = ASF home, `--path <dir>`.
- **Observed Reality**: Passing relative `--path` causes ASF to append it to `cwd` (e.g. `.\asf\asf`), resulting in `DirectoryNotFoundException`.
- **Adaptation**: Always set child process `cwd` to `%LOCALAPPDATA%/HourForge/asf` and omit `--path`, or pass an absolute path.

## DEV-005: Verified Confirmations
- **`SteamOwnerID` Not Required**: Verified that `POST /Api/Command` accepts commands with default `SteamOwnerID: 0` without restriction.
- **WebSocket `/Api/NLog` Auth**: Verified that `ws://127.0.0.1:<port>/Api/NLog?password=<password>` connects and streams JSON log lines immediately.
- **`UseLoginKeys` Default**: Verified that `UseLoginKeys: true` is standard in 7.0.0.8, caching session tokens in `config/hourforge.db`.
- **Invalid Password Pattern**: Verified exact log output:
  - `WARN|hourforge|HandleLoginResult() Unable to login to Steam: InvalidPassword/InvalidPassword`
  - `WARN|hourforge|OnConnected() SteamKit2.Authentication.AuthenticationException: Authentication failed with result InvalidPassword.`
  - `ERROR|hourforge|HandleLoginResult() Received InvalidPassword error code 3 times in a row. Your password for this account is most likely wrong, aborting!`



## DEV-006: Play/Reset Offline Bot Behavior
- **Brief Specification**: Section 4.2 item 6: Verify `play` works while `Paused: true` and `reset` leaves account not playing anything.
- **Observed Reality**: When bot is not logged on to Steam, issuing `play hourforge <appId>` or `reset hourforge` returns:
  `{"Result":"<hourforge> This bot instance is not connected!","Message":"OK","Success":true}`
- **Adaptation**: Offline bots reject `play` and `reset`. Verification of `play`/`reset` under `Paused: true` on an authenticated session must occur during live testing. Documented in `docs/MANUAL_TEST_CHECKLIST.md` with contingency strategy in `docs/DECISIONS.md`.


## DEV-007: Real ASF Binary Single Login Smoke Test
- **Date**: 2026-11-14
- **Verification**: Executed single isolated login attempt against real bundled ArchiSteamFarm 7.0.0.8 using dummy credentials.
- **Captured Real Output**:
  `2026-11-14 11:33:57|ArchiSteamFarm-17848|WARN|hourforge|OnConnected() SteamKit2.Authentication.AuthenticationException: Authentication failed with result InvalidPassword.`
- **Parser Match**: `src/main/asf/logPatterns.ts` regex `/InvalidPassword/i` matched line and emitted `BAD_CREDENTIALS`.
- **Process Termination**: Process terminated immediately upon first challenge; zero retries performed.
