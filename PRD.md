# Product Requirements Document (PRD): Mininet-Based Dynamic SDN Application

## 1. Product Overview

### Problem Statement
Traditional static computer networks rely on rigid, pre-configured forwarding tables and lack real-time awareness of higher-layer application conditions. When a physical link fails or a backend server is swamped by traffic spikes, static networks drop packets or cause application timeouts. 

This project solves this fundamental limitation by designing, implementing, and evaluating an **Application-Aware, Dynamic Software-Defined Network (SDN)**. By integrating low-level Python socket programming with a centralized OpenFlow 1.3 controller (`os-ken`), the network automatically adapts its forwarding state in hardware in response to both physical layer events (`PortStatus` down) and application layer congestion alerts (HTTP POST alerts from socket servers).

### Target Audience
* **Academic Evaluation Committee (Team 17 Evaluators):** Satisfying all criteria outlined in the *SDN-Socket Programming – Jackfruit Mini Project Guidelines & Rubrics*.
* **Network Engineering Students & Educators:** Serving as an exemplary reference model for bridging Layer 4/7 socket programming with Layer 2/3 OpenFlow data-plane automation.

### Success Criteria & Academic Rubric Alignment
The system is evaluated against the 40-mark Jackfruit Mini Project Rubric (Deliverable D1: 15 marks, Deliverable D2: 25 marks):

| Deliverable | Component | Marks | Success Criteria & Verification Method |
| :--- | :--- | :---: | :--- |
| **D1** | **Problem Understanding & Architecture** | 2 | Clear multi-tier architecture diagram, well-defined control and data plane boundaries, explicit switch port mapping. |
| **D1** | **TCP/UDP Socket Implementation** | 4 | Low-level concurrent TCP socket server with multi-threading, active connection tracking, and robust client latency logging. |
| **D1** | **Mininet + SDN Implementation** | 4 | Parameterized Mininet topology (`s1` core, `s2` server, `s3` client switches) with OpenFlow 1.3, explicit port bindings, and `net.staticArp()`. |
| **D1** | **Socket–SDN Integration** | 3 | Effective cross-layer integration: application server monitors active connections and issues Northbound REST alerts to SDN controller. |
| **D1** | **Initial Testing & Demo** | 2 | Verified end-to-end socket data transfer and zero packet loss ping over baseline topology. |
| **D2** | **Complete Application Functionality** | 4 | Robust simultaneous multi-client operations without server crashes or unhandled exceptions. |
| **D2** | **Dynamic SDN Functionality** | 6 | Controller dynamically injects Priority-20 OpenFlow flow mods in response to real-time events. |
| **D2** | **Challenging Scenario / Robustness** | 4 | Two challenging scenarios verified: (1) Instant link failover upon physical link tear down; (2) Hardware NAT reroute to replica server upon overload. |
| **D2** | **Performance Evaluation & Comparison** | 5 | Quantitative benchmarking comparing static baseline against dynamic SDN in `performance_metrics.csv` (latency, throughput, success rate). |
| **D2** | **Documentation, Final Demo & Viva** | 6 | Complete, reproducible documentation in `README.md`, verified unit test sanity suite, and presentation readiness. |
| **Total** | | **40** | **100% Rubric Coverage** |

---

## 2. MVP Scope & User Stories

### Core Features (v1.0 Implemented & Verified)
* **Custom Parameterized Mininet Topology:** 3 Open vSwitch instances (`s1` Core, `s2` Server, `s3` Client) with explicit port bindings and out-of-band NAT gateway.
* **Concurrent Multi-Threaded TCP Sockets:** Python socket server capable of handling multiple concurrent clients with threshold-based overload detection.
* **OpenFlow 1.3 SDN Controller (OS-Ken):** Centralized controller hosting baseline L2 learning and dynamic reactive flow handlers.
* **Northbound REST API Server:** Embedded HTTP server (`/api/overload` on port 8080) for real-time application-to-controller notification.
* **Scenario 1 — Link Failure Recovery:** Real-time port status monitoring (`EventOFPPortStatus`) that seamlessly reroutes traffic across an isolated backup link (`s2:4 <-> s3:5`).
* **Scenario 2 — Server Overload Load Balancing:** Priority-20 NAT flow modification rewriting destination IP/MAC to redirect traffic to replica server `server2` (`10.0.0.12`).
* **Performance Evaluation Suite:** Automated comparative test harness recording latency, throughput, and status into CSV.

