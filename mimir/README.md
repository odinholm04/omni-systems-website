# Mimir — your unified brain

Personal productivity app for Omni: tasks, calendar, notes and deep work — all connected.
Lives at `omni-systems.ai/mimir`. All data stays in the browser (localStorage); export/import
JSON backups from Settings. No backend, no build step, works offline after first load.

## The system it encodes

- **Capture** everything with `Q` — natural language parsing (`tomorrow 10am @loki !high for 45m`)
- **Triage** the inbox with `I` — one item at a time, keyboard verbs (Today / Tomorrow / Next week / Backlog / Delete)
- **Plan the day** with `P` — Sunsama-style wizard: confront leftovers → pick tasks → estimates vs capacity → protect a deep work block
- **Timeblock** on the week calendar — drag tasks onto the grid; day headers show planned load vs capacity
- **Deep work** with `F` — presets (25/50/90/180 min), timer bound to a task, distraction parking → inbox, sessions logged as planned-vs-actual
- **Shutdown ritual** with `S` — review the day, decide the fate of unfinished tasks, brain dump, daily note auto-written, shutdown phrase
- **Weekly review** with `W` — stats + quarterly-goal alignment → reflection → next week's objectives
- **Quarterly goals** — rolling planning: theme + 2–4 priorities; tasks link to priorities; progress tracked
- **Notes** — markdown, `[[wiki-links]]`, clickable checkboxes, daily notes, note→task
- **Insights** — 14-day deep work chart, focus streak, hours per project, estimate accuracy, goal alignment
- **Rituals (`8`) — The Daily Saga** — the newest morning routine ("Byrja daginn 2026") and night
  routine (wind-down countdown anchored to bedtime) from the Notion brain, gamified: 5 XP per step,
  +20 per completed ritual, +30 for a perfect day; Norse rank progression (Thrall → … → Allfather),
  ☀/☾/✦ streaks, and a 28-day rune wall that lights up on perfect days. Steps and bedtime are editable in-app.
- `⌘K` command palette searches everything; `1–7` switch pages; `?` shows all shortcuts

## Tests

Full end-to-end suite driving every feature in a real browser:

```bash
cd tests
npm install playwright
python3 -m http.server 8931 -d ../..   # serve repo root
node e2e.mjs http://localhost:8931/mimir/
```

Optionally set `PW_EXECUTABLE=/path/to/chromium` to use a system browser.
