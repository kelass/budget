"""Тест зачислений и карусели категорий на собранной версии docs/."""
import functools
import http.server
import pathlib
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "docs"))
H.log_message = lambda *a: None
srv = socketserver.TCPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://localhost:{srv.server_address[1]}/?web"
results, errors = [], []
NB = lambda t: t.replace(" ", " ")


def check(name, ok, extra=""):
    results.append(("OK  " if ok else "FAIL") + " " + name + (" — " + str(extra) if extra != "" else ""))


def drag(cdp, x0, y0, x1, y1, steps=10):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
    for i in range(1, steps + 1):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y0 + (y1 - y0) * i / steps}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, has_touch=True, is_mobile=True,
                        locale="ru-RU", timezone_id="Europe/Warsaw", service_workers="block")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    cdp = ctx.new_cdp_session(pg)
    pg.goto(URL); pg.wait_for_selector(".onb-body")
    pg.click('[data-action="onb-demo"]'); pg.wait_for_selector(".hero"); pg.wait_for_timeout(300)

    # --- 1. Накопления необязательные + 5 и больше категорий → видны в карусели
    pg.click('.tabbar [data-tab="budget"]')
    pg.locator(".lim-row .who", has_text="Накопления").first.click(); pg.wait_for_timeout(400)
    pg.click('[data-action="toggle-must"]'); pg.click('[data-action="save-cat"]'); pg.wait_for_timeout(400)
    pg.click('.tabbar [data-tab="main"]'); pg.wait_for_timeout(300)
    pages = pg.locator(".cat-page").count()
    all_text = NB(pg.inner_text("#cat-pages"))
    check("категорий больше 4 → несколько страниц", pages >= 2, pages)
    check("«Накопления» есть в карусели", "Накопления" in all_text)
    check("у «Накоплений» видно, сколько внесено из плана", "3 000 из 7 000" in all_text)
    pg.locator("#cat-pages").scroll_into_view_if_needed()
    box = pg.locator("#cat-pages").bounding_box()
    drag(cdp, box["x"] + box["width"] - 30, box["y"] + 60, box["x"] + 30, box["y"] + 62)
    pg.wait_for_timeout(900)
    sel = pg.evaluate("[...document.querySelectorAll('.dot')].findIndex(d => d.getAttribute('aria-selected') === 'true')")
    check("свайп влево открыл вторую страницу", sel == 1, sel)
    pg.screenshot(path=str(SHOTS / "i-carousel.png"))

    # --- 2. Напоминание о неотмеченной зарплате (удалим зарплату текущего месяца из демо)
    pg.click('.tabbar [data-tab="history"]'); pg.click('[data-action="hist-filter"][data-id="inc"]'); pg.wait_for_timeout(300)
    inc_list = NB(pg.inner_text("#hist-list"))
    check("фильтр «↓ Зачисления» показывает зачисления", "Зарплата" in inc_list and "+" in inc_list)
    pg.locator('[data-action="edit-inc"]', has_text="Зарплата").first.click(); pg.wait_for_timeout(400)
    pg.click('[data-action="del-inc"]'); pg.click('[data-action="del-inc"]'); pg.wait_for_timeout(400)
    pg.click('.tabbar [data-tab="main"]'); pg.wait_for_timeout(300)
    banner = pg.locator(".inc-banner")
    check("напоминание «Зарплата ещё не отмечена»", banner.count() == 1, NB(banner.inner_text()) if banner.count() else "")
    pg.screenshot(path=str(SHOTS / "i-reminder.png"))

    # --- 3. Тап по напоминанию → окно зачисления с суммой из ожидания → сохранить
    banner.click(); pg.wait_for_timeout(450)
    sheet = NB(pg.inner_text(".sheet-body"))
    check("окно открылось на «Зарплате» с ожидаемой суммой", "72 000" in sheet and pg.locator('.type-tile[aria-checked="true"] .nm').inner_text() == "Зарплата")
    check("«Ждать каждый месяц» включено", pg.locator('[data-action="toggle-repeat"]').get_attribute("aria-checked") == "true")
    pg.screenshot(path=str(SHOTS / "i-sheet.png"))
    pg.click('[data-action="save-inc"]'); pg.wait_for_timeout(450)
    check("после сохранения напоминание пропало", pg.locator(".inc-banner").count() == 0)

    # --- 4. Новый расход → вкладка «Зачисление», свой тип, удаление долгим нажатием
    pg.click('[data-action="add"]'); pg.wait_for_timeout(450)
    for k in "500": pg.click(f'[data-action="key"][data-k="{k}"]')
    pg.click('[data-action="rec-kind"][data-k="income"]'); pg.wait_for_timeout(200)
    check("сумма сохранилась при переключении на зачисление", "500" in NB(pg.inner_text(".amount")))
    pg.click('[data-action="new-inc-type"]'); pg.fill("#inc-newtype", "Продажа вещей"); pg.click('[data-action="add-inc-type"]'); pg.wait_for_timeout(200)
    check("свой тип добавлен и выбран", pg.locator('.type-tile[aria-checked="true"] .nm').inner_text().startswith("Продажа"))
    pg.click('[data-action="save-inc"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="add"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="rec-kind"][data-k="income"]'); pg.wait_for_timeout(200)
    chip = pg.locator('.type-tile[data-custom]', has_text="Продажа")
    chip.evaluate("el => el.scrollIntoView({ inline: 'center', block: 'nearest' })"); pg.wait_for_timeout(300)
    cb = chip.bounding_box()
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": cb["x"] + 10, "y": cb["y"] + 10}]})
    pg.wait_for_timeout(750)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    pg.wait_for_timeout(300)
    check("долгое нажатие предлагает удалить свой тип", pg.locator('[data-action="del-inc-type"]').count() == 1)
    pg.locator('[data-action="del-inc-type"]').evaluate("el => el.scrollIntoView({ inline: 'center', block: 'nearest' })"); pg.wait_for_timeout(200)
    pg.locator('[data-action="del-inc-type"]').tap(); pg.wait_for_timeout(300)
    check("тип с записями скрыт из выбора", pg.locator('.type-tile', has_text="Продажа").count() == 0)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    pg.click('.tabbar [data-tab="history"]'); pg.click('[data-action="hist-filter"][data-id="inc"]'); pg.wait_for_timeout(200)
    check("старое зачисление удалённого типа осталось в истории", "Продажа вещей" in pg.inner_text("#hist-list"))

    # --- 5. Аналитика → Зачисления
    pg.click('.tabbar [data-tab="stats"]'); pg.click('[data-action="stats-section"][data-s="inc"]'); pg.wait_for_timeout(300)
    st = NB(pg.inner_text("#screen"))
    check("вкладка «Зачисления»: итог закрытого месяца", "Зачислено" in st and "месяц закрыт" in st)
    check("график относительно плана с процентами", pg.locator(".inc-col .b").count() >= 4 and "%" in st)
    check("текущий месяц «ждём» или уже со столбцом", pg.locator(".inc-col .pend").count() + pg.locator(".inc-col .b").count() >= 5)
    check("список зачислений месяца и ожидаемый аванс", "Аванс" in st and "ожидается" in st, [l for l in st.split("\n") if "ожида" in l][:1])
    pg.screenshot(path=str(SHOTS / "i-stats.png"), full_page=True)
    pg.evaluate("document.getElementById('screen').scrollTop = 10000"); pg.wait_for_timeout(200)
    pg.screenshot(path=str(SHOTS / "i-stats-bottom.png"))

    # --- 6. Смена валюты пересчитывает и зачисления
    pg.click('.tabbar [data-tab="history"]'); pg.click('[data-action="hist-filter"][data-id="inc"]'); pg.wait_for_timeout(200)
    before = NB(pg.locator('[data-action="edit-inc"] .amt').first.inner_text())
    ctx.set_offline(True)
    pg.click('.tabbar [data-tab="main"]'); pg.click('[data-action="open-settings"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="set-currency"][data-code="EUR"]'); pg.wait_for_selector('[data-action="convert-ok"]', timeout=15000)
    pg.click('[data-action="convert-ok"]'); pg.wait_for_timeout(400)
    pg.click('[data-action="close-settings"]'); pg.wait_for_timeout(450)
    pg.click('.tabbar [data-tab="history"]'); pg.click('[data-action="hist-filter"][data-id="inc"]'); pg.wait_for_timeout(200)
    after = NB(pg.locator('[data-action="edit-inc"] .amt').first.inner_text())
    check("зачисления пересчитаны в евро", "€" in after, f"{before} → {after}")
    b.close()

srv.shutdown()
print("\n".join(results))
print("errors:", errors or "none")