### User Stories
* *As a client node (`client1`), I want to request files over a TCP socket so that I can reliably receive chunks of data and record my round-trip latency.*
* *As a server node (`server1`), I want to service incoming connections concurrently and autonomously send an HTTP POST to the SDN controller when my connection threshold is exceeded.*
* *As an SDN controller, I want to listen for server overload events so that I can inject Priority-20 OpenFlow flow mods to transparently reroute new client requests to replica server `server2` without client-side reconfiguration.*
* *As an SDN controller, I want to catch `OFPPortStatus` link-down events so that I can immediately activate the redundant backup link and prevent dropped connections.*
* *As an academic evaluator, I want to execute automated comparative benchmarks against static and dynamic routing to evaluate throughput, latency, and resilience.*

---

## 3. Out of Scope

To prevent scope creep and maintain strict rubric alignment, the following are excluded from the core MVP:
* **Production Public Key Infrastructure / TLS:** Plaintext TCP sockets are used to focus strictly on networking mechanics.
* **Distributed Multi-Controller Clusters:** A single centralized `osken-manager` controller instance is used.
* **Non-IPv4 Protocols:** IPv6, BGP routing, and MPLS labeling are omitted in favor of standard IPv4 OpenFlow 1.3 matches.
* **Heavyweight Container Orchestration:** No Docker or Kubernetes overlays; native Mininet host network namespaces are utilized.

---

## 4. Tech Stack & Architecture

### Component Breakdown
* **Network Data Plane:**
  * **Emulator:** Mininet 2.3+
  * **Virtual Switch:** Open vSwitch (`openvswitch-switch`, OpenFlow 1.3)
  * **Addressing Scheme:** Subnet `10.0.0.0/24` with static MAC mapping and pre-populated kernel ARP tables via `net.staticArp()`.
* **Control Plane (SDN Controller):**
  * **Framework:** `os-ken<=3.1.1` (modern Python 3.10+ / 3.14 compatible fork of Ryu)
  * **OpenFlow Protocol:** OpenFlow 1.3 via TCP port `6653`
  * **Northbound REST API:** Python standard library `http.server.ThreadingHTTPServer` listening on `http://0.0.0.0:8080/api/overload`
* **Application Layer:**
  * **Language:** Python 3 (standard libraries: `socket`, `threading`, `urllib.request`, `json`, `argparse`, `time`)
  * **Protocol:** Custom text-based request protocol (`GET /dummy_file`, `GET /spam`) over TCP stream sockets (Port 9000).
* **Evaluation & Testing:**
  * **Test Framework:** Python `unittest` (`tests/test_sanity.py`)
  * **Logging Utility:** Python CSV logger (`performance_metrics.csv`) tracking timestamp, client IP, latency (ms), throughput (kbps), and transfer status.

### Network Architecture Diagram
```text
                     +---------------------------------------+
                     |       SDN Controller (osken-manager)  |
                     |  - dynamic_router.py (Port 6653/8080) |
                     +-------------------+-------------------+
                                         | OpenFlow 1.3
                                         |
                                  +------+------+
                                  | Switch s1   | (Core)
                                  +---+-------+-+
                    Port 1 (Primary) /         \ Port 2 (Primary)
                                    /           \
                     +-------------+-+         +-+-------------+
        (Servers)    |   Switch s2   |=========|   Switch s3   |  (Clients)
                     +---+---------+-+  Backup +---+---+---+---+
                         |         |    Link       |   |   |
                  Port 2 |  Port 3 |    (s2:4      |   |   |
                         |         |     s3:5)     |   |   |
                   [server1]    [server2]        [c1] [c2] [c3]
                    .11          .12             .21  .22  .23
```

---

## 5. Directory Structure

