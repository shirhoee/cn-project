import json
from ryu.base import app_manager
from ryu.controller import ofp_event
from ryu.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER
from ryu.controller.handler import set_ev_cls
from ryu.ofproto import ofproto_v1_3
from ryu.lib.packet import packet
from ryu.lib.packet import ethernet
from ryu.lib.packet import ether_types
from ryu.app.wsgi import ControllerBase, WSGIApplication, route
from webob import Response

# Instance name used in WSGI registry
dynamic_router_instance_name = 'dynamic_router_api_app'
url = '/api/overload'

class DynamicRouterAPI(ControllerBase):
    def __init__(self, req, link, data, **config):
        super(DynamicRouterAPI, self).__init__(req, link, data, **config)
        self.router_app = data[dynamic_router_instance_name]

    @route('dynamic_router', url, methods=['POST'])
    def handle_overload(self, req, **kwargs):
        try:
            body = req.json
            server_ip = body.get('server_ip')
            active_connections = body.get('active_connections')
            
            self.router_app.logger.info(
                f"*** REST API ALERT: Server at {server_ip} reported OVERLOAD! "
                f"Active connections: {active_connections} ***"
            )

            # Scenario 2: Server Overload Load-Balancing
            if server_ip == "10.0.0.11":
                dp1 = self.router_app.datapaths.get(1)
                if dp1:
                    ofproto = dp1.ofproto
                    parser = dp1.ofproto_parser
                    
                    self.router_app.logger.info("Installing flow rules on Core Switch (s1) to redirect traffic to Server 2.")
                    
                    # 1. Forward trip: Redirect client traffic intended for Server 1 to Server 2
                    match_forward = parser.OFPMatch(eth_type=0x0800, ipv4_dst="10.0.0.11")
                    actions_forward = [
                        parser.OFPActionSetField(ipv4_dst="10.0.0.12"),
                        parser.OFPActionSetField(eth_dst="00:00:00:00:00:0c"),
                        parser.OFPActionOutput(1) # Send to Server switch
                    ]
                    self.router_app.add_flow(dp1, 20, match_forward, actions_forward)
                    
                    # 2. Return trip: Rewrite Server 2's responses to look like they came from Server 1
                    match_return = parser.OFPMatch(eth_type=0x0800, ipv4_src="10.0.0.12")
                    actions_return = [
                        parser.OFPActionSetField(ipv4_src="10.0.0.11"),
                        parser.OFPActionSetField(eth_src="00:00:00:00:00:0b"),
                        parser.OFPActionOutput(2) # Send to Client switch
                    ]
                    self.router_app.add_flow(dp1, 20, match_return, actions_return)
            
            return Response(status=200, content_type='application/json',
                            body=json.dumps({'status': 'redirected', 'to': '10.0.0.12'}))
        except Exception as e:
            return Response(status=400, body=str(e))


class DynamicRouter13(app_manager.RyuApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]
    _CONTEXTS = {'wsgi': WSGIApplication}

    def __init__(self, *args, **kwargs):
        super(DynamicRouter13, self).__init__(*args, **kwargs)
        self.mac_to_port = {}
        self.datapaths = {}
        
        # Register the WSGI REST API
        wsgi = kwargs['wsgi']
        wsgi.register(DynamicRouterAPI, {dynamic_router_instance_name: self})
        self.logger.info("DynamicRouter REST API registered on port 8080.")

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser
        dpid = datapath.id
        self.datapaths[dpid] = datapath

        # Install table-miss flow entry
        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                          ofproto.OFPCML_NO_BUFFER)]
        self.add_flow(datapath, 0, match, actions)
        
        self.logger.info(f"Switch {dpid} connected. Installing base static rules.")
        
        # Copying base topology rules from static router to keep connectivity alive
        if dpid == 1:
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 2)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 2)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 2)
        elif dpid == 2:
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 2)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 3)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 1)
        elif dpid == 3:
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 2)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 3)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 4)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 1)

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
                
                # Reroute on s2: Send client traffic out of port 4 (to s3)
                dp2 = self.datapaths.get(2)
                if dp2:
                    p2 = dp2.ofproto_parser
                    # Priority 20 overrides the static priority 10 rules
                    self.add_flow(dp2, 20, p2.OFPMatch(eth_dst="00:00:00:00:00:15"), [p2.OFPActionOutput(4)])
                    self.add_flow(dp2, 20, p2.OFPMatch(eth_dst="00:00:00:00:00:16"), [p2.OFPActionOutput(4)])
                    self.add_flow(dp2, 20, p2.OFPMatch(eth_dst="00:00:00:00:00:17"), [p2.OFPActionOutput(4)])

                # Reroute on s3: Send server traffic out of port 5 (to s2)
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
        else:
            out_port = ofproto.OFPP_FLOOD

        actions = [parser.OFPActionOutput(out_port)]

        if out_port != ofproto.OFPP_FLOOD:
            match = parser.OFPMatch(in_port=in_port, eth_dst=dst, eth_src=src)
            if msg.buffer_id != ofproto.OFP_NO_BUFFER:
                self.add_flow(datapath, 1, match, actions, msg.buffer_id)
                return
            else:
                self.add_flow(datapath, 1, match, actions)

        data = None
        if msg.buffer_id == ofproto.OFP_NO_BUFFER:
            data = msg.data

        out = parser.OFPPacketOut(datapath=datapath, buffer_id=msg.buffer_id,
                                  in_port=in_port, actions=actions, data=data)
        datapath.send_msg(out)
