/* ==========================================================================
   Infrastructure layer — SQLite (sql.js / WebAssembly), сохранение файла
   базы на устройстве (IndexedDB), миграции схемы и репозитории.
   ========================================================================== */
(function (root) {
  'use strict';
  const { Dates, Period } = root.Domain;

  // ------------------------------------------------- Хранилище файла базы ---
  /** Хранит бинарный файл SQLite в IndexedDB браузера/PWA на устройстве. */
  class DeviceFileStore {
    constructor(name) { this.name = name; this.dbp = null; }
    _open() {
      if (this.dbp) return this.dbp;
      this.dbp = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(this.name, 1);
          req.onupgradeneeded = () => req.result.createObjectStore('files');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
      return this.dbp;
    }
    async load() {
      try {
        const db = await this._open();
        return await new Promise((resolve, reject) => {
          const r = db.transaction('files', 'readonly').objectStore('files').get('main.sqlite');
          r.onsuccess = () => resolve(r.result || null);
          r.onerror = () => reject(r.error);
        });
      } catch (e) { console.warn('Хранилище недоступно, работа без сохранения', e); this.unavailable = true; return null; }
    }
    async save(bytes) {
      if (this.unavailable) return;
      try {
        const db = await this._open();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put(bytes, 'main.sqlite');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) { console.warn('Не удалось сохранить базу', e); }
    }
  }

  // ------------------------------------------------------------- Миграции ---
  const MIGRATIONS = [
    // v1 — исходная схема
    `
    CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE categories (
      id           INTEGER PRIMARY KEY,
      name         TEXT    NOT NULL,
      color        TEXT    NOT NULL,
      sort         INTEGER NOT NULL DEFAULT 0,
      is_mandatory INTEGER NOT NULL DEFAULT 0 CHECK (is_mandatory IN (0, 1)),
      due_day      INTEGER CHECK (due_day BETWEEN 1 AND 31),
      remind_days  INTEGER NOT NULL DEFAULT 2,
      archived     INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Общий бюджет периода ('YYYY-MM')
    CREATE TABLE budgets (
      period TEXT PRIMARY KEY,
      total  INTEGER NOT NULL CHECK (total >= 0)
    ) WITHOUT ROWID;

    -- Лимит категории в периоде. Для обязательной — сумма, которую нужно внести.
    CREATE TABLE category_limits (
      period      TEXT    NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      amount      INTEGER NOT NULL CHECK (amount >= 0),
      PRIMARY KEY (period, category_id)
    ) WITHOUT ROWID;

    CREATE TABLE expenses (
      id          INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      amount      INTEGER NOT NULL CHECK (amount > 0),
      spent_at    TEXT    NOT NULL,            -- 'YYYY-MM-DD HH:MM', локальное время
      note        TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX ix_expenses_spent_at     ON expenses(spent_at);
    CREATE INDEX ix_expenses_cat_spent_at ON expenses(category_id, spent_at);
    `,
    // v2 — копилка «Накопления» (признак is_savings), курсы валют, убраны рубли
    (db) => {
      db.exec(`
        ALTER TABLE categories ADD COLUMN is_savings INTEGER NOT NULL DEFAULT 0 CHECK (is_savings IN (0, 1));

        -- Курс: сколько единиц валюты за 1 евро. Хранится последний известный.
        CREATE TABLE fx_rates (
          code       TEXT PRIMARY KEY,
          per_eur    REAL NOT NULL CHECK (per_eur > 0),
          source     TEXT NOT NULL,          -- 'ecb' | 'erapi' | 'builtin'
          rate_date  TEXT NOT NULL,          -- дата курса 'YYYY-MM-DD'
          fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
        ) WITHOUT ROWID;
      `);
      const st = db.prepare('INSERT INTO fx_rates(code, per_eur, source, rate_date) VALUES (?, ?, ?, ?)');
      BUILTIN_RATES.forEach(([code, rate]) => st.run([code, rate, 'builtin', BUILTIN_RATES_DATE]));
      st.free();
      // Категория «Накопления» становится копилкой
      db.exec(`UPDATE categories SET is_savings = 1
               WHERE id = (SELECT id FROM categories WHERE archived = 0 AND name = 'Накопления' ORDER BY id LIMIT 1)`);
      // Рубли больше не поддерживаются — переключаем на гривну
      db.exec(`UPDATE settings SET value = 'UAH' WHERE key = 'currency' AND value IN ('RUB', 'BYN')`);
    },
    // v3 — копилка снова называется «Накопления» (в v2 её переименовывали в «Отложенные»)
    `UPDATE categories SET name = 'Накопления' WHERE is_savings = 1 AND name = 'Отложенные';`
  ];

  /** Встроенные курсы на случай, если приложение ни разу не выходило в сеть */
  const BUILTIN_RATES_DATE = '2026-10-15';
  const BUILTIN_RATES = [['EUR', 1], ['USD', 1.1195], ['PLN', 4.3658], ['UAH', 50.4169], ['KZT', 504.387], ['GEL', 2.9093]];

  // ------------------------------------------------------ Обёртка над SQLite ---
  class SqliteDatabase {
    constructor(SQL, store) { this.SQL = SQL; this.store = store; this.db = null; this._timer = null; this.listeners = new Set(); }

    async open() {
      const bytes = await this.store.load();
      this.db = bytes ? new this.SQL.Database(bytes) : new this.SQL.Database();
      this._configure();
      this._migrate();
      return this;
    }

    _configure() {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY;');
    }

    _migrate() {
      const v = this.get('PRAGMA user_version').user_version;
      for (let i = v; i < MIGRATIONS.length; i++) {
        this.db.exec('BEGIN');
        try {
          const m = MIGRATIONS[i];
          if (typeof m === 'function') m(this.db); else this.db.exec(m);
          this.db.exec('PRAGMA user_version = ' + (i + 1));
          this.db.exec('COMMIT');
        }
        catch (e) { this.db.exec('ROLLBACK'); throw e; }
      }
      if (v < MIGRATIONS.length) this.persistSoon();
    }

    all(sql, params) {
      const st = this.db.prepare(sql);
      try {
        if (params) st.bind(params);
        const rows = [];
        while (st.step()) rows.push(st.getAsObject());
        return rows;
      } finally { st.free(); }
    }
    get(sql, params) { return this.all(sql, params)[0] || null; }
    value(sql, params) { const r = this.get(sql, params); return r ? r[Object.keys(r)[0]] : null; }
    run(sql, params) { this.db.run(sql, params || []); }
    lastId() { return this.value('SELECT last_insert_rowid() AS id'); }

    /** Атомарная запись: всё или ничего. После — отложенное сохранение файла. */
    write(fn) {
      this.db.exec('BEGIN');
      let result;
      try { result = fn(this); this.db.exec('COMMIT'); }
      catch (e) { this.db.exec('ROLLBACK'); throw e; }
      this.persistSoon();
      this.listeners.forEach((l) => l());
      return result;
    }

    /** Сохраняем не на каждый чих, а пачкой через 400 мс — это экономит батарею. */
    persistSoon() {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(), 400);
    }
    async flush() {
      clearTimeout(this._timer); this._timer = null;
      if (!this.db) return;
      await this.store.save(this.db.export());
    }

    exportBytes() { return this.db.export(); }

    /** Заменяет базу файлом резервной копии (после проверки, что это наша база). */
    async replaceWith(bytes) {
      const probe = new this.SQL.Database(bytes);
      try {
        const ok = probe.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('expenses','categories','budgets')");
        if (!ok.length || ok[0].values.length < 3) throw new Error('Это не резервная копия приложения «Бюджет»');
      } catch (e) { probe.close(); throw e; }
      this.db.close();
      this.db = probe;
      this._configure();
      this._migrate();
      await this.flush();
    }

    async reset() {
      this.db.close();
      this.db = new this.SQL.Database();
      this._configure();
      this._migrate();
      await this.flush();
    }
  }

  // ---------------------------------------------------------- Репозитории ---
  class SettingsRepository {
    constructor(db) { this.db = db; }
    get(key, fallback) { const v = this.db.value('SELECT value FROM settings WHERE key = ?', [key]); return v == null ? fallback : v; }
    set(key, value) { this.db.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]); }
    all() { const o = {}; this.db.all('SELECT key, value FROM settings').forEach((r) => { o[r.key] = r.value; }); return o; }
  }

  class CategoryRepository {
    constructor(db) { this.db = db; }
    list() { return this.db.all('SELECT * FROM categories WHERE archived = 0 ORDER BY is_mandatory DESC, is_savings, sort, id').map(mapCategory); }
    savings() { const r = this.db.get('SELECT * FROM categories WHERE is_savings = 1 AND archived = 0 ORDER BY id LIMIT 1'); return r ? mapCategory(r) : null; }
    byId(id) { const r = this.db.get('SELECT * FROM categories WHERE id = ?', [id]); return r ? mapCategory(r) : null; }
    /** Включая архивные — нужны для истории старых записей */
    allById() { const m = new Map(); this.db.all('SELECT * FROM categories').forEach((r) => m.set(r.id, mapCategory(r))); return m; }
    create(c) {
      const sort = (this.db.value('SELECT COALESCE(MAX(sort), 0) + 1 FROM categories') || 1);
      this.db.run('INSERT INTO categories(name, color, sort, is_mandatory, due_day, remind_days, is_savings) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [c.name, c.color, sort, c.mandatory ? 1 : 0, c.mandatory ? c.dueDay : null, c.remindDays ?? 2, c.savings ? 1 : 0]);
      return this.db.lastId();
    }
    update(id, c) {
      this.db.run('UPDATE categories SET name = ?, color = ?, is_mandatory = ?, due_day = ?, remind_days = ? WHERE id = ?',
        [c.name, c.color, c.mandatory ? 1 : 0, c.mandatory ? c.dueDay : null, c.remindDays ?? 2, id]);
    }
    hasExpenses(id) { return !!this.db.value('SELECT 1 FROM expenses WHERE category_id = ? LIMIT 1', [id]); }
    /** Категорию с записями прячем в архив, чтобы история не сломалась; пустую — удаляем. */
    remove(id) {
      if (this.db.value('SELECT is_savings FROM categories WHERE id = ?', [id])) throw new Error('Категорию «Накопления» удалить нельзя');
      if (this.hasExpenses(id)) this.db.run('UPDATE categories SET archived = 1 WHERE id = ?', [id]);
      else this.db.run('DELETE FROM categories WHERE id = ?', [id]);
    }
  }
  function mapCategory(r) {
    return {
      id: r.id, name: r.name, color: r.color, sort: r.sort,
      mandatory: !!r.is_mandatory, savings: !!r.is_savings, dueDay: r.due_day, remindDays: r.remind_days, archived: !!r.archived,
      letter: (r.name.trim()[0] || '?').toUpperCase()
    };
  }

  class BudgetRepository {
    constructor(db) { this.db = db; }
    total(period) { return this.db.value('SELECT total FROM budgets WHERE period = ?', [period]); }
    setTotal(period, total) { this.db.run('INSERT INTO budgets(period, total) VALUES (?, ?) ON CONFLICT(period) DO UPDATE SET total = excluded.total', [period, total]); }
    limits(period) {
      const m = new Map();
      this.db.all('SELECT category_id, amount FROM category_limits WHERE period = ?', [period]).forEach((r) => m.set(r.category_id, r.amount));
      return m;
    }
    setLimit(period, categoryId, amount) {
      this.db.run('INSERT INTO category_limits(period, category_id, amount) VALUES (?, ?, ?) ON CONFLICT(period, category_id) DO UPDATE SET amount = excluded.amount', [period, categoryId, amount]);
    }
    exists(period) { return !!this.db.value('SELECT 1 FROM budgets WHERE period = ?', [period]); }
    latestBefore(period) { return this.db.value('SELECT period FROM budgets WHERE period < ? ORDER BY period DESC LIMIT 1', [period]); }
    earliest() { return this.db.value('SELECT MIN(period) FROM budgets'); }
    /** Пересчитывает бюджеты и лимиты всех месяцев (округление до целых единиц делает convert) */
    convertAll(convert) {
      this.db.all('SELECT period, total FROM budgets')
        .forEach((r) => this.db.run('UPDATE budgets SET total = ? WHERE period = ?', [convert(r.total), r.period]));
      this.db.all('SELECT period, category_id, amount FROM category_limits')
        .forEach((r) => this.db.run('UPDATE category_limits SET amount = ? WHERE period = ? AND category_id = ?', [convert(r.amount), r.period, r.category_id]));
    }

    /** Копирует общий бюджет и лимиты из одного периода в другой */
    copy(from, to) {
      const total = this.total(from);
      if (total == null) return false;
      this.setTotal(to, total);
      this.db.run('DELETE FROM category_limits WHERE period = ?', [to]);
      this.db.run('INSERT INTO category_limits(period, category_id, amount) SELECT ?, category_id, amount FROM category_limits WHERE period = ?', [to, from]);
      return true;
    }
  }

  class ExpenseRepository {
    constructor(db) { this.db = db; }
    byId(id) { return this.db.get('SELECT * FROM expenses WHERE id = ?', [id]); }
    add(e) {
      this.db.run('INSERT INTO expenses(category_id, amount, spent_at, note) VALUES (?, ?, ?, ?)', [e.categoryId, e.amount, e.spentAt, e.note || '']);
      return this.db.lastId();
    }
    update(id, e) { this.db.run('UPDATE expenses SET category_id = ?, amount = ?, spent_at = ?, note = ? WHERE id = ?', [e.categoryId, e.amount, e.spentAt, e.note || '', id]); }
    remove(id) { this.db.run('DELETE FROM expenses WHERE id = ?', [id]); }

    /** Записи за диапазон дат (по индексу spent_at) с фильтрами */
    list(range, { categoryId, query } = {}) {
      let sql = 'SELECT id, category_id, amount, spent_at, note FROM expenses WHERE spent_at >= ? AND spent_at < ?';
      const p = [range.startKey, range.endKey];
      if (categoryId) { sql += ' AND category_id = ?'; p.push(categoryId); }
      if (query) { sql += ' AND note LIKE ? ESCAPE \'\\\''; p.push('%' + query.replace(/[\\%_]/g, (m) => '\\' + m) + '%'); }
      sql += ' ORDER BY spent_at DESC, id DESC';
      return this.db.all(sql, p);
    }
    sum(range) { return this.db.value('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE spent_at >= ? AND spent_at < ?', [range.startKey, range.endKey]); }
    sumByCategory(range) {
      const m = new Map();
      this.db.all('SELECT category_id, SUM(amount) AS s FROM expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY category_id', [range.startKey, range.endKey])
        .forEach((r) => m.set(r.category_id, r.s));
      return m;
    }
    sumByDay(range) {
      const m = new Map();
      this.db.all('SELECT substr(spent_at, 1, 10) AS d, SUM(amount) AS s FROM expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY d', [range.startKey, range.endKey])
        .forEach((r) => m.set(r.d, r.s));
      return m;
    }
    /** Пересчёт всех записей одним запросом: сумма × коэффициент, до копеек, не меньше 1 копейки */
    convertAll(factor) {
      this.db.run('UPDATE expenses SET amount = MAX(1, CAST(ROUND(amount * ?) AS INTEGER))', [factor]);
    }
    sumAllTime(categoryId) { return this.db.value('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE category_id = ?', [categoryId]); }
    lastUsedCategory() { return this.db.value('SELECT category_id FROM expenses ORDER BY created_at DESC, id DESC LIMIT 1'); }
    earliestDay() { return this.db.value('SELECT MIN(spent_at) FROM expenses'); }
    count() { return this.db.value('SELECT COUNT(*) FROM expenses'); }
  }

  class FxRepository {
    constructor(db) { this.db = db; }
    all() { const m = new Map(); this.db.all('SELECT code, per_eur, source, rate_date, fetched_at FROM fx_rates').forEach((r) => m.set(r.code, r)); return m; }
    saveMany(rows) {
      rows.forEach((r) => this.db.run(
        `INSERT INTO fx_rates(code, per_eur, source, rate_date, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(code) DO UPDATE SET per_eur = excluded.per_eur, source = excluded.source, rate_date = excluded.rate_date, fetched_at = excluded.fetched_at`,
        [r.code, r.perEur, r.source, r.date]));
    }
  }

  /**
   * Курсы из сети. ЕЦБ (через api.frankfurter.dev — зеркало официальных курсов ЕЦБ)
   * даёт USD и PLN. Гривны, тенге и лари у ЕЦБ нет — их берём у ExchangeRate-API.
   */
  const RatesClient = {
    ECB_CODES: ['USD', 'PLN'],
    OTHER_CODES: ['UAH', 'KZT', 'GEL'],
    async _json(url, ms) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = setTimeout(() => ctl && ctl.abort(), ms);
      try {
        const res = await fetch(url, { cache: 'no-store', signal: ctl && ctl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } finally { clearTimeout(t); }
    },
    /** @returns {Promise<Array<{code, perEur, source, date}>>} пустой массив, если сети нет */
    async fetchLatest(timeoutMs = 6000) {
      const [ecb, other] = await Promise.allSettled([
        this._json('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=' + this.ECB_CODES.join(','), timeoutMs),
        this._json('https://open.er-api.com/v6/latest/EUR', timeoutMs)
      ]);
      const out = new Map();
      if (other.status === 'fulfilled' && other.value && other.value.rates) {
        const date = new Date((other.value.time_last_update_unix || Date.now() / 1000) * 1000).toISOString().slice(0, 10);
        [...this.OTHER_CODES, ...this.ECB_CODES].forEach((c) => {
          const v = other.value.rates[c];
          if (v > 0) out.set(c, { code: c, perEur: v, source: 'erapi', date });
        });
      }
      if (ecb.status === 'fulfilled' && ecb.value && ecb.value.rates) {
        this.ECB_CODES.forEach((c) => { const v = ecb.value.rates[c]; if (v > 0) out.set(c, { code: c, perEur: v, source: 'ecb', date: ecb.value.date }); });
      }
      if (out.size) {
        const date = [...out.values()][0].date;
        out.set('EUR', { code: 'EUR', perEur: 1, source: out.has('USD') && out.get('USD').source === 'ecb' ? 'ecb' : 'erapi', date });
      }
      return [...out.values()];
    }
  };

  // ---------------------------------------------------------- Демо-данные ---
  const DEMO_CATEGORIES = [
    { name: 'Жильё', color: '#2B3A55', limit: 45000, mandatory: true, dueDay: 5 },
    { name: 'Накопления', color: '#0F766E', limit: 7000, mandatory: true, dueDay: 15, savings: true },
    { name: 'Продукты', color: '#23805E', limit: 25000, base: 27300, ticket: 1400, notes: ['Магазин у дома', 'Продукты на неделю', 'Рынок', 'Супермаркет', 'Пекарня', 'Фрукты и овощи'] },
    { name: 'Кафе и рестораны', color: '#B84A17', limit: 12000, base: 11800, ticket: 900, notes: ['Кофе с собой', 'Ужин с друзьями', 'Обед в кафе', 'Бизнес-ланч', 'Доставка пиццы', 'Завтрак в кафе'] },
    { name: 'Развлечения', color: '#6A4FCC', limit: 12000, base: 9100, ticket: 1500, notes: ['Кино, 2 билета', 'Концерт', 'Боулинг', 'Книга', 'Настольная игра', 'Музей'] },
    { name: 'Транспорт', color: '#2F74BD', limit: 8000, base: 4800, ticket: 450, notes: ['Такси до офиса', 'Пополнение проездного', 'Бензин', 'Каршеринг', 'Такси домой'] },
    { name: 'Здоровье', color: '#C2416A', limit: 8000, base: 2600, ticket: 900, notes: ['Аптека', 'Анализы', 'Витамины', 'Стоматолог'] },
    { name: 'Подписки', color: '#8E7414', limit: 3000, fixed: [['Музыкальный сервис', 299, 2], ['Видеосервис', 899, 7], ['Облачное хранилище', 149, 12], ['Мобильная связь', 650, 18], ['Домашний интернет', 650, 20]] }
  ];

  /** Детерминированный генератор, чтобы демо было одинаковым при каждом сбросе */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function seedDemo(repos, now) {
    const rnd = mulberry32(20261011);
    const startDay = 1;
    const current = Period.ofDate(now, startDay);
    const periods = Period.lastN(current, 6);
    const factors = [0.86, 1.04, 1.18, 1.1, 1.0, 1.04];
    const nowStamp = Dates.stamp(now);

    repos.settings.set('currency', 'UAH');
    repos.settings.set('start_day', startDay);
    repos.settings.set('remind_days', 2);
    repos.settings.set('onboarded', 1);
    repos.settings.set('savings_initial', 150000 * 100);

    const ids = DEMO_CATEGORIES.map((c) => repos.categories.create({ name: c.name, color: c.color, mandatory: !!c.mandatory, dueDay: c.dueDay, remindDays: 2, savings: !!c.savings }));

    const add = (catIdx, amountUnits, date, note) => {
      const spentAt = Dates.stamp(date);
      if (spentAt > nowStamp) return;
      repos.expenses.add({ categoryId: ids[catIdx], amount: Math.round(amountUnits) * 100, spentAt, note });
    };
    const at = (period, day, h, m) => { const r = Period.range(period, startDay); const d = new Date(r.start); d.setDate(d.getDate() + day - 1); d.setHours(h, m); return d; };

    periods.forEach((p, pi) => {
      repos.budgets.setTotal(p, 120000 * 100);
      DEMO_CATEGORIES.forEach((c, ci) => repos.budgets.setLimit(p, ids[ci], c.limit * 100));
      const days = Period.range(p, startDay).days;
      const isCurrent = p === current;

      add(0, 45000, at(p, 3, 10, 15), 'Аренда квартиры');
      if (isCurrent) add(1, 3000, at(p, 5, 9, 30), 'Перевод на вклад');
      else { add(1, 4000, at(p, 5, 9, 30), 'Перевод на вклад'); add(1, 3000, at(p, 14, 9, 30), 'Перевод на вклад'); }

      DEMO_CATEGORIES.forEach((c, ci) => {
        if (c.fixed) { c.fixed.forEach(([note, amt, day]) => add(ci, amt, at(p, day, 8, 0), note)); return; }
        if (!c.base) return;
        const target = c.base * factors[pi] * (0.92 + rnd() * 0.16);
        const n = Math.max(2, Math.round(target / c.ticket));
        const weights = Array.from({ length: n }, () => 0.4 + rnd());
        const wsum = weights.reduce((s, w) => s + w, 0);
        weights.forEach((w) => {
          const day = 1 + Math.floor(rnd() * days);
          if (isCurrent && day >= Dates.diffDays(Period.range(p, startDay).start, now) - 1) return; // последние дни заполним вручную
          const amount = Math.max(50, Math.round((target * w / wsum) / 10) * 10);
          add(ci, amount, at(p, day, 8 + Math.floor(rnd() * 14), Math.floor(rnd() * 60)), c.notes[Math.floor(rnd() * c.notes.length)]);
        });
      });
    });

    // Последние три дня — как в макете истории
    const d = (back, h, m) => { const x = new Date(now); x.setDate(x.getDate() - back); x.setHours(h, m, 0, 0); return x; };
    add(2, 1240, d(0, Math.min(18, now.getHours()), 40), 'Магазин у дома');
    add(3, 320, d(0, Math.min(13, now.getHours()), 5), 'Кофе с собой');
    add(5, 560, d(0, Math.min(9, now.getHours()), 12), 'Такси до офиса');
    add(3, 3400, d(1, 20, 15), 'Ужин с друзьями');
    add(4, 1100, d(1, 17, 30), 'Кино, 2 билета');
    add(6, 640, d(1, 11, 2), 'Аптека');
    add(2, 4860, d(2, 19, 20), 'Продукты на неделю');
  }

  root.Infra = { DeviceFileStore, SqliteDatabase, SettingsRepository, CategoryRepository, BudgetRepository, ExpenseRepository, FxRepository, RatesClient, seedDemo };
})(window);
