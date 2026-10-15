"""Демо-данные не должны уходить в минус ни при каком «Начале месяца» и ни в какой день.
Проверяем остаток на главной для каждого дня начала 1–28 на нескольких датах."""
import datetime
import functools
import http.server
import pathlib
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "docs"))
H.log_message = lambda *a: None
srv = socketserver.TCPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://localhost:{srv.server_address[1]}/?web"

# Остаток и бюджет текущего и прошлых периодов прямо из сервиса приложения
PROBE = """() => {
  const v = document.querySelector('.hero-big').innerText.replace(/\\s+/g, '');
  return { title: document.querySelector('.month-btn').innerText.trim(), left: v };
}"""

bad, checked = [], 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for when in [datetime.datetime(2026, 10, 15, 22, 0), datetime.datetime(2026, 10, 31, 21, 0), datetime.datetime(2026, 11, 2, 9, 0)]:
        ctx = b.new_context(viewport={"width": 390, "height": 800}, timezone_id="Europe/Warsaw", service_workers="block")
        pg = ctx.new_page()
        pg.clock.set_fixed_time(when)
        pg.goto(URL); pg.wait_for_selector(".onb-body")
        pg.click('[data-action="onb-demo"]'); pg.wait_for_selector(".hero")
        for sd in range(1, 29):
            pg.click('[data-action="open-settings"]'); pg.wait_for_timeout(330)
            pg.select_option("#set-start", str(sd)); pg.wait_for_timeout(120)
            pg.click('[data-action="close-settings"]'); pg.wait_for_timeout(330)
            r = pg.evaluate(PROBE)
            checked += 1
            if r["left"].startswith("−"):
                bad.append(f"{when:%d.%m} начало {sd}: {r['title']} → {r['left']}")
        ctx.close()
    b.close()
srv.shutdown()
print(f"проверено {checked} вариантов, в минусе {len(bad)}")
print("\n".join(bad) if bad else "OK: демо нигде не уходит в минус")
