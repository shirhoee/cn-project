import os
import json
import time
import mimetypes
import threading
import http.server
from datetime import datetime

class TelemetryRegistry:
    """
    Thread-safe in-memory registry holding live SDN telemetry,
    switch port states, active OpenFlow flow rules, server metrics, and event logs.
    """
    def __init__(self):
        self.lock = threading.Lock()
        self.failover_active = False
        self.nat_redirect_active = False

        # Switch details
        self.switches = {
            1: {
                "dpid": 1,
                "name": "s1 (Core)",
                "status": "DISCONNECTED",
                "ports": {
                    1: {"peer": "s2:1", "status": "UP", "role": "primary"},
                    2: {"peer": "s3:1", "status": "UP", "role": "primary"},
                },
                "flow_count": 0
            },
            2: {
                "dpid": 2,
                "name": "s2 (Server Switch)",
                "status": "DISCONNECTED",
                "ports": {
                    1: {"peer": "s1:1", "status": "UP", "role": "primary"},
                    2: {"peer": "server1:0", "status": "UP", "role": "host"},
                    3: {"peer": "server2:0", "status": "UP", "role": "host"},
                    4: {"peer": "s3:5", "status": "UP", "role": "backup"},
                },
                "flow_count": 0
            },
            3: {
                "dpid": 3,
                "name": "s3 (Client Switch)",
                "status": "DISCONNECTED",
                "ports": {
                    1: {"peer": "s1:2", "status": "UP", "role": "primary"},
                    2: {"peer": "client1:0", "status": "UP", "role": "host"},
                    3: {"peer": "client2:0", "status": "UP", "role": "host"},
                    4: {"peer": "client3:0", "status": "UP", "role": "host"},
                    5: {"peer": "s2:4", "status": "UP", "role": "backup"},
                },
                "flow_count": 0
            }
        }

        # Links
        self.links = {
            "s1-s2": {"status": "UP", "type": "primary", "from": "s1", "to": "s2"},
            "s1-s3": {"status": "UP", "type": "primary", "from": "s1", "to": "s3"},
            "s2-s3": {"status": "STANDBY", "type": "backup", "from": "s2", "to": "s3", "active": False}
        }

        # Servers
        self.servers = {
            "10.0.0.11": {"name": "server1", "ip": "10.0.0.11", "active_conns": 0, "threshold": 2, "status": "HEALTHY"},
            "10.0.0.12": {"name": "server2 (Replica)", "ip": "10.0.0.12", "active_conns": 0, "threshold": 2, "status": "STANDBY"}
        }

        # Flows per switch
        self.flows = {1: [], 2: [], 3: []}

        # Chronological event log ring buffer (last 100)
        self.events = []
        self.log_event("INFO", "CONTROLLER", "SDN Controller initialized. Telemetry registry active.")

    def log_event(self, level, badge, text):
        with self.lock:
            ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            self.events.insert(0, {
                "timestamp": ts,
                "level": level,
                "badge": badge,
                "text": text
            })
            if len(self.events) > 100:
                self.events.pop()

    def record_switch_connected(self, dpid):
        with self.lock:
            if dpid in self.switches:
                self.switches[dpid]["status"] = "CONNECTED"
        self.log_event("SUCCESS", "SWITCH_JOIN", f"Switch {dpid} ({self.switches.get(dpid, {}).get('name', 'Unknown')}) connected to controller.")

    def record_flow(self, dpid, priority, flow_type, match_str, actions_str, desc):
        with self.lock:
            if dpid in self.flows:
                # Avoid duplicate identical match entries
                self.flows[dpid] = [f for f in self.flows[dpid] if not (f["match"] == match_str and f["priority"] == priority)]
                self.flows[dpid].insert(0, {
                    "priority": priority,
                    "type": flow_type,
                    "match": match_str,
                    "actions": actions_str,
                    "desc": desc,
                    "installed_at": datetime.now().strftime("%H:%M:%S")
                })
                self.switches[dpid]["flow_count"] = len(self.flows[dpid])

    def record_link_down(self, dpid, port_no):
        with self.lock:
            if dpid in self.switches and port_no in self.switches[dpid]["ports"]:
                self.switches[dpid]["ports"][port_no]["status"] = "DOWN"
            if (dpid == 1 and port_no == 1) or (dpid == 2 and port_no == 1):
                self.links["s1-s2"]["status"] = "DOWN"
        self.log_event("WARN", "LINK_DOWN", f"OpenFlow PortStatus: Switch {dpid} Port {port_no} DOWN (Primary link s1-s2 severed!)")

    def record_link_up(self, dpid, port_no):
        with self.lock:
            if dpid in self.switches and port_no in self.switches[dpid]["ports"]:
                self.switches[dpid]["ports"][port_no]["status"] = "UP"
            if (dpid == 1 and port_no == 1) or (dpid == 2 and port_no == 1):
                self.links["s1-s2"]["status"] = "UP"
        self.log_event("SUCCESS", "LINK_UP", f"OpenFlow PortStatus: Switch {dpid} Port {port_no} UP (Primary link s1-s2 restored!)")

    def record_failover_activated(self):
        with self.lock:
            self.failover_active = True
            self.links["s2-s3"]["status"] = "ACTIVE"
            self.links["s2-s3"]["active"] = True
        self.log_event("SUCCESS", "FAILOVER", "Dynamic Failover activated! Priority-20 backup corridor installed on s2 (Port 4) and s3 (Port 5).")

    def record_failover_deactivated(self):
        with self.lock:
            self.failover_active = False
            self.links["s2-s3"]["status"] = "STANDBY"
            self.links["s2-s3"]["active"] = False
            # Remove failover flows from registry
            for d in (2, 3):
                self.flows[d] = [f for f in self.flows[d] if f["type"] != "DYNAMIC_FAILOVER"]
                self.switches[d]["flow_count"] = len(self.flows[d])
        self.log_event("INFO", "FAILOVER_OFF", "Primary link restored. Dynamic failover corridor returned to standby.")

    def record_server_overload(self, server_ip, active_connections):
        with self.lock:
            self.nat_redirect_active = True
            if server_ip in self.servers:
                self.servers[server_ip]["active_conns"] = active_connections
                self.servers[server_ip]["status"] = "OVERLOAD"
            if "10.0.0.12" in self.servers:
                self.servers["10.0.0.12"]["status"] = "ACTIVE_TARGET"
        self.log_event("DANGER", "OVERLOAD", f"Northbound REST Alert: Server {server_ip} reports OVERLOAD ({active_connections} active connections)!")
        self.log_event("SUCCESS", "NAT_REROUTE", "Priority-20 Flow Mod: Redirecting all subsequent 10.0.0.11 requests to replica 10.0.0.12 via switch s1.")

    def reset_state(self):
        with self.lock:
            self.failover_active = False
            self.nat_redirect_active = False

            # Reset links to healthy
            self.links["s1-s2"]["status"] = "UP"
            self.links["s1-s3"]["status"] = "UP"
            self.links["s2-s3"]["status"] = "STANDBY"
            self.links["s2-s3"]["active"] = False

            # Reset switch ports
            for s in self.switches.values():
                for p in s["ports"].values():
                    p["status"] = "UP"

            # Reset server status
            self.servers["10.0.0.11"]["status"] = "HEALTHY"
            self.servers["10.0.0.11"]["active_conns"] = 0
            self.servers["10.0.0.12"]["status"] = "STANDBY"
            self.servers["10.0.0.12"]["active_conns"] = 0

            # Remove all dynamic Priority-20 flows (keep Priority 0, 5, 10)
            for d in self.flows:
                self.flows[d] = [f for f in self.flows[d] if f["priority"] != 20]
                self.switches[d]["flow_count"] = len(self.flows[d])

        self.log_event("SUCCESS", "RESET", "System telemetry and switch flows reset to healthy baseline.")

    def get_telemetry_snapshot(self):
        with self.lock:
            return {
                "timestamp": time.time(),
                "controller": {
                    "status": "ONLINE",
                    "openflow_version": "OpenFlow 1.3",
                    "failover_active": self.failover_active,
                    "nat_redirect_active": self.nat_redirect_active
                },
                "switches": list(self.switches.values()),
                "links": self.links,
                "servers": self.servers,
                "flow_totals": {dpid: len(flows) for dpid, flows in self.flows.items()}
            }

    def get_flows(self):
        with self.lock:
            return self.flows

    def get_events(self):
        with self.lock:
            return list(self.events)

    def get_metrics(self):
        # Read from performance_metrics.csv if available
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        csv_file = os.path.join(repo_root, "performance_metrics.csv")
        metrics = []
        if os.path.exists(csv_file):
            try:
                with open(csv_file, "r", encoding="utf-8") as f:
                    lines = [l.strip() for l in f.readlines() if l.strip()]
                if len(lines) > 1:
                    headers = lines[0].split(",")
                    for l in lines[1:][-20:]: # Last 20 runs
                        parts = l.split(",")
                        if len(parts) >= 6:
                            metrics.append({
                                "timestamp": parts[0],
                                "client_ip": parts[1],
                                "event": parts[2],
                                "latency_ms": float(parts[3]),
                                "throughput_kbps": float(parts[4]),
                                "status": parts[5]
                            })
            except Exception:
                pass
        return metrics


