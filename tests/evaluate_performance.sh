#!/bin/bash
# Resolve repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=================================================="
echo "    Automated SDN Performance Evaluation Guide    "
echo "=================================================="
echo ""
echo "To evaluate the STATIC baseline:"
echo "  1. In Terminal 1: osken-manager src/controller/static_router.py"
echo "  2. In Terminal 2: cd \"${REPO_ROOT}\" && sudo python3 tests/evaluate_performance.py static"
echo ""
echo "To evaluate the DYNAMIC controller:"
echo "  1. In Terminal 1: osken-manager src/controller/dynamic_router.py"
echo "  2. In Terminal 2: cd \"${REPO_ROOT}\" && sudo python3 tests/evaluate_performance.py dynamic"
echo ""
echo "Metrics are automatically recorded in: performance_metrics.csv"
echo "=================================================="
