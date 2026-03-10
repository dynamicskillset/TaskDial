# TaskDial

![TaskDial screenshot](taskdial-screenshot.png)

Most to-do apps show you a list. TaskDial shows you your day as a clock: tasks are coloured arcs, so you can see at a glance whether your plan is realistic, where the gaps are, and where you're overloading yourself.

There's a built-in Pomodoro timer too, so focused work and planning live in the same place.

**Try it at [chronotasker.dougbelshaw.com](https://chronotasker.dougbelshaw.com)** — invite-only while we're testing.

---

## What you get

- **Clock face** — your day as a visual ring, not a list; tasks are arcs you can see and move
- **Pomodoro timer** — 25-minute focus sessions with short breaks and a longer break every four cycles; sounds and notifications when each phase ends
- **Calendar feeds** — connect up to three iCal feeds (Google Calendar, Proton Calendar, etc.) and see your meetings on the clock with a configurable gap before the next task
- **Task management** — add, edit, reorder by dragging, reschedule to another day, set a fixed start time, mark as important, add tags, set up repeating tasks
- **Backlog** — a place for tasks that don't belong to any particular day yet; move them to today when you're ready
- **Undo/redo** — change your mind freely; undo or redo any action
- **Works offline** — tasks save locally first and sync when you're back online; installable as a PWA
- **Six colour schemes** — Berry (default), Nord, Aurora, Frost, Evergreen, Yellow
- **Accessible** — keyboard navigable and screen-reader friendly

---

## Getting access

TaskDial is currently in testing, so you'll need an invite code to sign up. Once you have one:

1. Go to [chronotasker.dougbelshaw.com](https://chronotasker.dougbelshaw.com)
2. Click **Create account** and enter your email, a password (12 characters or more), and your invite code
3. Install it for the best experience: on **Android and iOS**, add it to your home screen; on **Mac and Linux**, use Chrome or Edge and choose "Install app"

---

## Privacy

TaskDial stores your tasks and settings on the server so they sync across your devices. It uses no third-party trackers, shares no data, and does not use your data to train AI models. Full details are in the [Privacy Policy](https://chronotasker.dougbelshaw.com/privacy).

---

## Changelog

### v1.2.1 — 2026-03-10

- **Berry is now the default colour scheme** for new users, replacing the previous warm gold default.
- **Working days** (advanced settings): choose which days of the week you work; the previous/next day arrows skip non-working days automatically.
- **Accessibility**: clock face task arcs now report their active state to screen readers; the task list announces that drag-to-reorder is available; links in the help panel show a focus ring when navigating by keyboard; action buttons on the backlog list are now a full 44×44px touch target; settings panel collapses to a single column on narrow screens.
- **Performance**: reduced unnecessary recalculations when switching between tasks on the same minute.

### v1.1.1 — 2026-03-10

- **Privacy policy**: a full privacy policy is now at `/privacy`, linked from the login page and the help panel.
- **Login inputs**: the email and password fields now have a visible border so they stand out against the dark background.

### v1.1.0 — 2026-03-10

- **Multi-user support**: TaskDial now supports multiple accounts. Each person sees only their own tasks and settings.
- **Sign up and log in**: create an account with an invite code; sessions refresh automatically so you stay logged in.
- **Admin dashboard**: the owner account gets a panel at `/admin` to manage users, create and revoke invite codes, and view an audit log.
- **Security**: passwords are hashed, tokens are stored in secure httpOnly cookies rather than localStorage, and all data is scoped to the logged-in user.

### v1.0.4 — 2026-03-09

- **Drag to reorder**: drag tasks up and down the list to change their order on the clock. The up/down buttons remain available on touch devices.
- **Accessibility**: screen readers now get clear descriptions for the Pomodoro timer, recurring task badge, conflict and overflow warnings, day start/end time inputs, and colour scheme options.

### v1.0.3 — 2026-03-09

- **Undo/redo**: undo or redo the last task action with Cmd+Z / Cmd+Shift+Z, or use the bar at the bottom of the screen.
- **Tag filtering**: when tasks have different tags, filter pills appear above the task list.
- **First-time onboarding**: new users see a short explanation of how the app works, with a link to try demo mode.
- **Browser notifications**: the app notifies you when a scheduled task is about to start.

### v1.0.2 — 2026-03-09

- The highlight colour now defaults to warm gold instead of blue.
- Tags are assigned distinct colours that are clearly different from each other.
- The Pomodoro timer ring and dots follow the active highlight colour.
- Demo mode shows different tasks and calendar events on different days.

### v1.0.1 — 2026-03-09

- Calendar events from other time zones now appear at the correct local time.
- The app version number is shown in the top-left corner.
- Task titles on mobile now wrap instead of being cut off.

### v1.0.0 — 2026-03-05

First release: clock face visualisation, Pomodoro timer, task management, calendar feeds, recurring tasks, backlog, colour schemes, offline sync, PWA install, help page.

---

<details>
<summary><strong>Self-hosting and development</strong></summary>

TaskDial is designed to be self-hosted. You run one server for yourself and anyone you invite.

### Requirements

- Node.js 20+
- A server with a domain and HTTPS (Caddy works well)

### Setup

**1. Clone the repo**

```bash
git clone https://github.com/dynamicskillset/TaskDial
cd TaskDial
```

**2. Configure the server**

```bash
cd server
cp .env.example .env
```

Edit `.env`:

```
JWT_SECRET=        # generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
APP_ORIGIN=        # your frontend URL, e.g. https://taskdial.example.com
OWNER_EMAIL=       # your email address
PORT=3001
NODE_ENV=production
```

**3. Build and start the server**

```bash
npm install
npm run build
node dist/index.js
```

On first run the server creates your owner account and prints a one-time password to the console. Save it — it won't be shown again.

**4. Build the frontend**

```bash
cd ../chronotasker-app
cp .env.production.example .env.production
# Edit VITE_API_URL if your API is on a different domain
npm install
npm run build
# Serve the dist/ folder with Caddy, nginx, or any static file server
```

**5. Caddy example**

```caddy
your-domain.com {
    handle /api/* {
        reverse_proxy localhost:3001
    }
    handle {
        root * /path/to/chronotasker-app/dist
        try_files {path} /index.html
        file_server
    }
    encode gzip
    header {
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
    }
}
```

**6. Inviting people**

Log in with your owner account and go to `/admin`. From there you can generate invite codes to share.

### Running locally

```bash
# Backend
cd server && npm run dev

# Frontend (separate terminal)
cd chronotasker-app && npm run dev
```

The frontend dev server runs on `http://localhost:5173`. The API runs on port `3001`.

### Tests

```bash
cd chronotasker-app && npm test
```

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite, React, TypeScript, PWA (Workbox) |
| Backend | Express, better-sqlite3, TypeScript |
| Auth | JWT (httpOnly cookies), bcrypt, rotating refresh tokens |
| Deploy | GitHub Actions → VPS, Caddy reverse proxy, pm2 |

</details>
