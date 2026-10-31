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


class RestApiHandler(http.server.BaseHTTPRequestHandler):
    """
    Standard HTTP Request Handler for the Northbound REST API (/api/overload)
    """
    def log_message(self, format, *args):
        self.server.router_app.logger.info(f"[REST API] {format % args}")

    def do_POST(self):
        if self.path == '/api/overload':
            try:
                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len).decode('utf-8')
                body = json.loads(post_body)
                
                server_ip = body.get('server_ip')
                active_connections = body.get('active_connections')

                self.server.router_app.trigger_overload_redirection(server_ip, active_connections)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response = json.dumps({'status': 'redirected', 'to': '10.0.0.12'}).encode('utf-8')
                self.wfile.write(response)
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()


class DynamicRouter13(app_manager.OSKenApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]

    def __init__(self, *args, **kwargs):
        super(DynamicRouter13, self).__init__(*args, **kwargs)
        self.mac_to_port = {}
        self.datapaths = {}
        self.failover_active = False

        # Start Northbound REST API Server on port 8080
        self.start_rest_server(port=8080)

    def start_rest_server(self, port=8080):
        try:
            server = http.server.ThreadingHTTPServer(('0.0.0.0', port), RestApiHandler)
            server.router_app = self
            server_thread = threading.Thread(target=server.serve_forever, daemon=True)
            server_thread.start()
            self.logger.info(f"DynamicRouter REST API listening on http://0.0.0.0:{port}/api/overload")
        except Exception as e:
            self.logger.error(f"Failed to start REST server: {e}")

    def trigger_overload_redirection(self, server_ip, active_connections):
        self.logger.info(
            f"*** REST API ALERT: Server at {server_ip} reported OVERLOAD! "
            f"Active connections: {active_connections} ***"
        )

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

                # 2. Return trip: Rewrite Server 2's responses to look like they came from Server 1
                match_return = parser.OFPMatch(eth_type=0x0800, ipv4_src="10.0.0.12")
                actions_return = [
                    parser.OFPActionSetField(ipv4_src="10.0.0.11"),
                    parser.OFPActionSetField(eth_src="00:00:00:00:00:0b"),
                    parser.OFPActionOutput(2) # Send to Client switch (s3)
                ]
                self.add_flow(dp1, 20, match_return, actions_return)

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        dpid = datapath.id
        self.datapaths[dpid] = datapath

        # Install table-miss flow entry (send to controller)
        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                          ofproto.OFPCML_NO_BUFFER)]
        self.add_flow(datapath, 0, match, actions)

        self.logger.info(f"Switch {dpid} connected. Installing base static rules.")

        # Fixed topology routing rules:
        # s1: Core Switch (port 1 -> s2, port 2 -> s3)
        if dpid == 1:
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 1) # server1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 1) # server2
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 2) # client1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 2) # client2
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 2) # client3

        # s2: Server Switch (port 1 -> s1, port 2 -> server1, port 3 -> server2, port 4 -> backup s3)
        elif dpid == 2:
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 2) # server1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 3) # server2
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 1) # client1 via s1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 1) # client2 via s1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 1) # client3 via s1
            # By default, drop unrouted packets arriving on backup link port 4 to prevent loops
            self.add_flow(datapath, 5, parser.OFPMatch(in_port=4), [])

        # s3: Client Switch (port 1 -> s1, port 2 -> client1, port 3 -> client2, port 4 -> client3, port 5 -> backup s2)
        elif dpid == 3:
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 2) # client1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 3) # client2
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 4) # client3
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 1) # server1 via s1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 1) # server2 via s1
            # By default, drop unrouted packets arriving on backup link port 5 to prevent loops
            self.add_flow(datapath, 5, parser.OFPMatch(in_port=5), [])

    def add_static_mac_rule(self, datapath, dst_mac, out_port):
        parser = datapath.ofproto_parser
        match = parser.OFPMatch(eth_dst=dst_mac)
        actions = [parser.OFPActionOutput(out_port)]
        self.add_flow(datapath, 10, match, actions)

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

            # Scenario 1: Link Failure Recovery
            # If the link between s1 and s2 goes down (s1 port 1, or s2 port 1)
            if (dp.id == 1 and port_no == 1) or (dp.id == 2 and port_no == 1):
                self.logger.info("Executing Failover: Rerouting traffic over backup link (s2-s3)!")
                self.failover_active = True

                # Reroute on s2: Send client traffic out of port 4 (backup link to s3)
                dp2 = self.datapaths.get(2)
                if dp2:
                    p2 = dp2.ofproto_parser
                    self.add_flow(dp2, 20, p2.OFPMatch(eth_dst="00:00:00:00:00:15"), [p2.OFPActionOutput(4)])
                    self.add_flow(dp2, 20, p2.OFPMatch(eth_dst="00:00:00:00:00:16"), [p2.OFPActionOutput(4)])
                    self.add_flow(dp2, 20, p2.OFPMatch(eth_dst="00:00:00:00:00:17"), [p2.OFPActionOutput(4)])

                # Reroute on s3: Send server traffic out of port 5 (backup link to s2)
                dp3 = self.datapaths.get(3)
                if dp3:
                    p3 = dp3.ofproto_parser
                    self.add_flow(dp3, 20, p3.OFPMatch(eth_dst="00:00:00:00:00:0b"), [p3.OFPActionOutput(5)])
                    self.add_flow(dp3, 20, p3.OFPMatch(eth_dst="00:00:00:00:00:0c"), [p3.OFPActionOutput(5)])

    @set_ev_cls(ofp_event.EventOFPPacketIn, MAIN_DISPATCHER)
    def _packet_in_handler(self, ev):
        # Fallback L2 learning for nodes not hardcoded (like the NAT node)
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
            # Safe flooding avoiding loops over the backup link
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
