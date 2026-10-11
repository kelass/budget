import http.server, socketserver, threading, pathlib, functools, sys
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parent.parent / "docs"
SHOTS = pathlib.Path(__file__).resolve().parent / "shots"
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
H.log_message = lambda *a: None
srv = socketserver.TCPServer(("127.0.0.1", 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://localhost:{port}/"
errs = []
IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, user_agent=IOS, has_touch=True)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(base); pg.wait_for_selector(".install-steps"); pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / "pwa-install.png"))
    pg.goto(base + "?web"); pg.wait_for_selector(".onb-body"); pg.click('[data-action="onb-demo"]'); pg.wait_for_selector(".hero")
    pg.wait_for_function("navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(()=>true)")
    pg.wait_for_timeout(1500)
    print("sw controller:", pg.evaluate("!!navigator.serviceWorker.controller"))
    pg.reload(); pg.wait_for_selector(".hero"); pg.wait_for_timeout(800)
    print("sw controller after reload:", pg.evaluate("!!navigator.serviceWorker.controller"))
    font = pg.evaluate("document.fonts.check('800 20px Onest')")
    print("onest loaded:", font)
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_selector(".hero", timeout=10000)
    print("offline works, hero:", pg.inner_text(".hero-big"))
    pg.screenshot(path=str(SHOTS / "pwa-offline-main.png"))
    b.close()
srv.shutdown()
print("errors:", errs or "none")
