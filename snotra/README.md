# Snotra — your unified brain

Personal productivity app for Omni: tasks, calendar, notes and deep work — all connected.
Lives at `omni-systems.ai/snotra`. All data stays in the browser (localStorage); export/import
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
  ☀/☾/✦ streaks, and a 28-day rune wall that lights up on perfect days. Ritual names, steps and
  bedtime are all editable in-app, so anyone can write their own saga.
- **Quests** — custom daily goals (+10 XP each, own streaks): manual check-offs ("Read 10 pages") or
  **automatic metric quests** ("Sleep score ≥ 85") that judge themselves from sleep data — logged
  manually or auto-synced from an Ultrahuman ring (Settings → Ultrahuman; best-effort, falls back to manual).
- **Fellowship** — accountability with friends. Forge a share code, trade codes, and see each other's
  rank, XP, streaks, today's ritual/quest progress and sleep score. Stats publish automatically on
  change. Backend: three capability-code RPCs on the `odin-claude-brain` Supabase project
  (`snotra_create_profile` / `snotra_publish` / `snotra_get_profile`); the table is RLS-locked, the share
  code is the read capability and a separate secret is the write capability. Only saga stats sync —
  tasks, notes, calendar stay in the browser.
- **Reminders** — browser notifications at each dusk anchor (18:30 stop eating…) and at day-start for
  the morning ritual, while a Snotra tab is open.
- `⌘K` command palette searches everything; `1–7` switch pages; `?` shows all shortcuts

## Tests

Full end-to-end suite driving every feature in a real browser:

```bash
cd tests
npm install playwright
python3 -m http.server 8931 -d ../..   # serve repo root
node e2e.mjs http://localhost:8931/snotra/
```

Optionally set `PW_EXECUTABLE=/path/to/chromium` to use a system browser.
