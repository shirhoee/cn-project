# Dynamic SDN Mininet Application

A high-performance Software-Defined Networking (SDN) project demonstrating dynamic fault tolerance and application-aware load balancing using **Mininet**, **OpenFlow 1.3**, and **OS-Ken** (the modernized, Python 3.10+ compatible Ryu controller framework).

Developed by **Team 17**:
* **Shashidhar** (Socket Programming & Application Layer)
* **Shreyansh Raj** (SDN Controller, REST API & OpenFlow Engineering)
* **Shaun Joe Soares** (Network Topology & Performance Benchmarking)

---

## 1. Architecture & Design

Traditional static networks cannot react when links fail or when servers experience sudden traffic surges. This project bridges application socket monitoring with centralized OpenFlow data plane control to demonstrate two key SDN capabilities:

1. **Dynamic Link Failure Recovery:** The controller monitors OpenFlow `PortStatus` events. If a primary switch link fails, the controller automatically recalculates paths and injects priority flow modifications over a redundant backup link.
2. **Application-Aware Server Load Balancing:** Multi-threaded socket servers monitor active client connections. When an overload threshold is exceeded, the server alerts the SDN controller via a Northbound REST API (`/api/overload`). The controller immediately injects Priority-20 NAT flow rewrites in hardware to transparently redirect subsequent requests to a replica server.

### Network Topology & Port Bindings

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

* **Switches:** `s1` (Core), `s2` (Server Aggregation), `s3` (Client Aggregation).
* **Hosts:**
  * `server1` (`10.0.0.11`, MAC `00:00:00:00:00:0b`) connected to `s2` Port 2.
  * `server2` (`10.0.0.12`, MAC `00:00:00:00:00:0c`) connected to `s2` Port 3.
  * `client1` (`10.0.0.21`, MAC `00:00:00:00:00:15`) connected to `s3` Port 2.
  * `client2` (`10.0.0.22`, MAC `00:00:00:00:00:16`) connected to `s3` Port 3.
  * `client3` (`10.0.0.23`, MAC `00:00:00:00:00:17`) connected to `s3` Port 4.
* **Redundant Link:** `s2` Port 4 <---> `s3` Port 5 (isolated by loop guards during normal operation, active upon failover).

---

## 2. Prerequisites & Environment Setup

Supported on Linux (Ubuntu 20.04, 22.04, 24.04, or 26.04) and Windows Subsystem for Linux 2 (**WSL2**).

### Step 1: Install System Packages
Open your terminal (or run `wsl` in PowerShell) and install Mininet, Open vSwitch, and Pip:
```bash
sudo apt update
sudo apt install -y mininet openvswitch-switch python3-pip
```

### Step 2: Start Open vSwitch Service
On WSL2, background daemons do not launch automatically on boot. Start the switch service manually:
```bash
sudo service openvswitch-switch start
```

### Step 3: Install OS-Ken Controller
Install the pinned `os-ken` package (version `<=3.1.1` provides the standalone `osken-manager` CLI executable):
```bash
sudo pip3 install "os-ken<=3.1.1" --break-system-packages
```

### Step 4: Verify Installation
Verify that `osken-manager` is available:
```bash
osken-manager --version
```
*(Should output `osken-manager 3.1.1`).*

---

## 3. How to Run the Demonstration (Viva Walkthrough)

You will need **two terminal windows / tabs**.

> [!TIP]
> If Mininet is ever closed abruptly or switches stay bound, run `sudo mn -c` to cleanly reset all virtual interfaces and flows.

### Step A: Start the Controller (Terminal 1)
```bash
osken-manager src/controller/dynamic_router.py
```
Leave this running. You will see:
```text
loading app src/controller/dynamic_router.py
loading app os_ken.controller.ofp_handler
instantiating app src/controller/dynamic_router.py of DynamicRouter13
DynamicRouter Web Dashboard & REST API live at: http://0.0.0.0:8080/
instantiating app os_ken.controller.ofp_handler of OFPHandler
```

