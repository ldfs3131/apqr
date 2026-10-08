#!/usr/bin/env python3
"""App de mentira para o ensaio: responde /api/health como o APQR. Uso: stubapp.py PORTA VERSAO ("" = sem versão)."""
import json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
port, version = int(sys.argv[1]), sys.argv[2]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == '/api/health':
            body = {"ok": True, "database": "postgres", "schema": "ok"}
            if version: body["version"] = version
        elif self.path == '/api/health/live': body = {"ok": True}
        else: self.send_response(404); self.end_headers(); return
        data = json.dumps(body, separators=(',', ':')).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(data)
ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
