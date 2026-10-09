# Project Plan & Task Delegation

## Team 17
* Shashidhar
* Shreyansh Raj
* Shaun Joe Soares

---

## 1. Project Aims & Objectives
Our final project aims to demonstrate a highly resilient, application-aware Software-Defined Network (SDN). Traditional static networks struggle to seamlessly recover from link failures or dynamically distribute load during sudden spikes in traffic. 

We are building a custom Mininet topology managed by a centralized OpenFlow controller (`os-ken`). The final system aims to achieve two advanced networking scenarios:
1. **Dynamic Link Failure Recovery:** The SDN controller will actively monitor port statuses. If a core switch link goes down, the controller will automatically calculate and install new OpenFlow rules to reroute active traffic over a backup path, preventing connection drops.
2. **Application-Aware Load Balancing:** We are building custom Python TCP servers and clients. The servers will monitor their concurrent connection load. Once a threshold is breached, the server will communicate directly with the SDN controller's Northbound REST API. The controller will then dynamically push hardware-level flow rewrites (NAT) to transparently redirect new incoming client requests to an underutilized replica server.

Ultimately, the project will benchmark this dynamic SDN approach against a rigid, static routing baseline to prove quantifiable improvements in network throughput and reliability.

---

## 2. Task Delegation (Building Stage)

The project architecture has been logically divided into three primary domains to ensure parallel development and equal contribution.

### Team Member 1: Shreyansh Raj
**Role: SDN Controller & Flow Engineering**
Shreyansh is responsible for the "brain" of the network, managing the `os-ken` controller logic and OpenFlow rule manipulation.
*   **Controller Scaffolding:** Set up the base `os-ken` controller application capable of L2 learning and installing static baseline routes.
*   **REST API Integration:** Build the WSGI web server inside the controller to expose a Northbound REST API (`/api/overload`) that can receive alerts from the application layer.
*   **Dynamic Flow Rewriting (NAT):** Write the OpenFlow 1.3 `OFPFlowMod` logic that intercepts packets, rewrites destination/source IP and MAC addresses in the hardware data plane, and redirects traffic to replica servers during an overload event.
*   **Link Failover Logic:** Implement the `EventOFPPortStatus` handler to detect downed links and seamlessly failover traffic to backup paths.

### Team Member 2: Shashidhar
**Role: Socket Programming & Application Logic**
Shashidhar is responsible for the application layer that sits on top of the network, ensuring the client-server ecosystem is robust and can communicate its state to the network layer.
*   **Concurrent Server Development:** Write the low-level, multi-threaded Python TCP server (`server.py`) capable of handling simultaneous client connections and tracking active load.
*   **Client Implementation:** Develop the TCP client script (`client.py`) that fetches content, measures download latency, and handles socket timeouts.
*   **Overload Alert System:** Implement the threshold logic within the server. When concurrent connections exceed the limit, the server must autonomously trigger an HTTP POST request (via `urllib`) to the SDN controller's REST API.
*   **Stress Testing Tools:** Build a specialized "spam client" script to intentionally hold open connections and artificially trigger the server overload states for testing.

### Team Member 3: Shaun Joe Soares
**Role: Network Topology & Performance Evaluation**
Shaun is responsible for the Mininet data plane infrastructure and the metrics infrastructure needed to evaluate the final project's success.
*   **Custom Mininet Topology:** Design and code the `topology.py` script to generate a parameterized network with core switches, edge switches, redundant failover links, and Mininet NAT nodes for out-of-band REST API access.
*   **Metrics Logging:** Create a centralized CSV logging utility (`logger.py`) to systematically record timestamps, latencies, throughput, and packet-loss events across all network nodes.
*   **Automated Benchmarking Suite:** Write the `evaluate_performance.py` orchestration scripts that automatically start the network, trigger normal requests, trigger failures/overloads, and output comparison metrics between the static and dynamic controllers.
*   **Data Analysis:** Compile the final CSV outputs into the comparison metrics required for the project report/presentation.

---
*Note: The project is currently in the active building and integration stage. Core components are being written and tested locally before the final end-to-end integration.*
