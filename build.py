#!/usr/bin/env python3
"""Собирает симуляцию в один самодостаточный HTML: стили, код, SQLite (WASM) внутри."""
import base64
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
SQL = ROOT / "node_modules" / "sql.js" / "dist"
OUT = ROOT / "dist"
OUT.mkdir(exist_ok=True)


def read(p):
    return p.read_text(encoding="utf-8")


def script(code):
    # защищаемся от преждевременного закрытия тега внутри кода
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


wasm_b64 = base64.b64encode((SQL / "sql-wasm.wasm").read_bytes()).decode()

html = "\n".join([
    "<title>Бюджет</title>",
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap">',
    "<style>\n" + read(SRC / "styles.css") + "\n</style>",
    '<div class="stage">',
    '  <div class="device" id="device"><div class="boot">Загружаю базу данных…</div></div>',
    '  <p class="stage-note">Симуляция iPhone на настоящем SQLite. Данные сохраняются в этом браузере — можно закрыть и открыть снова.</p>',
    "</div>",
    script(f'window.__SQL_WASM_B64__="{wasm_b64}";'),
    script(read(SQL / "sql-wasm.js")),
    script(read(SRC / "domain.js")),
    script(read(SRC / "infra.js")),
    script(read(SRC / "services.js")),
    script(read(SRC / "ui.js")),
    script("window.BudgetUI.boot();"),
])

(OUT / "budget.html").write_text(html, encoding="utf-8")
print("dist/budget.html", round(len(html.encode()) / 1024), "KB")
