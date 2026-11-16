# Milestone M13b Performance & Resource Benchmarks (Final Post-Overhaul)

## 1. Overview & Test Methodology

Continuous 30-second automated benchmark suites were executed measuring:
1. **Window Hidden to Tray (Minimized/Hidden)**: Main application window hidden (`win.hide()`) with background IPC event pushes suppressed and React countdown timers paused.
2. **Closed to Tray (Window Destroyed)**: Real-world HourForge close-to-tray lifecycle where `mainWindow.destroy()` terminates the Chromium renderer process.
3. **Window Open on Dashboard (Idle)**: Window active on Dashboard with no running track.
4. **Window Open During Running Track**: Window active with concurrent simulated human play tracks (App 3513350 `PLAYING` + App 4508340 `RESTING`).

Measurements sampled all process trees (Browser/Main, Chromium Tab/Renderer, GPU Compositor, Utility Network Service) via `app.getAppMetrics()` at 1-second intervals over continuous 30-second measurement windows.

---

## 2. Before vs. After Summary

| Benchmark State | Metric | Before Restyle (Baseline) | After Restyle (Liquid Glass Initial) | Final Optimized |
|---|---|:---:|:---:|:---:|
| **Closed to Tray (Renderer Destroyed)** | **CPU %** | *N/A* | *N/A* | **0.02%** |
| | **Working Set RAM** | *N/A* | *N/A* | **273.2 MB** |
| **Window Hidden (win.hide())** | **CPU %** | **0.05%** | **0.18%** | **0.02%** |
| | **Working Set RAM** | **461.5 MB** | **436.7 MB** | **353.7 MB** |
| **Dashboard Open (Idle)** | **CPU %** | **0.05%** | **0.25%** | **0.18%** |
| | **Working Set RAM** | **448.8 MB** | **444.1 MB** | **367.3 MB** |
| **Dashboard (Running Track)** | **CPU %** | **0.03%** | **0.09%** | **0.06%** |
| | **Working Set RAM** | **448.1 MB** | **441.9 MB** | **366.1 MB** |

---

## 3. Per-Process Breakdown (Hidden & Closed States)

### A. Closed to Tray (`mainWindow.destroy()` — Native Real-World Lifecycle)
- **Total CPU**: **0.02%**
- **Total Working Set RAM**: **273.2 MB** (Peak: **274.0 MB**)

| Process Type | Process Role | Average CPU % | Average RAM (Working Set) |
|---|---|:---:|:---:|
| **Browser** | Main Node/Electron Supervisor | 0.02% | 100.1 MB |
| **GPU** | DirectX/DWM Compositing Process | 0.00% | 125.2 MB |
| **Utility** | Chromium Network Service | 0.00% | 48.0 MB |
| **Tab (Renderer)** | React UI / WebContents | **0.00% (Destroyed)** | **0.0 MB (Freed)** |
| **Helpers** | Standalone Steam Helper Processes | 0.00% | *Independent external processes* |

### B. Window Hidden (`win.hide()` — Background Throttling Active)
- **Total CPU**: **0.02%**
- **Total Working Set RAM**: **353.7 MB** (Peak: **361.7 MB**)

| Process Type | Process Role | Average CPU % | Average RAM (Working Set) |
|---|---|:---:|:---:|
| **Browser** | Main Node/Electron Supervisor | 0.00% | 100.2 MB |
| **GPU** | DirectX/DWM Compositing Process | 0.00% | 117.2 MB |
| **Utility** | Chromium Network Service | 0.01% | 48.1 MB |
| **Tab (Renderer)** | Backgrounded React UI | 0.02% | 88.2 MB |

---

## 4. Root Causes & Fixes Implemented

1. **Suppressed IPC Pushes While Hidden**:
   - `src/main/index.ts`: Gated `EVENT_ENGINE_STATE`, `EVENT_LOG_LINE`, `EVENT_GOALS_UPDATED`, and `EVENT_HOURS_UPDATED` behind `mainWindow.isVisible()`. When hidden, 0 IPC messages are sent.
   - Pushes an immediate state sync on `mainWindow.on('show')`.
2. **Paused React Tickers in Background**:
   - `DashboardScreen.tsx`: Gated `setTick` behind `if (!document.hidden)` to stop React re-renders while window is hidden.
3. **Confirmed Renderer Destruction on Close**:
   - Confirmed `SYSTEM_WINDOW_CLOSE` and `mainWindow.on('close')` invoke `mainWindow.destroy()` and null the handle, completely terminating the renderer process and shedding ~94 MB of RAM.
4. **Restored Strict `twoSimultaneousGoals.test.ts` Assertion**:
   - Anchored `t0Utc` deterministically to 10:00 AM local morning time, eliminating overnight sleep window flaking.
   - Restored strict assertion: `expect(credited1Hours + credited2Hours).toBeGreaterThan(pcOnHours)` (7.77h > 5.0h).
5. **Interactive Feature Additions**:
   - `Ctrl+K` Command Palette with keyboard search and quick route switching.
   - `1-9` Global number keys for direct screen navigation.
   - Number tweening hook (`useNumberTween`) with `prefers-reduced-motion` respect.
   - Animated SVG circular progress rings with smooth CSS dashoffset transitions.
   - Native HTML5 Drag-and-Drop game library reordering with grab handles.
