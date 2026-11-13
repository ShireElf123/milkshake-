#!/usr/bin/env python3
"""Preview server for local work.

    python3 tools/serve.py          # http://localhost:8000
    python3 tools/serve.py 3000     # another port

Like `python3 -m http.server`, with two differences: nothing is cached, so a
refresh always shows the files as they are now, and hidden files such as the
.git folder are not served.
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = self.path.split('?', 1)[0].split('#', 1)[0]
        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error(404, 'Not found')
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        # lets the fonts load when the page is shown inside a sandboxed frame (a preview pane)
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with Server(('0.0.0.0', port), Handler) as httpd:
        print(f'Serving {ROOT} at http://localhost:{port}/ (Ctrl+C to stop)', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
