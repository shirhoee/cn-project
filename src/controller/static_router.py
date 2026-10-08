from os_ken.base import app_manager
from os_ken.controller import ofp_event
from os_ken.controller.handler import CONFIG_DISPATCHER, MAIN_DISPATCHER
from os_ken.controller.handler import set_ev_cls
from os_ken.ofproto import ofproto_v1_3
from os_ken.lib.packet import packet
from os_ken.lib.packet import ethernet
from os_ken.lib.packet import ether_types

class StaticRouter13(app_manager.RyuApp):
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
        self.logger.info(f"Switch {dpid} connected. Installing static rules.")
        
        # Topology structure:
        # s1 (dpid=1): port 1 -> s2, port 2 -> s3
        # s2 (dpid=2): port 1 -> s1, port 2 -> server1, port 3 -> server2
        # s3 (dpid=3): port 1 -> s1, port 2 -> client1, port 3 -> client2, port 4 -> client3
        
        # MACs: server1 (00:00:00:00:00:0b), server2 (00:00:00:00:00:0c)
        # clients: client1 (00:00:00:00:00:15), client2 (00:00:00:00:00:16), client3 (00:00:00:00:00:17)
        
        if dpid == 1:
            # Route to servers
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 1)
            # Route to clients
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 2)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 2)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 2)
            
        elif dpid == 2:
            # Route to servers
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0b", 2)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:0c", 3)
            # Route to clients (via s1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 1)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 1)
            
        elif dpid == 3:
            # Route to clients
            self.add_static_mac_rule(datapath, "00:00:00:00:00:15", 2)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:16", 3)
            self.add_static_mac_rule(datapath, "00:00:00:00:00:17", 4)
            # Route to servers (via s1)
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

        inst = [parser.OFPInstructionActions(ofproto.OFPIT_APPLY_ACTIONS,
                                             actions)]
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

        # Learn the MAC address to avoid FLOOD next time
        self.mac_to_port[dpid][src] = in_port

        if dst in self.mac_to_port[dpid]:
            out_port = self.mac_to_port[dpid][dst]
        else:
            out_port = ofproto.OFPP_FLOOD

        actions = [parser.OFPActionOutput(out_port)]

        # Install a flow to avoid packet_in next time (for learned MACs)
        if out_port != ofproto.OFPP_FLOOD:
            match = parser.OFPMatch(in_port=in_port, eth_dst=dst, eth_src=src)
            # Verify if we have a valid buffer_id, if yes avoid to send both flow_mod & packet_out
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
