<div align="right">

<b>English</b> | [简体中文](README.zh-CN.md)

</div>

# Upgrade Diary

> Your one-page-a-day task & reflection journal. Check off your tasks, jot down a few thoughts, and watch your calendar fill up.

Upgrade Diary (升级日记) is a **local-first** desktop app for macOS and Windows, built with Electron. It doesn't try to be another feature-packed task manager — it focuses on one thing: **turning today into a single page**. Check off tasks, jot down thoughts, flip back through your calendar, and build up your streak like leveling up in a game.

![version](https://img.shields.io/badge/version-0.1.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)

## Screenshots

**Dark · Today**

<p align="center"><img src="assets/screenshots/today-dark.png" width="760" alt="Today view (dark theme): task list, one-click carry-over and reflection area"></p>

**Light · Today**

<p align="center"><img src="assets/screenshots/today-light.png" width="760" alt="Today view (light theme)"></p>

**Dark · Stats & heatmap**

<p align="center"><img src="assets/screenshots/stats-dark.png" width="760" alt="Stats view: 18-week heatmap and streaks"></p>

> Screenshots above were generated with [sample data](scripts/seed-sample-data.js) and contain no real personal information.

## Features

- **One page per day** — tasks belong to a date. Check to strike through and sink to the bottom; uncheck to restore. Click a task to edit it; drag the ⠿ handle to reorder (within active/done groups); full keyboard flow (↑↓ select, Enter edit with autosave-on-move, Delete with undo).
- **One-click carry-over** — unfinished tasks from previous days move into today in a single click, and are removed from their original dates (completed ones stay behind as history). The button hides itself when there is nothing left to carry. Carried tasks keep a source-date tag.
- **Daily reflection** — one plain-text block per page, autosaved as you type. Any past day can be revisited or backfilled. Days with a reflection get a ♥ on the heatmap.
- **Calendar review** — the sidebar month view is a mini heatmap sharing the exact same rules as the stats page. Click any date to jump to that page.
- **Stats & streaks** — an 18-week GitHub-style heatmap graded by the *number* of completed tasks, plus four counters: total completed, days recorded, longest streak, current streak.
- **Today overlay** — a global hotkey (⌥F by default) summons an always-on-top panel listing today's unfinished tasks. Check them off in place; clear them all for an "All clear ✨" moment.
- **Quick capture** — another global hotkey (⌥Space by default) opens a tiny quick-add window from anywhere. Type, hit Enter, done.
- **Themes** — follows system light/dark out of the box, or pin one manually. Both palettes are hand-tuned around a single amber accent.
- **Export & import** — Markdown export organized by date (tasks with check states, reflections preserved), plus JSON backup and restore.
- **Local data** — on first launch you pick a data folder. It can be relocated anytime with automatic migration. Every launch rolls a backup (last 7 kept).

Keyboard shortcuts can be remapped in Settings.

## The ideas behind it

**One page per day.** The date is the primary key; tasks belong to a day by nature. Opening the app *is* opening today's page. History isn't a filtered view of a task pool — it's a journal you flip through, one page at a time.

**Carry over, don't roll over.** Most todo apps silently roll unfinished tasks into tomorrow — pleasant in the moment, and the source of ever-growing guilt lists. Upgrade Diary refuses to do that. It tells you exactly how many tasks are left behind, and *you* decide: carry them into today, or delete them. Completed tasks stay on their original dates as history, and each finished day closes cleanly.

**Restrained gamification.** A streak counter, a heatmap, and an "All clear ✨" moment when the last task of the day gets checked. No levels, no badges, no confetti cannons — just enough feedback to make persistence visible.

**Your data, literally.** Everything lives in one plain-text `data.json` inside a folder you chose. No account, no cloud, no network calls. Rolling backups on every launch, Markdown/JSON export whenever you want out — and because it's plain text, you can hand it to an AI for review and reflection.

## What it deliberately doesn't do

No reminders. No priorities, tags or due dates. No cloud sync. No multi-device. No collaboration.

> It's a quiet personal journal, not a workflow platform.

For some people that's a dealbreaker. For the people this is built for, it's the whole point.

## Development

```bash
npm install
npm start        # launch the dev window
npm run icon     # regenerate the app icon (build/icon.png)
npm run dist     # package a macOS dmg into dist/
npm run dist:win # cross-package a Windows installer into dist/
```

Node.js ≥ 18 required. On first launch the app walks you through picking a data folder (default suggestion: `~/Documents/Upgrade Diary/`).

Utility scripts:

```bash
node scripts/test-store.js                                   # data-layer unit tests
node scripts/seed-sample-data.js <userDataDir> <dataDir>     # seed generic sample data for screenshots
SJ_SHOT=out.png SJ_VIEW=stats npm start                      # capture a UI screenshot (see src/main/main.js)
```

## System requirements

- macOS 12+ (Apple Silicon)
- Windows 10 / 11 (64-bit)

## Data & privacy

The app makes zero network calls and collects nothing. All data lives in plain text inside the folder you chose: `data.json` plus `backups/` (rolling, last 7 kept on every launch). You can back it up with anything, track it in git, or hand it to another tool.

## Feedback

Found a bug or have an idea? [Open an issue](https://github.com/PandaClose/shengji-diary/issues). This is a personal project maintained as-needed — responses may be slow, but every issue gets read.

## License

[MIT](./LICENSE)
