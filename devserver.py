#!/usr/bin/env python3
"""Static server for local development. Sends no-store so edited ES modules always reload.
POST /design-upload (also /designs) stores design JSON and artwork under designs/<id>/."""
import cgi
import json
import os
import socketserver
import sys
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DESIGNS = ROOT / "designs"

FILE_FIELDS = {"mockup-front", "mockup-back", "preview"}
FILE_PREFIXES = ("art-", "font-", "mockup-")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def log_message(self, *a):
        # Quiet access log — never dump bodies or uploaded JSON.
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path in ("/design-upload", "/designs"):
            self._handle_design_upload()
            return
        self.send_error(404, "Not found")

    def _json(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _public_base(self):
        host = (self.headers.get("Host") or "").strip() or f"127.0.0.1:{self.server.server_address[1]}"
        return f"http://{host}"

    def _safe_id(self, raw):
        s = "".join(c for c in str(raw or "") if c.isalnum() or c in "-_")
        return s[:80] if s else None

    def _ext_for(self, filename, content_type, data=b""):
        if filename:
            ext = Path(filename).suffix
            if ext and 1 < len(ext) <= 8 and all(c.isalnum() or c == "." for c in ext):
                return ext.lower()
        ct = (content_type or "").split(";")[0].strip().lower()
        by_ct = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/webp": ".webp",
            "image/svg+xml": ".svg",
            "application/json": ".json",
            "font/ttf": ".ttf",
            "font/otf": ".otf",
            "application/x-font-ttf": ".ttf",
            "application/x-font-otf": ".otf",
            "font/woff": ".woff",
            "font/woff2": ".woff2",
        }
        if ct in by_ct:
            return by_ct[ct]
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return ".png"
        if data[:2] == b"\xff\xd8":
            return ".jpg"
        return ""

    def _field_bytes(self, item):
        if getattr(item, "file", None) is not None:
            try:
                item.file.seek(0)
            except Exception:
                pass
            data = item.file.read()
            return data if isinstance(data, bytes) else str(data).encode("utf-8")
        val = getattr(item, "value", b"")
        if isinstance(val, bytes):
            return val
        return str(val or "").encode("utf-8")

    def _field_text(self, item):
        data = self._field_bytes(item)
        return data.decode("utf-8", "replace")

    def _items(self, form, name):
        if name not in form:
            return []
        v = form[name]
        return v if isinstance(v, list) else [v]

    def _is_file_field(self, name, item):
        if getattr(item, "filename", None):
            return True
        if name in FILE_FIELDS or name.startswith(FILE_PREFIXES):
            return True
        return False

    def _handle_design_upload(self):
        ctype = self.headers.get("Content-Type", "")
        env = {
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": ctype,
            "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
        }
        try:
            form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ=env, keep_blank_values=True)
        except Exception:
            self._json(400, {"error": "invalid multipart body"})
            return

        design_id = None
        for item in self._items(form, "designId"):
            design_id = self._safe_id(self._field_text(item))
        if not design_id:
            self._json(400, {"error": "designId required"})
            return

        dest = DESIGNS / design_id
        dest.mkdir(parents=True, exist_ok=True)

        files = {}
        design_written = False
        meta_text = None
        design_text = None
        base = self._public_base()

        for name in form.keys():
            if name == "designId":
                continue
            for item in self._items(form, name):
                filename = getattr(item, "filename", None) or ""

                if name == "meta" and not filename:
                    meta_text = self._field_text(item)
                    continue

                if name == "design":
                    data = self._field_bytes(item)
                    dest.joinpath("design.json").write_bytes(data)
                    design_written = True
                    if not filename:
                        design_text = data.decode("utf-8", "replace")
                    continue

                if name == "printArea" and not filename:
                    dest.joinpath("print-area.json").write_bytes(self._field_bytes(item))
                    files["printArea"] = f"{base}/designs/{design_id}/print-area.json"
                    continue

                if self._is_file_field(name, item):
                    data = self._field_bytes(item)
                    ext = self._ext_for(filename, getattr(item, "type", None), data)
                    safe_field = "".join(c for c in name if c.isalnum() or c in "-_")
                    if not safe_field:
                        continue
                    out_name = f"{safe_field}{ext}"
                    dest.joinpath(out_name).write_bytes(data)
                    files[name] = f"{base}/designs/{design_id}/{out_name}"

        if not design_written:
            if design_text:
                dest.joinpath("design.json").write_text(design_text, encoding="utf-8")
            elif meta_text:
                try:
                    parsed = json.loads(meta_text)
                except Exception:
                    parsed = {"meta": meta_text}
                if not isinstance(parsed, dict):
                    parsed = {"meta": parsed}
                parsed["_note"] = "design field missing; wrote meta instead"
                dest.joinpath("design.json").write_text(json.dumps(parsed, indent=2), encoding="utf-8")
            else:
                dest.joinpath("design.json").write_text(
                    json.dumps({"_note": "design field missing; no meta provided"}, indent=2),
                    encoding="utf-8",
                )

        files["design"] = f"{base}/designs/{design_id}/design.json"
        self._json(200, {"designId": design_id, "files": files})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(ROOT)
    DESIGNS.mkdir(exist_ok=True)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"serving on http://127.0.0.1:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
