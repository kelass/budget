import pathlib, sys
from playwright.sync_api import sync_playwright
html = (pathlib.Path(__file__).resolve().parent.parent / "dist" / "index.html")
src = (pathlib.Path(__file__).resolve().parent.parent / "dist" / "budget.html").read_text()
html.write_text('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">' + src + '</body></html>')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 390, "height": 700}, has_touch=True, is_mobile=True)
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(html.as_uri()); pg.wait_for_selector(".onb-body"); pg.click('[data-action="onb-demo"]'); pg.wait_for_selector(".hero")
    for i in range(4):
        pg.click('.tabbar [data-tab="budget"]'); pg.click('[data-action="new-cat"]'); pg.wait_for_timeout(350)
        pg.fill("#cat-name", f"Тест {i}"); pg.click('[data-action="save-cat"]'); pg.wait_for_timeout(350)
    pg.click('.tabbar [data-tab="budget"]'); pg.wait_for_timeout(200)
    r = pg.evaluate("""() => { const s=document.getElementById('screen'); const d=document.querySelector('.dashed-btn'); const rows=[...document.querySelectorAll('.lim-row')].map(x=>x.getBoundingClientRect().height);
      return {scrollH:s.scrollHeight, clientH:s.clientHeight, dashedH:d.getBoundingClientRect().height, minRow:Math.min(...rows)} }""")
    print(r, errs or "")
    b.close()
