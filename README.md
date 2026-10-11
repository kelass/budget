# Budget

Expense tracking and a monthly budget for iPhone. The app is installed from Safari to the Home Screen, works without an internet connection and keeps all data on the phone only, in a real SQLite database. There is no backend, no sign-up, and nothing is ever sent anywhere.

**Open the app:** https://kelass.github.io/budget/

> The interface is in Russian. The default currency is the Ukrainian hryvnia; seven other currencies are available in settings.

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
- **Budget and limits.** A total budget and per-category limits; a new month starts with the previous month's limits. The month can start on payday instead of the 1st.
- **Currencies.** Hryvnia, ruble, US dollar, euro, złoty, tenge, Belarusian ruble, lari.
- **Backup.** The database file can be saved to Files or sent to yourself in Telegram, then restored on a new phone.

## Privacy

All entries live in an SQLite database file inside the app on your phone. GitHub Pages only serves the program files on the first launch and when there is an update. The app makes no network requests with your data and contains no analytics or ads.

Data is stored in the installed app's storage. If you remove the icon from the Home Screen, iOS deletes the data with it, so make a backup in settings from time to time.

## How it works

This is a PWA, a web app that iOS lets you install to the Home Screen like a regular app. After the first launch all files are cached on the phone, and the internet is no longer needed.

| Part | Technology |
|---|---|
| Database | SQLite compiled to WebAssembly ([sql.js](https://github.com/sql-js/sql.js)) |
| Database file storage | IndexedDB on the device; saved in batches 400 ms after a change and when the app goes to the background |
| Offline mode | Service worker that caches every file; the cache version is a hash of the contents |
| UI | Plain JavaScript without frameworks; the Onest font ships with the app |

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
settings        (key, value)
categories      (id, name, color, sort, is_mandatory, due_day, remind_days, archived)
budgets         (period, total)                       -- period = 'YYYY-MM'
category_limits (period, category_id, amount)         -- for a mandatory category: the amount to pay
expenses        (id, category_id, amount, spent_at, note)
```

Amounts are stored as integers in minor units (kopiykas, cents) to avoid rounding errors. Dates are `YYYY-MM-DD HH:MM` strings in local time and are indexed. The schema version is kept in `PRAGMA user_version`, and migrations run on startup.

## Build

Requires Node.js and Python 3 with Pillow.

```bash
npm install
python3 build_pwa.py   # installable app → docs/
python3 build.py       # single-page simulation → dist/budget.html
```

To publish changes, commit the updated `docs/` folder to the `main` branch. GitHub Pages serves it automatically, and users get a "new version available" banner in the app.
