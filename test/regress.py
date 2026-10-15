"""Регресс-тест релиза: миграция старой базы, «Накопления», свайпы, прокрутка, смена валюты офлайн и онлайн.
Запуск: python3 test/regress.py <папка старой версии docs>"""
import http.server
import os
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
NEW = ROOT / "docs"
OLD = pathlib.Path(sys.argv[1])
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
state = {"dir": OLD}


class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        rel = path.split("?", 1)[0].lstrip("/") or "index.html"
        return str(state["dir"] / rel)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


srv = socketserver.TCPServer(("127.0.0.1", 0), H)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://localhost:{port}/?web"
results, errors = [], []


def check(name, ok, extra=""):
    results.append(("OK  " if ok else "FAIL") + " " + name + (" — " + str(extra) if extra else ""))


def touch_drag(cdp, x, y0, y1, steps=8, dx=0):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0}]})
    for i in range(1, steps + 1):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + dx * i / steps, "y": y0 + (y1 - y0) * i / steps}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=2, has_touch=True, is_mobile=True,
                        locale="ru-RU", timezone_id="Europe/Warsaw", ignore_https_errors=True, service_workers="block")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    cdp = ctx.new_cdp_session(pg)

    # --- 1. Старая версия: демо-данные, рубль, начало месяца 6
    pg.goto(URL); pg.wait_for_selector(".onb-body")
    pg.click('[data-action="onb-demo"]'); pg.wait_for_selector(".hero")
    pg.click('[data-action="open-settings"]'); pg.wait_for_timeout(400)
    had_rub = pg.locator('[data-action="set-currency"][data-code="RUB"]').count() > 0
    if had_rub:
        pg.click('[data-action="set-currency"][data-code="RUB"]'); pg.wait_for_timeout(200)
    pg.select_option("#set-start", "6"); pg.wait_for_timeout(900)
    old_label = pg.inner_text(".sample")
    if had_rub:
        check("старая версия на рублях", "₽" in old_label, old_label.replace("\n", " "))

    # --- 2. Новая версия поверх той же базы
    state["dir"] = NEW
    pg.reload(); pg.wait_for_selector(".hero"); pg.wait_for_timeout(500)
    title = pg.inner_text(".month-btn")
    check("период подписан диапазоном", "–" in title, title)
    check("валюта — гривна", "₴" in pg.inner_text(".hero-big"), pg.inner_text(".hero-big"))
    check("карточка «Всего накоплено» есть", pg.locator(".savings").count() == 1, pg.inner_text(".savings").replace("\n", " ") if pg.locator(".savings").count() else "")
    check("копилка называется «Накопления»", "Накопления" in pg.inner_text("#screen") and "Отложенные" not in pg.inner_text("#screen"))
    pg.screenshot(path=str(SHOTS / "r-main.png"))

    # --- 3. Бюджет: прокрутка и размер кнопки при многих категориях
    for i in range(5):
        pg.click('.tabbar [data-tab="budget"]'); pg.click('[data-action="new-cat"]'); pg.wait_for_timeout(380)
        pg.fill("#cat-name", f"Категория {i}"); pg.click('[data-action="save-cat"]'); pg.wait_for_timeout(380)
    pg.click('.tabbar [data-tab="budget"]'); pg.wait_for_timeout(200)
    m = pg.evaluate("() => { const s=document.getElementById('screen'); return {sh:s.scrollHeight, ch:s.clientHeight, btn:document.querySelector('.dashed-btn').offsetHeight} }")
    check("кнопка «Новая категория» 48px", m["btn"] == 48, m)
    touch_drag(cdp, 200, 600, 200)
    pg.wait_for_timeout(500)
    st = pg.evaluate("document.getElementById('screen').scrollTop")
    check("бюджет прокручивается пальцем", st > 100, st)

    # --- 4. «Накопления» нельзя удалить
    pg.evaluate("document.getElementById('screen').scrollTop = 0")
    pg.locator(".lim-row .who", has_text="Накопления").first.click(); pg.wait_for_timeout(400)
    check("у «Накоплений» нет кнопки удаления", pg.locator('[data-action="del-cat"]').count() == 0)

    # --- 5. Свайп вниз за ручку закрывает лист
    box = pg.locator(".grabber-zone").bounding_box()
    touch_drag(cdp, box["x"] + box["width"] / 2, box["y"] + 10, box["y"] + 400)
    pg.wait_for_timeout(500)
    check("свайп за ручку закрыл лист", not pg.evaluate("document.getElementById('sheet-layer').classList.contains('on')"))

    # короткий свайп — лист возвращается на место
    pg.click('.tabbar [data-tab="main"]'); pg.click('[data-action="add"]'); pg.wait_for_timeout(450)
    box = pg.locator(".grabber-zone").bounding_box()
    touch_drag(cdp, box["x"] + box["width"] / 2, box["y"] + 10, box["y"] + 50, steps=10)
    pg.wait_for_timeout(500)
    check("короткий свайп не закрывает лист", pg.evaluate("document.getElementById('sheet-layer').classList.contains('on')"))
    pg.screenshot(path=str(SHOTS / "r-sheet.png"))
    # свайп по клавиатуре вниз тоже закрывает (содержимое в начале прокрутки)
    kb = pg.locator('[data-action="key"][data-k="5"]').bounding_box()
    touch_drag(cdp, kb["x"] + 20, kb["y"] + 10, kb["y"] + 260)
    pg.wait_for_timeout(500)
    check("свайп вниз по содержимому закрыл лист", not pg.evaluate("document.getElementById('sheet-layer').classList.contains('on')"))

    # --- 6. Настройки закрываются свайпом вправо
    pg.click('[data-action="open-settings"]'); pg.wait_for_timeout(450)
    pg.screenshot(path=str(SHOTS / "r-settings.png"), full_page=False)
    touch_drag(cdp, 60, 400, 400, dx=280)
    pg.wait_for_timeout(500)
    check("свайп вправо закрыл настройки", not pg.evaluate("document.getElementById('page-layer').classList.contains('on')"))

    # --- 7. Смена валюты без интернета → курс из базы
    budget_before = pg.evaluate("() => null")
    pg.click('.tabbar [data-tab="budget"]'); pg.wait_for_timeout(200)
    total_before = pg.inner_text(".big-amount")
    pg.click('.tabbar [data-tab="main"]'); pg.wait_for_timeout(300)
    left_before = pg.inner_text(".hero-big")
    ctx.set_offline(True)
    pg.click('[data-action="open-settings"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="set-currency"][data-code="USD"]'); pg.wait_for_selector('[data-action="convert-ok"]', timeout=15000)
    sheet_txt = pg.inner_text(".sheet-body")
    check("офлайн: взят сохранённый курс", "встроенный" in sheet_txt.lower() or "сохранённый" in sheet_txt.lower(), sheet_txt.split("\n")[3:5])
    pg.screenshot(path=str(SHOTS / "r-currency-offline.png"))
    pg.click('[data-action="convert-ok"]'); pg.wait_for_timeout(500)
    pg.click('[data-action="close-settings"]'); pg.wait_for_timeout(450)
    pg.click('.tabbar [data-tab="budget"]'); pg.wait_for_timeout(200)
    total_after = pg.inner_text(".big-amount")
    check("бюджет пересчитан в доллары", "$" in total_after, f"{total_before} → {total_after}")
    pg.click('.tabbar [data-tab="main"]'); pg.wait_for_timeout(300)
    left_usd = pg.inner_text(".hero-big")
    num = lambda t: float(t.replace("\u00a0", "").replace(" ", "").replace("−", "-").replace(",", ".").rstrip("$₴€ ").strip())
    check("остаток на главной не ушёл в минус", "−" not in left_usd and num(left_usd) > 0, f"{left_before} → {left_usd}")
    check("остаток пересчитан по тому же курсу", abs(num(left_before) / 44.98 - num(left_usd)) < num(left_usd) * 0.02, f"{num(left_before)}/44.98 ≈ {num(left_before)/44.98:.0f}")

    # --- 8. Онлайн: курс из сети (если песочница пускает)
    ctx.set_offline(False)
    pg.click('.tabbar [data-tab="main"]')
    pg.click('[data-action="open-settings"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="set-currency"][data-code="UAH"]'); pg.wait_for_selector('[data-action="convert-ok"]', timeout=20000)
    sheet_txt = pg.inner_text(".sheet-body")
    online = "ЕЦБ" in sheet_txt or "ExchangeRate" in sheet_txt
    check("онлайн: курс получен из сети", online, [l for l in sheet_txt.split("\n") if "курс" in l.lower()][:2])
    pg.screenshot(path=str(SHOTS / "r-currency-online.png"))
    pg.click('[data-action="convert-ok"]'); pg.wait_for_timeout(400)
    b.close()

    # --- 9. Новая установка: шаг «Сколько уже накоплено?»
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=2, has_touch=True, service_workers="block")
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL); pg.wait_for_selector(".onb-body")
    pg.click('[data-action="onb-next"]'); pg.click('[data-action="onb-next"]')
    for k in "30000": pg.click(f'[data-action="key"][data-k="{k}"]')
    pg.click('[data-action="onb-next"]')
    check("есть шаг «Сколько уже накоплено?»", "накоплено" in pg.inner_text(".onb-body").lower())
    for k in "12000": pg.click(f'[data-action="key"][data-k="{k}"]')
    pg.screenshot(path=str(SHOTS / "r-onb-savings.png"))
    pg.click('[data-action="onb-next"]')
    pg.screenshot(path=str(SHOTS / "r-onb-cats.png"))
    pg.click('[data-action="onb-finish"]'); pg.wait_for_selector(".hero")
    sv = pg.inner_text(".savings")
    check("стартовая сумма попала во «Всего накоплено»", "12 000" in sv.replace("\u00a0", " "), sv.replace("\n", " "))
    b.close()

srv.shutdown()
print("\n".join(results))
print("errors:", errors or "none")