class DashboardHttpHandler(http.server.BaseHTTPRequestHandler):
    """
    HTTP Request Handler serving both the live web dashboard frontend
    and the REST telemetry API endpoints.
    """
    def log_message(self, format, *args):
        # Suppress routine GET logging to keep controller console clean
        if self.path.startswith('/api/overload') or getattr(self.server.router_app, 'verbose', False):
            if hasattr(self.server.router_app, 'logger') and self.server.router_app.logger:
                self.server.router_app.logger.info(f"[REST API] {format % args}")

    def end_headers(self):
        # Enable CORS and disable caching
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Route API endpoints
        if self.path in ('/api/reset', '/api/reset/'):
            try:
                self.server.router_app.reset_system()
                self.send_json({"status": "reset_success", "message": "System state restored to healthy baseline."})
            except Exception as e:
                self.send_json({"status": "error", "message": str(e)})
            return
        elif self.path == '/api/telemetry':
            self.send_json(self.server.router_app.registry.get_telemetry_snapshot())
            return
        elif self.path == '/api/flows':
            self.send_json(self.server.router_app.registry.get_flows())
            return
        elif self.path == '/api/events':
            self.send_json(self.server.router_app.registry.get_events())
            return
        elif self.path == '/api/metrics':
            self.send_json(self.server.router_app.registry.get_metrics())
            return

        # Serve static dashboard assets from src/dashboard/
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        dashboard_dir = os.path.join(repo_root, "src", "dashboard")

        clean_path = self.path.split('?')[0].lstrip('/')
        if clean_path in ('', 'index.html', 'dashboard', 'dashboard/'):
            file_path = os.path.join(dashboard_dir, "index.html")
        elif clean_path.startswith('dashboard/'):
            file_path = os.path.join(dashboard_dir, clean_path[len('dashboard/'):])
        else:
            file_path = os.path.join(dashboard_dir, clean_path)

        if os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                if file_path.endswith('.css'):
                    mime_type = 'text/css'
                elif file_path.endswith('.js'):
                    mime_type = 'application/javascript'
                else:
                    mime_type = 'text/plain'

            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', mime_type)
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            except Exception as e:
                self.send_error(500, f"Error reading file: {e}")
                return

        self.send_error(404, f"File not found: {self.path}")

    def do_POST(self):
        if self.path in ('/api/reset', '/api/reset/'):
            try:
                self.server.router_app.reset_system()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'reset_success', 'message': 'System state restored to healthy baseline.'}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return
        elif self.path == '/api/overload':
            try:
                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len).decode('utf-8')
                body = json.loads(post_body)

                server_ip = body.get('server_ip')
                active_connections = body.get('active_connections', 3)

                # Trigger the controller logic
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

    def send_json(self, data):
        payload = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