### Step B: Open the Live Web Telemetry Dashboard (Browser)
Open your browser (Chrome, Edge, or Firefox on Windows or Linux) and navigate to:
👉 **[http://localhost:8080/](http://localhost:8080/)**

> [!TIP]
> **Accessing from Windows Host under WSL2:**
> In most Windows 10/11 environments, WSL2 automatically forwards `localhost:8080` to Windows. If your browser cannot reach `localhost:8080` due to Windows firewall rules, retrieve your WSL2 IP address by running `hostname -I` in your terminal (e.g. `172.x.x.x`) and navigate to `http://<WSL_IP>:8080/`.

The dashboard provides a real-time, zero-dependency visual interface engineered specifically for academic demonstration:
* **Interactive 60 FPS Topology Visualizer:** Displays switches, servers, clients, and animated packet flows scaled crisply at any DPI.
* **Click-to-Trace Forwarding Path:** Click any client (e.g., `client1`) and then a server (e.g., `server1` or `server2`) to highlight the active hop-by-hop OpenFlow routing corridor.
* **Live Link State Transitions:** Watch primary links sever and pulse red while the redundant standby link illuminates in electric blue upon failover.
* **Dynamic Hardware NAT Visualizer:** Watch client requests to `10.0.0.11` turn amber and divert to `10.0.0.12` when Server 1 reports overload.
* **Real-Time Performance Metrics:**
  * **RTT Latency:** Live download latency with rolling median calculation.
  * **Peak Throughput:** Instantaneous transfer rate in kbps.
  * **Failover Speed Stopwatch:** Hardware OpenFlow flow modification duration measured in sub-milliseconds (`< 2.5 ms`).
  * **Active Connection Radial Gauge:** Color-coded meter tracking concurrent server load against the threshold limit.
* **Static Baseline vs. Dynamic SDN Grouped Bar Chart:** Real-time visual comparison of Latency, Throughput, and Success Rate (100% vs 33%) pulled directly from `performance_metrics.csv`.
* **Hardware Flow Table Inspector:** Real-time tabbed view of active OpenFlow 1.3 rules across Core (`s1`), Server (`s2`), and Client (`s3`) switches with dynamic rule change diff chips (`+2 rules`).
* **Live Event Stream Console:** Timestamped feed of controller events with category filter chips (`All`, `Link`, `Failover`, `Overload`, `NAT`) and one-click JSON export.
* **One-Click Simulation Triggers & Presenter Mode:** Demo buttons and keyboard accelerators to trigger failover, overload, or presenter mode instantly.

#### Keyboard Shortcuts

| Key | Action | Description |
| :---: | :--- | :--- |
| <kbd>1</kbd> | **Trigger Overload** | Injects 3 concurrent connections on `server1` to trigger Priority-20 NAT rerouting |
| <kbd>2</kbd> | **Trigger Failover** | Simulates `link s1 s2 down` to activate the backup corridor `s2-s3` |
| <kbd>R</kbd> | **Reset System** | Flushes dynamic flows, resets link states, and restores baseline health |
| <kbd>P</kbd> | **Presenter Mode** | Toggles high-contrast, enlarged presentation mode for projector displays |
| <kbd>S</kbd> | **Packet Stream** | Toggles animated packet particle flow on/off |
| <kbd>?</kbd> | **Shortcuts Guide** | Opens the in-app interactive keyboard shortcut modal |

### Step C: Start the Mininet Network (Terminal 2)
In a second terminal window:
```bash
cd /mnt/e/cn\ project
sudo python3 src/network/topology.py
```
This drops you into the interactive prompt:
```text
mininet>
```

---

### Demo 1: Dynamic Server Load Balancing (Northbound REST API)

1. **Inside the Mininet CLI, start the backend servers:**
   ```bash
   mininet> server1 python3 src/app/server.py --port 9000 &
   mininet> server2 python3 src/app/server.py --port 9000 &
   ```

2. **Send a baseline request (healthy state):**
   ```bash
   mininet> client1 python3 src/app/client.py --ip 10.0.0.11 --port 9000
   ```
   *Result:* Request connects to `10.0.0.11` and completes in ~1 ms.

3. **Simulate high concurrent traffic to trigger overload on Server 1:**
   ```bash
   mininet> client1 python3 src/app/spam_client.py --ip 10.0.0.11 --count 3 &
   ```
   *Result:* Server 1 reaches 3 active connections, exceeds threshold (2), and fires an HTTP POST alert to `http://127.0.0.1:8080/api/overload`.
   *Terminal 1 Output:*
   ```text
   *** REST API ALERT: Server at 10.0.0.11 reported OVERLOAD! Active connections: 3 ***
   Installing flow rules on Core Switch (s1) to redirect traffic to Server 2.
   ```

4. **Verify transparent hardware rerouting:**
   ```bash
   mininet> client2 python3 src/app/client.py --ip 10.0.0.11 --port 9000
   ```
   *Result:* Client 2 sends its request to `10.0.0.11`, but the switch hardware transparently rewrites packet headers and routes to `Server 2` (`10.0.0.12`). Look at the logs: Server 2 services the request seamlessly!

---

### Demo 2: Dynamic Link Failure Recovery (PortStatus Event)

1. **Verify baseline end-to-end connectivity:**
   ```bash
   mininet> client1 ping -c 1 server1
   ```

2. **Sever the primary link between Core Switch `s1` and Server Switch `s2`:**
   ```bash
   mininet> link s1 s2 down
   ```
   *Terminal 1 Output:*
   ```text
   *** LINK DOWN DETECTED: Switch 1, Port 1 ***
   Executing Failover: Rerouting traffic over backup link (s2-s3)!
   *** LINK DOWN DETECTED: Switch 2, Port 1 ***
   Executing Failover: Rerouting traffic over backup link (s2-s3)!
   ```

3. **Verify seamless recovery over the backup link:**
   ```bash
   mininet> client1 ping -c 2 server1
   ```
   *Result:* 0% packet loss! Traffic immediately travels through the redundant `s2 <-> s3` link without dropping client connections.

---

## 4. Viva Examination Runbook (6-Step Checklist)

Follow this 6-step script during your oral examination / viva presentation:

```text
[Step 1: Baseline Health]
   ├── Browser: All status pills green, Server 1 gauge at 0 conns, 0% packet loss.
   ├── Action: client1 python3 src/app/client.py --ip 10.0.0.11 --port 9000
   └── Observation: Request completes in ~1.0 ms. Cyan particles travel s3 -> s1 -> s2 -> server1.

[Step 2: Server Overload & Priority-20 NAT]
   ├── Action: In Mininet, run 'client1 python3 src/app/spam_client.py --ip 10.0.0.11 --count 3 &'
   │           (Or click the 'DEMO Overload' button / press '1' in browser)
   ├── Observation:
   │   ├── Red toast appears: "Server 1 Overload Detected"
   │   ├── Connection gauge swings into the red zone (> 2 conns)
   │   ├── Live particle stream changes color to AMBER and redirects to replica server2 (10.0.0.12)
   │   └── Switch s1 flow table dynamically adds Priority-20 NAT flow rule (diff chip: +1 rules)
   └── Verification: client2 connects to 10.0.0.11 and receives response with zero timeout!

[Step 3: Link Failure Recovery & Failover Speed]
   ├── Action: In Mininet, run 'mininet> link s1 s2 down' (or click 'DEMO Failover' / press '2')
   ├── Observation:
   │   ├── Toast: "Failover Corridor Activated"
   │   ├── Primary link s1-s2 pulses red with severed markers
   │   ├── Redundant link s2-s3 illuminates in electric blue with travelling energy pulses
   │   ├── Metric "Failover Speed" displays hardware flow mod time (< 2.5 ms)
   │   └── Switches s2 and s3 flow tables update with Priority-20 failover bypass rules
   └── Verification: 'client1 ping -c 2 server1' exhibits 0% packet loss!

[Step 4: Interactive Path Verification (Click-to-Trace)]
   ├── Action: Click 'client1', then click 'server2' on the canvas visualizer
   └── Observation: Hop-by-hop forwarding corridor illuminates with animated neon glow rings.

[Step 5: Static vs. Dynamic Evaluation Comparison]
   ├── Point to Panel: "Static Baseline vs. Dynamic SDN" canvas chart
   └── Explain to Examiner:
       ├── Dynamic SDN achieves 100% success rate with ~0.7 ms latency.
       └── Static routing drops to 33% success rate with ~2000 ms timeout when link is severed.

[Step 6: Reset to Healthy Baseline]
   ├── Action: Click 'Reset to Healthy' button (or press 'R')
   └── Observation: Dynamic flow rules flushed, primary links restored, status pills return to green.
```

---

## 5. Automated Performance Evaluation

To compare the static baseline against the dynamic SDN approach and record latency and throughput into `performance_metrics.csv`:

1. **Evaluate Static Baseline:**
   * Terminal 1: `osken-manager src/controller/static_router.py`
   * Terminal 2: `sudo python3 tests/evaluate_performance.py static`

2. **Evaluate Dynamic Controller:**
   * Terminal 1: `osken-manager src/controller/dynamic_router.py`
   * Terminal 2: `sudo python3 tests/evaluate_performance.py dynamic`

3. **Review Results:**
   Check `performance_metrics.csv` to inspect latency, throughput, and status across runs.

---

## 6. Repository Structure

```text
cn_project/
├── PRD.md                         # Product Requirements Document & Rubric Mapping
├── PROJECT_PLAN.md                # Task delegation & team roles
├── README.md                      # Architecture and demonstration runbook
├── requirements.txt               # Pinned Python package dependencies
├── performance_metrics.csv        # Benchmarking evaluation log
├── plans/                         # Implementation feature plans
│   ├── phase-5-docs-cleanup-and-verification.md
│   ├── phase-6-live-telemetry-dashboard.md
│   └── phase-7-dashboard-polish.md
├── src/
│   ├── app/
│   │   ├── client.py              # TCP socket client with latency tracking
│   │   ├── server.py              # Multi-threaded TCP server with REST alert
│   │   └── spam_client.py         # Concurrent connection stress tool
│   ├── controller/
│   │   ├── dynamic_router.py      # Failover + REST + Live Web Dashboard controller
│   │   ├── static_router.py       # Baseline static OpenFlow 1.3 controller
│   │   └── telemetry_handler.py   # Telemetry Registry & Dashboard HTTP Handler (SSE)
│   ├── dashboard/                 # Zero-dependency browser visualizer
│   │   ├── index.html             # Main dashboard UI
│   │   ├── styles.css             # Glassmorphism dark-mode styling
│   │   └── js/
│   │       ├── app.js             # Dashboard controller & keyboard shortcuts
│   │       ├── charts.js          # Canvas time-series latency/throughput graph
│   │       ├── comparison.js      # Static vs Dynamic grouped bar comparison chart
│   │       ├── gauge.js           # Radial arc meter for server connections
│   │       ├── toast.js           # Slide-down toast alert notification banner
│   │       └── topology_canvas.js # 60 FPS HTML5 Canvas animated packet flow & trace
│   ├── network/
│   │   ├── start_network.sh       # Convenience starter script
│   │   └── topology.py            # Mininet topology with explicit ports & static ARP
│   └── utils/
│       └── logger.py              # CSV performance metrics logger
└── tests/
    ├── evaluate_performance.py    # Automated comparative test harness
    ├── evaluate_performance.sh    # Evaluation guide wrapper
    ├── test_dashboard_api.py      # Integration test for dashboard endpoints
    └── test_sanity.py             # Repository & topology sanity assertions
```
