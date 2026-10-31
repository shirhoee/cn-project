#!/bin/bash
# Resolve repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "Starting Mininet topology for Dynamic SDN..."
cd "${REPO_ROOT}" || exit 1
sudo python3 src/network/topology.py
