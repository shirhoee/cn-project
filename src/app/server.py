#!/usr/bin/env python3
import socket
import threading
import logging
import argparse
import sys
import time

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

class ConcurrentServer:
    def __init__(self, host='0.0.0.0', port=9000, controller_ip='127.0.0.1', controller_port=8080):
        self.host = host
        self.port = port
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.active_connections = 0
        self.lock = threading.Lock()
        self.running = True
        
        # New Phase 2 parameters
        self.controller_ip = controller_ip
        self.controller_port = controller_port
        self.overload_threshold = 2
        self.overload_reported = False

    def get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def notify_overload(self):
        import urllib.request
        import json
        
        url = f"http://{self.controller_ip}:{self.controller_port}/api/overload"
        server_ip = self.get_local_ip()
        
        payload = {
            "server_ip": server_ip,
            "active_connections": self.active_connections
        }
        
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        
        try:
            logging.info(f"Triggering REST API: Notifying controller of overload at {url}")
            with urllib.request.urlopen(req, timeout=3) as response:
                res_body = response.read().decode('utf-8')
                logging.info(f"Controller response: {res_body}")
        except Exception as e:
            logging.error(f"Failed to notify controller: {e}")

    def start(self):
        try:
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(10)
            logging.info(f"Server listening on {self.host}:{self.port}")
        except Exception as e:
            logging.error(f"Failed to bind socket: {e}")
            sys.exit(1)

        try:
            while self.running:
                self.server_socket.settimeout(1.0)
                try:
                    client_sock, client_addr = self.server_socket.accept()
                except socket.timeout:
                    continue
                except OSError:
                    break

                with self.lock:
                    self.active_connections += 1
                    current_conns = self.active_connections
                    
                logging.info(f"Accepted connection from {client_addr}. Active connections: {current_conns}")

                # Phase 2: Overload Notification
                if current_conns >= self.overload_threshold and not self.overload_reported:
                    self.overload_reported = True
                    # Run notification in a separate thread so we don't block the accept loop
                    threading.Thread(target=self.notify_overload, daemon=True).start()

                client_thread = threading.Thread(target=self.handle_client, args=(client_sock, client_addr))
                client_thread.daemon = True
                client_thread.start()
        except KeyboardInterrupt:
            logging.info("Shutting down server...")
            self.stop()

    def handle_client(self, client_sock, client_addr):
        try:
            request = client_sock.recv(1024).decode('utf-8').strip()
            logging.info(f"Request from {client_addr}: {request}")
            
            if request.startswith("GET"):
                # Simulate serving a file/chunk
                dummy_content = b"DUMMY_DATA_CHUNK_" * 100
                client_sock.sendall(dummy_content)
                logging.info(f"Sent data to {client_addr}")
            else:
                client_sock.sendall(b"ERROR: Invalid Request")
        except Exception as e:
            logging.error(f"Error handling client {client_addr}: {e}")
        finally:
            client_sock.close()
            with self.lock:
                self.active_connections -= 1
            logging.info(f"Connection closed for {client_addr}. Active connections: {self.active_connections}")

    def stop(self):
        self.running = False
        self.server_socket.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TCP Socket Server")
    parser.add_argument('--port', type=int, default=9000, help='Port to listen on')
    args = parser.parse_args()
    
    server = ConcurrentServer(port=args.port)
    server.start()
