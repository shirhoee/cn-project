import json
import threading
import http.server
from os_ken.base import app_manager
from os_ken.controller import ofp_event
from os_ken.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER
from os_ken.controller.handler import set_ev_cls
from os_ken.ofproto import ofproto_v1_3
from os_ken.lib.packet import packet
from os_ken.lib.packet import ethernet
from os_ken.lib.packet import ether_types

import sys, os
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
from src.controller.telemetry_handler import TelemetryRegistry, DashboardHttpHandler


class DynamicRouter13(app_manager.OSKenApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]

    def __init__(self, *args, **kwargs):
        super(DynamicRouter13, self).__init__(*args, **kwargs)
        self.mac_to_port = {}
        self.datapaths = {}
        self.failover_active = False
        self.verbose = False

        # Telemetry registry for live web dashboard
        self.registry = TelemetryRegistry()

        # Start Web Dashboard & Northbound REST API Server on port 8080
        self.start_dashboard_server(port=8080)

    def start_dashboard_server(self, port=8080):
        try:
            server = http.server.ThreadingHTTPServer(('0.0.0.0', port), DashboardHttpHandler)
            server.router_app = self
            server_thread = threading.Thread(target=server.serve_forever, daemon=True)
            server_thread.start()
            self.logger.info(f"DynamicRouter Web Dashboard & REST API live at: http://0.0.0.0:{port}/")
        except Exception as e:
            self.logger.error(f"Failed to start Dashboard server: {e}")

    def trigger_overload_redirection(self, server_ip, active_connections):
        self.logger.info(
            f"*** REST API ALERT: Server at {server_ip} reported OVERLOAD! "
            f"Active connections: {active_connections} ***"
        )
        self.registry.record_server_overload(server_ip, active_connections)

        # Scenario 2: Server Overload Load-Balancing
        if server_ip == "10.0.0.11":
            dp1 = self.datapaths.get(1)
            if dp1:
                ofproto = dp1.ofproto
                parser = dp1.ofproto_parser

                self.logger.info("Installing flow rules on Core Switch (s1) to redirect traffic to Server 2.")

                # 1. Forward trip: Redirect client traffic intended for Server 1 to Server 2
                match_forward = parser.OFPMatch(eth_type=0x0800, ipv4_dst="10.0.0.11")
                actions_forward = [
                    parser.OFPActionSetField(ipv4_dst="10.0.0.12"),
                    parser.OFPActionSetField(eth_dst="00:00:00:00:00:0c"),
                    parser.OFPActionOutput(1) # Send to Server switch (s2)
                ]
                self.add_flow(dp1, 20, match_forward, actions_forward)
                self.registry.record_flow(
                    dpid=1, priority=20, flow_type="DYNAMIC_NAT",
                    match_str="eth_type=0x0800, ipv4_dst=10.0.0.11",
                    actions_str="SET_FIELD(ipv4_dst=10.0.0.12, eth_dst=00:00:00:00:00:0c), OUTPUT(1)",
                    desc="Forward NAT: Redirect Server 1 requests to Server 2"
                )

                # 2. Return trip: Rewrite Server 2's responses to look like they came from Server 1
                match_return = parser.OFPMatch(eth_type=0x0800, ipv4_src="10.0.0.12")
                actions_return = [
                    parser.OFPActionSetField(ipv4_src="10.0.0.11"),
                    parser.OFPActionSetField(eth_src="00:00:00:00:00:0b"),
                    parser.OFPActionOutput(2) # Send to Client switch (s3)
                ]
                self.add_flow(dp1, 20, match_return, actions_return)
                self.registry.record_flow(
                    dpid=1, priority=20, flow_type="DYNAMIC_NAT",
                    match_str="eth_type=0x0800, ipv4_src=10.0.0.12",
                    actions_str="SET_FIELD(ipv4_src=10.0.0.11, eth_src=00:00:00:00:00:0b), OUTPUT(2)",
                    desc="Reverse NAT: Disguise Server 2 responses as Server 1"
                )

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        dpid = datapath.id
        self.datapaths[dpid] = datapath

        # Update telemetry registry
        self.registry.record_switch_connected(dpid)

        # Install table-miss flow entry (send to controller)
        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                          ofproto.OFPCML_NO_BUFFER)]
        self.add_flow(datapath, 0, match, actions)
        self.registry.record_flow(
            dpid=dpid, priority=0, flow_type="TABLE_MISS",
            match_str="WILDCARD (*)",
            actions_str="OUTPUT(CONTROLLER)",
            desc="Table-miss fallback: buffer to controller"
        )

        self.logger.info(f"Switch {dpid} connected. Installing base static rules.")

        # Fixed topology routing rules:
        # s1: Core Switch (port 1 -> s2, port 2 -> s3)
        if dpid == 1:
            self.install_and_record_static(datapath, "00:00:00:00:00:0b", 1, "Route to server1 via port 1")
            self.install_and_record_static(datapath, "00:00:00:00:00:0c", 1, "Route to server2 via port 1")
            self.install_and_record_static(datapath, "00:00:00:00:00:15", 2, "Route to client1 via port 2")
            self.install_and_record_static(datapath, "00:00:00:00:00:16", 2, "Route to client2 via port 2")
            self.install_and_record_static(datapath, "00:00:00:00:00:17", 2, "Route to client3 via port 2")

        # s2: Server Switch (port 1 -> s1, port 2 -> server1, port 3 -> server2, port 4 -> backup s3)
        elif dpid == 2:
            self.install_and_record_static(datapath, "00:00:00:00:00:0b", 2, "Deliver to server1 (Port 2)")
            self.install_and_record_static(datapath, "00:00:00:00:00:0c", 3, "Deliver to server2 (Port 3)")
            self.install_and_record_static(datapath, "00:00:00:00:00:15", 1, "Forward to client1 via Core s1 (Port 1)")
            self.install_and_record_static(datapath, "00:00:00:00:00:16", 1, "Forward to client2 via Core s1 (Port 1)")
            self.install_and_record_static(datapath, "00:00:00:00:00:17", 1, "Forward to client3 via Core s1 (Port 1)")
            # Loop guard on backup link port 4
            self.add_flow(datapath, 5, parser.OFPMatch(in_port=4), [])
            self.registry.record_flow(
                dpid=2, priority=5, flow_type="LOOP_GUARD",
                match_str="in_port=4", actions_str="DROP",
                desc="Drop standby backup traffic to prevent loops"
            )

        # s3: Client Switch (port 1 -> s1, port 2 -> client1, port 3 -> client2, port 4 -> client3, port 5 -> backup s2)
        elif dpid == 3:
            self.install_and_record_static(datapath, "00:00:00:00:00:15", 2, "Deliver to client1 (Port 2)")
            self.install_and_record_static(datapath, "00:00:00:00:00:16", 3, "Deliver to client2 (Port 3)")
            self.install_and_record_static(datapath, "00:00:00:00:00:17", 4, "Deliver to client3 (Port 4)")
            self.install_and_record_static(datapath, "00:00:00:00:00:0b", 1, "Forward to server1 via Core s1 (Port 1)")
            self.install_and_record_static(datapath, "00:00:00:00:00:0c", 1, "Forward to server2 via Core s1 (Port 1)")
            # Loop guard on backup link port 5
            self.add_flow(datapath, 5, parser.OFPMatch(in_port=5), [])
            self.registry.record_flow(
                dpid=3, priority=5, flow_type="LOOP_GUARD",
                match_str="in_port=5", actions_str="DROP",
                desc="Drop standby backup traffic to prevent loops"
            )

    def install_and_record_static(self, datapath, dst_mac, out_port, desc):
        parser = datapath.ofproto_parser
        match = parser.OFPMatch(eth_dst=dst_mac)
        actions = [parser.OFPActionOutput(out_port)]
        self.add_flow(datapath, 10, match, actions)
        self.registry.record_flow(
            dpid=datapath.id, priority=10, flow_type="STATIC_L2",
            match_str=f"eth_dst={dst_mac}",
            actions_str=f"OUTPUT({out_port})",
            desc=desc
        )

    def add_flow(self, datapath, priority, match, actions, buffer_id=None):
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS, actions)]
        if buffer_id:
            mod = parser.OFPFlowMod(datapath=datapath, buffer_id=buffer_id,
                                    priority=priority, match=match,
                                    instructions=inst)
        else:
            mod = parser.OFPFlowMod(datapath=datapath, priority=priority,
                                    match=match, instructions=inst)
        datapath.send_msg(mod)

    @set_ev_cls(ofp_event.EventOFPPortStatus, MAIN_DISPATCHER)
    def port_status_handler(self, ev):
        msg = ev.msg
        dp = msg.datapath
        ofproto = dp.ofproto
        parser = dp.ofproto_parser
        port_no = msg.desc.port_no

        # Check if port is down (link failure)
        if msg.reason == ofproto.OFPPR_MODIFY and (msg.desc.state & ofproto.OFPPS_LINK_DOWN):
            self.logger.warning(f"*** LINK DOWN DETECTED: Switch {dp.id}, Port {port_no} ***")
            self.registry.record_link_down(dp.id, port_no)

            # Scenario 1: Link Failure Recovery
            # If the link between s1 and s2 goes down (s1 port 1, or s2 port 1)
            if (dp.id == 1 and port_no == 1) or (dp.id == 2 and port_no == 1):
                self.logger.info("Executing Failover: Rerouting traffic over backup link (s2-s3)!")
                self.failover_active = True
                self.registry.record_failover_activated()

                # Reroute on s2: Send client traffic out of port 4 (backup link to s3)
                dp2 = self.datapaths.get(2)
                if dp2:
                    p2 = dp2.ofproto_parser
                    for mac, client_name in [("00:00:00:00:00:15", "client1"), ("00:00:00:00:00:16", "client2"), ("00:00:00:00:00:17", "client3")]:
                        self.add_flow(dp2, 20, p2.OFPMatch(eth_dst=mac), [p2.OFPActionOutput(4)])
                        self.registry.record_flow(
                            dpid=2, priority=20, flow_type="DYNAMIC_FAILOVER",
                            match_str=f"eth_dst={mac}", actions_str="OUTPUT(4)",
                            desc=f"Failover: Route {client_name} via backup link s2-s3 (Port 4)"
                        )

                # Reroute on s3: Send server traffic out of port 5 (backup link to s2)
                dp3 = self.datapaths.get(3)
                if dp3:
                    p3 = dp3.ofproto_parser
                    for mac, server_name in [("00:00:00:00:00:0b", "server1"), ("00:00:00:00:00:0c", "server2")]:
                        self.add_flow(dp3, 20, p3.OFPMatch(eth_dst=mac), [p3.OFPActionOutput(5)])
                        self.registry.record_flow(
                            dpid=3, priority=20, flow_type="DYNAMIC_FAILOVER",
                            match_str=f"eth_dst={mac}", actions_str="OUTPUT(5)",
                            desc=f"Failover: Route {server_name} via backup link s3-s2 (Port 5)"
                        )

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def _packet_in_handler(self, ev):
        # Fallback L2 learning for untracked nodes
        msg = ev.msg
        datapath = msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        in_port = msg.match['in_port']

        pkt = packet.Packet(msg.data)
        eth = pkt.get_protocols(ethernet.ethernet)[0]

        if eth.ethertype == ether_types.ETH_TYPE_LLDP:
            return

        dst = eth.dst
        src = eth.src
        dpid = datapath.id

        self.mac_to_port.setdefault(dpid, {})
        self.mac_to_port[dpid][src] = in_port

        if dst in self.mac_to_port[dpid]:
            out_port = self.mac_to_port[dpid][dst]
            actions = [parser.OFPActionOutput(out_port)]
            match = parser.OFPMatch(in_port=in_port, eth_dst=dst, eth_src=src)
            if msg.buffer_id != ofproto.OFP_NO_BUFFER:
                self.add_flow(datapath, 1, match, actions, msg.buffer_id)
                return
            else:
                self.add_flow(datapath, 1, match, actions)
        else:
            # Safe flooding avoiding backup links
            if dpid == 2:
                active = [1, 2, 3] if not self.failover_active else [2, 3, 4]
                actions = [parser.OFPActionOutput(p) for p in active if p != in_port]
            elif dpid == 3:
                active = [1, 2, 3, 4] if not self.failover_active else [2, 3, 4, 5]
                actions = [parser.OFPActionOutput(p) for p in active if p != in_port]
            else:
                actions = [parser.OFPActionOutput(ofproto.OFPP_FLOOD)]

        data = None
        if msg.buffer_id == ofproto.OFP_NO_BUFFER:
            data = msg.data

        out = parser.OFPPacketOut(datapath=datapath, buffer_id=msg.buffer_id,
                                  in_port=in_port, actions=actions, data=data)
        datapath.send_msg(out)
