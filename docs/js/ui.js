/* ==========================================================================
   Presentation layer — экраны по макету. Рендер строками в контейнеры,
   делегирование событий, частичные перерисовки там, где важен фокус.
   ========================================================================== */
(function () {
  'use strict';
  const { Dates, Period, Money, BudgetMath, Labels, plural } = window.Domain;
  const { BudgetService, CURRENCIES, PALETTE, PRESETS, DEFAULT_CURRENCY } = window.App;

  // ------------------------------------------------------------- Утилиты ---
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (d, size = 20, sw = 2, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const P = {
    chev: '<path d="M6 9l6 6 6-6"></path>',
    back: '<path d="M15 18l-6-6 6-6"></path>',
    right: '<path d="M9 18l6-6-6-6"></path>',
    gear: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>',
    home: '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>',
    wallet: '<rect x="2" y="6" width="20" height="14" rx="3"></rect><path d="M2 10h20M16 15h2"></path>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
    pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
    search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"></path>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"></path>',
    del: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"></path><path d="M17.5 9.5l-5 5M12.5 9.5l5 5"></path>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path>',
    alert: '<circle cx="12" cy="12" r="10"></circle><path d="M12 8v4M12 16h.01"></path>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="3"></rect><path d="M11 18h2"></path>',
    share: '<path d="M12 3v13M7 8l5-5 5 5"></path><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"></path>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"></path><path d="M4 20h16"></path>'
  };
  const checkCircle = (size = 28, color = 'var(--accent)', label = 'Выполнено') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 28 28" role="img" aria-label="${label}" style="flex-shrink:0"><circle cx="14" cy="14" r="14" fill="${color}"></circle><path d="M8 14.5l4 4 8-9" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  const emptyCircle = (size = 28) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 28 28" role="img" aria-label="Не выполнено" style="flex-shrink:0"><circle cx="14" cy="14" r="12.75" fill="none" stroke="#B8BAB4" stroke-width="2.5"></circle></svg>`;
  const ava = (c, size) => `<span class="ava" style="background:${c.color};${size ? `width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.31)}px;font-size:${Math.round(size * 0.4)}px` : ''}">${esc(c.letter)}</span>`;
  const striped = (c) => `repeating-linear-gradient(135deg, ${c} 0 4px, ${c}66 4px 8px)`;

  // --------------------------------------------------------------- State ---
  let svc;
  const S = {
    tab: 'main',
    period: null,
    sheet: null,
    page: null,
    onb: null,
    hist: { cat: 0, q: '' },
    stats: { mode: '6m', sel: null },
    scroll: {}
  };
  const el = {};
  let st = null; // кэш настроек на текущий рендер
  const now = () => new Date();
  const fmt = (minor, o) => Money.format(minor, st.sym, o);
  const num = (minor) => Money.format(minor, '', { noFraction: Math.abs(minor) >= 100000 });
  // Подписи периода с учётом дня начала месяца: «Октябрь» или «6 окт – 5 ноя»
  const PT = (p) => svc.periodTitle(p, now());
  const PIN = (p) => svc.periodIn(p, now());
  const PFOR = (p) => svc.periodFor(p, now());
  const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const fmtR = (minor) => Money.format(minor, st.sym, { noFraction: Math.abs(minor) >= 100000 }); // крупные суммы без копеек

  // ============================================================== Экраны ===
  function screenMain() {
    const n = now();
    const vm = svc.overview(S.period, n);
    const ov = vm.ov;
    const out = [];

    out.push(`<div class="head">
      <button class="month-btn" data-action="pick-month" aria-label="Выбрать месяц, сейчас ${esc(PT(S.period))}">${esc(PT(S.period))}${svg(P.chev, 18, 2.5)}</button>
      <button class="icon-btn" data-action="open-settings" aria-label="Настройки">${svg(P.gear, 20)}</button>
    </div>`);

    if (vm.catCount === 0) {
      out.push(`<div class="empty"><div class="t">Добавьте первую категорию</div><div class="s">Категории помогают видеть, куда уходят деньги, и держать лимиты.</div><button class="btn-primary" data-action="new-cat" style="margin-top:6px">Новая категория</button></div>`);
      return out.join('');
    }

    const alerts = vm.mandatory.filter((m) => m.st.remind || m.st.overdue);
    if (alerts.length) {
      const m = alerts[0];
      const when = m.st.overdue ? `срок прошёл ${Labels.longDate(m.st.due)}` : m.st.daysToDue === 0 ? 'срок сегодня' : `до ${Labels.longDate(m.st.due)}`;
      out.push(`<button class="banner" data-action="pay" data-id="${m.cat.id}">${svg(P.bell, 20, 2, 'var(--warn)')}<span><b>${esc(m.cat.name)}</b>: внести ${fmtR(m.st.remaining)}, ${when}${alerts.length > 1 ? ` · ещё ${alerts.length - 1}` : ''}</span></button>`);
    }

    const pct = Math.round(ov.spentRatio * 100);
    const pill = ov.state === 'current' ? Labels.days(ov.daysLeft) : ov.state === 'past' ? 'месяц закрыт' : 'ещё не начался';
    const title = ov.state === 'past' ? (ov.left >= 0 ? 'Осталось в конце месяца' : 'Перерасход за месяц') : (ov.left >= 0 ? 'Осталось на месяц' : 'Перерасход');
    const tiles = ov.state === 'current'
      ? [['Можно тратить в день', '≈ ' + fmtR(ov.perDay)], ['Сегодня потрачено', fmtR(vm.todaySpent)]]
      : [['В среднем в день', fmtR(ov.avgPerDay)], [ov.left >= 0 ? 'Сэкономлено' : 'Перерасход', fmtR(Math.abs(ov.left))]];
    out.push(`<section class="hero" aria-label="Сводка за месяц">
      <div class="hero-top"><span class="t">${title}</span><span class="hero-pill">${pill}</span></div>
      <div class="hero-big${ov.left < 0 ? ' neg' : ''}">${fmtR(ov.left)}</div>
      <div class="hero-sub">${vm.total > 0 ? `Потрачено ${fmtR(vm.spent)} из ${fmtR(vm.total)}` : `Потрачено ${fmtR(vm.spent)} · бюджет не задан`}</div>
      <div class="hero-bar" role="img" aria-label="Потрачено ${pct}% бюджета">
        <div class="fill${ov.spentRatio > 1 ? ' over' : ''}" style="width:${Math.min(100, ov.spentRatio * 100).toFixed(1)}%"></div>
        ${ov.state === 'current' ? `<div class="mark" style="left:calc(${(ov.elapsedRatio * 100).toFixed(1)}% - 1px)"></div>` : ''}
      </div>
      <div class="hero-legend"><span>${pct}% бюджета</span><span>${ov.state === 'current' ? 'сегодня — ' + Labels.shortDate(n) : Labels.days(ov.totalDays)}</span></div>
      <div class="hero-tiles">${tiles.map(([k, v]) => `<div class="hero-tile"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
    </section>`);

    const sv = svc.savings();
    if (sv.cat) {
      const parts = [];
      if (sv.initial) parts.push('стартовые ' + fmtR(sv.initial));
      parts.push('взносы ' + fmtR(sv.contributed));
      out.push(`<button class="savings" data-action="hist-cat" data-id="${sv.cat.id}" aria-label="Всего накоплено ${fmtR(sv.total)}. Открыть взносы">
        ${ava(sv.cat, 44)}
        <span class="main"><span class="k">Всего накоплено</span><span class="v">${fmtR(sv.total)}</span><span class="s">${parts.join(' + ')}</span></span>
        ${svg(P.right, 20, 2.2, 'var(--muted)')}</button>`);
    }

    if (vm.mandatory.length) {
      const done = vm.mandatory.filter((m) => m.st.done).length;
      out.push(`<section class="sec"><div class="sec-head"><h2 class="h2">Обязательные платежи</h2><span class="meta">${done} из ${vm.mandatory.length}</span></div>
        <div class="card">${vm.mandatory.map((m) => mandatoryRow(m, ov.state)).join('')}</div>
        <p class="cap">Галочка ставится, когда записей в категорию за месяц набралось на нужную сумму или больше.</p></section>`);
    }

    if (vm.regular.length) {
      const top = vm.regular.slice(0, 4);
      out.push(`<section class="sec"><div class="sec-head"><h2 class="h2">Категории</h2><button class="link-btn" data-action="tab" data-tab="budget">Все ${vm.catCount}</button></div>
        <div class="card" style="padding:6px 16px">${top.map((r) => {
          const right = r.st.over ? `перерасход ${fmtR(-r.st.remaining)}` : r.st.noLimit ? `потрачено ${fmtR(r.spent)}` : `ещё ${fmtR(r.st.remaining)}`;
          return `<button class="row tap" style="padding:11px 0" data-action="hist-cat" data-id="${r.cat.id}">${ava(r.cat)}
            <span class="main" style="gap:6px"><span class="line"><span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.cat.name)}</span><span class="r${r.st.over ? ' warn' : ''}">${right}</span></span>
            <span class="track"><span style="display:block;height:100%;border-radius:3px;width:${(r.st.ratio * 100).toFixed(1)}%;background:${r.st.over ? 'var(--warn-bar)' : r.cat.color}"></span></span></span></button>`;
        }).join('')}</div></section>`);
    }
    return out.join('');
  }

  function mandatoryRow(m, state) {
    const s = m.st, c = m.cat;
    if (s.done) {
      return `<div class="row done">${checkCircle()}
        <span class="main" style="gap:2px"><span class="title">${esc(c.name)}</span><span class="sub">${num(s.paid)} из ${fmtR(s.required)}${m.doneAt ? ' · внесено ' + Labels.shortDate(m.doneAt) : ''}</span></span>
        <span class="badge ok">Готово</span></div>`;
    }
    let due = `до ${Labels.shortDate(s.due)}`, soon = s.remind || s.overdue;
    if (state === 'current') {
      if (s.overdue) due = `просрочено на ${Labels.days(-s.daysToDue)}`;
      else if (s.daysToDue === 0) due = 'срок сегодня';
      else due += ' · ' + Labels.days(s.daysToDue);
    } else if (state === 'past') { due = 'не внесено'; soon = true; }
    const sub = s.required > 0 ? `${num(s.paid)} из ${fmtR(s.required)} · не хватает ${fmtR(s.remaining)}` : 'Сумма не задана — укажите её в «Бюджете»';
    return `<div class="row">${emptyCircle()}
      <span class="main" style="gap:5px"><span class="line"><span style="font-weight:600;white-space:nowrap;flex-shrink:0">${esc(c.name)}</span><span class="due${soon ? ' soon' : ''}" style="overflow:hidden;text-overflow:ellipsis">${due}</span></span>
      <span class="track thin"><span style="display:block;height:100%;border-radius:3px;width:${(s.ratio * 100).toFixed(1)}%;background:${c.color}"></span></span>
      <span class="sub">${sub}</span></span>
      <button class="btn-dark-sm" data-action="pay" data-id="${c.id}">Внести</button></div>`;
  }

  // ------------------------------------------------------------- История
  function screenHistory() {
    const n = now();
    const total = svc.history(S.period, {}).total;
    const cats = svc.categoryList();
    return `<div class="head"><h1 class="h1">История</h1>
        <button class="link-btn" style="color:var(--ink-2);font-size:14px;font-weight:500" data-action="pick-month">${esc(PT(S.period))} · ${fmtR(total)}</button></div>
      <label class="search" for="hist-q">${svg(P.search, 18, 2, 'var(--muted)')}<span class="sr">Поиск</span>
        <input id="hist-q" type="search" placeholder="Поиск по заметкам" value="${esc(S.hist.q)}" autocomplete="off" enterkeyhint="search"></label>
      <div class="chips" role="group" aria-label="Фильтр по категории">
        <button class="chip" aria-pressed="${!S.hist.cat}" data-action="hist-filter" data-id="0">Все</button>
        ${cats.map((c) => `<button class="chip" aria-pressed="${S.hist.cat === c.id}" data-action="hist-filter" data-id="${c.id}">${esc(shortName(c.name))}</button>`).join('')}
      </div>
      <div id="hist-list" style="display:flex;flex-direction:column;gap:14px">${historyList()}</div>`;
  }

  function historyList() {
    const n = now();
    const vm = svc.history(S.period, { categoryId: S.hist.cat || null, query: S.hist.q.trim() });
    const filtered = S.hist.cat || S.hist.q.trim();
    if (!vm.count) {
      return filtered
        ? `<div class="empty"><div class="t">Ничего не найдено</div><div class="s">Попробуйте другой запрос или сбросьте фильтр.</div></div>`
        : `<div class="empty"><div class="t">Записей пока нет</div><div class="s">Нажмите «+» внизу, чтобы добавить первый расход за этот месяц.</div></div>`;
    }
    const head = filtered ? `<p class="cap" style="margin:0 4px">Найдено ${vm.count} ${plural(vm.count, ['запись', 'записи', 'записей'])} на ${fmtR(vm.filteredTotal)}</p>` : '';
    return head + vm.days.map((d) => `<section class="day">
      <div class="day-head"><h2>${esc(Labels.dayTitle(d.key, n))}</h2><span>−${fmtR(d.total)}</span></div>
      <div class="card list">${d.items.map((t) => `<button class="row tap" data-action="edit-exp" data-id="${t.id}">${ava(t.cat)}
        <span class="main" style="gap:2px"><span class="title">${esc(t.note || t.cat.name)}</span><span class="sub">${esc(t.cat.name)} · ${Dates.time(t.spent_at)}</span></span>
        <span class="amt">−${fmt(t.amount)}</span></button>`).join('')}</div></section>`).join('');
  }

  // ----------------------------------------------------------- Аналитика
  function screenStats() {
    const n = now();
    const mode = S.stats.mode;
    const vm = svc.stats(mode, mode === 'month' ? S.period : S.stats.sel, n);
    if (mode !== 'month') S.stats.sel = vm.sel;
    const isMonth = mode === 'month';

    // В режиме «по дням» одна крупная трата (аренда) не должна сплющивать остальные столбики
    const sorted = vm.bars.map((b) => b.value).sort((a, b) => b - a);
    let max = Math.max(1, vm.budgetLine, sorted[0] || 0) * 1.06;
    if (isMonth) max = Math.min(max, Math.max(vm.budgetLine * 2.5, (sorted[1] || 0) * 1.15, 1));
    const area = 120;
    const lineBottom = Math.round(vm.budgetLine / max * area);
    const bars = vm.bars.map((b, i) => {
      const h = Math.min(area, Math.max(b.value > 0 ? 3 : 0, Math.round(b.value / max * area)));
      const over = isMonth ? (vm.budgetLine > 0 && b.value > vm.budgetLine) : (b.budget > 0 && b.value > b.budget);
      const sel = isMonth ? b.today : b.key === vm.sel;
      const showLabel = isMonth ? b.today : (sel || b.current);
      const cls = ['bar', isMonth ? 'thin' : '', sel ? 'sel' : '', !isMonth && b.current ? 'cur' : '', b.future ? 'future' : '', over && !b.future ? 'over' : ''].join(' ');
      const tag = isMonth ? 'span' : 'button';
      const attrs = isMonth ? `aria-hidden="true"` : `data-action="stats-sel" data-k="${b.key}" aria-pressed="${sel}" aria-label="${esc(PT(b.key))}: ${fmtR(b.value)}"`;
      return `<${tag} class="${cls}" ${attrs}><span class="v" style="visibility:${showLabel ? 'visible' : 'hidden'}">${Money.compact(b.value)}</span><span class="b" style="height:${h}px"></span></${tag}>`;
    }).join('');
    const labels = vm.bars.map((b, i) => {
      if (isMonth) {
        const nearToday = vm.bars.some((x, j) => x.today && Math.abs(j - i) === 1);
        const show = b.today || ((i === 0 || (i + 1) % 5 === 0) && !nearToday);
        return `<span class="${b.today ? 'on' : ''}" style="visibility:${show ? 'visible' : 'hidden'}">${b.label}</span>`;
      }
      return `<span class="${b.key === vm.sel ? 'on' : ''}">${b.label}</span>`;
    }).join('');
    const gap = isMonth ? 3 : mode === 'year' ? 6 : 12;
    const legend = vm.budgetLine > 0 ? `<span class="chart-legend"><i></i>${isMonth ? fmtR(vm.budgetLine) + ' в день' : 'бюджет ' + Money.format(vm.budgetLine, '', { noFraction: true })}</span>` : '';
    const chartAria = isMonth ? `Расходы по дням, ${PT(vm.sel)}` : 'Расходы по месяцам';

    return `<h1 class="h1">Аналитика</h1>
      <div class="seg" role="group" aria-label="Период">
        ${[['month', 'Месяц'], ['6m', '6 месяцев'], ['year', 'Год']].map(([k, t]) => `<button aria-pressed="${mode === k}" data-action="stats-mode" data-m="${k}">${t}</button>`).join('')}
      </div>
      <section class="card pad" style="padding:16px 16px 12px;gap:10px" aria-label="${chartAria}">
        <div class="sec-head"><span style="font-size:15px;font-weight:700">${isMonth ? 'По дням · ' + esc(PT(vm.sel)) : vm.chartTitle}</span>${legend}</div>
        <div class="chart" style="--bar-gap:${gap}px">${vm.budgetLine > 0 ? `<div class="bline" style="bottom:${lineBottom}px"></div>` : ''}${bars}</div>
        <div class="xlabels" style="--bar-gap:${gap}px">${labels}</div>
      </section>
      ${breakdown(vm.detail, n)}`;
  }

  function breakdown(d, n) {
    const total = d.total;
    let acc = 0;
    const stops = d.cats.filter((c) => c.value > 0).map((c) => {
      const a = acc / total * 100; acc += c.value; const b = acc / total * 100;
      return `${c.cat.color} ${a.toFixed(2)}% ${b.toFixed(2)}%`;
    });
    const bg = total > 0 ? `conic-gradient(${stops.join(', ')})` : 'var(--track)';
    const pct = d.budget > 0 ? Math.round(total / d.budget * 100) + '%' : '—';
    const diff = total - d.prevTotal;
    let deltaLine = '';
    if (d.hasPrev) {
      if (diff < 0) deltaLine = `<span style="font-size:13px;font-weight:600" class="good">↓ ${fmtR(-diff)} меньше, чем ${PIN(d.prev)}</span>`;
      else if (diff > 0) deltaLine = `<span style="font-size:13px;font-weight:600" class="bad">↑ ${fmtR(diff)} больше, чем ${PIN(d.prev)}</span>`;
      else deltaLine = `<span style="font-size:13px;font-weight:600;color:var(--muted)">как ${PIN(d.prev)}</span>`;
    }
    const isCur = d.period === svc.currentPeriod(n);
    let budgetLine = '';
    if (d.budget > 0) {
      const left = d.budget - total;
      budgetLine = left >= 0
        ? `<span style="font-size:12px;color:var(--muted)">${isCur ? 'осталось' : 'сэкономлено'} ${fmtR(left)} от бюджета</span>`
        : `<span style="font-size:12px" class="bad">перерасход ${fmtR(-left)}</span>`;
    }
    const rows = d.cats.length ? d.cats.map((c) => {
      let delta = '', cls = '';
      if (d.hasPrev) {
        const x = c.value - c.prev;
        if (x === 0) { delta = '= без изменений'; cls = ''; }
        else { delta = (x < 0 ? '↓ ' : '↑ ') + Money.format(Math.abs(x), '', { noFraction: true }); cls = x < 0 ? 'good' : 'bad'; }
      }
      return `<div class="legend-row"><span class="dot" style="background:${c.cat.color}"></span><span class="n">${esc(c.cat.name)}</span><span class="val">${fmtR(c.value)}</span>${d.hasPrev ? `<span class="d ${cls}" style="${cls ? '' : 'color:var(--muted)'}">${delta}</span>` : ''}</div>`;
    }).join('') : `<p class="cap" style="margin:0">В этом месяце записей нет.</p>`;
    return `<section class="card pad" aria-label="Структура расходов">
      <div class="donut-wrap">
        <div class="donut" role="img" aria-label="Структура расходов, ${esc(PT(d.period))}, ${pct} бюджета" style="background:${bg}"><div>${pct}</div></div>
        <div class="donut-info"><span class="k">${esc(PT(d.period))}</span><span class="v">${fmtR(total)}</span>${deltaLine}${budgetLine}</div>
      </div>
      <div>${rows}</div></section>`;
  }

  // -------------------------------------------------------------- Бюджет
  function screenBudget() {
    const n = now();
    const vm = svc.budget(S.period);
    const segs = vm.rows.filter((r) => r.limit > 0).map((r) => `<div style="flex:${r.limit};background:${r.cat.color}"></div>`).join('')
      + (vm.free > 0 ? `<div style="flex:${vm.free};background:var(--track)"></div>` : '');
    return `<div class="head"><h1 class="h1">Бюджет</h1>
        <button class="pill-btn" data-action="copy-prev" ${vm.canCopy ? '' : 'disabled'}>${svg(P.copy, 16)}${st.startDay === 1 ? 'Как в ' + esc(Period.prep(vm.prev)) : 'Как в прошлом'}</button></div>
      <section class="card pad">
        <div class="sec-head" style="align-items:center"><span style="font-size:14px;color:var(--ink-2);font-weight:500">Общий бюджет ${esc(PFOR(S.period))}</span>
          <button class="text-btn" style="font-size:13px;font-weight:600;min-height:28px;padding:0" data-action="edit-total">Изменить</button></div>
        <div class="big-amount">${fmtR(vm.total)}</div>
        <div class="dist" role="img" aria-label="Распределение бюджета по категориям">${segs}</div>
        <div class="split-line"><span>Распределено <b>${fmtR(vm.allocated)}</b></span>
          ${vm.free >= 0 ? `<span>Свободно <b>${fmtR(vm.free)}</b></span>` : `<span class="bad">Не хватает <b class="bad">${fmtR(-vm.free)}</b></span>`}</div>
      </section>
      <div class="sec-head" style="padding:0 4px"><h2 class="h3">Лимиты по категориям</h2><span style="font-size:13px;color:var(--muted)">потрачено / лимит</span></div>
      ${vm.rows.length ? `<div class="card" style="padding:2px 16px">${vm.rows.map((r) => {
        const over = !r.cat.mandatory && r.limit > 0 && r.spent > r.limit;
        return `<div class="lim-row">
          <button class="who" data-action="edit-cat" data-id="${r.cat.id}" aria-label="Изменить категорию ${esc(r.cat.name)}">${ava(r.cat)}
            <span class="main"><span class="nm"><span>${esc(r.cat.name)}</span>${r.cat.mandatory ? '<span class="tag">ОБЯЗ.</span>' : ''}</span>
            <span class="sp${over ? ' warn' : ''}">${r.cat.mandatory ? 'внесено' : 'потрачено'} ${fmtR(r.spent)}${over ? ' · перерасход' : ''}${r.cat.mandatory && r.limit > 0 && r.spent >= r.limit ? ' · готово' : ''}</span></span></button>
          <label class="lim-input"><span class="sr">Лимит «${esc(r.cat.name)}»</span>
            <input id="lim-${r.cat.id}" data-lim="${r.cat.id}" type="text" inputmode="decimal" enterkeyhint="done" value="${Money.format(r.limit, '', { noFraction: true })}" autocomplete="off"><span>${esc(st.sym)}</span></label>
        </div>`;
      }).join('')}</div>` : `<div class="empty"><div class="t">Категорий пока нет</div><div class="s">Создайте категорию и задайте ей лимит на месяц.</div></div>`}
      <button class="dashed-btn" data-action="new-cat">${svg(P.plus, 18, 2.4)}Новая категория</button>`;
  }

  const shortName = (name) => (name.length > 11 && name.includes(' ') ? name.split(' ')[0] : name);

  // ============================================================ Жесты ===
  /**
   * Закрытие свайпом, как в приложениях iOS: лист тянется вниз, экран настроек — вправо.
   * Жест начинается только когда движение явно идёт по нужной оси, поэтому прокрутка
   * и горизонтальные ленты внутри не ломаются. Короткий рывок тоже закрывает.
   */
  let suppressClickUntil = 0;
  function attachSwipeDismiss(node, { axis, canStart, onDismiss, scrim }) {
    if (!node) return;
    const isY = axis === 'y';
    let start = null, dragging = false, last = 0, lastT = 0, speed = 0;

    const begin = (x, y, target) => {
      if (target.closest('input, textarea, select')) return;
      start = { x, y, t: performance.now(), allowed: canStart(target) };
      dragging = false; last = 0; speed = 0;
    };
    const move = (x, y, ev) => {
      if (!start) return;
      const d = isY ? y - start.y : x - start.x;
      const cross = isY ? Math.abs(x - start.x) : Math.abs(y - start.y);
      if (!dragging) {
        if (!start.allowed) return;
        if (Math.abs(d) < 8 && cross < 8) return;          // ещё непонятно, куда движение
        if (d <= 0 || cross > Math.abs(d)) { start = null; return; } // вверх или вбок — это прокрутка, не жест
        dragging = true;
        node.style.transition = 'none';
        if (scrim) scrim.style.transition = 'none';
      }
      if (ev && ev.cancelable) ev.preventDefault();
      const now2 = performance.now();
      speed = (d - last) / Math.max(1, now2 - lastT);
      last = d; lastT = now2;
      const off = Math.max(0, d);
      node.style.transform = isY ? `translateY(${off}px)` : `translateX(${off}px)`;
      if (scrim) scrim.style.opacity = String(Math.max(0, 1 - off / (node.offsetHeight || 600)));
    };
    const end = () => {
      if (!start) return;
      const wasDragging = dragging;
      start = null; dragging = false;
      if (!wasDragging) return;
      suppressClickUntil = performance.now() + 350;
      const size = isY ? node.offsetHeight : node.offsetWidth;
      node.style.transition = '';
      if (scrim) { scrim.style.transition = ''; scrim.style.opacity = ''; }
      if (last > Math.min(140, size * 0.3) || (speed > 0.5 && last > 30)) {
        node.style.transform = '';
        onDismiss();
      } else {
        node.style.transform = '';
      }
    };

    node.addEventListener('touchstart', (e) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); }, { passive: true });
    node.addEventListener('touchmove', (e) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', end);
    // Мышь (симуляция на компьютере): тянуть за ручку листа или за край экрана настроек
    node.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !e.target.closest(isY ? '.grabber-zone, .sheet-head' : '.page-body')) return;
      begin(e.clientX, e.clientY, e.target);
      const mm = (ev) => move(ev.clientX, ev.clientY, ev);
      const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
      window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    });
  }

  // ================================================================ Листы ===
  function openSheet(sheet) {
    S.sheet = sheet;
    const short = ['month', 'amount', 'confirm', 'backup', 'currency'].includes(sheet.type);
    el.sheetLayer.innerHTML = `<button class="scrim" data-action="close-sheet" aria-label="Закрыть" tabindex="-1"></button>
      <div class="sheet${short ? ' short' : ''}" role="dialog" aria-modal="true"><div class="grabber-zone" aria-hidden="true"><div class="grabber"></div></div><div class="sheet-body"></div></div>`;
    renderSheet();
    const sheetEl = el.sheetLayer.querySelector('.sheet');
    attachSwipeDismiss(sheetEl, {
      axis: 'y',
      scrim: el.sheetLayer.querySelector('.scrim'),
      // тянуть можно за ручку и заголовок, а по содержимому — только когда оно прокручено к началу
      canStart: (target) => !!target.closest('.grabber-zone, .sheet-head') || sheetEl.querySelector('.sheet-body').scrollTop <= 0,
      onDismiss: closeSheet
    });
    el.sheetLayer.getBoundingClientRect(); // старт анимации
    el.sheetLayer.classList.add('on');
  }
  function closeSheet() {
    S.sheet = null;
    el.sheetLayer.classList.remove('on');
    setTimeout(() => { if (!S.sheet) el.sheetLayer.innerHTML = ''; }, 340);
  }
  function renderSheet() {
    const body = el.sheetLayer.querySelector('.sheet-body');
    if (!body || !S.sheet) return;
    const chips = body.querySelector('.cats');
    const sl = chips ? chips.scrollLeft : 0;
    body.innerHTML = SHEETS[S.sheet.type]();
    const chips2 = body.querySelector('.cats');
    if (chips2) chips2.scrollLeft = sl;
    const dlg = el.sheetLayer.querySelector('.sheet');
    const h = body.querySelector('h1');
    if (dlg && h) dlg.setAttribute('aria-label', h.textContent);
  }

  const sheetHead = (title, right = '') => `<div class="sheet-head"><button class="text-btn l" data-action="close-sheet">Отмена</button><h1>${esc(title)}</h1><span class="r">${right}</span></div>`;

  function keypad() {
    return `<div class="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) =>
      `<button class="key${k === ',' || k === 'del' ? ' alt' : ''}" data-action="key" data-k="${k}" aria-label="${k === 'del' ? 'Стереть' : k === ',' ? 'Запятая' : k}">${k === 'del' ? svg(P.del, 24, 1.8) : k}</button>`).join('')}</div>`;
  }
  function amountDisplay(str) {
    const empty = !str;
    const [w, f] = (str || '0').split(',');
    const shown = String(parseInt(w || '0', 10)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f !== undefined ? ',' + f : '');
    const size = shown.length > 11 ? ' xs' : shown.length > 8 ? ' sm' : '';
    return `<div class="amount" aria-live="polite"><span class="n${size}${empty ? ' zero' : ''}">${shown}</span><span class="c">${esc(st.sym)}</span><span class="caret" aria-hidden="true"></span></div>`;
  }
  function pressKey(target, k) {
    let s = target.amount || '';
    if (k === 'del') s = s.slice(0, -1);
    else if (k === ',') { if (!s.includes(',')) s = (s || '0') + ','; }
    else if (/^\d$/.test(k)) {
      if (s.includes(',')) { if (s.split(',')[1].length >= 2) return false; s += k; }
      else if (s === '0' || s === '') s = k === '0' ? '' : k;
      else if (s.length >= 9) return false;
      else s += k;
    } else return false;
    target.amount = s;
    return true;
  }

  // ---------------------------------------------------------- Новая запись
  function openExpense(opts = {}) {
    const n = now();
    const cats = svc.categoryList();
    if (opts.id) {
      const e = svc.expense(opts.id);
      if (!e) return;
      openSheet({ type: 'expense', id: e.id, amount: Money.toInput(e.amount), catId: e.category_id, date: e.spent_at.slice(0, 10), time: e.spent_at.slice(11, 16), note: e.note, origAmount: e.amount });
      return;
    }
    const last = svc.lastUsedCategory();
    const catId = opts.catId || (cats.some((c) => c.id === last) ? last : (cats.find((c) => !c.mandatory) || cats[0] || {}).id);
    openSheet({ type: 'expense', id: null, amount: opts.amount ? Money.toInput(opts.amount) : '', catId, date: Dates.dayKey(n), time: null, note: opts.note || '' });
  }

  function expenseSheet() {
    const s = S.sheet, n = now();
    const cats = svc.categoryList();
    if (!cats.length) {
      return `${sheetHead('Новая запись')}<div class="empty"><div class="t">Сначала создайте категорию</div><div class="s">Каждая запись относится к категории — так видно, куда уходят деньги.</div>
        <button class="btn-primary" data-action="new-cat" style="margin-top:6px">Новая категория</button></div>`;
    }
    const amount = Money.parse(s.amount);
    const day = Dates.parseDay(s.date);
    const diff = Dates.diffDays(day, n);
    const dateLabel = diff === 0 ? 'Сегодня, ' + Labels.shortDate(day) : diff === 1 ? 'Вчера, ' + Labels.shortDate(day) : Labels.shortDate(day) + (day.getFullYear() !== n.getFullYear() ? ' ' + day.getFullYear() : '');
    const chips = cats.map((c) => {
      const on = c.id === s.catId;
      return `<button class="cat-pick" aria-pressed="${on}" data-action="pick-cat" data-id="${c.id}">
        <span class="ic" style="background:${on ? c.color : 'var(--card)'};color:${on ? '#FFFFFF' : c.color};box-shadow:${on ? `0 0 0 3px var(--bg), 0 0 0 5px ${c.color}` : 'none'}">${esc(c.letter)}${c.mandatory ? '<span class="must" aria-label="обязательный">!</span>' : ''}</span>
        <span class="nm">${esc(shortName(c.name))}</span></button>`;
    }).join('');
    return `${sheetHead(s.id ? 'Запись' : 'Новая запись')}
      ${amountDisplay(s.amount)}
      <div class="cats" role="group" aria-label="Категория">${chips}</div>
      ${expenseInfo(s, amount)}
      <div class="fields">
        <label class="field-btn" for="exp-date">${svg(P.cal, 18, 2, 'var(--muted)')}<span>${dateLabel}</span>
          <input id="exp-date" class="overlay-input" type="date" value="${s.date}" max="${Dates.dayKey(new Date(n.getFullYear() + 1, n.getMonth(), n.getDate()))}" aria-label="Дата"></label>
        <label class="field-btn note" for="exp-note">${svg(P.pen, 18, 2, 'var(--muted)')}<span class="sr">Заметка</span>
          <input id="exp-note" type="text" placeholder="Заметка" maxlength="80" value="${esc(s.note)}" autocomplete="off" enterkeyhint="done"></label>
      </div>
      ${keypad()}
      <button class="btn-primary" data-action="save-exp" ${amount > 0 && s.catId ? '' : 'disabled'}>Сохранить</button>
      ${s.id && !s.savings ? `<button class="btn-danger${s.confirmDel ? ' confirm' : ''}" data-action="del-exp">${s.confirmDel ? 'Нажмите ещё раз, чтобы удалить' : 'Удалить запись'}</button>` : ''}`;
  }

  function expenseInfo(s, amount) {
    const period = Period.ofDate(Dates.parseDay(s.date), st.startDay);
    const ctx = svc.categoryContext(s.catId, period, s.id);
    if (!ctx) return '';
    const { cat, spent, limit } = ctx;
    const after = spent + amount;
    const pctOf = (v) => (limit > 0 ? Math.min(100, v / limit * 100) : 0).toFixed(1);
    const bar = (overColor) => `<div class="bar2" role="img" aria-label="Было ${fmtR(spent)}, станет ${fmtR(after)} из ${fmtR(limit)}">
        <div style="width:${pctOf(spent)}%;background:${cat.color}"></div>
        <div style="width:${(pctOf(after) - pctOf(spent)).toFixed(1)}%;background:${striped(overColor || cat.color)}"></div></div>`;
    if (cat.mandatory) {
      const due = BudgetMath.dueDate(period, st.startDay, cat.dueDay || st.startDay);
      let status;
      if (limit <= 0) status = `<span class="txt">Сумма платежа не задана. Её можно указать в «Бюджете».</span>`;
      else if (spent >= limit) status = `<div class="ok">${checkCircle(20, cat.color, '')}Уже внесено полностью</div>`;
      else if (after >= limit && amount > 0) status = `<div class="ok">${checkCircle(20, cat.color, '')}После сохранения платёж будет отмечен</div>`;
      else status = `<span class="txt">Останется внести <b>${fmtR(limit - after)}</b></span>`;
      return `<div class="info"><div class="top"><span class="tagbig">ОБЯЗАТЕЛЬНО</span><span>до ${Labels.longDate(due)}</span></div>
        ${limit > 0 ? bar() + `<span class="txt">Было ${fmtR(spent)} → станет <b>${fmtR(after)} из ${fmtR(limit)}</b></span>` : ''}${status}</div>`;
    }
    if (limit <= 0) {
      return `<div class="info"><div class="top">Лимит не задан</div><span class="txt">${cap1(PIN(period))} на «${esc(cat.name)}» потрачено <b>${fmtR(spent)}</b>${amount ? `, станет <b>${fmtR(after)}</b>` : ''}</span></div>`;
    }
    const overBy = after - limit;
    return `<div class="info"><div class="top">Лимит ${PIN(period)} · ${esc(cat.name)}</div>
      ${bar(overBy > 0 ? '#C9541E' : null)}
      <span class="txt">Было ${fmtR(spent)} → станет <b>${fmtR(after)} из ${fmtR(limit)}</b></span>
      ${overBy > 0 ? `<div class="wr">${svg(P.alert, 18, 2)}Лимит будет превышен на ${fmtR(overBy)}</div>` : `<span class="txt">Останется <b>${fmtR(limit - after)}</b></span>`}</div>`;
  }

  function saveExpense() {
    const s = S.sheet, n = now();
    const amount = Money.parse(s.amount);
    if (!(amount > 0) || !s.catId) return;
    const time = s.time || (s.date === Dates.dayKey(n) ? Dates.stamp(n).slice(11) : '12:00');
    const period = Period.ofDate(Dates.parseDay(s.date), st.startDay);
    const before = svc.categoryContext(s.catId, period, s.id);
    try {
      svc.saveExpense({ id: s.id, categoryId: s.catId, amount, spentAt: s.date + ' ' + time, note: (s.note || '').trim() }, n);
    } catch (e) { toast(e.message, true); return; }
    let msg = s.id ? 'Запись обновлена' : 'Запись сохранена';
    if (before.cat.mandatory && before.limit > 0 && before.spent < before.limit && before.spent + amount >= before.limit) msg = `Платёж «${before.cat.name}» отмечен`;
    else if (period !== S.period) msg += ' ' + PIN(period);
    closeSheet();
    render();
    toast(msg);
  }

  // ------------------------------------------------------------ Категория
  function openCategory(id) {
    const n = now();
    if (id) {
      const c = svc.category(id);
      const limit = svc.budget(S.period).rows.find((r) => r.cat.id === id)?.limit || 0;
      openSheet({ type: 'category', id, name: c.name, color: c.color, limit: limit ? Money.format(limit, '', { noFraction: true }) : '', mandatory: c.mandatory, savings: c.savings, dueDay: c.dueDay || 15, remindDays: c.remindDays ?? st.remindDays, origLimit: limit });
    } else {
      const used = new Set(svc.categoryList().map((c) => c.color));
      const color = (PALETTE.find(([c]) => !used.has(c)) || PALETTE[0])[0];
      openSheet({ type: 'category', id: null, name: '', color, limit: '', mandatory: false, dueDay: Math.min(28, n.getDate() + 5), remindDays: st.remindDays, origLimit: 0 });
    }
  }

  function categorySheet() {
    const s = S.sheet;
    const vm = svc.budget(S.period);
    const free = vm.free + (s.origLimit || 0);
    const letter = (s.name.trim()[0] || '?').toUpperCase();
    const limit = Money.parse(s.limit);
    const reminds = [[0, 'в день срока'], [1, 'за 1 день'], [2, 'за 2 дня'], [3, 'за 3 дня'], [5, 'за 5 дней'], [7, 'за неделю']];
    const delText = s.id && svc.categoryHasExpenses(s.id) ? 'Записи сохранятся в истории, категория скроется' : 'Категория будет удалена';
    return `${sheetHead(s.id ? 'Категория' : 'Новая категория')}
      <div style="display:flex;align-items:center;gap:14px">
        <span id="cat-ava" class="ava" style="width:60px;height:60px;border-radius:19px;font-size:24px;font-weight:800;background:${s.color}">${esc(letter)}</span>
        <label class="field" style="flex:1;min-width:0" for="cat-name"><span>Название</span>
          <input id="cat-name" class="input" type="text" value="${esc(s.name)}" placeholder="Например, Спорт" maxlength="40" autocomplete="off" enterkeyhint="done"></label>
      </div>
      <div class="field"><span>Цвет</span>
        <div class="swatches" role="radiogroup" aria-label="Цвет категории">${PALETTE.map(([c, label]) =>
          `<button class="swatch" role="radio" aria-checked="${c === s.color}" aria-label="${label}" data-action="pick-color" data-c="${c}" style="background:${c};box-shadow:${c === s.color ? `0 0 0 3px var(--bg), 0 0 0 5px ${c}` : 'none'}"></button>`).join('')}</div></div>
      <label class="field" for="cat-limit"><span>Лимит на месяц</span>
        <span class="input-money"><input id="cat-limit" type="text" inputmode="decimal" value="${esc(s.limit)}" placeholder="0" autocomplete="off" enterkeyhint="done"><span>${esc(st.sym)}</span></span>
        <span style="font-size:12px;color:${free < 0 ? 'var(--warn)' : 'var(--ink-2)'}">${free >= 0 ? `Свободно в бюджете ${PFOR(S.period)}: ${fmtR(free)}` : `Бюджет ${PFOR(S.period)} уже распределён с превышением на ${fmtR(-free)}`}</span></label>
      <div class="card" style="padding:4px 14px;border-radius:18px">
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;${s.mandatory ? 'border-bottom:1px solid var(--line)' : ''}">
          <div style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:15px;font-weight:700" id="must-l">Обязательный платёж</span>
            <span style="font-size:12px;color:var(--ink-2);line-height:1.35">Галочка на главной загорится, когда внесёте нужную сумму</span></div>
          <button class="switch" role="switch" aria-checked="${s.mandatory}" aria-labelledby="must-l" data-action="toggle-must"><span></span></button>
        </div>
        ${s.mandatory ? `
          <div class="opt-row"><span>Нужно внести не меньше</span><span style="font-weight:700" id="cat-req">${fmtR(limit)}</span></div>
          <label class="opt-row" for="cat-due"><span>Срок</span><span class="val">до ${s.dueDay} числа${st.startDay !== 1 ? ' · ' + Labels.shortDate(BudgetMath.dueDate(S.period, st.startDay, s.dueDay)) : ''}</span>
            <select id="cat-due" aria-label="Срок платежа">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${i + 1 === s.dueDay ? ' selected' : ''}>до ${i + 1} числа</option>`).join('')}</select></label>
          <label class="opt-row" for="cat-remind"><span>Напомнить</span><span class="val">${(reminds.find(([d]) => d === s.remindDays) || reminds[2])[1]}</span>
            <select id="cat-remind" aria-label="Когда напомнить">${reminds.map(([d, t]) => `<option value="${d}"${d === s.remindDays ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
      </div>
      ${s.savings ? `<p class="cap" style="margin:0">Все взносы в эту категорию копятся во «Всего накоплено» на главной. Стартовую сумму можно поменять в настройках.</p>` : ''}
      <div style="flex:1"></div>
      <button class="btn-primary" data-action="save-cat">${s.id ? 'Сохранить' : 'Создать категорию'}</button>
      ${s.id && !s.savings ? `<button class="btn-danger${s.confirmDel ? ' confirm' : ''}" data-action="del-cat">${s.confirmDel ? 'Нажмите ещё раз: ' + delText.toLowerCase() : 'Удалить категорию'}</button>` : ''}`;
  }

  function saveCategory() {
    const s = S.sheet;
    try {
      svc.saveCategory({ id: s.id, name: s.name, color: s.color, limit: Money.parse(s.limit), mandatory: s.mandatory, dueDay: s.dueDay, remindDays: s.remindDays }, S.period);
    } catch (e) { toast(e.message, true); return; }
    closeSheet(); render(); toast(s.id ? 'Категория сохранена' : 'Категория создана');
  }

  // --------------------------------------------------------- Прочие листы
  function amountSheet() {
    const s = S.sheet;
    return `${sheetHead(s.title)}${amountDisplay(s.amount)}<p class="cap" style="text-align:center">${esc(s.hint || '')}</p>${keypad()}
      <button class="btn-primary" data-action="save-amount">Сохранить</button>`;
  }

  function monthSheet() {
    const n = now();
    const list = svc.periods(n);
    return `${sheetHead('Месяц')}<div class="card" role="radiogroup" aria-label="Месяц">${list.map((p) => {
      const sum = svc.history(p, {}).total;
      return `<button class="radio-row" role="radio" aria-checked="${p === S.period}" data-action="set-period" data-p="${p}">
        <span class="nm" style="font-weight:${p === S.period ? 700 : 500}">${esc(PT(p))}${p === svc.currentPeriod(n) ? ' <span style="color:var(--muted);font-weight:500">· текущий</span>' : ''}</span>
        <span class="cd">${fmtR(sum)}</span><span class="ck">${svg(P.check, 18, 2.6, 'var(--link)')}</span></button>`;
    }).join('')}</div>`;
  }

  function confirmSheet() {
    const s = S.sheet;
    return `<h1 style="margin:6px 0 0;font-size:20px;font-weight:800;text-align:center">${esc(s.title)}</h1>
      <p style="margin:0;text-align:center;font-size:15px;color:var(--ink-2);line-height:1.45">${esc(s.text)}</p>
      <button class="btn-primary" style="${s.danger ? 'background:var(--warn)' : ''}" data-action="confirm-ok">${esc(s.ok)}</button>
      <button class="btn-secondary" data-action="close-sheet">Отмена</button>`;
  }

  function backupSheet() {
    const s = S.sheet;
    return `${sheetHead('Резервная копия')}
      <p class="cap" style="margin:0;font-size:14px;color:var(--ink-2)">Файл базы SQLite со всеми записями, категориями и лимитами. Сохраните его в «Файлы» или отправьте себе в Telegram.</p>
      <button class="btn-primary" data-action="backup-share">${svg(P.share, 20, 2, '#FFFFFF')}&nbsp;Сохранить файл копии</button>
      <button class="btn-secondary" data-action="backup-copy">Скопировать копию как текст</button>
      <div style="height:6px"></div>
      <span class="label-up" style="margin:0">Восстановить</span>
      <label class="btn-secondary" style="display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer" for="backup-file">${svg(P.upload, 18)}Выбрать файл .sqlite
        <input id="backup-file" type="file" accept=".sqlite,.db,application/x-sqlite3,application/octet-stream" class="sr"></label>
      <label class="field" for="backup-text"><span>или вставьте текст копии</span>
        <textarea id="backup-text" class="textarea" placeholder="Текст резервной копии…">${esc(s.text || '')}</textarea></label>
      <button class="btn-secondary" data-action="backup-restore-text" ${s.text ? '' : 'disabled'}>Восстановить из текста</button>
      <p class="cap" style="margin:0">Восстановление заменит все текущие данные на данные из копии.</p>`;
  }

  function fmtRate(x) {
    const d = x >= 100 ? 1 : x >= 10 ? 2 : x >= 1 ? 3 : 4;
    return x.toFixed(d).replace('.', ',');
  }

  function currencySheet() {
    const s = S.sheet;
    const to = CURRENCIES.find((c) => c.code === s.to);
    if (s.loading) {
      return `${sheetHead('Смена валюты')}<div class="empty" style="background:transparent;padding:30px 10px"><div class="spinner" aria-hidden="true"></div><div class="s">Получаю курс ${esc(st.currency.code)} → ${esc(to.code)}…</div></div>`;
    }
    const pl = s.plan;
    if (!pl) {
      return `${sheetHead('Смена валюты')}<div class="empty"><div class="t">Нет курса для перевода в ${esc(to.inForm)}</div><div class="s">Подключитесь к интернету и попробуйте ещё раз.</div></div>`;
    }
    const big = pl.rate >= 1 ? `1 ${esc(pl.from.sym)} = ${fmtRate(pl.rate)} ${esc(pl.to.sym)}` : `1 ${esc(pl.to.sym)} = ${fmtRate(pl.reverse)} ${esc(pl.from.sym)}`;
    const when = Labels.longDate(Dates.parseDay(pl.date));
    const srcLine = pl.builtin
      ? `Встроенный курс от ${when}: приложение ещё ни разу не получало курс из сети.`
      : `${esc(pl.source)}, курс от ${when}.${s.online ? '' : ' Нет интернета, взят последний сохранённый курс.'}`;
    return `${sheetHead('Смена валюты')}
      <h1 style="margin:2px 0 0;font-size:22px;font-weight:800;text-align:center">Перевести бюджет в ${esc(to.inForm)}?</h1>
      <div class="sample" style="justify-content:center"><span style="font-size:22px;color:#FFFFFF;font-weight:800">${big}</span></div>
      <p class="cap" style="margin:0;text-align:center;font-size:13px;${s.online || pl.builtin ? '' : 'color:var(--warn)'}">${srcLine}</p>
      <div class="card" style="border-radius:18px;padding:0 16px">
        <div class="opt-row"><span>Бюджет</span><span style="font-weight:700;white-space:nowrap">${Money.format(pl.totalBefore, pl.from.sym, { noFraction: true })} → ${Money.format(pl.totalAfter, pl.to.sym, { noFraction: true })}</span></div>
        <div class="opt-row"><span>Потрачено</span><span style="font-weight:700;white-space:nowrap">${Money.format(pl.spentBefore, pl.from.sym, { noFraction: true })} → ${Money.format(pl.spentAfter, pl.to.sym, { noFraction: true })}</span></div>
      </div>
      <p class="cap" style="margin:0">Пересчитаются все суммы по этому курсу: бюджеты и лимиты, все записи трат, в том числе за прошлые месяцы, и стартовая сумма накоплений.</p>
      <button class="btn-primary" data-action="convert-ok">Перевести в ${esc(to.code)}</button>`;
  }

  const SHEETS = { currency: currencySheet, expense: expenseSheet, category: categorySheet, amount: amountSheet, month: monthSheet, confirm: confirmSheet, backup: backupSheet };

  // ============================================================ Настройки ===
  function openSettings() {
    S.page = 'settings';
    el.pageLayer.innerHTML = `<div class="page" role="dialog" aria-modal="true" aria-label="Настройки"><div class="page-body"></div></div>`;
    renderPage();
    attachSwipeDismiss(el.pageLayer.querySelector('.page'), { axis: 'x', canStart: () => true, onDismiss: closeSettings });
    el.pageLayer.getBoundingClientRect();
    el.pageLayer.classList.add('on');
  }
  function closeSettings() {
    S.page = null; el.pageLayer.classList.remove('on');
    setTimeout(() => { if (!S.page) el.pageLayer.innerHTML = ''; }, 340);
    render();
  }
  function renderPage() {
    const body = el.pageLayer.querySelector('.page-body');
    if (!body) return;
    const sample = svc.overview(S.period, now()).ov.left;
    const count = svc.expenses.count();
    const reminds = [[0, 'в день срока'], [1, 'за 1 день'], [2, 'за 2 дня'], [3, 'за 3 дня'], [5, 'за 5 дней'], [7, 'за неделю']];
    body.innerHTML = `
      <div style="display:flex;align-items:center;min-height:44px"><button class="back" data-action="close-settings">${svg(P.back, 24, 2.2)}Обзор</button></div>
      <h1 class="h1" style="margin:0 0 6px">Настройки</h1>
      <h2 class="label-up">Валюта</h2>
      <div class="sample"><span>Так будут выглядеть суммы</span><span>${fmtR(sample)}</span></div>
      <div class="card" role="radiogroup" aria-label="Валюта" style="border-radius:18px;padding:0 16px">${CURRENCIES.map((c) =>
        `<button class="radio-row" role="radio" aria-checked="${c.code === st.currency.code}" data-action="set-currency" data-code="${c.code}">
          <span class="sym">${esc(c.sym)}</span><span class="nm">${esc(c.name)}</span><span class="cd">${c.code}</span><span class="ck">${svg(P.check, 18, 2.6, 'var(--link)')}</span></button>`).join('')}</div>
      <p class="cap" style="margin:0 4px 6px">При смене валюты все суммы — бюджеты, лимиты, записи и накопления — пересчитываются по курсу. ${rateNote()}</p>
      <h2 class="label-up">Накопления</h2>
      <div class="card" style="border-radius:18px;padding:0 16px">
        <div class="opt-row"><span>Было накоплено до начала учёта</span><span class="val">${fmtR(st.savingsInitial)}</span><button class="cover" data-action="edit-savings" aria-label="Изменить стартовую сумму накоплений"></button></div>
      </div>
      <p class="cap" style="margin:0 4px 6px">Всего накоплено = эта сумма + все взносы в категорию «Накопления».</p>
      <h2 class="label-up">Месяц и напоминания</h2>
      <div class="card" style="border-radius:18px;padding:0 16px">
        <label class="opt-row" for="set-start"><span>Начало месяца</span><span class="val">${st.startDay} число</span>
          <select id="set-start" aria-label="Начало месяца">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}"${i + 1 === st.startDay ? ' selected' : ''}>${i + 1} число</option>`).join('')}</select></label>
        <label class="opt-row" for="set-remind"><span>Напоминать о платежах</span><span class="val">${(reminds.find(([d]) => d === st.remindDays) || reminds[2])[1]}</span>
          <select id="set-remind" aria-label="Напоминание по умолчанию">${reminds.map(([d, t]) => `<option value="${d}"${d === st.remindDays ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <p class="cap" style="margin:0 4px 6px">${st.startDay === 1 ? 'Если зарплата приходит не 1-го, поставьте день зарплаты: например, при 6 числе месяц станет «6 окт – 5 ноя», и сроки платежей будут считаться внутри него.' : `Сейчас месяц: ${esc(PT(svc.currentPeriod(now())))}. Срок «до 10 числа» означает ${esc(Labels.longDate(BudgetMath.dueDate(svc.currentPeriod(now()), st.startDay, 10)))}, «до 3 числа» — ${esc(Labels.longDate(BudgetMath.dueDate(svc.currentPeriod(now()), st.startDay, 3)))}.`} Напоминание задаётся для новых обязательных категорий.</p>
      <h2 class="label-up">Данные</h2>
      <div class="card" style="border-radius:18px;padding:0 16px">
        <div class="opt-row"><span>Резервная копия</span><span class="val">${svg(P.right, 18, 2.2, 'var(--muted)')}</span><button class="cover" data-action="open-backup" aria-label="Резервная копия"></button></div>
        <div class="opt-row"><span>Загрузить демо-данные</span><span class="val">${svg(P.right, 18, 2.2, 'var(--muted)')}</span><button class="cover" data-action="ask-demo" aria-label="Загрузить демо-данные"></button></div>
        <div class="opt-row"><span style="color:var(--warn)">Удалить все данные</span><button class="cover" data-action="ask-wipe" aria-label="Удалить все данные"></button></div>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-start;margin:6px 4px 0">${svg(P.shield, 18, 2, 'var(--muted)')}
        <p class="cap" style="margin:0">Все данные хранятся только на этом устройстве, в базе SQLite. В базе ${count} ${plural(count, ['запись', 'записи', 'записей'])}.${svc.db.store.unavailable ? ' <b style="color:var(--warn)">Хранилище недоступно — изменения не сохранятся после закрытия.</b>' : ''}</p></div>`;
  }

  /** Подпись про сохранённый курс в настройках */
  function rateNote() {
    const r = svc.rates().get(st.currency.code === 'EUR' ? 'USD' : st.currency.code);
    if (!r) return '';
    const d = Dates.parseDay(r.rate_date);
    return r.source === 'builtin' ? 'Курс ещё не загружался из сети.' : `Сохранённый курс от ${Labels.longDate(d)}.`;
  }

  // ============================================================ Онбординг ===
  function renderOnboarding() {
    const o = S.onb || (S.onb = { step: 0, currency: DEFAULT_CURRENCY, amount: '', sav: { amount: '' }, presets: PRESETS.map((p) => ({ ...p })) });
    const sym = (CURRENCIES.find((c) => c.code === o.currency) || CURRENCIES[0]).sym;
    st = { ...st, sym };
    const steps = (k) => `<div class="steps" aria-label="Шаг ${k} из 4">${[1, 2, 3, 4].map((i) => `<i class="${i <= k ? 'on' : ''}"></i>`).join('')}</div>`;
    const backBtn = `<button class="back" data-action="onb-back" style="align-self:flex-start">${svg(P.back, 24, 2.2)}Назад</button>`;
    let body = '', foot = '';
    if (o.step === 0) {
      body = `<div style="flex:1;min-height:12px"></div>
        <div class="logo">${svg(P.wallet, 38, 2, '#FFFFFF')}</div>
        <h1>Бюджет на месяц под контролем</h1>
        <p>Записывайте траты за пару секунд и смотрите, сколько можно потратить сегодня, чтобы дотянуть до конца месяца.</p>
        <div style="display:flex;flex-direction:column;gap:14px;margin-top:8px">
          <div class="point"><span class="pi">${svg(P.phone, 20)}</span><span>Работает без интернета. Все данные хранятся только на вашем телефоне.</span></div>
          <div class="point"><span class="pi">${svg(P.check, 20, 2.4)}</span><span>Обязательные платежи отмечаются галочкой, когда внесена вся сумма.</span></div>
          <div class="point"><span class="pi">${svg(P.chart, 20)}</span><span>Аналитика по месяцам и категориям.</span></div>
        </div>`;
      foot = `<button class="btn-primary" data-action="onb-next">Настроить</button><button class="btn-secondary" data-action="onb-demo">Посмотреть на демо-данных</button>`;
    } else if (o.step === 1) {
      body = `${backBtn}${steps(1)}<h1>Валюта</h1><p>В какой валюте ведёте бюджет? Потом можно поменять.</p>
        <div class="card" role="radiogroup" aria-label="Валюта" style="border-radius:18px;padding:0 16px">${CURRENCIES.map((c) =>
          `<button class="radio-row" role="radio" aria-checked="${c.code === o.currency}" data-action="onb-currency" data-code="${c.code}"><span class="sym">${esc(c.sym)}</span><span class="nm">${esc(c.name)}</span><span class="ck">${svg(P.check, 18, 2.6, 'var(--link)')}</span></button>`).join('')}</div>`;
      foot = `<button class="btn-primary" data-action="onb-next">Дальше</button>`;
    } else if (o.step === 2) {
      body = `${backBtn}${steps(2)}<h1>Сколько тратите в месяц?</h1><p>Всё вместе, включая аренду и другие обязательные платежи.</p>
        ${amountDisplay(o.amount)}<div style="flex:1"></div>${keypad()}`;
      foot = `<button class="btn-primary" data-action="onb-next" ${Money.parse(o.amount) > 0 ? '' : 'disabled'}>Дальше</button>`;
    } else if (o.step === 3) {
      body = `${backBtn}${steps(3)}<h1>Сколько уже накоплено?</h1><p>Деньги, которые у вас уже есть в копилке или на вкладе. Дальше к ним будут прибавляться взносы в категорию «Накопления».</p>
        ${amountDisplay(o.sav.amount)}<div style="flex:1"></div>${keypad()}`;
      foot = `<button class="btn-primary" data-action="onb-next">${Money.parse(o.sav.amount) > 0 ? 'Дальше' : 'Пока ничего, дальше'}</button>`;
    } else {
      const total = Money.parse(o.amount);
      const on = o.presets.filter((p) => p.on);
      const shareSum = on.reduce((s, p) => s + p.share, 0) || 1;
      body = `${backBtn}${steps(4)}<h1>Категории</h1><p>Бюджет распределим по категориям автоматически. Лимиты и список можно поменять в любой момент.</p>
        <div class="card" style="border-radius:18px;padding:0 16px">${o.presets.map((p, i) => {
          const lim = p.on ? Math.floor(total * p.share / shareSum / 10000) * 10000 : 0;
          return `<button class="check-row" role="checkbox" aria-checked="${p.on}" ${p.locked ? 'aria-disabled="true"' : `data-action="onb-preset" data-i="${i}"`}>
            <span class="box">${p.on ? svg(P.check, 16, 3, '#FFFFFF') : ''}</span>${ava({ color: p.color, letter: p.name[0] })}
            <span style="flex:1;min-width:0;display:flex;align-items:center;gap:6px"><span style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>${p.locked ? '<span class="tag" style="background:var(--teal)">ВСЕГДА</span>' : p.mandatory ? '<span class="tag">ОБЯЗ.</span>' : ''}</span>
            <span style="font-size:14px;font-weight:600;color:var(--muted);white-space:nowrap">${p.on ? Money.format(lim, sym, { noFraction: true }) : ''}</span></button>`;
        }).join('')}</div>`;
      foot = `<button class="btn-primary" data-action="onb-finish" ${on.length ? '' : 'disabled'}>Начать</button>`;
    }
    el.onb.innerHTML = `<div class="onb-body">${body}</div><div class="onb-foot">${foot}</div>`;
    el.onb.hidden = false;
  }

  /** Куда идут нажатия цифровой клавиатуры: открытый лист или шаг первой настройки */
  function keyTarget() {
    if (S.sheet && (S.sheet.type === 'expense' || S.sheet.type === 'amount')) return S.sheet;
    if (S.onb && el.app.hidden) { if (S.onb.step === 2) return S.onb; if (S.onb.step === 3) return S.onb.sav; }
    return null;
  }

  // ================================================================ Рендер ===
  function render() {
    st = svc.settings();
    if (!st.onboarded) {
      el.app.hidden = true;
      renderOnboarding();
      return;
    }
    el.onb.hidden = true;
    el.app.hidden = false;
    svc.ensurePeriod(S.period, now());
    const screen = el.screen;
    S.scroll[screen.dataset.tab] = screen.scrollTop;
    const html = { main: screenMain, history: screenHistory, stats: screenStats, budget: screenBudget }[S.tab]();
    screen.className = 'screen' + (S.tab === 'main' ? '' : ' tight');
    screen.innerHTML = html;
    if (screen.dataset.tab !== S.tab) { screen.dataset.tab = S.tab; screen.scrollTop = S.scroll[S.tab] || 0; }
    el.tabbar.querySelectorAll('[data-tab]').forEach((b) => {
      if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (S.page) renderPage();
  }

  let toastTimer;
  function toast(text, isError) {
    el.toast.innerHTML = (isError ? svg(P.alert, 18, 2, '#F2A27E') : svg(P.check, 18, 2.6, '#7FD3B0')) + `<span>${esc(text)}</span>`;
    el.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('on'), 2400);
  }

  // ============================================================== Действия ===
  const A = {
    tab(t) { S.tab = t.dataset.tab; render(); },
    add() { openExpense(); },
    'close-sheet'() { closeSheet(); },
    'pick-month'() { openSheet({ type: 'month' }); },
    'set-period'(t) { S.period = t.dataset.p; S.stats.sel = null; closeSheet(); render(); },
    'open-settings'() { openSettings(); },
    'close-settings'() { closeSettings(); },
    pay(t) {
      const id = +t.dataset.id;
      const m = svc.overview(S.period, now()).mandatory.find((x) => x.cat.id === id);
      openExpense({ catId: id, amount: m ? m.st.remaining : 0 });
    },
    'hist-cat'(t) { S.tab = 'history'; S.hist = { cat: +t.dataset.id, q: '' }; render(); },
    'hist-filter'(t) { S.hist.cat = +t.dataset.id; render(); },
    'edit-exp'(t) { openExpense({ id: +t.dataset.id }); },
    'pick-cat'(t) { S.sheet.catId = +t.dataset.id; renderSheet(); },
    key(t) {
      const target = keyTarget();
      if (!target || !pressKey(target, t.dataset.k)) return;
      if (target === S.onb || (S.onb && target === S.onb.sav)) renderOnboarding(); else renderSheet();
    },
    'save-exp'() { saveExpense(); },
    'del-exp'() {
      if (!S.sheet.confirmDel) { S.sheet.confirmDel = true; renderSheet(); return; }
      svc.deleteExpense(S.sheet.id); closeSheet(); render(); toast('Запись удалена');
    },
    'stats-mode'(t) { S.stats.mode = t.dataset.m; render(); },
    'stats-sel'(t) { S.stats.sel = t.dataset.k; render(); },
    'new-cat'() { if (S.sheet) { closeSheet(); setTimeout(() => openCategory(null), 200); } else openCategory(null); },
    'edit-cat'(t) { openCategory(+t.dataset.id); },
    'pick-color'(t) { S.sheet.color = t.dataset.c; renderSheet(); },
    'toggle-must'() { S.sheet.mandatory = !S.sheet.mandatory; renderSheet(); },
    'save-cat'() { saveCategory(); },
    'del-cat'() {
      if (!S.sheet.confirmDel) { S.sheet.confirmDel = true; renderSheet(); return; }
      svc.removeCategory(S.sheet.id); if (S.hist.cat === S.sheet.id) S.hist.cat = 0;
      closeSheet(); render(); toast('Категория удалена');
    },
    'edit-total'() {
      const vm = svc.budget(S.period);
      openSheet({ type: 'amount', title: 'Бюджет ' + PFOR(S.period), amount: vm.total ? Money.toInput(vm.total) : '', hint: 'Общая сумма на месяц, включая обязательные платежи' });
    },
    'save-amount'() {
      const v = Money.parse(S.sheet.amount);
      if (S.sheet.kind === 'savings') { svc.setSavingsInitial(v); closeSheet(); render(); toast('Стартовая сумма сохранена'); return; }
      svc.setTotal(S.period, v); closeSheet(); render(); toast('Бюджет обновлён');
    },
    'edit-savings'() {
      openSheet({ type: 'amount', kind: 'savings', title: 'Было накоплено', amount: st.savingsInitial ? Money.toInput(st.savingsInitial) : '', hint: 'Сумма, которая уже была накоплена до начала учёта в приложении' });
    },
    'copy-prev'() {
      const vm = svc.budget(S.period);
      openSheet({ type: 'confirm', title: 'Скопировать лимиты?',
        text: `Общий бюджет и лимиты ${PFOR(S.period)} станут такими же, как ${PIN(vm.prev)}.`, ok: 'Скопировать',
        run: () => { svc.copyFrom(vm.prev, S.period); toast('Лимиты скопированы'); } });
    },
    'confirm-ok'() { const run = S.sheet.run; closeSheet(); Promise.resolve(run()).then(render); },
    'set-currency'(t) {
      const code = t.dataset.code;
      if (code === st.currency.code) return;
      openSheet({ type: 'currency', to: code, loading: true });
      svc.freshRates().then(({ rates, online }) => {
        if (!S.sheet || S.sheet.type !== 'currency' || S.sheet.to !== code) return;
        Object.assign(S.sheet, { loading: false, online, plan: svc.conversionPlan(code, rates, now()) });
        renderSheet();
      });
    },
    'convert-ok'() {
      const plan = S.sheet.plan;
      if (!plan) return;
      svc.changeCurrency(plan); closeSheet(); render(); toast('Все суммы переведены в ' + plan.to.inForm);
    },
    'open-backup'() { openSheet({ type: 'backup', text: '' }); },
    'ask-demo'() {
      openSheet({ type: 'confirm', title: 'Загрузить демо-данные?', text: 'Текущие записи, категории и лимиты будут заменены примером за полгода.', ok: 'Загрузить', danger: true,
        run: async () => { await svc.loadDemo(now()); S.period = svc.currentPeriod(now()); S.hist = { cat: 0, q: '' }; toast('Демо-данные загружены'); } });
    },
    'ask-wipe'() {
      openSheet({ type: 'confirm', title: 'Удалить все данные?', text: 'Все записи, категории и лимиты будут удалены с этого устройства без возможности восстановления. Сделайте резервную копию, если она нужна.', ok: 'Удалить всё', danger: true,
        run: async () => { await svc.wipe(); S.onb = null; S.tab = 'main'; if (S.page) { S.page = null; el.pageLayer.classList.remove('on'); el.pageLayer.innerHTML = ''; } } });
    },
    async 'backup-share'() {
      const bytes = svc.db.exportBytes();
      const name = `budget-${Dates.dayKey(now())}.sqlite`;
      const file = new File([bytes], name, { type: 'application/x-sqlite3' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Резервная копия «Бюджет»' }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      // В симуляции (страница внутри рамки просмотра) скачивание файлов запрещено — честно говорим об этом
      if (window.self !== window.top) { toast('В симуляции файл не сохранить — используйте «Скопировать как текст»', true); return; }
      try {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('Файл копии сохраняется');
      } catch (e) { toast('Не удалось сохранить файл. Скопируйте копию как текст.', true); }
    },
    async 'backup-copy'() {
      const bytes = svc.db.exportBytes();
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const text = 'BUDGET1:' + btoa(bin);
      try { await navigator.clipboard.writeText(text); toast('Копия скопирована, вставьте её в заметку или чат'); }
      catch (e) { S.sheet.text = text; renderSheet(); const ta = document.getElementById('backup-text'); if (ta) { ta.focus(); ta.select(); } toast('Текст копии в поле ниже — скопируйте его', true); }
    },
    'backup-restore-text'() {
      const txt = (S.sheet.text || '').trim().replace(/^BUDGET1:/, '');
      try {
        const bin = atob(txt.replace(/\s+/g, ''));
        const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        restore(bytes);
      } catch (e) { toast('Текст копии повреждён', true); }
    },
    'onb-next'() { S.onb.step++; renderOnboarding(); },
    'onb-back'() { S.onb.step = Math.max(0, S.onb.step - 1); renderOnboarding(); },
    'onb-currency'(t) { S.onb.currency = t.dataset.code; renderOnboarding(); },
    'onb-preset'(t) { const p = S.onb.presets[+t.dataset.i]; p.on = !p.on; renderOnboarding(); },
    async 'onb-demo'() { await svc.loadDemo(now()); S.period = svc.currentPeriod(now()); S.onb = null; render(); toast('Демо-данные загружены'); },
    'onb-finish'() {
      const o = S.onb;
      svc.completeOnboarding({ currency: o.currency, total: Money.parse(o.amount), presets: o.presets, savingsInitial: Money.parse(o.sav.amount) }, now());
      S.period = svc.currentPeriod(now()); S.onb = null; S.tab = 'main'; render(); toast('Готово! Добавьте первую трату кнопкой «+»');
    }
  };

  async function restore(bytes) {
    try {
      await svc.db.replaceWith(bytes);
      svc.ensureSavingsCategory();
      S.period = svc.currentPeriod(now()); S.hist = { cat: 0, q: '' };
      closeSheet(); render(); toast('Данные восстановлены');
    } catch (e) { toast(e.message || 'Файл не подходит', true); }
  }

  // ======================================================= Ввод с клавиатуры ===
  let histTimer;
  function onInput(e) {
    const t = e.target;
    if (t.id === 'hist-q') {
      S.hist.q = t.value;
      clearTimeout(histTimer);
      histTimer = setTimeout(() => { const l = document.getElementById('hist-list'); if (l) l.innerHTML = historyList(); }, 120);
    } else if (t.id === 'exp-note') S.sheet.note = t.value;
    else if (t.id === 'cat-name') {
      S.sheet.name = t.value;
      const a = document.getElementById('cat-ava'); if (a) a.textContent = (t.value.trim()[0] || '?').toUpperCase();
    } else if (t.id === 'cat-limit') {
      S.sheet.limit = t.value;
      const r = document.getElementById('cat-req'); if (r) r.textContent = fmtR(Money.parse(t.value));
    } else if (t.id === 'backup-text') {
      const had = !!S.sheet.text; S.sheet.text = t.value;
      const b = el.sheetLayer.querySelector('[data-action="backup-restore-text"]'); if (b) b.disabled = !t.value.trim();
      if (had !== !!t.value) { /* без перерисовки, чтобы не терять фокус */ }
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'exp-date' && t.value) { S.sheet.date = t.value; if (!S.sheet.id) S.sheet.time = null; renderSheet(); }
    else if (t.dataset.lim) {
      const id = +t.dataset.lim;
      const val = Money.parse(t.value);
      svc.setLimit(S.period, id, val);
      render();
    } else if (t.id === 'cat-due') { S.sheet.dueDay = +t.value; renderSheet(); }
    else if (t.id === 'cat-remind') { S.sheet.remindDays = +t.value; renderSheet(); }
    else if (t.id === 'set-start') { svc.setSetting('start_day', t.value); S.period = svc.currentPeriod(now()); render(); toast('Начало месяца: ' + t.value + ' число'); }
    else if (t.id === 'set-remind') { svc.setSetting('remind_days', t.value); render(); }
    else if (t.id === 'backup-file' && t.files && t.files[0]) {
      t.files[0].arrayBuffer().then((buf) => restore(new Uint8Array(buf))).catch(() => toast('Не удалось прочитать файл', true));
    }
  }
  function onKey(e) {
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') { if (S.sheet) closeSheet(); else if (S.page) closeSettings(); return; }
    if (typing) {
      if (e.key === 'Enter' && (e.target.dataset.lim || e.target.id === 'exp-note' || e.target.id === 'cat-name' || e.target.id === 'cat-limit')) e.target.blur();
      return;
    }
    const target = keyTarget();
    if (!target) return;
    let k = null;
    if (/^\d$/.test(e.key)) k = e.key; else if (e.key === ',' || e.key === '.') k = ','; else if (e.key === 'Backspace') k = 'del';
    else if (e.key === 'Enter') { if (target === S.sheet && S.sheet.type === 'expense') saveExpense(); else if (target === S.sheet) A['save-amount'](); return; }
    if (k && pressKey(target, k)) { e.preventDefault(); if (target === S.onb || (S.onb && target === S.onb.sav)) renderOnboarding(); else renderSheet(); }
  }

  // ================================================================ Старт ===
  function buildShell() {
    el.device.innerHTML = `
      <div id="app" hidden>
        <main class="screen" id="screen" data-tab=""></main>
        <nav class="tabbar" aria-label="Основная навигация">
          <button class="tab" data-action="tab" data-tab="main">${svg(P.home, 24)}Обзор</button>
          <button class="tab" data-action="tab" data-tab="history">${svg(P.list, 24)}История</button>
          <button class="fab" data-action="add" aria-label="Добавить расход">${svg(P.plus, 26, 2.6)}</button>
          <button class="tab" data-action="tab" data-tab="stats">${svg(P.chart, 24)}Аналитика</button>
          <button class="tab" data-action="tab" data-tab="budget">${svg(P.wallet, 24)}Бюджет</button>
        </nav>
      </div>
      <div class="onb" id="onb" hidden></div>
      <div class="layer" id="page-layer"></div>
      <div class="layer" id="sheet-layer"></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
    el.app = document.getElementById('app');
    el.screen = document.getElementById('screen');
    el.tabbar = el.device.querySelector('.tabbar');
    el.onb = document.getElementById('onb');
    el.pageLayer = document.getElementById('page-layer');
    el.sheetLayer = document.getElementById('sheet-layer');
    el.toast = document.getElementById('toast');

    el.device.addEventListener('click', (e) => {
      if (performance.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
      const t = e.target.closest('[data-action]');
      if (!t || t.disabled) return;
      const fn = A[t.dataset.action];
      if (fn) { e.preventDefault(); fn(t, e); }
    });
    el.device.addEventListener('input', onInput);
    el.device.addEventListener('change', onChange);
    el.device.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.lim) setTimeout(() => e.target.select(), 0); });
    el.device.addEventListener('click', (e) => {
      // На десктопе прозрачный input[type=date] не всегда открывает календарь — помогаем
      if (e.target.id === 'exp-date' && e.target.showPicker) { try { e.target.showPicker(); } catch (_) { /* iOS откроет сам */ } }
    });
    document.addEventListener('keydown', onKey);
  }

  async function loadSql() {
    let wasmBinary;
    if (window.__SQL_WASM_B64__) {
      const bin = atob(window.__SQL_WASM_B64__);
      wasmBinary = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) wasmBinary[i] = bin.charCodeAt(i);
      delete window.__SQL_WASM_B64__;
    }
    try {
      return await window.initSqlJs(wasmBinary ? { wasmBinary } : { locateFile: (f) => window.__SQL_BASE__ + f });
    } catch (e) {
      // Если WebAssembly запрещён окружением — JS-сборка SQLite (медленнее, но работает)
      console.warn('WASM недоступен, переключаюсь на asm.js', e);
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-asm.js';
        s.onload = resolve; s.onerror = () => reject(new Error('Не удалось загрузить SQLite'));
        document.head.appendChild(s);
      });
      return await window.initSqlJs();
    }
  }

  async function boot() {
    el.device = document.getElementById('device');
    try {
      const SQL = await loadSql();
      const db = await new window.Infra.SqliteDatabase(SQL, new window.Infra.DeviceFileStore('budget-app')).open();
      svc = new BudgetService(db);
      svc.ensureSavingsCategory();
      S.period = svc.currentPeriod(now());
      buildShell();
      render();
      if (db.store.unavailable) toast('Хранилище недоступно: данные не сохранятся после закрытия', true);
      let lastDay = Dates.dayKey(now());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') db.flush();
        else if (Dates.dayKey(now()) !== lastDay) { lastDay = Dates.dayKey(now()); S.period = svc.currentPeriod(now()); render(); }
      });
      window.addEventListener('pagehide', () => db.flush());
      // Курсы: как только есть интернет — один раз за сеанс обновляем сохранённые в базе
      const syncRates = () => svc.syncRatesOnce(now()).then((ok) => { if (ok && S.page) renderPage(); });
      window.addEventListener('online', syncRates);
      if (navigator.onLine !== false) setTimeout(syncRates, 1500);
    } catch (e) {
      console.error(e);
      el.device.innerHTML = `<div class="boot"><span class="err">Не удалось запустить базу данных</span><span>${esc(e.message || e)}</span></div>`;
    }
  }

  window.BudgetUI = { boot, flush: () => (svc ? svc.db.flush() : Promise.resolve()) };
})();
