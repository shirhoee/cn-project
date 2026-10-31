from os_ken.base import app_manager
from os_ken.controller import ofp_event
from os_ken.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER
from os_ken.controller.handler import set_ev_cls
from os_ken.ofproto import ofproto_v1_3
from os_ken.lib.packet import packet
from os_ken.lib.packet import ethernet
from os_ken.lib.packet import ether_types

class StaticRouter13(app_manager.OSKenApp):
    OFP_VERSIONS = [ofproto_v1_3.OFP_VERSION]

    def __init__(self, *args, **kwargs):
        super(StaticRouter13, self).__init__(*args, **kwargs)
        self.mac_to_port = {}

    @set_ev_cls(ofp_event.EventOFPSwitchFeatures, CONFIG_DISPATCHER)
    def switch_features_handler(self, ev):
        datapath = ev.msg.datapath
        ofproto = datapath.ofproto
        parser = datapath.ofproto_parser

        # Install table-miss flow entry
        match = parser.OFPMatch()
        actions = [parser.OFPActionOutput(ofproto.OFPP_CONTROLLER,
                                          ofproto.OFPCML_NO_BUFFER)]
        self.add_flow(datapath, 0, match, actions)
        
        # Hardcoded static flows based on our fixed topology
        dpid = datapath.id
        
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
            # Static router does not use the backup link (port 4), so drop unrouted traffic on it
            self.add_flow(datapath, 5, parser.OFPMatch(in_port=4), [])

        # s3: Client Switch (port 1 -> s1, port 2 -> client1, port 3 -> client2, port 4 -> client3, port 5 -> backup s2)
        elif dpid == 3:
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 2) # client1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 3) # client2
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 4) # client3
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 1) # server1 via s1
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 1) # server2 via s1
            # Drop unrouted traffic on backup link port 5
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
            # Safe flooding avoiding backup links
            if dpid == 2:
                actions = [parser.OFPActionOutput(p) for p in [1, 2, 3] if p != in_port]
            elif dpid == 3:
                actions = [parser.OFPActionOutput(p) for p in [1, 2, 3, 4] if p != in_port]
            else:
                actions = [parser.OFPActionOutput(ofproto.OFPP_FLOOD)]

        data = None
        if msg.buffer_id == ofproto.OFP_NO_BUFFER:
            data = msg.data

        out = parser.OFPPacketOut(datapath=datapath, buffer_id=msg.buffer_id,
                                  in_port=in_port, actions=actions, data=data)
        datapath.send_msg(out)
