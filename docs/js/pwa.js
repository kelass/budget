/* ==========================================================================
   PWA shell — экран установки на iPhone, офлайн-кэш (service worker),
   плашка «Доступна новая версия», просьба не удалять данные.
   ========================================================================== */
(function () {
  'use strict';

  const isStandalone = () =>
    window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser|OPiOS|GSA|Telegram|Instagram|FBAN|FBAV/.test(ua);

  const share = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5"></path><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"></path></svg>';
  const addSq = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"></rect><path d="M12 8v8M8 12h8"></path></svg>';
  const wallet = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="14" rx="3"></rect><path d="M2 10h20M16 15h2"></path></svg>';

  function installScreen() {
    const device = document.getElementById('device');
    const notSafari = isIOS && !isSafari;
    device.innerHTML = `
      <div class="onb install">
        <div class="onb-body">
          <div style="flex:1;min-height:8px"></div>
          <div class="logo">${wallet}</div>
          <h1>Установите «Бюджет» на iPhone</h1>
          <p>Это займёт 10 секунд. Приложение появится на экране «Домой», будет работать без интернета, а данные останутся только на вашем телефоне.</p>
          ${notSafari ? `<div class="banner" style="cursor:default">Сейчас ссылка открыта не в Safari. Нажмите «⋯» или значок браузера и выберите «Открыть в Safari».</div>` : ''}
          <ol class="install-steps">
            <li><span class="pi">${share}</span><span>Нажмите <b>«Поделиться»</b> на панели Safari</span></li>
            <li><span class="pi">${addSq}</span><span>Прокрутите и выберите <b>«На экран Домой»</b></span></li>
            <li><span class="pi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"></path></svg></span><span>Нажмите <b>«Добавить»</b> в правом верхнем углу</span></li>
          </ol>
          <p style="font-size:14px">Дальше открывайте приложение иконкой «Бюджет» на экране «Домой»: ваши записи хранятся именно там.</p>
        </div>
        ${isIOS ? `<div class="install-arrow" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M5 13l7 7 7-7"></path></svg></div>` : ''}
        ${isIOS ? '' : `<div class="onb-foot"><button class="btn-secondary" id="open-anyway">Открыть в браузере</button></div>`}
      </div>`;
    const btn = document.getElementById('open-anyway');
    if (btn) btn.addEventListener('click', () => { try { sessionStorage.setItem('budget.browser', '1'); } catch (_) { /* приватный режим */ } start(); });
  }

  // ---------------------------------------------------------- Обновления
  function updateBanner(worker) {
    if (document.getElementById('update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'update-bar';
    bar.innerHTML = '<span>Доступна новая версия</span><button type="button">Обновить</button>';
    bar.querySelector('button').addEventListener('click', () => {
      bar.querySelector('button').disabled = true;
      Promise.resolve(window.BudgetUI.flush()).finally(() => worker.postMessage('skip-waiting'));
    });
    document.getElementById('device').appendChild(bar);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return; reloading = true;
      setTimeout(() => location.reload(), 150);
    });
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const watch = (w) => w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) updateBanner(w);
      });
      if (reg.waiting && navigator.serviceWorker.controller) updateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // проверяем обновления при каждом возврате в приложение
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch((e) => console.warn('Офлайн-режим недоступен', e));
  }

  function start() {
    // Просим систему не удалять данные приложения при нехватке места
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    document.getElementById('device').innerHTML = '<div class="boot">Загружаю базу данных…</div>';
    window.BudgetUI.boot();
  }

  let allowBrowser = false;
  try { allowBrowser = sessionStorage.getItem('budget.browser') === '1'; } catch (_) { /* ignore */ }
  registerSW();
  if (isStandalone() || allowBrowser || /[?&]web\b/.test(location.search)) start();
  else installScreen();
})();
