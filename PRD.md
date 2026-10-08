# Product Requirements Document (PRD): Mininet-Based Dynamic SDN Application

## 1. Product Overview

**Problem Statement:**  
Traditional static networks cannot seamlessly recover from link failures or dynamically distribute load during sudden spikes in traffic. This project aims to demonstrate a smart, application-aware Software-Defined Network (SDN) that dynamically reroutes traffic and balances server load based on real-time network conditions and application-level events.

**Target Audience:**  
Network engineering students, educators, and the evaluation committee (Team 17). It serves as a proof-of-concept for dynamic SDN functionality using OpenFlow.

**Success Criteria:**  
- **Phase 1 (D1):** Socket clients can successfully request and receive content from socket servers across the Mininet topology.
- **Phase 2 (D2):** The SDN controller dynamically manages the network, effectively passing two challenging scenarios:
  1. **Simulated Link Failure:** Traffic seamlessly reroutes to an alternate path when a link is brought down via Mininet CLI.
  2. **Server Overload / Congestion:** When a server threshold is breached by high concurrent socket requests, new traffic is actively redirected to an underutilized replica server.
- **Performance Evaluation:** Logging demonstrates a marked improvement in reliability and throughput when comparing the dynamic SDN approach against a baseline static routing approach.

---

## 2. MVP Scope & User Stories

**Core Features:**
- **Custom Mininet Topology:** Multiple switches, multiple content servers (replicas), and multiple clients.
- **Concurrent Python Sockets:** TCP/UDP clients that request files, and multi-threaded servers that serve them.
- **SDN Controller (Ryu):** A centralized OpenFlow 1.3 controller with a Northbound REST API.
- **Dynamic Link Recovery:** Controller listens for OpenFlow PortStatus events to recalculate paths and rewrite flow tables instantly.
- **Application-Driven Load Balancing:** Servers monitor their own load (or controller polls switch stats). When overloaded, an HTTP POST to the controller triggers traffic redirection to a replica server.

**User Stories:**
- *As a client node, I want to request a file using a Python socket script so that I can download content reliably.*
- *As a server node, I want to handle multiple concurrent client connections without crashing.*
- *As a server node, I want to notify the SDN controller via REST API when I reach my concurrency threshold so that new requests are redirected to Server B.*
- *As an SDN controller, I want to detect link failures immediately and install alternate routing rules so that active socket connections survive the network disruption.*
- *As an evaluator, I want to compare static flow rules vs. dynamic flow rules through generated logs to verify performance improvements.*

---

## 3. Out of Scope
- Graphical User Interfaces (GUIs). Everything will be CLI-based.
- Complex authentication, encryption (TLS/SSL), or database integration.
- Distributed controllers (a single centralized Ryu controller will be used).
- Support for protocols outside of standard IPv4, TCP, UDP, and OpenFlow.

---

## 4. Tech Stack & Architecture

- **Network Emulator:** Mininet
- **SDN Controller:** Ryu (or `os-ken` if using Python 3.10+) leveraging OpenFlow 1.3
- **Application Nodes:** Python 3 (built-in `socket`, `threading`, `urllib.request` for REST calls)
- **Controller API:** Ryu's built-in WSGI/REST framework
- **Baseline Comparison:** Hardcoded static flow rules installed at startup (does not change based on load or failures).
- **Architecture Flow:**
  - Client -> Switch -> Server (Socket Communication)
  - Controller <-> Switch (OpenFlow 1.3 Protocol)
  - Server -> Controller (Northbound REST API via HTTP POST for overload events)

---

## 5. Directory Structure

```text
cn_project/
├── .gitignore
├── requirements.txt
├── README.md
├── PRD.md
├── src/
│   ├── network/
│   │   ├── topology.py          # Mininet custom topology script
│   │   └── start_network.sh     # Shell script to start Mininet and set up NAT
│   ├── controller/
│   │   ├── static_router.py     # Baseline static Ryu application
│   │   └── dynamic_router.py    # Advanced Ryu application (REST API, failover, load balancing)
│   ├── app/
│   │   ├── client.py            # Python TCP/UDP socket client
│   │   ├── server.py            # Python concurrent socket server
│   │   └── spam_client.py       # Specialized client to trigger overload (Scenario 2)
│   └── utils/
│       └── logger.py            # Performance evaluation and metrics logging
└── tests/
    ├── test_sockets.py
    └── evaluate_performance.sh  # Script to run baseline vs dynamic evaluation
```

---

## 6. Phases of Work (Implementation Roadmap)

**Phase 1: Foundation & Low-Level Sockets (Phase 1 / D1)**
1. Construct the custom Mininet topology (`src/network/topology.py`) with NAT configured for Northbound API access.
2. Implement the concurrent socket server (`src/app/server.py`) and basic client (`src/app/client.py`).
3. Write the baseline `static_router.py` Ryu controller to prove basic end-to-end connectivity (The static evaluation baseline).
4. *Validation:* Clients can successfully fetch content from servers.

**Phase 2: SDN Controller & REST API Integration**
1. Scaffold `dynamic_router.py` using Ryu's WSGI framework to expose REST endpoints (e.g., `/api/overload`).
2. Integrate HTTP POST requests into `server.py` to trigger the REST API when the concurrency threshold is met.
3. *Validation:* Controller logs output upon receiving REST requests from Mininet hosts.

**Phase 3: The Challenging Scenarios (Phase 2 / D2)**
1. **Scenario 1 (Link Failure):** Implement OpenFlow `PortStatus` event handlers in `dynamic_router.py` to detect down links and dynamically compute/install shortest-path flow rules.
2. **Scenario 2 (Server Overload):** Implement flow rewriting logic in `dynamic_router.py` so that when Server A reports overload via REST, the controller installs rules to rewrite destination IPs/MACs and redirect new clients to Server B.
3. Write the `spam_client.py` script to generate high concurrent traffic.

**Phase 4: Evaluation & Polish**
1. Build `utils/logger.py` to record latency, throughput, and failover times.
2. Write `evaluate_performance.sh` to run the topology twice (once with static controller, once with dynamic controller) and output comparison metrics.
3. Final code cleanup and `README.md` instructions for the demo.
