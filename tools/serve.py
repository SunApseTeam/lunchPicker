# Static dev server that disables caching, so edited ES modules load on a plain reload.
import http.server
import sys


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
print(f"http://localhost:{port}", flush=True)
http.server.ThreadingHTTPServer(("", port), NoStoreHandler).serve_forever()
