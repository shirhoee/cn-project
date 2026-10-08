# Dynamic SDN Mininet Application

A Python-based networking project demonstrating dynamic Software-Defined Networking (SDN) capabilities using Mininet and Ryu. Developed by Team 17 (Shashidhar, Shreyansh Raj, Shaun Joe Soares).

## Architecture Overview

This project proves that an SDN controller can dynamically route traffic based on real-time network conditions and application-level events.

- **Network:** A Mininet topology featuring a Core Switch connected to a Server Switch and a Client Switch. It includes a backup link to demonstrate failover.
- **Application Layer:** Multi-threaded Python TCP socket clients and servers.
- **SDN Controller:** 
  - `static_router.py`: A baseline OpenFlow 1.3 controller with rigid routing rules.
  - `dynamic_router.py`: An advanced controller that handles failover (via `PortStatus` events) and application-aware load balancing (via a Northbound REST API).

## Features & Scenarios

1. **Scenario 1: Link Failure Recovery** 
   If the core link fails, the controller detects the OpenFlow port-down event and instantly calculates and installs new flow rules to route traffic through the backup link, preserving connectivity.
   
2. **Scenario 2: Server Overload Load-Balancing**
   The application servers monitor their active connections. When the threshold is breached, they send an HTTP POST alert to the controller. The controller pushes Priority-20 OpenFlow rules to transparently redirect all new client requests to an underutilized replica server using NAT-style IP/MAC rewrites in the switch hardware.

## Setup & Requirements

1. **Linux Environment** (e.g., Ubuntu 20.04/22.04 VM or WSL2)
2. **Mininet:** `sudo apt-get install mininet`
3. **Ryu Controller:** `pip install ryu` (or `os-ken` if using Python 3.10+)

Install Python requirements:
```bash
pip install -r requirements.txt
```

---

## How to Run the Final Demonstration (Viva)

### Demo 1: Dynamic Server Load Balancing
This demonstrates the Northbound REST API integration.

1. **Start the Dynamic Controller:**
   ```bash
   ryu-manager src/controller/dynamic_router.py
   ```
2. **Start the Mininet Topology:**
   ```bash
   sudo python3 src/network/topology.py
   ```
3. **In the Mininet CLI (`mininet>`), start the servers:**
   ```bash
   mininet> server1 python3 src/app/server.py --port 9000 &
   mininet> server2 python3 src/app/server.py --port 9000 &
   ```
4. **Trigger the Overload from Client 1:**
   ```bash
   mininet> client1 python3 src/app/spam_client.py --ip 10.0.0.11 --count 3
   ```
5. **Verify Transparent Reroute from Client 2:**
   ```bash
   mininet> client2 python3 src/app/client.py --ip 10.0.0.11 --port 9000
   ```
   *Look at your logs: The request to `.11` will succeed, but Server 2 (.12) will log that it handled the connection!*

### Demo 2: Link Failure Recovery
This demonstrates OpenFlow PortStatus event handling.

1. Keep the controller and Mininet running from Demo 1.
2. Verify normal ping:
   ```bash
   mininet> client1 ping -c 1 server1
   ```
3. Break the primary link:
   ```bash
   mininet> link s1 s2 down
   ```
4. Verify recovery (the ping still works via the backup link!):
   ```bash
   mininet> client1 ping -c 1 server1
   ```

---

## Automated Performance Evaluation

To compare the static baseline against the dynamic SDN approach, run the evaluation scripts. This will output a `performance_metrics.csv` log.

**Evaluate Static Baseline:**
1. `ryu-manager src/controller/static_router.py`
2. `sudo python3 tests/evaluate_performance.py static`

**Evaluate Dynamic Controller:**
1. `ryu-manager src/controller/dynamic_router.py`
2. `sudo python3 tests/evaluate_performance.py dynamic`
