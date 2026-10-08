import csv
import os
import time

class PerformanceLogger:
    def __init__(self, log_file="performance_metrics.csv"):
        self.log_file = log_file
        self.initialize_log()

    def initialize_log(self):
        if not os.path.exists(self.log_file):
            with open(self.log_file, mode='w', newline='') as file:
                writer = csv.writer(file)
                writer.writerow(["timestamp", "client_ip", "event_type", "latency_ms", "throughput_kbps", "status"])

    def log_metric(self, client_ip, event_type, latency_ms, throughput_kbps, status):
        with open(self.log_file, mode='a', newline='') as file:
            writer = csv.writer(file)
            writer.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), client_ip, event_type, round(latency_ms, 2), round(throughput_kbps, 2), status])

# Singleton instance for easy import
perf_logger = PerformanceLogger()
