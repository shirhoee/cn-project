#!/usr/bin/env python3
import socket
import threading
import time
import argparse
import sys

def spam_connection(ip, port, duration=10):
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        client_socket.connect((ip, port))
        client_socket.sendall(b"GET /spam")
        # Keep connection open for 'duration' seconds to artificially bloat active connections
        time.sleep(duration)
        client_socket.recv(4096)
    except Exception as e:
        print(f"Failed to connect: {e}")
    finally:
        client_socket.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--ip', type=str, required=True, help="Server IP")
    parser.add_argument('--port', type=int, default=9000)
    parser.add_argument('--count', type=int, default=3, help="Number of concurrent clients")
    args = parser.parse_args()

    print(f"Spawning {args.count} concurrent clients to {args.ip}:{args.port}...")
    threads = []
    for _ in range(args.count):
        t = threading.Thread(target=spam_connection, args=(args.ip, args.port))
        t.start()
        threads.append(t)
        
    for t in threads:
        t.join()
        
    print("Spam test complete.")
