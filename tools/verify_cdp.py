import asyncio
import aiohttp
import http.server
import socketserver
import threading
import subprocess
import json
import urllib.request
import time
import os
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PORT = 8769
DIRECTORY = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

def run_server():
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()

server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()
print(f"HTTP server serving {DIRECTORY} at http://127.0.0.1:{PORT}")

chrome_paths = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
chrome_bin = None
for p in chrome_paths:
    if os.path.exists(p):
        chrome_bin = p
        break

if not chrome_bin:
    print("No chrome or edge executable found!")
    sys.exit(1)

cdp_port = 9222
user_data_dir = os.path.join(DIRECTORY, ".chrome_profile")
cmd = [
    chrome_bin,
    "--headless=new",
    f"--remote-debugging-port={cdp_port}",
    f"--user-data-dir={user_data_dir}",
    "--disable-gpu",
    "--no-sandbox",
    "--autoplay-policy=no-user-gesture-required",
    f"http://127.0.0.1:{PORT}/death-race.html"
]

proc = subprocess.Popen(cmd)

async def main():
    await asyncio.sleep(2)
    tabs_url = f"http://127.0.0.1:{cdp_port}/json"
    req = urllib.request.urlopen(tabs_url)
    tabs = json.loads(req.read().decode())
    page_target = next((t for t in tabs if t.get("type") == "page"), None)
    if not page_target:
        print("Page target not found:", tabs)
        return
    ws_url = page_target["webSocketDebuggerUrl"]
    print("Connecting to CDP websocket:", ws_url)

    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(ws_url) as ws:
            msg_id = 0
            async def send_cdp(method, params=None):
                nonlocal msg_id
                msg_id += 1
                req = {"id": msg_id, "method": method}
                if params:
                    req["params"] = params
                await ws.send_str(json.dumps(req))
                while True:
                    msg = await ws.receive()
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = json.loads(msg.data)
                        if data.get("id") == msg_id:
                            return data

            print("Waiting for boot diagnostics...")
            start_time = time.time()
            while time.time() - start_time < 35:
                res = await send_cdp("Runtime.evaluate", {
                    "expression": "window.DR && window.DR.diag ? window.DR.diag.summary() : null",
                    "returnByValue": True
                })
                val = res.get("result", {}).get("result", {}).get("value")
                if val:
                    total_done = val.get("f", 0) + val.get("p", 0) + val.get("e", 0)
                    running = val.get("r", 0)
                    if running == 0 and total_done >= 33:
                        print(f"Diagnostics complete! Total: {val.get('total')}, Passed: {val.get('p')}, Failed: {val.get('f')}, Errors: {val.get('e')}")
                        res_details = await send_cdp("Runtime.evaluate", {
                            "expression": "window.DR.diag.results.map(r => ({id: r.id, status: r.status, attempts: r.attempts, value: r.value}))",
                            "returnByValue": True
                        })
                        for r in res_details.get("result", {}).get("result", {}).get("value", []):
                            print(f"[{r['status']}] {r['id']} (attempts={r['attempts']}) - {r['value']}")
                        return val.get('f', 0) == 0 and val.get('e', 0) == 0
                await asyncio.sleep(1)
            print("Timed out waiting for diagnostics.")
            return False

try:
    ok = asyncio.run(main())
finally:
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        proc.kill()

if ok:
    print("ALL TESTS PASSED SUCCESSFULLY!")
    sys.exit(0)
else:
    print("TEST SUITE FAILED OR TIMED OUT!")
    sys.exit(1)
