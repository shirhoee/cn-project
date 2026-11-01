# Diagnosis Report: Dashboard Dead State Bug (Post-Phase 7)

**Date:** 2026-11-01  
**Target:** Team 17 Dynamic SDN Telemetry Dashboard (`http://localhost:8080/`)

---

## 1. Endpoint & Static File Audit (Step 1a)
A diagnostic harness serving `DashboardHttpHandler` tested all static assets and REST endpoints:
- `GET /` -> Status: **200 OK**, Content-Type: `text/html`
- `GET /styles.css` -> Status: **200 OK**, Content-Type: `text/css`
- `GET /dashboard/js/toast.js` -> Status: **200 OK**, Content-Type: `application/javascript` / `text/javascript`
- `GET /dashboard/js/charts.js` -> Status: **200 OK**, Content-Type: `application/javascript` / `text/javascript`
- `GET /dashboard/js/gauge.js` -> Status: **200 OK**, Content-Type: `application/javascript` / `text/javascript`
- `GET /dashboard/js/comparison.js` -> Status: **200 OK**, Content-Type: `application/javascript` / `text/javascript`
- `GET /dashboard/js/topology_canvas.js` -> Status: **200 OK**, Content-Type: `application/javascript` / `text/javascript`
- `GET /dashboard/js/app.js` -> Status: **200 OK**, Content-Type: `application/javascript` / `text/javascript`
- `GET /api/telemetry` -> Status: **200 OK**, Content-Type: `application/json`
- `GET /api/flows` -> Status: **200 OK**, Content-Type: `application/json`
- `GET /api/events` -> Status: **200 OK**, Content-Type: `application/json`
- `GET /api/metrics` -> Status: **200 OK**, Content-Type: `application/json`
- `GET /api/metrics/comparison` -> Status: **200 OK**, Content-Type: `application/json`

**Finding:** All static routes in `telemetry_handler.py` respond with HTTP 200. No 404s on `<script src>` or `<link href>`. Explicit `application/javascript; charset=utf-8` MIME type headers will be enforced across all paths.

---

## 2. Server-Sent Events (SSE) Concurrency & Blocking Audit (Step 1b)
- An active SSE subscriber (`GET /api/stream`) was held open with keep-alive pings.
- While the stream was open, a concurrent `GET /api/telemetry` completed in `1.7 ms` with HTTP 200.
- In `TelemetryRegistry`, `notify_subscribers` only acquires `self.lock` momentarily to clone the subscriber list (`subs = list(self.subscribers)`) and broadcasts via non-blocking `q.put_nowait(msg)`. No locks are held during socket writes.
- **Finding:** In `src/controller/dynamic_router.py`, `server.daemon_threads = True` was missing on `ThreadingHTTPServer`. Request worker threads defaulted to non-daemon threads, which could cause zombie worker threads if clients disconnect abruptly.

---

## 3. Static JS Code & DOM Review: CRITICAL ROOT CAUSE IDENTIFIED (Step 1c)
### A. Fatal Syntax Error in `src/dashboard/js/topology_canvas.js`
- **Location:** `src/dashboard/js/topology_canvas.js`, Lines 207–213:
```javascript
  stopLoop() {
    this.loopRunning = false;
  }
    };
    requestAnimationFrame(animate);
  }
```
- **Root Cause:** An extra `}; requestAnimationFrame(animate); }` block was mistakenly left in the class definition.
- **Impact in Browser:**
  1. Parsing `topology_canvas.js` throws an unrecoverable `SyntaxError: Unexpected token '}'`.
  2. Because of this syntax error, `window.TopologyCanvas` is **never defined**.
  3. When `app.js` executes and calls `this.topoCanvas = new TopologyCanvas('topoCanvas')` at line 14:
     `Uncaught ReferenceError: TopologyCanvas is not defined`
  4. The constructor of `DashboardApp` crashes immediately at line 14.
  5. `this.metricsChart`, `this.connGauge`, and `this.comparisonChart` are **never instantiated**.
  6. `this.initSSE()`, `this.startPolling()`, and `this.fetchTelemetry()` are **never called**.
  7. Telemetry data is never fetched: RTT/throughput/failover show `--`, flow table stays at `Loading active flow rules...`, gauge is empty, comparison chart is blank, and topology canvas is dead.

### B. DOM Identifier & Class Audit
- All DOM IDs referenced in JS match `index.html`:
  - `#topoCanvas`, `#metricsChart`, `#connGauge`, `#comparisonCanvas`, `#terminalLog`, `#flowTableBody`, `#controllerStatus`, `#failoverStatus`, `#serverLoadStatus`, `#shortcutsModal`, `#offlineOverlay`.
- `#metricConns` in `app.js` was replaced by `#connGauge` in HTML; guarded with `if (connsEl)`.
- Script load order in `index.html`: `toast.js` -> `charts.js` -> `gauge.js` -> `comparison.js` -> `topology_canvas.js` -> `app.js`. Order is correct.

---

## 4. Canvas Sizing & Feedback Loop Review (Step 1d)
- **Excessive Topology Height:** `.canvas-wrapper` had `flex: 1; min-height: 540px; display: flex; align-items: center; justify-content: center;`. In CSS Grid (`.dashboard-grid`), the left column stretches to match the entire stacked right column (`diagnostics-column`), which is >1000px tall.
- **ResizeObserver Feedback:**
  - Setting `this.canvas.style.height = `${this.height}px`` on a canvas in flex layout alters its parent's layout bounds.
  - Fix: Give `.canvas-wrapper` a deterministic CSS size `height: clamp(420px, 62vh, 720px); position: relative; overflow: hidden;`.
  - Position `#topoCanvas` as `position: absolute; inset: 0; width: 100% !important; height: 100% !important;`.
  - Guard `resize()` in `topology_canvas.js` and `charts.js` to skip recomputation when integer width, height, and DPR have not changed.

---

## 5. Resilience & Error Boundary (Step 1e)
- Current `app.js` constructor has no error boundaries around component instantiation.
- Fix:
  1. Wrap each widget initialization (`TopologyCanvas`, `MetricsChart`, `ConnectionGauge`, `ComparisonChart`) in independent `try/catch` blocks.
  2. Call `this.fetchTelemetry()` immediately on load before SSE so initial data renders synchronously without relying on stream handshakes.
  3. If SSE does not receive data within 2s, fall back to active interval polling.
  4. Add a visible debug bar (`?debug=1`) tracking SSE state, last data timestamp, and last error.
