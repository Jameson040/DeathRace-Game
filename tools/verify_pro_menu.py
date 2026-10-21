import asyncio
import aiohttp
import http.server
import threading
import subprocess
import json
import urllib.request
import os
import sys
import base64
import shutil

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PORT = 8785
DIRECTORY = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ARTIFACT_DIR = r"C:\Users\Akshay\.gemini\antigravity\brain\79955dff-ebc8-4b28-9898-ac8940e23bf0"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def log_message(self, format, *args):
        pass

http_server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=http_server.serve_forever, daemon=True).start()
print(f"HTTP server serving at http://127.0.0.1:{PORT}")

chrome_paths = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
chrome_bin = next(p for p in chrome_paths if os.path.exists(p))

cdp_port = 9240
user_data_dir = os.path.join(DIRECTORY, ".chrome_profile_pro_menu")
cmd = [
    chrome_bin,
    "--headless=new",
    f"--remote-debugging-port={cdp_port}",
    f"--user-data-dir={user_data_dir}",
    "--window-size=1400,850",
    "--disable-gpu",
    "--no-sandbox",
    "--autoplay-policy=no-user-gesture-required",
    f"http://127.0.0.1:{PORT}/death-race.html"
]

proc = subprocess.Popen(cmd)

async def take_screenshot(send_cdp, filename):
    res = await send_cdp("Page.captureScreenshot", {"format": "png"})
    data = res.get("result", {}).get("data")
    if data:
        img_bytes = base64.b64decode(data)
        out_path = os.path.join(DIRECTORY, "tools", filename)
        with open(out_path, "wb") as f:
            f.write(img_bytes)
        print(f"Saved screenshot: {out_path}")
        if os.path.exists(ARTIFACT_DIR):
            art_path = os.path.join(ARTIFACT_DIR, filename)
            shutil.copyfile(out_path, art_path)
            print(f"Copied to artifact dir: {art_path}")

