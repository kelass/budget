"""Вид закреплён: щипок и двойной тап не масштабируют, прокрутка и клавиатура суммы работают."""
import http.server, socketserver, threading, pathlib, functools, sys
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parent.parent / "docs"
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE)); H.log_message = lambda *a: None
srv = socketserver.TCPServer(("127.0.0.1", 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://localhost:{port}/?web"
fails = []
def check(name, ok, info=""):
    print(("OK  " if ok else "FAIL"), name, info); ok or fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(base); pg.wait_for_selector(".onb-body"); pg.click('[data-action="onb-demo"]'); pg.wait_for_selector(".hero")
    vp = pg.get_attribute('meta[name="viewport"]', "content")
    check("viewport запрещает масштаб", "maximum-scale=1" in vp and "user-scalable=no" in vp, vp)
    ta = pg.evaluate("getComputedStyle(document.documentElement).touchAction")
    check("touch-action без pinch-zoom и double-tap", ta == "pan-x pan-y", ta)
    cdp = ctx.new_cdp_session(pg)
    scale = lambda: pg.evaluate("visualViewport.scale")
    cdp.send("Input.synthesizePinchGesture", {"x": 195, "y": 400, "scaleFactor": 2.5, "relativeSpeed": 600})
    pg.wait_for_timeout(400); check("щипок не увеличивает", abs(scale() - 1) < 1e-3, f"scale={scale()}")
    pg.touchscreen.tap(195, 300); pg.wait_for_timeout(60); pg.touchscreen.tap(195, 300); pg.wait_for_timeout(500)
    check("двойной тап не увеличивает", abs(scale() - 1) < 1e-3, f"scale={scale()}")
    # одиночные события iOS gesture* гасятся
    prevented = pg.evaluate("""(() => { const e = new Event('gesturestart', {cancelable: true}); document.dispatchEvent(e); return e.defaultPrevented; })()""")
    check("gesturestart отменяется (iOS)", prevented)
    # прокрутка одним пальцем на главной
    sc = pg.evaluate("(() => { const s = document.querySelector('.screen'); return s ? [s.scrollHeight, s.clientHeight] : null })()")
    if sc and sc[0] > sc[1]:
        touch = lambda t, y: cdp.send("Input.dispatchTouchEvent", {"type": t, "touchPoints": [] if t == "touchEnd" else [{"x": 195, "y": y}]})
        touch("touchStart", 700)
        for y in range(690, 380, -10): touch("touchMove", y)
        touch("touchEnd", 380)
        pg.wait_for_timeout(400); top = pg.evaluate("document.querySelector('.screen').scrollTop")
        check("прокрутка пальцем работает", top > 0, f"scrollTop={top}")
    # быстрые нажатия на клавиатуре суммы не теряются и не масштабируют
    pg.click('[data-action="add"]'); pg.wait_for_selector('.keys'); pg.wait_for_timeout(600)
    box = pg.locator('.key[data-k="1"]').bounding_box(); cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    for _ in range(3): pg.touchscreen.tap(cx, cy); pg.wait_for_timeout(120)
    pg.wait_for_timeout(300); shown = pg.inner_text('.amount .n, .amount [class^="n"]').strip()
    check("три быстрых тапа «1» → 111", shown.replace(" ", "").replace("\u00a0", "") == "111", shown)
    check("после тапов масштаб 1", abs(scale() - 1) < 1e-3, f"scale={scale()}")
    b.close()
srv.shutdown()
sys.exit(1 if fails else 0)
