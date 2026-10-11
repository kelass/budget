#!/usr/bin/env python3
"""Собирает устанавливаемую офлайн-версию (PWA) в папку site/ — её и публикуем на GitHub Pages."""
import hashlib
import json
import pathlib
import shutil

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
NM = ROOT / "node_modules"
OUT = ROOT / "docs"

if OUT.exists():
    for p in OUT.iterdir():
        if p.name == ".git":
            continue
        shutil.rmtree(p) if p.is_dir() else p.unlink()
OUT.mkdir(exist_ok=True)
for d in ("js", "vendor", "fonts", "icons"):
    (OUT / d).mkdir(exist_ok=True)

# --- шрифты: кладём рядом, чтобы работали офлайн
faces = []
for w in (400, 500, 600, 700, 800):
    for subset, rng in (("cyrillic", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"),
                        ("latin", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")):
        name = f"onest-{subset}-{w}-normal.woff2"
        shutil.copy(NM / "@fontsource/onest/files" / name, OUT / "fonts" / name)
        faces.append(f"@font-face{{font-family:'Onest';font-style:normal;font-display:swap;font-weight:{w};src:url(fonts/{name}) format('woff2');unicode-range:{rng}}}")

css = "\n".join(faces) + "\n" + (SRC / "styles.css").read_text(encoding="utf-8") + "\n" + (SRC / "pwa.css").read_text(encoding="utf-8")
(OUT / "app.css").write_text(css, encoding="utf-8")

for f in ("domain.js", "infra.js", "services.js", "ui.js", "pwa.js"):
    shutil.copy(SRC / f, OUT / "js" / f)
shutil.copy(NM / "sql.js/dist/sql-wasm.js", OUT / "vendor" / "sql-wasm.js")
shutil.copy(NM / "sql.js/dist/sql-wasm.wasm", OUT / "vendor" / "sql-wasm.wasm")


# --- иконки
def icon(size, maskable=False):
    s = 4  # рисуем крупнее и уменьшаем — так края гладкие
    S = size * s
    img = Image.new("RGB", (S, S), "#15171C")
    d = ImageDraw.Draw(img)
    pad = S * (0.27 if maskable else 0.2)
    x0, y0, x1, y1 = pad, S * 0.32, S - pad, S - S * 0.27
    if maskable:
        y0, y1 = S * 0.36, S - S * 0.31
    lw = int(S * 0.055)
    r = int(S * 0.09)
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, outline="#FFFFFF", width=lw)
    band = y0 + (y1 - y0) * 0.3
    d.line([x0 + lw / 2, band, x1 - lw / 2, band], fill="#FFFFFF", width=lw)
    cx, cy, cr = x1 - (x1 - x0) * 0.24, y0 + (y1 - y0) * 0.66, S * 0.055
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill="#2FA779")
    return img.resize((size, size), Image.LANCZOS)


icon(180).save(OUT / "icons/apple-touch-icon.png")
icon(192).save(OUT / "icons/icon-192.png")
icon(512).save(OUT / "icons/icon-512.png")
icon(512, maskable=True).save(OUT / "icons/maskable-512.png")
icon(32).save(OUT / "icons/favicon-32.png")

manifest = {
    "name": "Бюджет",
    "short_name": "Бюджет",
    "description": "Учёт расходов и бюджет на месяц. Работает офлайн, данные хранятся на телефоне.",
    "lang": "ru",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#F3F4F1",
    "theme_color": "#F3F4F1",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(OUT / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

index = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Бюджет</title>
<meta name="description" content="Учёт расходов и бюджет на месяц. Работает офлайн, данные хранятся на телефоне.">
<meta name="theme-color" content="#F3F4F1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Бюджет">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/favicon-32.png">
<link rel="preload" href="fonts/onest-cyrillic-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="app.css">
<style>:root{padding-top:env(safe-area-inset-top,0px)}body{margin:0}</style>
</head>
<body>
<div class="stage"><div class="device" id="device"><div class="boot">Загрузка…</div></div></div>
<noscript><p style="padding:24px">Для работы приложения нужен JavaScript.</p></noscript>
<script>window.__SQL_BASE__='./vendor/';</script>
<script src="vendor/sql-wasm.js"></script>
<script src="js/domain.js"></script>
<script src="js/infra.js"></script>
<script src="js/services.js"></script>
<script src="js/ui.js"></script>
<script src="js/pwa.js"></script>
</body>
</html>
"""
(OUT / "index.html").write_text(index, encoding="utf-8")
(OUT / ".nojekyll").write_text("")

# --- service worker: список файлов и версия по хэшу содержимого
files = sorted(str(p.relative_to(OUT)).replace("\\", "/") for p in OUT.rglob("*")
               if p.is_file() and ".git" not in p.parts and p.name not in (".nojekyll", "sw.js"))
h = hashlib.sha256()
for f in files:
    h.update(f.encode()); h.update((OUT / f).read_bytes())
version = h.hexdigest()[:10]
sw = (SRC / "sw.js").read_text(encoding="utf-8").replace("__VERSION__", version).replace(
    "__FILES__", json.dumps(["./"] + ["./" + f for f in files], ensure_ascii=False))
(OUT / "sw.js").write_text(sw, encoding="utf-8")
(OUT / "version.txt").write_text(version)
print("docs/ built, version", version, "files", len(files))
