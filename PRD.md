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
│   └── phase-5-docs-cleanup-and-verification.md
├── src/
│   ├── app/
│   │   ├── client.py              # TCP socket client measuring latency & throughput
│   │   ├── server.py              # Multi-threaded TCP server with REST overload notification
│   │   └── spam_client.py         # Concurrent connection generator for load triggering
│   ├── controller/
│   │   ├── dynamic_router.py      # Reactive SDN controller (Failover + REST load balancing)
│   │   └── static_router.py       # Baseline static OpenFlow 1.3 controller
│   ├── network/
│   │   ├── start_network.sh       # Convenience starter script for Mininet
│   │   └── topology.py            # Mininet topology script with explicit port bindings
│   └── utils/
│       └── logger.py              # Centralized CSV performance metrics logger
└── tests/
    ├── evaluate_performance.py    # Automated Mininet evaluation comparing static vs dynamic
    ├── evaluate_performance.sh    # Evaluation execution helper script
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

* **Phase 7: Presentation-Grade UI Polish & Real-Time Pipeline (Deliverable D2 - Completed)**
  * **Real-Time Data Pipeline:** Upgraded from plain polling to Server-Sent Events (`GET /api/stream`) with auto-reconnection and connection watchdog overlay.
  * **Failover Recovery Stopwatch:** Controller accurately records microsecond-precision hardware flow mod duration (< 2.5 ms) displayed in the real-time metrics row.
  * **Active Connection Gauge:** Radial canvas arc meter visually showing active connections against overload threshold (0 to 3+ conns).
  * **Static vs. Dynamic Evaluation Chart:** Interactive grouped bar chart pulling from `performance_metrics.csv` to visually present the 100% vs 33% reliability advantage for examiners.
  * **Click-to-Trace Forwarding Verification:** Interactive canvas tool allowing users to click a client then a server to highlight the active hop-by-hop forwarding path.
  * **One-Click Simulation Triggers:** Built-in DEMO buttons for instantaneous failover and overload demonstration directly from the web interface.
  * **Presenter Mode & Keyboard Shortcuts:** High-contrast projector mode and keyboard accelerators (`1`, `2`, `R`, `P`, `S`, `?`) for smooth viva presentation.

