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

        # Link switches
        self.addLink(s1, s2) # s1: port 1, s2: port 1
        self.addLink(s1, s3) # s1: port 2, s3: port 1
        self.addLink(s2, s3) # Backup link! s2: port 4, s3: port 5

        # Add servers
        for i in range(1, num_servers + 1):
            host_name = f'server{i}'
            ip_addr = f'10.0.0.{10+i}'
            mac_addr = f'00:00:00:00:00:{10+i:02x}'
            h = self.addHost(host_name, ip=ip_addr, mac=mac_addr)
            self.addLink(h, s2)
            
        # Add clients
        for i in range(1, num_clients + 1):
            host_name = f'client{i}'
            ip_addr = f'10.0.0.{20+i}'
            mac_addr = f'00:00:00:00:00:{20+i:02x}'
            h = self.addHost(host_name, ip=ip_addr, mac=mac_addr)
            self.addLink(h, s3)

def run():
    topo = DynamicAppTopo(num_servers=2, num_clients=3)
    
    # Use RemoteController (Ryu/os-ken)
    c0 = RemoteController('c0', ip='127.0.0.1', port=6653)
    
    net = Mininet(topo=topo, controller=c0, switch=OVSSwitch)
    
    # Add NAT to allow hosts to talk to the controller's REST API on 127.0.0.1/host IP
    net.addNAT().configDefault()
    
    net.start()
    info("*** Topology started. Testing basic connectivity requires Ryu to be running.\n")
    CLI(net)
    net.stop()

if __name__ == '__main__':
    setLogLevel('info')
    run()
