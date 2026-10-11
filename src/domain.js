/* ==========================================================================
   Domain layer — чистая бизнес-логика без зависимостей от БД и интерфейса.
   Все суммы хранятся в минорных единицах (копейки/центы) как целые числа,
   чтобы не было ошибок округления с плавающей точкой.
   ========================================================================== */
(function (root) {
  'use strict';

  const DAY_MS = 86400000;
  const NBSP = ' ';

  // ---------------------------------------------------------------- Даты ---
  const pad2 = (n) => String(n).padStart(2, '0');

  const Dates = {
    /** 'YYYY-MM-DD' в локальном времени */
    dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); },
    /** 'YYYY-MM-DD HH:MM' — сортируется лексикографически, удобно для индексов */
    stamp(d) { return Dates.dayKey(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); },
    parseDay(key) { const [y, m, d] = key.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); },
    parseStamp(s) {
      const d = Dates.parseDay(s);
      const t = s.slice(11, 16).split(':').map(Number);
      if (t.length === 2 && !isNaN(t[0])) d.setHours(t[0], t[1]);
      return d;
    },
    startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); },
    /** Разница в календарных днях (b - a), устойчива к переходу на летнее время */
    diffDays(a, b) { return Math.round((Dates.startOfDay(b) - Dates.startOfDay(a)) / DAY_MS); },
    daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); },
    time(s) { return s.slice(11, 16); }
  };

  // ------------------------------------------------------------- Названия ---
  const MONTHS = {
    nom: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    gen: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    prep: ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'],
    short: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
    abbr: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  };

  /** plural(5, ['день','дня','дней']) → 'дней' */
  function plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  // --------------------------------------------------------------- Деньги ---
  const Money = {
    /** Форматирует минорные единицы: 3809000 → '38 090 ₽' */
    format(minor, symbol, opts) {
      const o = opts || {};
      const neg = minor < 0;
      const abs = Math.abs(Math.round(minor));
      const whole = Math.floor(abs / 100);
      const frac = abs % 100;
      let s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
      if (frac && !o.noFraction) s += ',' + pad2(frac);
      if (neg && o.sign !== false) s = '−' + s;
      if (o.forceSign && !neg && abs > 0) s = '+' + s;
      return symbol ? s + NBSP + symbol : s;
    },
    /** Компактная подпись для графиков: 10185000 → '102k' */
    compact(minor) {
      const v = minor / 100;
      if (v >= 1e6) return (Math.round(v / 1e5) / 10).toString().replace('.', ',') + 'M';
      if (v >= 1e3) return Math.round(v / 1e3) + 'k';
      return String(Math.round(v));
    },
    /** Строка с клавиатуры '4000,5' → 400050 */
    parse(str) {
      if (str == null) return 0;
      const clean = String(str).replace(/[\s  ]/g, '').replace('.', ',');
      if (!clean) return 0;
      const [w, f = ''] = clean.split(',');
      const whole = parseInt(w || '0', 10);
      if (isNaN(whole)) return 0;
      const frac = parseInt((f + '00').slice(0, 2), 10) || 0;
      return whole * 100 + frac;
    },
    /** 400050 → '4000,5' — для редактирования на клавиатуре */
    toInput(minor) {
      const whole = Math.floor(minor / 100);
      const frac = minor % 100;
      if (!frac) return String(whole);
      return whole + ',' + pad2(frac).replace(/0$/, '');
    }
  };

  // --------------------------------------------------------------- Период ---
  /**
   * Бюджетный период. Ключ — 'YYYY-MM' календарного месяца, в котором
   * период начинается. При startDay = 10 период '2026-10' = 10 окт … 9 ноя.
   */
  const Period = {
    ofDate(d, startDay) {
      let y = d.getFullYear(), m = d.getMonth();
      if (d.getDate() < startDay) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
      return y + '-' + pad2(m + 1);
    },
    parts(key) { const [y, m] = key.split('-').map(Number); return { y, m0: m - 1 }; },
    shift(key, delta) {
      const { y, m0 } = Period.parts(key);
      const d = new Date(y, m0 + delta, 1);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    },
    range(key, startDay) {
      const { y, m0 } = Period.parts(key);
      const start = new Date(y, m0, startDay);
      const end = new Date(y, m0 + 1, startDay); // не включительно
      return { start, end, startKey: Dates.dayKey(start), endKey: Dates.dayKey(end), days: Dates.diffDays(start, end) };
    },
    /** Последние n периодов, заканчивая key (по возрастанию) */
    lastN(key, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(Period.shift(key, -i)); return out; },
    name(key) { return MONTHS.nom[Period.parts(key).m0]; },
    prep(key) { return MONTHS.prep[Period.parts(key).m0]; },
    short(key) { return MONTHS.short[Period.parts(key).m0]; },
    /** 'Октябрь' или 'Октябрь 2025', если год не текущий */
    title(key, now) {
      const { y } = Period.parts(key);
      return Period.name(key) + (y !== now.getFullYear() ? ' ' + y : '');
    }
  };

  // ------------------------------------------------------- Расчёты бюджета ---
  const BudgetMath = {
    /**
     * Сводка по периоду для главного экрана.
     * @returns {{left, spentRatio, elapsedRatio, totalDays, elapsedDays, daysLeft, perDay, state}}
     */
    overview({ total, spent, period, startDay, now }) {
      const r = Period.range(period, startDay);
      const today = Dates.startOfDay(now);
      let state = 'current';
      if (today >= r.end) state = 'past'; else if (today < r.start) state = 'future';
      const totalDays = r.days;
      const elapsedDays = state === 'current' ? Dates.diffDays(r.start, today) + 1 : (state === 'past' ? totalDays : 0);
      const daysLeft = state === 'current' ? totalDays - elapsedDays + 1 : (state === 'future' ? totalDays : 0);
      const left = total - spent;
      // «Можно тратить в день» округляем вниз до целых единиц валюты
      const perDay = daysLeft > 0 ? Math.floor(Math.max(0, left) / daysLeft / 100) * 100 : 0;
      return {
        left, totalDays, elapsedDays, daysLeft, perDay, state,
        spentRatio: total > 0 ? spent / total : (spent > 0 ? 1 : 0),
        elapsedRatio: totalDays ? elapsedDays / totalDays : 0,
        avgPerDay: elapsedDays > 0 ? Math.round(spent / elapsedDays) : 0
      };
    },

    /** Состояние категории с лимитом */
    category({ spent, limit }) {
      const over = limit > 0 && spent > limit;
      return {
        over,
        noLimit: !limit,
        remaining: limit - spent,
        ratio: limit > 0 ? Math.min(spent / limit, 1) : (spent > 0 ? 1 : 0)
      };
    },

    /** Дата срока обязательного платежа внутри периода */
    dueDate(period, startDay, dueDay) {
      const { y, m0 } = Period.parts(period);
      // Если число срока меньше начала периода — оно попадает в следующий календарный месяц
      const month = dueDay < startDay ? m0 + 1 : m0;
      const yy = y + Math.floor(month / 12), mm = ((month % 12) + 12) % 12;
      const day = Math.min(dueDay, Dates.daysInMonth(yy, mm));
      return new Date(yy, mm, day);
    },

    /** Статус обязательного платежа: галочка, когда внесено ≥ нужной суммы */
    mandatory({ required, paid, dueDay, remindDays, period, startDay, now }) {
      const done = required > 0 && paid >= required;
      const due = BudgetMath.dueDate(period, startDay, dueDay || startDay);
      const daysToDue = Dates.diffDays(now, due);
      const r = Period.range(period, startDay);
      const isCurrent = now >= r.start && now < r.end;
      return {
        done,
        paid,
        required,
        remaining: Math.max(0, required - paid),
        ratio: required > 0 ? Math.min(paid / required, 1) : 0,
        due,
        daysToDue,
        overdue: !done && isCurrent && daysToDue < 0,
        remind: !done && isCurrent && daysToDue >= 0 && daysToDue <= (remindDays ?? 2)
      };
    },

    /** Сумма лимитов и свободный остаток бюджета */
    allocation(total, limits) {
      const allocated = limits.reduce((s, x) => s + (x || 0), 0);
      return { allocated, free: total - allocated };
    }
  };

  // ----------------------------------------------------- Подписи для людей ---
  const Labels = {
    dayTitle(key, now) {
      const d = Dates.parseDay(key);
      const diff = Dates.diffDays(d, now);
      const base = d.getDate() + ' ' + MONTHS.gen[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
      if (diff === 0) return 'Сегодня, ' + base;
      if (diff === 1) return 'Вчера, ' + base;
      return base;
    },
    shortDate(d) { return d.getDate() + ' ' + MONTHS.abbr[d.getMonth()]; },
    longDate(d) { return d.getDate() + ' ' + MONTHS.gen[d.getMonth()]; },
    days(n) { return n + ' ' + plural(n, ['день', 'дня', 'дней']); }
  };

  const api = { Dates, MONTHS, plural, Money, Period, BudgetMath, Labels, NBSP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Domain = api;
})(typeof window !== 'undefined' ? window : globalThis);
