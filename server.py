#!/usr/bin/env python3
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8090
DIR = os.path.dirname(os.path.abspath(__file__))
ACTIONS_FILE = os.path.join(DIR, 'pending-actions.json')

class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_POST(self):
        if self.path == '/api/action':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))

            actions = []
            if os.path.exists(ACTIONS_FILE):
                with open(ACTIONS_FILE, 'r') as f:
                    actions = json.load(f)

            actions.append(body)

            with open(ACTIONS_FILE, 'w') as f:
                json.dump(actions, f, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    print(f"Dashboard running at: http://localhost:{PORT}")
    HTTPServer(('', PORT), DashboardHandler).serve_forever()
