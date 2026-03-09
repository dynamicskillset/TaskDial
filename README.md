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

### v1.0.1 — 2026-03-09

- Fix: calendar events from non-local timezones now display at the correct local time. The previous `toLocaleString` + `new Date()` offset trick double-applied the local UTC offset; replaced with `Intl.DateTimeFormat.formatToParts` for accurate conversion.
- Add: version number displayed in the app header next to the help button.

### v1.0.0 — 2026-03-05

Initial versioned release. Core features:

- Circular clock face (SVG) with task arcs and live time hand
- Pomodoro timer (25/5/15 cycles) with audio and milestone animation
- Task management: add, edit, delete, drag-to-reorder, reschedule, fixed-time slots
- iCal calendar feed integration (up to 3 feeds) with meeting buffer arcs and RRULE recurring event support
- Backlog for unscheduled tasks
- 5 colour schemes: Nord, Aurora, Frost, Evergreen, Berry
- Offline-first sync via Express + SQLite backend
- HTTP basic auth via Caddy
- PWA: installable, service worker, offline support
- Help modal with FAQ
- Accessibility audit: all critical/high/medium items resolved
- Delight pass: completion sounds, all-done state, drag animation, button press, toggle spring
- Auto-deploy pipeline via GitHub Actions