```text
cn_project/
├── .gitignore                     # Git ignore rules for bytecode, logs, and venvs
├── requirements.txt               # Pinned Python package dependencies (os-ken<=3.1.1)
├── README.md                      # Comprehensive architecture and viva demo guide
├── PRD.md                         # Product Requirements Document & Rubric Mapping
├── PROJECT_PLAN.md                # Task delegation & team role distribution
├── performance_metrics.csv        # Benchmarking evaluation log output
├── plans/                         # Feature execution plans
│   ├── phase-5-docs-cleanup-and-verification.md
│   ├── phase-6-live-telemetry-dashboard.md
│   ├── phase-7-dashboard-polish.md
│   └── apple-ui-redesign-spec.md
├── src/
│   ├── app/
│   │   ├── client.py              # TCP socket client measuring latency & throughput
│   │   ├── server.py              # Multi-threaded TCP server with REST overload notification
│   │   └── spam_client.py         # Concurrent connection generator for load triggering
│   ├── controller/
│   │   ├── dynamic_router.py      # Reactive SDN controller (Failover + REST load balancing)
│   │   ├── static_router.py       # Baseline static OpenFlow 1.3 controller
│   │   └── telemetry_handler.py   # Telemetry Registry & Dashboard HTTP Handler (SSE)
│   ├── dashboard/                 # Zero-dependency Apple-grade browser visualizer
│   │   ├── index.html             # Main dashboard UI
│   │   ├── styles.css             # Apple HIG smoked glass dark-mode styling
│   │   └── js/
│   │       ├── app.js             # Dashboard controller & keyboard shortcuts
│   │       ├── charts.js          # Canvas time-series latency/throughput graph
│   │       ├── comparison.js      # Keynote benchmark grouped bar comparison chart
│   │       ├── gauge.js           # Apple Watch Activity Ring concentric gauge
│   │       ├── toast.js           # iOS Dynamic Island floating pill notifications
│   │       └── topology_canvas.js # 60 FPS Canvas 2D topology visualizer
│   ├── network/
│   │   ├── start_network.sh       # Convenience starter script for Mininet
│   │   └── topology.py            # Mininet topology script with explicit port bindings
│   └── utils/
│       └── logger.py              # Centralized CSV performance metrics logger
└── tests/
    ├── evaluate_performance.py    # Automated Mininet evaluation comparing static vs dynamic
    ├── evaluate_performance.sh    # Evaluation execution helper script
    ├── test_dashboard_api.py      # Integration test for dashboard endpoints
    └── test_sanity.py             # Automated unit tests validating port bindings & classes
```

---

## 6. Phases of Work (Implementation Roadmap)

### Completed Phases

* **Phase 1: Foundation & Low-Level Sockets (Deliverable D1)**
  * Scaffolded custom Mininet topology with NAT connectivity.
  * Implemented concurrent multi-threaded TCP socket client and server.
  * Built baseline `static_router.py` controller and verified initial communication.

* **Phase 2: SDN Controller & REST API Integration (Deliverable D1/D2)**
  * Integrated Northbound REST API (`/api/overload`) inside the SDN controller.
  * Added autonomous HTTP POST alerts in `server.py` triggered when connection thresholds are exceeded.

* **Phase 3: The Challenging Scenarios (Deliverable D2)**
  * **Scenario 1 (Link Failure):** Added `EventOFPPortStatus` handler in `dynamic_router.py` for automated shortest-path failover to backup link `s2-s3`.
  * **Scenario 2 (Server Overload):** Added Priority-20 OpenFlow flow rewrite (NAT) to transparently redirect traffic to replica server `server2`.
  * Implemented `spam_client.py` to simulate high concurrent client load.

* **Phase 4: Evaluation & Benchmarking Suite (Deliverable D2)**
  * Built `src/utils/logger.py` to record latency, throughput, and status into `performance_metrics.csv`.
  * Implemented `tests/evaluate_performance.py` for automated headless evaluation.

