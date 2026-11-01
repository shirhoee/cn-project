# Phase 7 Implementation Plan: Presentation-Grade Web Telemetry Dashboard Upgrade

## Current Architecture & Data Flow Summary

### 1. Backend REST Endpoints (Standard Library `ThreadingHTTPServer`)
* `GET /`: Serves `src/dashboard/index.html`.
* `GET /styles.css`, `GET /dashboard/js/*.js`: Static assets.
* `GET /api/telemetry`: Returns snapshot with controller state (`failover_active`, `nat_redirect_active`), switch metadata (`dpid`, `ports`, `flow_count`), link states (`s1-s2`, `s1-s3`, `s2-s3`), and server statuses (`10.0.0.11`, `10.0.0.12`).
* `GET /api/flows`: Returns `{ "1": [...], "2": [...], "3": [...] }` with priority, match, actions, and flow description per switch.
* `GET /api/events`: Chronological ring buffer of recent controller and data-plane events (timestamps, severity level, badge, and message).
* `GET /api/metrics`: Recent latency and throughput readings parsed from `performance_metrics.csv`.
* `POST /api/overload`: Northbound alert from server socket triggering Priority-20 forward and reverse NAT flows on Core Switch `s1`.
* `GET /api/reset` & `POST /api/reset`: Reverts dynamic failover and NAT flows, returning the system to healthy baseline.

### 2. Frontend Polling & Rendering Loop
* Initialized in `src/dashboard/js/app.js` with an 800ms polling interval.
* `TopologyCanvas` renders network nodes, links, and animated packet particles at ~60 FPS.
* `MetricsChart` plots latency over time on a 2D canvas.
* Flow table renders rules for the selected switch tab (`s1`, `s2`, `s3`).
* Terminal log renders formatted event badges with auto-scroll.

---

## Upgrade Implementation Phases

### Phase 1: Fix Core Visual Bugs
1. **Canvas DPR & Crispness:**
   - Query `window.devicePixelRatio || 1`.
   - Update `TopologyCanvas` and `MetricsChart` to resize backing store (`canvas.width = cssW * dpr`, `canvas.height = cssH * dpr`) while setting `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
   - Attach `ResizeObserver` to cleanly handle layout changes and window resizing.
2. **Dynamic Topology Layout Scaling:**
   - Convert fixed node coordinates (`x: 460, y: 80`) to proportional relative coordinates (`nx: 0.5, ny: 0.16`).
   - Recompute absolute coordinates dynamically based on canvas dimensions, ensuring all nodes (`server1`, `server2`, `client1-3`) remain fully visible with generous padding across 1280x720, 1920x1080, and narrow viewports.
3. **Enhanced Node & Link Labels:**
   - Increase label font size to $\ge 13\text{px}$.
   - Add semi-opaque rounded backdrop pills behind node labels with subtle text-shadow.
   - Display node IP addresses below host labels (`10.0.0.11`, `10.0.0.12`, `10.0.0.21`, etc.).
   - Add small, unobtrusive monospace port badges along links (`s1:1 <-> s2:1`, `s1:2 <-> s3:1`, `s2:2/3` to servers, `s3:2/3/4` to clients, `s2:4 <-> s3:5` backup).
4. **Chart Math & Readability:**
   - Fix Y-axis tick formatting to clean numbers (`1.2 ms` instead of `002.3ms`).
   - Render smooth monotonic bezier curves with gradient area fill.
   - Replace "Avg" with a rolling median over recent samples (`Median: X.X ms`).
   - Add interactive hover crosshair with a floating tooltip displaying exact latency/time.
5. **Event Deduplication:**
   - Deduplicate twin events (e.g. `s1` and `s2` both reporting `LINK_UP` or `FAILOVER_OFF` within 300ms) both in `telemetry_handler.py` and client-side in `app.js` with a neat `x2` badge.

### Phase 2: Background + Visual Design
1. **Layered Background:**
   - Deep navy background gradient with subtle SVG noise texture (data URI) to eliminate banding.
   - 2-3 large blurred radial ambient blobs (cyan, electric blue, violet) drifting with slow CSS keyframe animations (GPU transform-only).
   - Crisp faint dot-grid overlay and soft peripheral vignette.
2. **Refined Glassmorphism Cards:**
   - Polished backdrop blur, 1px semi-transparent gradient borders, soft inner glow, and standardized spacing scale.
3. **Design Tokens (`:root`):**
   - Palette: Normal Cyan (`#38bdf8`), Failover Electric Blue (`#06b6d4`), Severed Red (`#ef4444`), NAT Amber (`#f59e0b`), Healthy Green (`#10b981`).
   - Consistent typography with system font stack (`Inter`, `system-ui`, `JetBrains Mono`, `ui-monospace`).
   - Tabular numerals (`font-variant-numeric: tabular-nums`) for all performance metrics.
