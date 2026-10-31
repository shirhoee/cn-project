#!/usr/bin/env python3
import sys
from mininet.net import Mininet
from mininet.node import RemoteController, OVSSwitch
from mininet.cli import CLI
from mininet.log import setLogLevel, info
from mininet.topo import Topo

class DynamicAppTopo(Topo):
    """
    Custom Mininet Topology
    s1 (Core) -> s2 (Server Switch), s3 (Client Switch)
    Servers connect to s2
    Clients connect to s3
    """
    def build(self, num_servers=2, num_clients=3):
        # Add switches
        s1 = self.addSwitch('s1', protocols='OpenFlow13')
        s2 = self.addSwitch('s2', protocols='OpenFlow13')
        s3 = self.addSwitch('s3', protocols='OpenFlow13')

        # Primary links to Core Switch (s1)
        self.addLink(s1, s2, port1=1, port2=1) # s1: port 1, s2: port 1
        self.addLink(s1, s3, port1=2, port2=1) # s1: port 2, s3: port 1

        # Add servers to s2 (server1: port 2, server2: port 3)
        for i in range(1, num_servers + 1):
            host_name = f'server{i}'
            ip_addr = f'10.0.0.{10+i}'
            mac_addr = f'00:00:00:00:00:{10+i:02x}'
            h = self.addHost(host_name, ip=ip_addr, mac=mac_addr)
            self.addLink(h, s2, port1=0, port2=1+i)
            
        # Add clients to s3 (client1: port 2, client2: port 3, client3: port 4)
        for i in range(1, num_clients + 1):
            host_name = f'client{i}'
            ip_addr = f'10.0.0.{20+i}'
            mac_addr = f'00:00:00:00:00:{20+i:02x}'
            h = self.addHost(host_name, ip=ip_addr, mac=mac_addr)
            self.addLink(h, s3, port1=0, port2=1+i)

        # Redundant Backup link between s2 and s3 (s2: port 4, s3: port 5)
        self.addLink(s2, s3, port1=4, port2=5)

def run():
    topo = DynamicAppTopo(num_servers=2, num_clients=3)
    
    # Use RemoteController (os-ken / Ryu) on standard OpenFlow port 6653
    c0 = RemoteController('c0', ip='127.0.0.1', port=6653)
    
    net = Mininet(topo=topo, controller=c0, switch=OVSSwitch)
    
    # Add NAT to allow hosts to talk to the controller's REST API on 127.0.0.1/host IP
    net.addNAT().configDefault()
    
    net.start()
    # Pre-populate host ARP tables to avoid broadcast flooding storms over loops
    net.staticArp()

    info("*** Topology started. Controller (osken-manager) must be running.\n")
    CLI(net)
    net.stop()

if __name__ == '__main__':
    setLogLevel('info')
    run()
