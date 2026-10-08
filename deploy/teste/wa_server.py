#!/usr/bin/env python3
"""CallMeBot de mentira: grava cada aviso recebido em um arquivo. Uso: wa_server.py PORTA ARQUIVO."""
import sys, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
port, out = int(sys.argv[1]), sys.argv[2]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        with open(out, 'a') as f: f.write("%s|%s|%s\n" % (q.get('phone', [''])[0], q.get('apikey', [''])[0], q.get('text', [''])[0]))
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
HTTPServer(('127.0.0.1', port), H).serve_forever()
