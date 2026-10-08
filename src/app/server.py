#!/usr/bin/env python3
import socket
import threading
import logging
import argparse
import sys
import time

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

class ConcurrentServer:
    def __init__(self, host='0.0.0.0', port=9000):
        self.host = host
        self.port = port
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        # Allow port reuse
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.active_connections = 0
        self.lock = threading.Lock()
        self.running = True

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
                # Accept connection
                self.server_socket.settimeout(1.0) # So we can gracefully shutdown
                try:
                    client_sock, client_addr = self.server_socket.accept()
                except socket.timeout:
                    continue
                except OSError:
                    break

                with self.lock:
                    self.active_connections += 1
                logging.info(f"Accepted connection from {client_addr}. Active connections: {self.active_connections}")

                # Handle client in a new thread
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
