#!/usr/bin/env python3
import socket
import logging
import argparse
import time
import sys
import os

# Add parent directory to path to import utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.logger import perf_logger

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def run_client(server_ip, server_port):
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    client_socket.settimeout(2.0)
    
    logging.info(f"Connecting to {server_ip}:{server_port}...")
    local_ip = get_local_ip()
    
    start_time = time.time()
    try:
        client_socket.connect((server_ip, server_port))
        connect_time = time.time()
        
        request = "GET /dummy_file"
        client_socket.sendall(request.encode('utf-8'))
        
        # Receive data
        received_data = b""
        while True:
            chunk = client_socket.recv(4096)
            if not chunk:
                break
            received_data += chunk
            
        end_time = time.time()
        latency_ms = (connect_time - start_time) * 1000
        total_time_s = end_time - start_time
        throughput_kbps = (len(received_data) * 8) / (total_time_s * 1000) if total_time_s > 0 else 0
        
        logging.info(f"Download complete. {len(received_data)} bytes in {total_time_s*1000:.2f} ms.")
        perf_logger.log_metric(local_ip, "FETCH_FILE", latency_ms, throughput_kbps, "SUCCESS")
        
    except socket.timeout:
        logging.error(f"Timeout connecting/reading from {server_ip}:{server_port}.")
        perf_logger.log_metric(local_ip, "FETCH_FILE", (time.time() - start_time)*1000, 0, "TIMEOUT")
        sys.exit(1)
    except ConnectionRefusedError:
        logging.error(f"Connection refused by {server_ip}:{server_port}.")
        perf_logger.log_metric(local_ip, "FETCH_FILE", (time.time() - start_time)*1000, 0, "CONN_REFUSED")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Socket error: {e}")
        perf_logger.log_metric(local_ip, "FETCH_FILE", (time.time() - start_time)*1000, 0, "ERROR")
        sys.exit(1)
    finally:
        client_socket.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TCP Socket Client")
    parser.add_argument('--ip', type=str, required=True, help='Server IP address')
    parser.add_argument('--port', type=int, default=9000, help='Server port')
    args = parser.parse_args()
    
    run_client(args.ip, args.port)