4. **Canvas Aesthetics:**
   - Soft radial ambient glow behind Core Switch `s1`, faint grid, glowing node rings reacting to state.

### Phase 3: Animations & Transitions
1. **Metric Count-Up Tweens:**
   - Eased number transitions (~400ms `easeOutCubic`) on metric values with change highlight flashes (green on improvement, red on degradation).
2. **Dynamic Link Transitions:**
   - Color interpolation (cyan $\to$ red over 300ms) on link failure.
   - Animated marching dashes (`lineDashOffset`) for standby backup links.
   - Glowing electric blue travelling pulse on failover activation.
3. **Particle Improvements:**
   - Curved motion with trails and smooth fade-in/out at endpoints.
   - Dynamic NAT rerouting particles bending gracefully toward `server2`.
4. **Switch Flow Ripples:**
   - Visual ripple rings propagating outwards from switches when new flow rules are pushed.
5. **Flow Table Diff & Animations:**
   - Animated row entries, active-tab indicator slide, and stable scroll positions during table re-renders.
6. **Toast System & Micro-Interactions:**
   - Slide-down notifications for failover and overload events.
   - Button hover lift, press scale, and toggle animations.
   - Full support for `prefers-reduced-motion`.

### Phase 4: Fluid Data Pipeline (SSE + Fallback)
1. **Server-Sent Events (`GET /api/stream`):**
   - Thread-safe streaming endpoint in `telemetry_handler.py` pushing JSON events and state updates in real time with 15s keepalives.
2. **Resilient Frontend Connection:**
   - `EventSource` with exponential backoff and seamless fallback to existing JSON polling.
3. **Chart Interpolation & Offline State:**
   - Continuous 60 FPS scrolling graph.
   - "Controller offline - reconnecting..." overlay if data ceases for $>3\text{s}$.

### Phase 5: Advanced Features
1. **Failover Recovery Stopwatch:**
   - Controller-side timestamp measurement from `PortStatus` DOWN to backup corridor rule installation. Displayed in a dedicated "Recovered in X ms" card.
2. **Static vs. Dynamic Benchmark Comparison:**
   - Endpoint `GET /api/metrics/comparison` analyzing `performance_metrics.csv`.
   - Native Canvas grouped bar chart comparing latency, throughput, and success rate.
3. **Connection Radial Gauge:**
   - Dynamic arc meter visualizing active socket connections against the overload threshold.
4. **Interactive Topology Tooltips & Click-to-Trace:**
   - Rich hover cards with DPID, MAC, IP, and flow counts.
   - Click a client and a server to trace and highlight the active hop-by-hop forwarding path.
5. **Interactive Demo Controls:**
   - Server-backed demo triggers (`/api/demo/overload`, `/api/demo/link_down`, `/api/demo/reset`) with clear "DEMO" badges.
6. **Presenter Mode & Shortcuts:**
   - High-contrast projector mode toggled with `P`. Keyboard shortcuts `1` (Overload), `2` (Link Down), `R` (Reset), `S` (Stream Toggle), `?` (Shortcut overlay).

### Phase 6: Quality, Accessibility & Verification
1. Canvas 60 FPS optimization with background tab suspension (`document.hidden`).
2. WCAG AA accessibility compliance and `aria-live` polite event terminal.
3. Expanded unit tests in `tests/test_dashboard_api.py`.
4. Comprehensive documentation in `README.md` and `PRD.md`.
5. Full Viva Demonstration QA Checklist.
