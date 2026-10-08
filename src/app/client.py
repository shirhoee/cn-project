#!/usr/bin/env python3
import socket
import logging
import argparse
import time
import sys

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

def run_client(server_ip, server_port):
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    
    logging.info(f"Connecting to {server_ip}:{server_port}...")
    try:
        start_time = time.time()
        client_socket.connect((server_ip, server_port))
        connect_time = time.time()
        logging.info(f"Connected in {(connect_time - start_time)*1000:.2f} ms")
        
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
        total_time = (end_time - start_time) * 1000
        logging.info(f"Download complete. Received {len(received_data)} bytes in {total_time:.2f} ms.")
        
    except ConnectionRefusedError:
        logging.error(f"Connection refused by {server_ip}:{server_port}. Is the server running?")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Socket error: {e}")
        sys.exit(1)
    finally:
        client_socket.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TCP Socket Client")
    parser.add_argument('--ip', type=str, required=True, help='Server IP address')
    parser.add_argument('--port', type=int, default=9000, help='Server port')
    args = parser.parse_args()
    
    run_client(args.ip, args.port)