* **Phase 5: Modernization, Documentation & Sanity Suite (Deliverable D2)**
  * Migrated controllers to `os-ken<=3.1.1` and `OSKenApp` with standard library `ThreadingHTTPServer`.
  * Enforced explicit switch port bindings in `src/network/topology.py` and loop guard rules.
  * Authored unit sanity test suite (`tests/test_sanity.py`) verifying topology port integrity.
  * Overhauled `README.md` with full viva demonstration runbooks and setup instructions.

---

* **Phase 6: Live Web Telemetry Dashboard & Flow Visualizer (Deliverable D2 - Completed)**
  * Embedded zero-dependency `DashboardHttpHandler` directly into `dynamic_router.py` on port 8080.
  * Implemented 60 FPS HTML5 Canvas 2D topology visualizer with animated packet particles travelling along active paths.
  * Added live link state transitions (solid cyan -> pulsing red on severed links; glowing electric blue on failover corridor).
  * Added dynamic NAT particle flow diversion (amber particles redirected to replica `server2` on overload).
  * Built real-time OpenFlow 1.3 flow table tabs and live event stream terminal with automatic JSON polling.
  * Authored automated endpoint test suite (`tests/test_dashboard_api.py`).

* **Phase 7: Presentation-Grade UI Polish & Apple Human Interface Elevation (Deliverable D2 - Completed)**
  * **Real-Time Data Pipeline:** High-performance Server-Sent Events (`GET /api/stream`) with auto-reconnection and connection watchdog overlay.
  * **Apple HIG & macOS Sequoia Aesthetic:** Smoked glass materials with dual-stage backdrop filters (`blur(28px) saturate(190%)`), OLED space black grounding, and top specular chamfer edge highlights (`inset 0 1px 0 rgba(255,255,255,0.12)`).
  * **Retina Topology Visualizer:** Milled metal squircle switches with radial metallic gradients, glowing status pearls, multi-layer luminous conduits, frosted port badges, and photonic comet packet streams with exponential decay tails.
  * **Apple Watch Activity Rings:** Dual concentric circular rings rendering active Server 1 connection load and Corridor Capacity with rounded caps and drop shadows.
  * **macOS Activity Monitor Health Waveform:** Monotone cubic spline curve with soft linear gradient area decay, breathing terminal pulse dot, and frosted glass crosshair tooltip.
  * **Apple Keynote Benchmark Visualizer:** Grouped capsule bars comparing Latency, Throughput, and Availability with bold emerald multiplier callout badges (**"2,780× Faster"**, **"3× Uptime"**).
  * **macOS Console.app Flow Table:** Segmented pill switcher with smooth chiclets, subtle zebra striping, and Dynamic Island flow rule diff chips (`+2 rules`).
  * **iOS Dynamic Island Notifications:** Floating top-center pill notifications with bouncy spring physics, glowing progress hairlines, and specular smoked glass.
  * **Failover Recovery Stopwatch:** Controller accurately records microsecond-precision hardware flow mod duration (< 2.5 ms) displayed in the real-time metrics row.
  * **Click-to-Trace Forwarding Verification:** Interactive canvas tool allowing users to click a client then a server to highlight the active hop-by-hop forwarding path.
  * **One-Click Simulation Triggers & Presenter Mode:** Built-in DEMO buttons and keyboard accelerators (`1`, `2`, `R`, `P`, `S`, `?`) for smooth viva presentation.

* **Phase 8: Dashboard Recovery, Parser Invariant & Visual Responsiveness Fix (Deliverable D2 - Completed)**
  * **Syntax & Parser Recovery:** Fix premature closing brace on line 336 of `src/dashboard/js/app.js` restoring full instantiation of `DashboardApp`.
  * **Local Dev Cache Invariant (1A):** Remove aggressive `immutable` / 1-year caching in `src/controller/telemetry_handler.py`. Enforce `Cache-Control: no-cache, must-revalidate` with dynamic ETags. Bump script/style query version from `?v=2.0.0` to `?v=2.1.0`.
  * **In-App Error Banner (2A):** Implement `#appErrorBanner` in `index.html`, `styles.css`, and `app.js` to visibly surface unhandled script errors in a floating Apple-styled pill.
  * **Static Topology Instant Paint (3A):** Force immediate static layer render on `TopologyCanvas` instantiation so switches, links, port badges, and hosts are visible before the first telemetry frame.
  * **Automated Syntax Validation Test:** Implement `tests/validate_frontend_syntax.py` ensuring all JS files have balanced blocks/parens/brackets.

