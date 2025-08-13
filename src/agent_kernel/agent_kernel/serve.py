"""Minimal HTTP interface for the Agent Kernel.
Run: python -m agent_kernel.serve --port 8000
"""
import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

from .tasks.basic import kernel  # registers tasks & schedules

class KernelHandler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa
        parsed = urlparse(self.path)
        if parsed.path == '/tasks':
            return self._json(200, {"tasks": kernel.list_tasks()})
        if parsed.path == '/schedules':
            return self._json(200, {"schedules": kernel.list_schedules()})
        if parsed.path.startswith('/run/'):
            name = parsed.path.split('/run/', 1)[1]
            params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            result = kernel.run_task(name, **params)
            code = 200 if result.get("status") == "ok" else 500
            return self._json(code, result)
        self._json(404, {"error": "not found"})

    def log_message(self, format, *args):  # noqa: override to reduce noise
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    kernel.start()
    server = HTTPServer(('0.0.0.0', args.port), KernelHandler)
    print(f"Agent Kernel listening on :{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        kernel.stop()

if __name__ == '__main__':  # pragma: no cover
    main()
