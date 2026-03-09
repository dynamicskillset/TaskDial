# ChronoTasker

A visual time-planning tool with integrated Pomodoro timer. See your day as time on a clock face, not a list.

Live at [chronotasker.dougbelshaw.com](https://chronotasker.dougbelshaw.com)

## Stack

- **Frontend:** Vite + React + TypeScript PWA
- **Backend:** Express + SQLite (better-sqlite3)
- **Infra:** VPS (Debian), Caddy reverse proxy, pm2, GitHub Actions CI/CD

## Development

```bash
# Frontend
cd chronotasker-app && npm run dev

# Backend
cd server && npm run dev
```

## Deployment

Push to `main` triggers GitHub Actions. Frontend builds in CI, backend builds on VPS. Deploy takes ~2 minutes.

---

## Changelog

### v1.0.4 — 2026-03-09

- **Drag to reorder**: You can now drag tasks up and down the list to change their order on the clock. On touch devices the up/down buttons remain available.
- **Accessibility**: Screen readers now get clear descriptions for the Pomodoro timer, recurring task badge, conflict and overflow warnings, day start/end time inputs, and colour scheme options.

### v1.0.3 — 2026-03-09

- **Undo/redo**: Undo or redo the last task action (add, delete, edit, complete, mark important) using Cmd+Z / Cmd+Shift+Z or the bar that appears at the bottom of the screen.
- **Tag filtering**: When tasks have different tags, filter pills appear above the task list — click one to show only tasks with that tag.
- **First-time onboarding**: New users see a short explanation of how the app works, with a link to try demo mode.
- **Browser notifications**: The app now notifies you when a scheduled task is about to start (requires notification permission, which the Pomodoro timer already requests).
- **Accessibility**: FAQ accordion, reschedule popover, time inputs, and backlog items all have correct screen reader attributes.

### v1.0.2 — 2026-03-09

- The highlight colour now defaults to warm gold (Nord yellow) instead of blue.
- Tags are now assigned distinct colours that are clearly different from each other.
- Tag colours in dark mode are brighter and easier to read.
- The clock face arcs are more vivid in dark mode.
- The Pomodoro timer ring and dots now follow the active highlight colour.
- Pomodoro timer buttons now use colours that meet accessibility contrast requirements.
- Demo mode now shows different tasks and calendar events on different days — navigate back to yesterday or forward to tomorrow to see a full example week.

### v1.0.1 — 2026-03-09

- Calendar events from other time zones now appear at the right time of day instead of being shifted by several hours.
- The app version number is shown in the top-left corner of the screen, next to the help button.
- Task titles on mobile now wrap onto multiple lines instead of being cut off with "..."

### v1.0.0 — 2026-03-05

First proper release. Everything needed for a full day of planning:

- Your day shown as a clock face — tasks appear as coloured arcs so you can see at a glance how your time is allocated
- Pomodoro timer built in: 25-minute focus sessions, short breaks, and a longer break every four cycles, with a sound and a small animation when you complete a cycle
- Add, edit, move, and reorder tasks; drag them into position; reschedule to another day; set a fixed start time if needed
- Connect up to three calendar feeds so meetings show up on the clock automatically, with a configurable buffer before each one
- Recurring calendar events (weekly stand-ups, etc.) are supported
- A backlog for tasks that don't have a place in today's schedule yet
- Five colour schemes to choose from
- Works offline and syncs across your devices when you're back online
- Can be installed to your home screen on any device
- A help page explaining how everything works
