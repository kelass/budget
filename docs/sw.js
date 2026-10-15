/* Service worker: держит все файлы приложения в кэше, чтобы оно работало без интернета.
   e1af912e42 и ["./", "./app.css", "./fonts/onest-cyrillic-400-normal.woff2", "./fonts/onest-cyrillic-500-normal.woff2", "./fonts/onest-cyrillic-600-normal.woff2", "./fonts/onest-cyrillic-700-normal.woff2", "./fonts/onest-cyrillic-800-normal.woff2", "./fonts/onest-latin-400-normal.woff2", "./fonts/onest-latin-500-normal.woff2", "./fonts/onest-latin-600-normal.woff2", "./fonts/onest-latin-700-normal.woff2", "./fonts/onest-latin-800-normal.woff2", "./icons/apple-touch-icon.png", "./icons/favicon-32.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./index.html", "./js/domain.js", "./js/infra.js", "./js/pwa.js", "./js/services.js", "./js/ui.js", "./manifest.webmanifest", "./vendor/sql-wasm.js", "./vendor/sql-wasm.wasm"] подставляет сборка. Данные пользователя здесь не хранятся. */
const VERSION = 'e1af912e42';
const CACHE = 'budget-' + VERSION;
const FILES = ["./", "./app.css", "./fonts/onest-cyrillic-400-normal.woff2", "./fonts/onest-cyrillic-500-normal.woff2", "./fonts/onest-cyrillic-600-normal.woff2", "./fonts/onest-cyrillic-700-normal.woff2", "./fonts/onest-cyrillic-800-normal.woff2", "./fonts/onest-latin-400-normal.woff2", "./fonts/onest-latin-500-normal.woff2", "./fonts/onest-latin-600-normal.woff2", "./fonts/onest-latin-700-normal.woff2", "./fonts/onest-latin-800-normal.woff2", "./icons/apple-touch-icon.png", "./icons/favicon-32.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./index.html", "./js/domain.js", "./js/infra.js", "./js/pwa.js", "./js/services.js", "./js/ui.js", "./manifest.webmanifest", "./vendor/sql-wasm.js", "./vendor/sql-wasm.wasm"];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('budget-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // внешние запросы не трогаем
  // Открытие приложения — всегда из кэша, даже в авиарежиме
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
