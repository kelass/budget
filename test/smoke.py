"""Дымовой тест симуляции: прогоняет основные сценарии в headless Chromium и снимает скриншоты."""
import http.server
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SHOTS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "test" / "shots")
SHOTS.mkdir(parents=True, exist_ok=True)

page_html = (DIST / "budget.html").read_text(encoding="utf-8")
(DIST / "index.html").write_text(
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    "<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style>"
    "</head><body>" + page_html + "</body></html>", encoding="utf-8")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(DIST), **k)

    def log_message(self, *a):
        pass


srv = socketserver.TCPServer(("127.0.0.1", 0), Quiet)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{port}/index.html"

errors = []


def run(viewport, prefix):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport=viewport, device_scale_factor=2, locale="ru-RU", timezone_id="Europe/Warsaw")
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(f"[{prefix}] {m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errors.append(f"[{prefix}] pageerror: {e}"))
        pg.goto(URL)
        pg.wait_for_selector(".onb-body", timeout=20000)
        shot = lambda name: pg.screenshot(path=str(SHOTS / f"{prefix}-{name}.png"))
        pg.wait_for_timeout(300)
        shot("0-onboarding")

        pg.click('[data-action="onb-demo"]')
        pg.wait_for_selector(".hero")
        pg.wait_for_timeout(400)
        shot("1-main")
        if prefix == "phone":
            pg.screenshot(path=str(SHOTS / f"{prefix}-1-main-full.png"), full_page=False)

        # Внести обязательный платёж
        pg.click('.row [data-action="pay"]')
        pg.wait_for_timeout(450)
        shot("2-pay")
        pg.click('[data-action="save-exp"]')
        pg.wait_for_timeout(500)
        shot("3-after-pay")

        # Обычный расход с клавиатуры
        pg.click('[data-action="add"]')
        pg.wait_for_timeout(450)
        for k in "1250":
            pg.click(f'[data-action="key"][data-k="{k}"]')
        pg.fill("#exp-note", "Тестовый обед")
        shot("4-add")
        pg.click('[data-action="save-exp"]')
        pg.wait_for_timeout(450)

        for tab in ["history", "stats", "budget"]:
            pg.click(f'.tabbar [data-tab="{tab}"]')
            pg.wait_for_timeout(250)
            shot("5-" + tab)

        pg.click('[data-action="new-cat"]')
        pg.wait_for_timeout(450)
        pg.fill("#cat-name", "Спорт")
        pg.fill("#cat-limit", "3000")
        pg.click('[data-action="toggle-must"]')
        shot("6-newcat")
        pg.click('[data-action="save-cat"]')
        pg.wait_for_timeout(450)
        shot("6b-budget-after")

        pg.click('.tabbar [data-tab="stats"]')
        pg.click('[data-action="stats-mode"][data-m="month"]')
        pg.wait_for_timeout(250)
        shot("7-stats-month")

        pg.click('.tabbar [data-tab="main"]')
        pg.click('[data-action="open-settings"]')
        pg.wait_for_timeout(450)
        shot("8-settings")
        pg.click('[data-action="set-currency"][data-code="PLN"]')
        pg.wait_for_timeout(200)
        pg.click('[data-action="close-settings"]')
        pg.wait_for_timeout(450)

        # Сохранность после перезагрузки
        pg.wait_for_timeout(700)
        pg.reload()
        pg.wait_for_selector(".hero")
        pg.wait_for_timeout(300)
        shot("9-after-reload")
        print(prefix, "after reload hero:", pg.inner_text(".hero-big"), "| history has test:", "Тестовый обед" in pg.content() or None)
        pg.click('.tabbar [data-tab="history"]')
        pg.wait_for_timeout(200)
        print(prefix, "test record persisted:", "Тестовый обед" in pg.inner_text("#hist-list"))
        overflow = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        print(prefix, "horizontal overflow:", overflow)
        b.close()


run({"width": 390, "height": 844}, "phone")
run({"width": 1280, "height": 960}, "desk")
srv.shutdown()
print("\n".join(errors) if errors else "no console errors")
