# Budget

Expense tracking and a monthly budget for iPhone. The app is installed from Safari to the Home Screen, works without an internet connection and keeps all data on the phone only, in a real SQLite database. There is no backend, no sign-up, and nothing is ever sent anywhere.

**Open the app:** https://kelass.github.io/budget/

> The interface is in Russian. The default currency is the Ukrainian hryvnia; five other currencies are available in settings.

## Install on iPhone

1. Open the link above in **Safari**.
2. Tap **Share** in the Safari toolbar.
3. Choose **Add to Home Screen** and tap **Add**.
4. Launch the app from the «Бюджет» icon.

No App Store, no Mac and no Apple Developer account are needed. If the link opened inside Telegram or another app, choose **Open in Safari** first.

## Features

- **Month overview.** How much is left, how much you can spend per day to make it to the end of the month, and how much you have spent today. A marker on the progress bar shows how much of the month has already passed.
- **Mandatory payments.** Rent, savings and other required expenses with a due date. The checkmark appears automatically once entries in the category add up to the required amount. A reminder shows up in advance.
- **Quick entry.** Amount from a numeric keypad, category, date and note. You see how the limit will change before you save.
- **History.** Entries grouped by day, search by note, category filter, editing and deletion.
- **Analytics.** Spending by day, over six months and over a year, compared with the budget; breakdown by category and the difference from the previous month.
- **Savings.** Every user has a «Накопления» (savings) category with a monthly amount and a checkmark. *Total saved* on the overview = the amount you already had when you started (set during setup or in settings) + every contribution to the category, all time. The category can't be deleted.
- **Budget and limits.** A total budget and per-category limits; a new month starts with the previous month's limits.
- **Month start on payday.** If your salary arrives on the 6th, set the month to start on the 6th: periods are then labelled as ranges («6 окт – 5 ноя»), and a payment due «by the 10th» means the 10th inside that period, so nothing is flagged overdue before payday.
- **Currencies with conversion.** Hryvnia, US dollar, euro, złoty, tenge, lari. Switching currency converts every amount at the latest rate, in one transaction: budgets and limits for all months, every expense entry (to the cent) and the starting savings amount. The overview, analytics and savings therefore always stay in a single currency.
- **Backup.** The database file can be saved to Files or sent to yourself in Telegram, then restored on a new phone.

## Privacy

All entries live in an SQLite database file inside the app on your phone. GitHub Pages only serves the program files on the first launch and when there is an update. The only other network requests are anonymous exchange-rate lookups (see below); they carry none of your data. There is no analytics and no ads.

Data is stored in the installed app's storage. If you remove the icon from the Home Screen, iOS deletes the data with it, so make a backup in settings from time to time.

## How it works

This is a PWA, a web app that iOS lets you install to the Home Screen like a regular app. After the first launch all files are cached on the phone, and the internet is no longer needed.

| Part | Technology |
|---|---|
| Database | SQLite compiled to WebAssembly ([sql.js](https://github.com/sql-js/sql.js)) |
| Database file storage | IndexedDB on the device; saved in batches 400 ms after a change and when the app goes to the background |
| Offline mode | Service worker that caches every file; the cache version is a hash of the contents |
| UI | Plain JavaScript without frameworks; the Onest font ships with the app |
| Exchange rates | ECB reference rates via [Frankfurter](https://frankfurter.dev) for USD and PLN; [ExchangeRate-API](https://www.exchangerate-api.com) for UAH, KZT and GEL, which the ECB does not publish |

### Exchange rates offline

Rates are stored in the `fx_rates` table as units per 1 EUR, and conversion goes through EUR as a cross rate.

- **On currency change** the app asks the network for a fresh rate. Without a connection it uses the last rate saved in the database, and says so on the confirmation screen.
- **When the internet comes back** the saved rates are refreshed once per session, and only if they aren't from today.
- **First launch offline** works too: the database ships with built-in rates, clearly marked as such until the first successful download.

### Code layers

The code follows domain-driven design: the budget rules know nothing about the database or the screens.

```
src/
  domain.js    rules: period, remaining amount, daily allowance, mandatory payments, money
  infra.js     SQLite, storage, schema migrations, repositories, demo data
  services.js  use cases and view models for the screens
  ui.js        screens, sheets, input
  pwa.js       install screen, offline cache, updates
  sw.js        service worker
docs/          the built app served by GitHub Pages
```

### Database schema

```sql
settings        (key, value)                          -- currency, start_day, savings_initial, …
categories      (id, name, color, sort, is_mandatory, due_day, remind_days, archived, is_savings)
budgets         (period, total)                       -- period = 'YYYY-MM'
category_limits (period, category_id, amount)         -- for a mandatory category: the amount to pay
expenses        (id, category_id, amount, spent_at, note)
fx_rates        (code, per_eur, source, rate_date, fetched_at)
```

Amounts are stored as integers in minor units (kopiykas, cents) to avoid rounding errors. Dates are `YYYY-MM-DD HH:MM` strings in local time and are indexed. The schema version is kept in `PRAGMA user_version`, and migrations run on startup. Version 2 added savings, exchange rates, turned the «Накопления» category into the savings category and moved users off the removed ruble currencies to the hryvnia.

## Build

Requires Node.js and Python 3 with Pillow.

```bash
npm install
python3 build_pwa.py   # installable app → docs/
python3 build.py       # single-page simulation → dist/budget.html
python3 test/regress.py <old docs folder>   # migration, gestures, savings, currency checks
```

To publish changes, commit the updated `docs/` folder to the `main` branch. GitHub Pages serves it automatically, and users get a "new version available" banner in the app.