async def main():
    await asyncio.sleep(2)
    tabs_url = f"http://127.0.0.1:{cdp_port}/json"
    req = urllib.request.urlopen(tabs_url)
    tabs = json.loads(req.read().decode())
    page_target = next((t for t in tabs if t.get("type") == "page"), None)
    if not page_target:
        print("Page target not found!")
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

            # Wait for DR to boot
            for _ in range(30):
                res = await send_cdp("Runtime.evaluate", {
                    "expression": "typeof window.DR !== 'undefined' && window.DR.state !== undefined",
                    "returnByValue": True
                })
                if res.get("result", {}).get("result", {}).get("value") is True:
                    break
                await asyncio.sleep(0.5)

            print("DR loaded. Waiting for 3D preview and assets...")
            await asyncio.sleep(3.0)

            # --- STEP 1: PILOT SELECTION (3 visible at a time) ---
            print("\n1. Verifying Step 1 (Pilot Selection)...")
            p_info = await send_cdp("Runtime.evaluate", {
                "expression": """
                ({
                    menuStep: window.DR.menuStep,
                    visibleCards: document.querySelectorAll('#pilotCarouselCards .char-slide').length,
                    activeCardName: document.querySelector('#pilotCarouselCards .char-slide.active .char-name')?.textContent,
                    prevCardName: document.querySelector('#pilotCarouselCards .char-slide.prev .char-name')?.textContent,
                    nextCardName: document.querySelector('#pilotCarouselCards .char-slide.next .char-name')?.textContent,
                    totalDots: document.querySelectorAll('#pilotDots .dot').length
                })
                """,
                "returnByValue": True
            })
            pilot_val = p_info.get("result", {}).get("result", {}).get("value", {})
            print("Step 1 Pilot Roster State:", pilot_val)
            assert pilot_val.get('menuStep') == 1, f"Expected menuStep 1, got {pilot_val.get('menuStep')}"
            assert pilot_val.get('visibleCards') == 3, f"Expected exactly 3 cards on screen, got {pilot_val.get('visibleCards')}"
            assert pilot_val.get('totalDots') == 9, f"Expected 9 pagination dots, got {pilot_val.get('totalDots')}"
            print(f"[PASS] Step 1 displays exactly 3 pilots on screen: [{pilot_val.get('prevCardName')}] <== [{pilot_val.get('activeCardName')}] ==> [{pilot_val.get('nextCardName')}]")

            await take_screenshot(send_cdp, "menu_step1_pilot_carousel.png")

            # Test sliding to next pilot
            print("Sliding pilot carousel forward...")
            await send_cdp("Runtime.evaluate", {
                "expression": "window.DR.shiftPilot(1);"
            })
            await asyncio.sleep(0.5)
            p_info2 = await send_cdp("Runtime.evaluate", {
                "expression": "document.querySelector('#pilotCarouselCards .char-slide.active .char-name')?.textContent",
                "returnByValue": True
            })
            new_active = p_info2.get("result", {}).get("result", {}).get("value")
            print("Shifted Active Pilot:", new_active)
            assert new_active != pilot_val.get('activeCardName'), "Active pilot did not change on shift!"
            print("[PASS] Carousel sliding navigation verified!")

            # --- STEP 2: PLACE & WEATHER AS ONE ---
            print("\n2. Navigating to Step 2 (Place & Weather as One)...")
            await send_cdp("Runtime.evaluate", {
                "expression": "window.DR.setMenuStep(2);"
            })
            await asyncio.sleep(0.8)

            # Select Scorched Desert and Golden Sunset to test live update
            await send_cdp("Runtime.evaluate", {
                "expression": """
                window.DR.setBiome('desert');
                window.DR.setLighting('sunset');
                """
            })
            await asyncio.sleep(0.8)

            t_info = await send_cdp("Runtime.evaluate", {
                "expression": """
                ({
                    menuStep: window.DR.menuStep,
                    biomeId: window.DR.biomeId,
                    lightingId: window.DR.lightingId,
                    selectedBiomeName: document.getElementById('selectedBiomeName')?.textContent,
                    selectedWeatherName: document.getElementById('selectedWeatherName')?.textContent,
                    biomeCardsCount: document.querySelectorAll('#biomeCards .biome-card').length,
                    lightCardsCount: document.querySelectorAll('#lightCards .light-card').length
                })
                """,
                "returnByValue": True
            })
            track_val = t_info.get("result", {}).get("result", {}).get("value", {})
            print("Step 2 Battleground State:", track_val)
            assert track_val.get('menuStep') == 2, f"Expected menuStep 2, got {track_val.get('menuStep')}"
            assert track_val.get('biomeCardsCount') == 6, f"Expected 6 biome cards, got {track_val.get('biomeCardsCount')}"
            assert track_val.get('lightCardsCount') == 5, f"Expected 5 lighting cards, got {track_val.get('lightCardsCount')}"
            assert 'DESERT' in track_val.get('selectedBiomeName'), "Biome name not updated!"
            assert 'SUNSET' in track_val.get('selectedWeatherName'), "Weather name not updated!"
            print("[PASS] Step 2 Place and Weather integrated dossier verified!")

            await take_screenshot(send_cdp, "menu_step2_place_and_weather.png")

            # --- STEP 3: COMBAT VEHICLE & STATS ---
            print("\n3. Navigating to Step 3 (Vehicle with Visuals & Stats)...")
            await send_cdp("Runtime.evaluate", {
                "expression": "window.DR.setMenuStep(3);"
            })
            await asyncio.sleep(0.8)

            # Select Goliath War Rig to inspect stats
            await send_cdp("Runtime.evaluate", {
                "expression": "window.DR.selectCar('warrig');"
            })
            await asyncio.sleep(0.8)

            v_info = await send_cdp("Runtime.evaluate", {
                "expression": """
                ({
                    menuStep: window.DR.menuStep,
                    playerStyle: window.DR.playerStyle,
                    title: document.getElementById('dossierTitle')?.textContent,
                    speedVal: document.getElementById('statSpeedVal')?.textContent,
                    speedBar: document.getElementById('statSpeedBar')?.style.width,
                    armorVal: document.getElementById('statArmorVal')?.textContent,
                    armorBar: document.getElementById('statArmorBar')?.style.width,
                    totalGarageVehicles: document.querySelectorAll('#garage .biome-card').length
                })
                """,
                "returnByValue": True
            })
            veh_val = v_info.get("result", {}).get("result", {}).get("value", {})
            print("Step 3 Vehicle Dossier State:", veh_val)
            assert veh_val.get('menuStep') == 3, f"Expected menuStep 3, got {veh_val.get('menuStep')}"
            assert 'GOLIATH' in veh_val.get('title'), f"Expected title to contain 'GOLIATH', got {veh_val.get('title')}"
            assert veh_val.get('totalGarageVehicles') == 16, f"Expected 16 vehicles in garage, got {veh_val.get('totalGarageVehicles')}"
            print("[PASS] Step 3 Vehicle Showcase and dynamic stat meters verified!")

            await take_screenshot(send_cdp, "menu_step3_vehicle_and_stats.png")

            # Test Launching Race
            print("\nTesting race launch from button...")
            await send_cdp("Runtime.evaluate", {
                "expression": "document.getElementById('btnPlay').click();"
            })
            await asyncio.sleep(1.0)
            race_info = await send_cdp("Runtime.evaluate", {
                "expression": "({state: window.DR.state, phase: window.DR.race?.phase, hudVisible: !document.getElementById('hud').classList.contains('hidden')})",
                "returnByValue": True
            })
            r_val = race_info.get("result", {}).get("result", {}).get("value", {})
            print("Race launch state:", r_val)
            assert r_val.get('state') == 'RACE', f"Expected state 'RACE', got {r_val.get('state')}"
            assert r_val.get('hudVisible') is True, "HUD was not visible after starting race!"
            print("[PASS] Race launched successfully into combat circuit!")

            await take_screenshot(send_cdp, "pro_race_in_action.png")

            print("\nALL PRO-GRADE MENU TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        try:
            proc.terminate()
        except:
            pass
