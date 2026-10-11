/* ==========================================================================
   Application layer — сценарии использования. Связывает репозитории и
   доменную логику, отдаёт интерфейсу готовые модели представления.
   Интерфейс никогда не ходит в SQL напрямую.
   ========================================================================== */
(function (root) {
  'use strict';
  const { Dates, Period, BudgetMath, Money } = root.Domain;
  const I = root.Infra;

  const CURRENCIES = [
    { code: 'RUB', sym: '₽', name: 'Российский рубль' },
    { code: 'USD', sym: '$', name: 'Доллар США' },
    { code: 'EUR', sym: '€', name: 'Евро' },
    { code: 'PLN', sym: 'zł', name: 'Польский злотый' },
    { code: 'KZT', sym: '₸', name: 'Казахстанский тенге' },
    { code: 'UAH', sym: '₴', name: 'Украинская гривна' },
    { code: 'BYN', sym: 'Br', name: 'Белорусский рубль' },
    { code: 'GEL', sym: '₾', name: 'Грузинский лари' }
  ];

  const PALETTE = [
    ['#0F766E', 'Бирюзовый'], ['#23805E', 'Зелёный'], ['#2F74BD', 'Синий'], ['#6A4FCC', 'Фиолетовый'],
    ['#C2416A', 'Розовый'], ['#B84A17', 'Оранжевый'], ['#8E7414', 'Горчичный'], ['#2B3A55', 'Тёмно-синий']
  ];

  /** Готовый набор категорий для первой настройки (доли от бюджета) */
  const PRESETS = [
    { key: 'home', name: 'Жильё', color: '#2B3A55', share: 0.375, mandatory: true, dueDay: 5, on: true },
    { key: 'save', name: 'Накопления', color: '#0F766E', share: 0.06, mandatory: true, dueDay: 15, on: true },
    { key: 'food', name: 'Продукты', color: '#23805E', share: 0.21, on: true },
    { key: 'cafe', name: 'Кафе и рестораны', color: '#B84A17', share: 0.1, on: true },
    { key: 'fun', name: 'Развлечения', color: '#6A4FCC', share: 0.1, on: true },
    { key: 'car', name: 'Транспорт', color: '#2F74BD', share: 0.065, on: true },
    { key: 'med', name: 'Здоровье', color: '#C2416A', share: 0.065, on: true },
    { key: 'subs', name: 'Подписки', color: '#8E7414', share: 0.025, on: true }
  ];

  class BudgetService {
    constructor(db) {
      this.db = db;
      this.settingsRepo = new I.SettingsRepository(db);
      this.categories = new I.CategoryRepository(db);
      this.budgets = new I.BudgetRepository(db);
      this.expenses = new I.ExpenseRepository(db);
    }

    // ------------------------------------------------------------ Настройки
    settings() {
      const s = this.settingsRepo.all();
      const currency = CURRENCIES.find((c) => c.code === s.currency) || CURRENCIES[0];
      return {
        currency,
        sym: currency.sym,
        startDay: parseInt(s.start_day || '1', 10),
        remindDays: parseInt(s.remind_days || '2', 10),
        onboarded: s.onboarded === '1'
      };
    }
    setSetting(key, value) { this.db.write(() => this.settingsRepo.set(key, value)); }

    currentPeriod(now) { return Period.ofDate(now, this.settings().startDay); }
    range(period) { return Period.range(period, this.settings().startDay); }

    /** Новый месяц автоматически получает бюджет и лимиты предыдущего */
    ensurePeriod(period, now) {
      if (this.budgets.exists(period)) return;
      if (period < this.currentPeriod(now)) return; // прошлое не выдумываем
      const prev = this.budgets.latestBefore(period);
      if (prev) this.db.write(() => this.budgets.copy(prev, period));
    }

    /** Периоды, доступные в выборе месяца: от первого с данными до текущего */
    periods(now) {
      const cur = this.currentPeriod(now);
      const firstBudget = this.budgets.earliest();
      const firstExp = this.expenses.earliestDay();
      let first = cur;
      if (firstBudget && firstBudget < first) first = firstBudget;
      if (firstExp) { const p = Period.ofDate(Dates.parseStamp(firstExp), this.settings().startDay); if (p < first) first = p; }
      const out = [];
      for (let p = cur; p >= first && out.length < 60; p = Period.shift(p, -1)) out.push(p);
      return out;
    }

    // -------------------------------------------------------------- Обзор
    overview(period, now) {
      const st = this.settings();
      const r = this.range(period);
      const cats = this.categories.list();
      const limits = this.budgets.limits(period);
      const spentBy = this.expenses.sumByCategory(r);
      const total = this.budgets.total(period) || 0;
      const spent = this.expenses.sum(r);
      const todayKey = Dates.dayKey(now);
      const todaySpent = this.expenses.sum({ startKey: todayKey, endKey: Dates.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) });
      const ov = BudgetMath.overview({ total, spent, period, startDay: st.startDay, now });

      const mandatory = cats.filter((c) => c.mandatory).map((c) => ({
        cat: c,
        st: BudgetMath.mandatory({ required: limits.get(c.id) || 0, paid: spentBy.get(c.id) || 0, dueDay: c.dueDay, remindDays: c.remindDays, period, startDay: st.startDay, now }),
        doneAt: null
      }));
      mandatory.forEach((m) => {
        if (m.st.done) {
          // Дата, когда набралась нужная сумма — для подписи «внесено 3 окт»
          let acc = 0;
          const rows = this.db.all('SELECT amount, spent_at FROM expenses WHERE category_id = ? AND spent_at >= ? AND spent_at < ? ORDER BY spent_at', [m.cat.id, r.startKey, r.endKey]);
          for (const row of rows) { acc += row.amount; if (acc >= m.st.required) { m.doneAt = Dates.parseStamp(row.spent_at); break; } }
        }
      });

      const regular = cats.filter((c) => !c.mandatory).map((c) => {
        const s = spentBy.get(c.id) || 0, l = limits.get(c.id) || 0;
        return { cat: c, spent: s, limit: l, st: BudgetMath.category({ spent: s, limit: l }) };
      }).sort((a, b) => (b.st.over - a.st.over) || (b.st.ratio - a.st.ratio) || (b.spent - a.spent));

      return { period, total, spent, todaySpent, ov, mandatory, regular, catCount: cats.length, hasBudget: this.budgets.exists(period) };
    }

    // ------------------------------------------------------------ История
    history(period, filter) {
      const r = this.range(period);
      const rows = this.expenses.list(r, filter);
      const byId = this.categories.allById();
      const days = [];
      let cur = null;
      rows.forEach((row) => {
        const d = row.spent_at.slice(0, 10);
        if (!cur || cur.key !== d) { cur = { key: d, total: 0, items: [] }; days.push(cur); }
        cur.total += row.amount;
        cur.items.push({ ...row, cat: byId.get(row.category_id) });
      });
      return { total: this.expenses.sum(r), filteredTotal: rows.reduce((s, x) => s + x.amount, 0), days, count: rows.length };
    }

    // ---------------------------------------------------------- Аналитика
    stats(mode, selected, now) {
      const st = this.settings();
      const cur = this.currentPeriod(now);
      let bars, sel, chartTitle;
      if (mode === 'month') {
        sel = selected || cur;
        const r = this.range(sel);
        const byDay = this.expenses.sumByDay(r);
        const total = this.budgets.total(sel) || 0;
        bars = [];
        for (let i = 0; i < r.days; i++) {
          const d = new Date(r.start); d.setDate(d.getDate() + i);
          const k = Dates.dayKey(d);
          bars.push({ key: k, label: String(d.getDate()), value: byDay.get(k) || 0, future: k > Dates.dayKey(now), today: k === Dates.dayKey(now) });
        }
        chartTitle = 'Расходы по дням';
        return { mode, sel, bars, chartTitle, budgetLine: r.days ? Math.round(total / r.days) : 0, budgetLabel: 'в день по бюджету', detail: this._breakdown(sel), cur };
      }
      const n = mode === 'year' ? 12 : 6;
      const list = Period.lastN(cur, n);
      bars = list.map((p) => ({ key: p, label: Period.short(p), value: this.expenses.sum(this.range(p)), budget: this.budgets.total(p) || 0, current: p === cur }));
      sel = selected && list.includes(selected) ? selected : (bars.length > 1 && bars[bars.length - 2].value > 0 ? list[list.length - 2] : cur);
      chartTitle = 'Расходы по месяцам';
      const budgetLine = this.budgets.total(cur) || Math.max(0, ...bars.map((b) => b.budget));
      return { mode, sel, bars, chartTitle, budgetLine, budgetLabel: 'бюджет', detail: this._breakdown(sel), cur };
    }

    _breakdown(period) {
      const prev = Period.shift(period, -1);
      const r = this.range(period), rp = this.range(prev);
      const byId = this.categories.allById();
      const now = this.expenses.sumByCategory(r), before = this.expenses.sumByCategory(rp);
      const total = this.expenses.sum(r), prevTotal = this.expenses.sum(rp);
      const budget = this.budgets.total(period) || 0;
      const ids = new Set([...now.keys(), ...before.keys()]);
      const cats = [...ids].map((id) => ({ cat: byId.get(id), value: now.get(id) || 0, prev: before.get(id) || 0 }))
        .filter((x) => x.cat && (x.value > 0 || x.prev > 0))
        .sort((a, b) => b.value - a.value);
      return { period, prev, total, prevTotal, budget, cats, hasPrev: prevTotal > 0 };
    }

    // ------------------------------------------------------------- Бюджет
    budget(period) {
      const r = this.range(period);
      const cats = this.categories.list();
      const limits = this.budgets.limits(period);
      const spentBy = this.expenses.sumByCategory(r);
      const total = this.budgets.total(period) || 0;
      const rows = cats.map((c) => ({ cat: c, limit: limits.get(c.id) || 0, spent: spentBy.get(c.id) || 0 }));
      const alloc = BudgetMath.allocation(total, rows.map((x) => x.limit));
      const prev = Period.shift(period, -1);
      return { period, total, rows, ...alloc, prev, canCopy: this.budgets.exists(prev) };
    }

    /** Данные для карточки на экране ввода записи */
    categoryContext(catId, period, excludeExpenseId) {
      const c = this.categories.byId(catId);
      if (!c) return null;
      const r = this.range(period);
      let spent = this.db.value('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE category_id = ? AND spent_at >= ? AND spent_at < ? AND id != ?', [catId, r.startKey, r.endKey, excludeExpenseId || 0]);
      const limit = this.budgets.limits(period).get(catId) || 0;
      return { cat: c, spent, limit };
    }

    // ------------------------------------------------------------ Команды
    saveExpense(e, now) {
      if (!(e.amount > 0)) throw new Error('Введите сумму больше нуля');
      if (!this.categories.byId(e.categoryId)) throw new Error('Выберите категорию');
      const period = Period.ofDate(Dates.parseStamp(e.spentAt), this.settings().startDay);
      this.ensurePeriod(period, now);
      return this.db.write(() => (e.id ? (this.expenses.update(e.id, e), e.id) : this.expenses.add(e)));
    }
    deleteExpense(id) { this.db.write(() => this.expenses.remove(id)); }
    expense(id) { return this.expenses.byId(id); }
    lastUsedCategory() { return this.expenses.lastUsedCategory(); }

    saveCategory(c, period) {
      const name = (c.name || '').trim();
      if (!name) throw new Error('Введите название категории');
      if (name.length > 40) throw new Error('Название длиннее 40 символов');
      return this.db.write(() => {
        let id = c.id;
        if (id) this.categories.update(id, { ...c, name });
        else id = this.categories.create({ ...c, name });
        // лимит действует с текущего периода и дальше
        this.budgets.setLimit(period, id, c.limit || 0);
        this.db.run('UPDATE category_limits SET amount = ? WHERE category_id = ? AND period > ?', [c.limit || 0, id, period]);
        return id;
      });
    }
    removeCategory(id) { this.db.write(() => this.categories.remove(id)); }
    categoryHasExpenses(id) { return this.categories.hasExpenses(id); }
    category(id) { return this.categories.byId(id); }
    categoryList() { return this.categories.list(); }

    setTotal(period, total) { this.db.write(() => this.budgets.setTotal(period, total)); }
    setLimit(period, catId, amount) {
      this.db.write(() => {
        if (!this.budgets.exists(period)) this.budgets.setTotal(period, 0);
        this.budgets.setLimit(period, catId, amount);
      });
    }
    copyFrom(from, to) { return this.db.write(() => this.budgets.copy(from, to)); }

    completeOnboarding({ currency, total, presets }, now) {
      this.db.write(() => {
        this.settingsRepo.set('currency', currency);
        this.settingsRepo.set('start_day', this.settingsRepo.get('start_day', '1'));
        this.settingsRepo.set('remind_days', 2);
        const period = Period.ofDate(now, parseInt(this.settingsRepo.get('start_day', '1'), 10));
        this.budgets.setTotal(period, total);
        const chosen = presets.filter((p) => p.on);
        const shareSum = chosen.reduce((s, p) => s + p.share, 0) || 1;
        let allocated = 0;
        chosen.forEach((p, i) => {
          const id = this.categories.create({ name: p.name, color: p.color, mandatory: !!p.mandatory, dueDay: p.dueDay, remindDays: 2 });
          // распределяем бюджет по долям, округляя до сотен, остаток — в последнюю
          let amount = i === chosen.length - 1 ? total - allocated : Math.floor(total * p.share / shareSum / 10000) * 10000;
          amount = Math.max(0, amount);
          allocated += amount;
          this.budgets.setLimit(period, id, amount);
        });
        this.settingsRepo.set('onboarded', 1);
      });
    }

    async loadDemo(now) {
      await this.db.reset();
      this.db.write(() => I.seedDemo({ settings: this.settingsRepo, categories: this.categories, budgets: this.budgets, expenses: this.expenses }, now));
      await this.db.flush();
    }
    async wipe() { await this.db.reset(); }
  }

  root.App = { BudgetService, CURRENCIES, PALETTE, PRESETS };
})(window);
