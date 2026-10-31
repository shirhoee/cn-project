# Phase 6 Plan: Real-Time Web Telemetry Dashboard & Live Flow Visualizer

## Feature Description & User Stories
As an academic evaluator, student, or network engineer demonstrating the Dynamic SDN project, I want a real-time, browser-based telemetry dashboard and live flow visualizer accessible at `http://localhost:8080/` so that I can visually witness link failure failover, server overload NAT rerouting, switch flow tables, and performance metrics in real time during the viva demonstration without needing third-party tools or separate terminal servers.

* **User Story 1:** As an evaluator viewing the dashboard at `http://localhost:8080`, I want to see an interactive, animated HTML5 canvas topology showing switches `s1`, `s2`, `s3`, servers, and clients with live packet particles flowing along active network paths.
* **User Story 2:** As a presenter breaking link `s1-s2` in Mininet (`link s1 s2 down`), I want the visualizer to immediately turn the primary link pulsing red, illuminate the redundant backup link `s2-s3` in electric blue, re-route packet particles through the backup corridor, and log the `[FAILOVER]` event in the live terminal feed.
* **User Story 3:** As a presenter running `spam_client.py`, I want the visualizer to show Server 1 transitioning to `OVERLOAD`, show an `[OVERLOAD]` alert in the log, display the new Priority-20 NAT flow rule in the OpenFlow table, and animate subsequent client requests rerouting to `server2` (`10.0.0.12`).
* **User Story 4:** As a researcher, I want real-time charts plotting round-trip latency and throughput alongside a live OpenFlow flow table for switches `s1`, `s2`, and `s3`.

---

## Problem & Solution Statement
* **Problem:** 
  During a live viva or demo, inspecting OpenFlow flow rules and verifying dynamic behaviors currently requires reading terminal log scrollback or running manual `ovs-ofctl dump-flows` commands. This lacks visual immediacy and does not intuitively showcase the packet rerouting mechanisms.
* **Solution:**
  1. Build a zero-dependency, controller-embedded web server in `src/controller/dynamic_router.py` that serves both the static web dashboard assets and a comprehensive suite of JSON REST endpoints (`/api/telemetry`, `/api/flows`, `/api/events`, `/api/metrics`, `/api/overload`).
  2. Implement a pure HTML5 Canvas 2D topology visualizer with 60 FPS animated packet particles, dynamic link coloring, switch state badges, and interactive inspection.
  3. Provide an interactive multi-panel dashboard UI with a live event log terminal, active OpenFlow 1.3 flow table tabs for each switch, and rolling performance metric sparklines.
  4. Ensure 100% offline compatibility with zero external npm or CDN dependencies.

---

