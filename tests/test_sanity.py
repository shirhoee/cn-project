#!/usr/bin/env python3
import unittest
import os
import sys

# Ensure repository root is in sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


class TestRepositorySanity(unittest.TestCase):

    def test_requirements_pin(self):
        """Verify that requirements.txt pins os-ken<=3.1.1 to preserve the osken-manager CLI."""
        req_path = os.path.join(REPO_ROOT, "requirements.txt")
        self.assertTrue(os.path.exists(req_path), "requirements.txt must exist")
        with open(req_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("os-ken<=3.1.1", content, "requirements.txt must pin os-ken<=3.1.1")

    def test_topology_port_bindings(self):
        """Verify that DynamicAppTopo binds switches and hosts to the exact intended OpenFlow ports."""
        from src.network.topology import DynamicAppTopo

        topo = DynamicAppTopo(num_servers=2, num_clients=3)

        # Core switch primary links
        self.assertEqual(topo.port('s1', 's2'), (1, 1), "s1:1 must connect to s2:1")
        self.assertEqual(topo.port('s1', 's3'), (2, 1), "s1:2 must connect to s3:1")

        # Servers on switch s2
        self.assertEqual(topo.port('s2', 'server1'), (2, 0), "s2:2 must connect to server1")
        self.assertEqual(topo.port('s2', 'server2'), (3, 0), "s2:3 must connect to server2")

        # Clients on switch s3
        self.assertEqual(topo.port('s3', 'client1'), (2, 0), "s3:2 must connect to client1")
        self.assertEqual(topo.port('s3', 'client2'), (3, 0), "s3:3 must connect to client2")
        self.assertEqual(topo.port('s3', 'client3'), (4, 0), "s3:4 must connect to client3")

        # Redundant backup link between s2 and s3
        self.assertEqual(topo.port('s2', 's3'), (4, 5), "s2:4 must connect to s3:5")

    def test_controller_inheritance(self):
        """Verify that controllers inherit from app_manager.OSKenApp."""
        from os_ken.base import app_manager
        from src.controller.dynamic_router import DynamicRouter13
        from src.controller.static_router import StaticRouter13

        self.assertTrue(issubclass(DynamicRouter13, app_manager.OSKenApp))
        self.assertTrue(issubclass(StaticRouter13, app_manager.OSKenApp))

    def test_logger_utility(self):
        """Verify that perf_logger can format and structure metrics properly."""
        from src.utils.logger import PerformanceLogger
        logger = PerformanceLogger(log_file="/tmp/test_metrics.csv")
        self.assertTrue(os.path.exists("/tmp/test_metrics.csv"))
        logger.log_metric("10.0.0.99", "TEST_EVENT", 1.23, 5000.0, "SUCCESS")
        with open("/tmp/test_metrics.csv", "r", encoding="utf-8") as f:
            lines = f.readlines()
        self.assertGreaterEqual(len(lines), 2)
        self.assertIn("10.0.0.99", lines[-1])
        if os.path.exists("/tmp/test_metrics.csv"):
            os.remove("/tmp/test_metrics.csv")


if __name__ == "__main__":
    unittest.main()
