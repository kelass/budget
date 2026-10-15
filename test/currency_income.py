"""Валюта зачисления и окна записи без прокрутки: бюджет в злотых, аванс в гривнах."""
import functools, http.server, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "shots"; SHOTS.mkdir(parents=True, exist_ok=True)
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "docs")); H.log_message = lambda *a: None
srv = socketserver.TCPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://localhost:{srv.server_address[1]}/?web"
results, errors = [], []
NB = lambda t: t.replace(" ", " ")
def check(name, ok, extra=""): results.append(("OK  " if ok else "FAIL") + " " + name + (" — " + str(extra) if extra != "" else ""))
FIT = "() => { const b = document.querySelector('.sheet-body'); const r = b.getBoundingClientRect(); const save = b.querySelector('.btn-primary').getBoundingClientRect(); return { over: b.scrollHeight - b.clientHeight, saveVisible: save.bottom <= window.innerHeight + 1 } }"

with sync_playwright() as p:
    b = p.chromium.launch()
    for (w, h, name) in [(390, 844, "iPhone 14"), (430, 932, "iPhone 14 Pro Max"), (375, 667, "iPhone SE")]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, has_touch=True, is_mobile=True, service_workers="block", timezone_id="Europe/Warsaw")
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL); pg.wait_for_selector(".onb-body"); pg.click('[data-action="onb-demo"]'); pg.wait_for_selector(".hero")
        pg.click('[data-action="add"]'); pg.wait_for_timeout(450)
        f = pg.evaluate(FIT)
        check(f"{name}: «Расход» без прокрутки", f["over"] <= 1 and f["saveVisible"], f)
        if name == "iPhone 14": pg.screenshot(path=str(SHOTS / "c-expense.png"))
        pg.click('[data-action="rec-kind"][data-k="income"]'); pg.wait_for_timeout(250)
        f = pg.evaluate(FIT)
        check(f"{name}: «Зачисление» без прокрутки", f["over"] <= 1 and f["saveVisible"], f)
        check(f"{name}: кнопки «Отмена» нет", pg.locator('.sheet-head [data-action="close-sheet"]').count() == 0)
        ctx.close()

    # Сценарий: бюджет в злотых, аванс приходит в гривнах
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True, service_workers="block", timezone_id="Europe/Warsaw")
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL); pg.wait_for_selector(".onb-body"); pg.click('[data-action="onb-demo"]'); pg.wait_for_selector(".hero")
    ctx.set_offline(True)  # курс из сохранённых в базе
    pg.click('[data-action="open-settings"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="set-currency"][data-code="PLN"]'); pg.wait_for_selector('[data-action="convert-ok"]'); pg.click('[data-action="convert-ok"]'); pg.wait_for_timeout(400)
    pg.click('[data-action="close-settings"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="add"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="rec-kind"][data-k="income"]'); pg.wait_for_timeout(250)
    check("валюта зачисления по умолчанию — валюта бюджета", "zł" in NB(pg.inner_text(".cur-pill")) and "в валюте бюджета" in pg.inner_text(".amount-cap"))
    pg.locator(".type-tile", has_text="Аванс").click(); pg.wait_for_timeout(150)
    for k in "2000": pg.click(f'[data-action="key"][data-k="{k}"]')
    pg.click('[data-action="cur-menu"]'); pg.wait_for_timeout(150)
    pg.screenshot(path=str(SHOTS / "c-menu.png"))
    pg.click('[data-action="pick-cur"][data-code="UAH"]'); pg.wait_for_timeout(250)
    cap = NB(pg.inner_text(".amount-cap"))
    check("пересчёт в злотые с курсом под суммой", cap.startswith("≈") and "zł" in cap and "₴" in cap, cap)
    pg.screenshot(path=str(SHOTS / "c-income-uah.png"))
    f = pg.evaluate(FIT); check("с выбранной валютой окно тоже без прокрутки", f["over"] <= 1, f)
    pg.click('[data-action="save-inc"]'); pg.wait_for_timeout(450)
    pg.click('.tabbar [data-tab="history"]'); pg.click('[data-action="hist-filter"][data-id="inc"]'); pg.wait_for_timeout(200)
    row = NB(pg.locator('[data-action="edit-inc"]').first.inner_text())
    expected = round(2000 / 50.4169 * 4.3658, 2)
    check("в истории сумма в злотых и исходные 2 000 ₴", "zł" in row and "2 000 ₴" in row, row.replace("\n", " | "))
    check("сумма пересчитана по курсу (≈ %.2f zł)" % expected, ("%.2f" % expected).replace(".", ",") in row or str(round(expected)) in row, row.replace("\n", " | "))
    # Правка без изменений не пересчитывает, удаление иконкой в заголовке
    pg.locator('[data-action="edit-inc"]').first.click(); pg.wait_for_timeout(450)
    check("при правке открывается в гривнах", "₴" in NB(pg.inner_text(".cur-pill")) and "2 000" in NB(pg.inner_text(".amount")))
    pg.screenshot(path=str(SHOTS / "c-edit.png"))
    pg.click('[data-action="del-inc"]'); pg.wait_for_timeout(150)
    check("удаление: первое нажатие спрашивает «Удалить?»", "Удалить?" in pg.inner_text(".del-btn"))
    pg.click('[data-action="del-inc"]'); pg.wait_for_timeout(450)
    subs = [NB(x) for x in pg.locator('[data-action="edit-inc"] .sub').all_inner_texts()]
    check("зачисление удалено", not any(x.startswith("2 000 ₴") for x in subs))
    # Смена валюты бюджета на гривну возвращает точную исходную сумму
    pg.click('.tabbar [data-tab="main"]'); pg.click('[data-action="add"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="rec-kind"][data-k="income"]'); pg.locator(".type-tile", has_text="Премия").click()
    for k in "3000": pg.click(f'[data-action="key"][data-k="{k}"]')
    pg.click('[data-action="cur-menu"]'); pg.click('[data-action="pick-cur"][data-code="UAH"]'); pg.click('[data-action="save-inc"]'); pg.wait_for_timeout(400)
    pg.click('[data-action="open-settings"]'); pg.wait_for_timeout(450)
    pg.click('[data-action="set-currency"][data-code="UAH"]'); pg.wait_for_selector('[data-action="convert-ok"]'); pg.click('[data-action="convert-ok"]'); pg.wait_for_timeout(400)
    pg.click('[data-action="close-settings"]'); pg.wait_for_timeout(450)
    pg.click('.tabbar [data-tab="history"]'); pg.click('[data-action="hist-filter"][data-id="inc"]'); pg.wait_for_timeout(200)
    prem = NB(pg.locator('[data-action="edit-inc"]', has_text="Премия").first.inner_text())
    check("после перехода бюджета на гривну премия ровно +3 000 ₴", "+3 000 ₴" in prem, prem.replace("\n", " | "))
    b.close()
srv.shutdown()
print("\n".join(results)); print("errors:", errors or "none")