## CONTEXT REFERENCES
* [src/controller/dynamic_router.py](file:///mnt/e/cn%20project/src/controller/dynamic_router.py) - Primary SDN controller with embedded `ThreadingHTTPServer`.
* [src/network/topology.py](file:///mnt/e/cn%20project/src/network/topology.py) - Topology layout: `s1` Core, `s2` Server Aggregation, `s3` Client Aggregation, redundant link `s2:4 <-> s3:5`.
* [src/app/server.py](file:///mnt/e/cn%20project/src/app/server.py) - TCP socket server sending overload alerts to `/api/overload`.
* [performance_metrics.csv](file:///mnt/e/cn%20project/performance_metrics.csv) - Benchmarking log file.
* [PRD.md](file:///mnt/e/cn%20project/PRD.md) - Section 6 Phase 6 roadmap.

---

## New Files to Create
* **Components:**
  * `src/dashboard/index.html` - Single-page dashboard markup with glassmorphism layout, canvas container, flow table tabs, and live event console.
  * `src/dashboard/styles.css` - Sleek dark mode styling (`#0b0f19` theme, neon accents, responsive grid).
  * `src/dashboard/js/topology_canvas.js` - 60 FPS Canvas 2D engine rendering nodes, links, and animated packet particle flows.
  * `src/dashboard/js/charts.js` - Lightweight Canvas 2D time-series charts for latency and throughput.
  * `src/dashboard/js/app.js` - Frontend polling engine fetching `/api/telemetry`, `/api/flows`, `/api/events`, and managing UI interactions.
* **API:**
  * `src/controller/telemetry_handler.py` - Modular HTTP handler and Telemetry Registry maintaining switch states, flow tables, event ring buffer, and static asset serving.
* **Tests:**
  * `tests/test_dashboard_api.py` - Automated integration test verifying that all REST endpoints and static files return valid HTTP 200 responses and JSON schemas.

---

## STEP-BY-STEP TASKS

### Task 1: Implement Telemetry Registry & Modular HTTP Handler
* Create `src/controller/telemetry_handler.py` containing:
  * `TelemetryRegistry`: Thread-safe registry tracking switch connections, port states, active flow entries, server connection counts, and a 100-event ring buffer.
  * `DashboardHttpHandler`: HTTP request handler extending `http.server.BaseHTTPRequestHandler` to serve static dashboard assets (`index.html`, CSS, JS) and JSON API endpoints (`/api/telemetry`, `/api/flows`, `/api/events`, `/api/metrics`, `/api/overload`).
* **VALIDATE:** `python3 -c "import src.controller.telemetry_handler; print('Telemetry handler imported')"`

### Task 2: Integrate Telemetry Registry into Dynamic Router
* Update `src/controller/dynamic_router.py`:
  * Initialize `TelemetryRegistry` on startup and pass it to `DashboardHttpHandler`.
  * Record all switch connection events (`EventOFPSwitchFeatures`) and installed static rules into the registry.
  * Record link down and failover events (`port_status_handler`) into the event stream and switch port registry.
  * Record overload alert and NAT flow mod installations (`trigger_overload_redirection`) into the flow registry and event stream.
* **VALIDATE:** `timeout 2 osken-manager src/controller/dynamic_router.py`

### Task 3: Build the Modern Dashboard UI (HTML & CSS)
* Create `src/dashboard/index.html` with:
  * Top navigation ribbon showing live controller pulse, active failover status, server health badges, and auto-poll toggle.
  * Left pane: Dedicated interactive HTML5 Canvas container for the network visualizer with an overlay legend.
  * Right pane: Multi-panel diagnostics including OpenFlow 1.3 flow table tabs (`s1`, `s2`, `s3`), live event stream console, and latency/throughput charts.
* Create `src/dashboard/styles.css` with a high-contrast dark theme (`#0b0f19`), glassmorphism cards, and responsive CSS grid.
* **VALIDATE:** `test -f src/dashboard/index.html && test -f src/dashboard/styles.css`

### Task 4: Implement 60 FPS HTML5 Canvas Topology & Particle Engine
* Create `src/dashboard/js/topology_canvas.js`:
  * Render hierarchical SDN topology: `s1` (Top), `s2` (Left), `s3` (Right), servers (Bottom Left), clients (Bottom Right).
  * Render link states: glowing cyan for active primary links, pulsing dashed crimson red for severed link `s1-s2`, and electric blue for active failover corridor `s2-s3`.
  * Particle engine: Animated packet dots travelling between clients and servers. When `server1` is overloaded, particles dynamically shift to `server2` (`10.0.0.12`).
* Create `src/dashboard/js/charts.js` for zero-dependency Canvas time-series graphing.
* Create `src/dashboard/js/app.js` to manage 800ms polling, state updates, flow table tab switching, and log autoscrolling.
* **VALIDATE:** `test -f src/dashboard/js/topology_canvas.js && test -f src/dashboard/js/charts.js && test -f src/dashboard/js/app.js`

### Task 5: Implement Automated Integration & API Test Suite
* Create `tests/test_dashboard_api.py` to:
  * Start the controller's telemetry server on a test port.
  * Validate `GET /` returns HTML.
  * Validate `GET /dashboard/styles.css` and `GET /dashboard/js/app.js` return HTTP 200.
  * Validate `GET /api/telemetry` returns the expected JSON structure with switches, links, and servers.
  * Validate `GET /api/flows` returns active flow definitions.
  * Validate `POST /api/overload` updates the telemetry state and event log.
* **VALIDATE:** `python3 -m unittest tests/test_dashboard_api.py`

### Task 6: Update Documentation & Viva Runbook
* Update `README.md` to document the Live Dashboard URL (`http://localhost:8080/`), describe how to open it alongside Mininet, and explain the visual elements to watch during the viva.
* Update `PRD.md` to reflect Phase 6 as completed.
* **VALIDATE:** `grep -q "http://localhost:8080" README.md && python3 -m unittest tests/test_sanity.py`

---

## TESTING STRATEGY
* **API & Endpoint Integration Testing:** `python3 -m unittest tests/test_dashboard_api.py` verifies all HTTP routes, headers, content types, and JSON responses.
* **Repository Sanity Check:** `python3 -m unittest tests/test_sanity.py` guarantees backward compatibility with existing topology and controller bindings.
* **Live Dry-Run:** Launch `osken-manager src/controller/dynamic_router.py` and test `curl -s http://localhost:8080/api/telemetry | grep "controller"` to ensure immediate responsiveness.

---

## ACCEPTANCE CRITERIA
* [ ] Navigating to `http://localhost:8080/` serves the single-page dashboard with zero external dependencies.
* [ ] Network topology canvas accurately renders switches `s1`, `s2`, `s3`, servers, and clients with 60 FPS animated packet flow particles.
* [ ] Severing link `s1-s2` turns the primary link red, illuminates the backup link in electric blue, reroutes packet particles, and logs the `[FAILOVER]` event.
* [ ] Triggering overload transitions `server1` to `OVERLOAD`, logs `[OVERLOAD]`, displays the Priority-20 NAT rule in the flow table, and directs new requests to `server2`.
* [ ] OpenFlow 1.3 flow table tabs display real-time rules for switches `s1`, `s2`, and `s3`.
* [ ] `tests/test_dashboard_api.py` passes 100%.