* **Phase 9: SSE Keepalive Heartbeat & Full Apple HIG Aesthetic Transformation (Deliverable D2 - Completed)**
  * **SSE Keepalive Disconnection Root-Cause Resolution:** Diagnosed why `#offlineOverlay` ("Controller Disconnected") fired periodically. SSE comments (`: keepalive\n\n`) are discarded by browser `EventSource` parsers and do not trigger DOM events. When traffic was idle, the 3.8s frontend watchdog starved. Resolved by sending active `event: ping\ndata: {}\n\n` every 1.5s in `telemetry_handler.py`, listening for `ping` in `app.js`, extending watchdog to 5.0s, and adding proactive `/api/telemetry` probe before alarming.
  * **Custom Apple Dark Capsule Scrollbars:** Injected custom `::-webkit-scrollbar` and `scrollbar-width: thin` across the entire document and `.table-container`, eradicating the 17px bright white Windows Chrome default scrollbar.
  * **Ambient Stage Lighting & Frosted Glass Refraction:** Added multi-hue radial stage lighting in `body::before` (soft indigo, cyan, emerald fields) so `backdrop-filter: blur(20px)` refracts authentic glass vibrancy rather than flat pitch black.
  * **Specular Chamfers & Card Elevation:** Upgraded `--apple-shadow-card` with physical top chamfer specular highlights (`inset 0 1px 0 0 rgba(255, 255, 255, 0.22)`).
  * **High-Contrast Apple Typography:** Enforced `"Segoe UI Variable Display"`, `system-ui`, and `600` weight on `.metric-value strong` for crisp, punchy optical clarity under Windows ClearType.
  * **Elevated Segmented Pill Slider:** Transformed `switchTabs` with authentic macOS glass chiclet slider (`rgba(255, 255, 255, 0.18)` + specular inner border).
  * **Outlier-Resistant Latency Spline:** Clamped handshake/timeout spikes in `charts.js` so isolated 2600ms timeouts no longer flatten live ~1ms waves against the baseline.
  * **Activity Ring Readout Dimensions:** Expanded connection gauge to 104x60px for effortless readability.
  * **Cache Invalidation:** Bumped all asset queries to `?v=2.2.0` in `index.html`.

* **Phase 10: Interactive Static vs. Dynamic Deep-Dive, Member Spotlight & Layout Elevation (Deliverable D2 - Completed & Verified)**
  * **Prominent Glass Team Dossier & Problem Statement Banner:** Positioned below the titlebar with member avatar chips for Shashidhar, Shreyansh Raj, and Shaun Joe Soares.
  * **Member Hover Tooltip & Canvas Spotlight Glow:** Interactive popovers explaining individual code contributions with pulsating neon canvas spotlighting (dimming unrelated nodes, highlighting member components).
  * **Top-Level Navigation View Switcher:** Seamlessly toggles between "Live Network Operations" and "Static vs Dynamic Deep-Dive".
  * **Interactive Before/After Comparison Slider with Animations:** Drag slider revealing side-by-side animated packet flows (Static packet loss & timeouts vs Dynamic sub-2.5ms failover).
  * **Right-Column Decongestion (Segmented Deck Switcher):** Tabbed master switcher ('Metrics & Health', 'OpenFlow Rules', 'Event Stream') eliminating vertical squishing.
  * **Visual Bug Fixes:** Adaptive unit formatting for throughput (Mbps/kbps with `clamp()`), integer-snapped crisp Y-axis canvas text with 85% opacity, and complete utilization of the bottom-left space with an interactive viva quick-reference card.
  * **Comprehensive Verification:** 16/16 unit tests passing, all 7 frontend JavaScript modules passing AST syntax checks, zero runtime console errors.


