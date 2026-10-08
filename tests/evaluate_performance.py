#!/usr/bin/env python3
import sys
import os
import time

# Add parent directory to path to import topology
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.network.topology import DynamicAppTopo

from mininet.net import Mininet
from mininet.node import RemoteController, OVSSwitch
from mininet.log import setLogLevel, info

def run_evaluation(controller_script="static_router.py"):
    info(f"\n*** Running Evaluation against {controller_script} ***\n")
    
    # 1. Initialize Network
    topo = DynamicAppTopo(num_servers=2, num_clients=3)
    c0 = RemoteController('c0', ip='127.0.0.1', port=6653)
    net = Mininet(topo=topo, controller=c0, switch=OVSSwitch)
    net.addNAT().configDefault()
    net.start()
    
    time.sleep(2) # Wait for switches to connect to Ryu
    
    s1 = net.get('server1')
    s2 = net.get('server2')
    c1 = net.get('client1')
    c2 = net.get('client2')
    
    # 2. Start Servers
    info("*** Starting Server 1 & Server 2\n")
    s1.cmd("python3 src/app/server.py --port 9000 &")
    s2.cmd("python3 src/app/server.py --port 9000 &")
    time.sleep(1)
    
    # 3. Baseline Request (Healthy)
    info("*** Test 1: Baseline Request (No Overload)\n")
    out = c1.cmd("python3 src/app/client.py --ip 10.0.0.11 --port 9000")
    print(out)
    
    # 4. Trigger Overload (Overload condition)
    info("*** Test 2: Triggering Overload on Server 1\n")
    # c2 holds 3 connections open to server 1
    c2.cmd("python3 src/app/spam_client.py --ip 10.0.0.11 --count 3 &")
    time.sleep(2) # Give it time to report to Ryu
    
    # 5. Evaluate Response under Overload
    info("*** Test 3: Client Request During Overload\n")
    out = c1.cmd("python3 src/app/client.py --ip 10.0.0.11 --port 9000")
    print(out)
    
    # 6. Cleanup
    info("*** Cleaning up...\n")
    s1.cmd("pkill -f server.py")
    s2.cmd("pkill -f server.py")
    c2.cmd("pkill -f spam_client.py")
    net.stop()
    
    info("\n*** Evaluation Complete. Check performance_metrics.csv ***\n")

if __name__ == '__main__':
    setLogLevel('info')
    if len(sys.argv) > 1 and sys.argv[1] == "dynamic":
        run_evaluation("dynamic_router.py")
    else:
        run_evaluation("static_router.py")
