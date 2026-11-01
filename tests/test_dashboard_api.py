#!/usr/bin/env python3
import unittest
import threading
import http.server
import urllib.request
import json
import os
import sys

# Ensure repository root is in sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from src.controller.telemetry_handler import TelemetryRegistry, DashboardHttpHandler


class MockController:
    def __init__(self, registry):
        self.registry = registry
        self.verbose = False
        self.datapaths = {}

    def trigger_overload_redirection(self, server_ip, active_connections):
        self.registry.record_server_overload(server_ip, active_connections)

    def reset_system(self):
        self.registry.reset_state()


class TestDashboardAndApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = TelemetryRegistry()
        cls.controller = MockController(cls.registry)

        # Start test HTTP server on port 8999
        cls.port = 8999
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', cls.port), DashboardHttpHandler)
        cls.server.router_app = cls.controller
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_root_serves_html(self):
        url = f"http://127.0.0.1:{self.port}/"
        with urllib.request.urlopen(url) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get_content_type(), "text/html")
            body = resp.read().decode('utf-8')
            self.assertIn("Dynamic SDN Telemetry & Flow Visualizer", body)
            self.assertIn("topoCanvas", body)

    def test_static_css_and_js(self):
        css_url = f"http://127.0.0.1:{self.port}/styles.css"
        with urllib.request.urlopen(css_url) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get_content_type(), "text/css")

        js_url = f"http://127.0.0.1:{self.port}/dashboard/js/app.js"
        with urllib.request.urlopen(js_url) as resp:
            self.assertEqual(resp.status, 200)
            self.assertIn(resp.headers.get_content_type(), ["application/javascript", "text/javascript"])

    def test_api_telemetry_snapshot(self):
        url = f"http://127.0.0.1:{self.port}/api/telemetry"
        with urllib.request.urlopen(url) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get_content_type(), "application/json")
            data = json.loads(resp.read().decode('utf-8'))
            self.assertIn("controller", data)
            self.assertIn("switches", data)
            self.assertIn("links", data)
            self.assertIn("servers", data)
            self.assertEqual(data["controller"]["status"], "ONLINE")

    def test_api_flows_endpoint(self):
        # Register a mock flow
        self.registry.record_flow(1, 10, "STATIC_L2", "eth_dst=00:00:00:00:00:0b", "OUTPUT(1)", "Test flow")
        url = f"http://127.0.0.1:{self.port}/api/flows"
        with urllib.request.urlopen(url) as resp:
            self.assertEqual(resp.status, 200)
            flows = json.loads(resp.read().decode('utf-8'))
            self.assertIn("1", flows)
            self.assertGreaterEqual(len(flows["1"]), 1)
            self.assertEqual(flows["1"][0]["priority"], 10)

    def test_api_events_endpoint(self):
        url = f"http://127.0.0.1:{self.port}/api/events"
        with urllib.request.urlopen(url) as resp:
            self.assertEqual(resp.status, 200)
            events = json.loads(resp.read().decode('utf-8'))
            self.assertIsInstance(events, list)
            self.assertGreaterEqual(len(events), 1)

    def test_post_overload_alert(self):
        url = f"http://127.0.0.1:{self.port}/api/overload"
        payload = json.dumps({"server_ip": "10.0.0.11", "active_connections": 3}).encode('utf-8')
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertEqual(data.get("status"), "redirected")
            self.assertEqual(data.get("to"), "10.0.0.12")

        # Verify telemetry was updated
        snap = self.registry.get_telemetry_snapshot()
        self.assertTrue(snap["controller"]["nat_redirect_active"])
        self.assertEqual(snap["servers"]["10.0.0.11"]["status"], "OVERLOAD")

    def test_reset_api(self):
        # Trigger overload first
        self.registry.record_server_overload("10.0.0.11", 5)
        self.assertTrue(self.registry.get_telemetry_snapshot()["controller"]["nat_redirect_active"])

        # Send reset POST
        url = f"http://127.0.0.1:{self.port}/api/reset"
        req = urllib.request.Request(url, data=b"{}", headers={'Content-Type': 'application/json'}, method="POST")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertEqual(data.get("status"), "reset_success")

        # Verify state is back to healthy
        snap = self.registry.get_telemetry_snapshot()
        self.assertFalse(snap["controller"]["nat_redirect_active"])
        self.assertEqual(snap["servers"]["10.0.0.11"]["status"], "HEALTHY")
        self.assertEqual(snap["links"]["s1-s2"]["status"], "UP")


if __name__ == "__main__":
    unittest.main()
