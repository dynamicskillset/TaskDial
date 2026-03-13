# TaskDial

![TaskDial screenshot](taskdial-screenshot.png)

Most to-do apps show you a list. TaskDial shows you your day as a clock: tasks are coloured arcs, so you can see at a glance whether your plan is realistic, where the gaps are, and where you're overloading yourself.

There's a built-in Pomodoro timer too, so focused work and planning live in the same place.

**Try it at [taskdial.dynamicskillset.com](https://taskdial.dynamicskillset.com)** — invite-only while we're testing.

---

## What you get

- **Clock face** — your day as a visual ring, not a list; tasks are arcs you can see and move
- **Pomodoro timer** — 25-minute focus sessions with short breaks and a longer break every four cycles; sounds and notifications when each phase ends
- **Calendar feeds** — connect up to three iCal feeds (Google Calendar, Proton Calendar, etc.) and see your meetings on the clock with a configurable gap before the next task
- **Task management** — add, edit, reorder by dragging, reschedule to another day, set a fixed start time, mark as important, add tags, set up repeating tasks
- **Backlog** — a place for tasks that don't belong to any particular day yet; move them to today when you're ready
- **Undo/redo** — change your mind freely; undo or redo any action
- **Works offline** — tasks save locally first and sync when you're back online; installable as a PWA
- **Five colour schemes** — Berry (default), Nord, Aurora, Frost, Evergreen
- **Accessible** — keyboard navigable and screen-reader friendly

---

## Getting access

TaskDial is currently in testing, so you'll need an invite code to sign up. Once you have one:

1. Go to [taskdial.dynamicskillset.com](https://taskdial.dynamicskillset.com)
2. Click **Create account** and enter your email, a password (12 characters or more), and your invite code
3. Install it for the best experience: on **Android and iOS**, add it to your home screen; on **Mac and Linux**, use Chrome or Edge and choose "Install app"

---

## Privacy

TaskDial encrypts your task content (titles, tags, and notes) on your device before it reaches the server. The encryption key is derived from your password and never leaves your browser. iCal calendar URLs are stored only in your browser and are never sent to the server. The server sees only ciphertext — not your actual task data. It uses no third-party trackers, shares no data, and does not use your data to train AI models. Full details are in the [Privacy Policy](https://taskdial.dynamicskillset.com/privacy).

---

## Versioning

TaskDial uses [PrideVer](https://pridever.org): `PROUD.DEFAULT.SHAME`

- **PROUD** — bump when the release is something to be proud of
- **DEFAULT** — bump for routine, functional releases
- **SHAME** — bump when fixing embarrassing bugs

---

## Changelog

### v1.3.3 — 2026-03-13

Bug fixes: mobile logouts, encrypted blobs on login, repeated desktop notifications, time removal not syncing, "What's new?" firing on patch releases, move-to submenu requiring two taps.

### v1.3.2 — 2026-03-13

- **Ellipsis actions menu**: task actions tucked behind a `…` button, keeping the task row cleaner.
- **Task titles wrap**: long titles no longer overflow on narrow screens.
- **Backlog tag filter**: works the same way as the main list filter.

### v1.3.0 — 2026-03-11

- **Password reset**: reset your password by email; resets the encryption key and revokes all sessions.
- **Multi-use invite codes**: tokens can be used more than once, with optional limits and working revocation.
- **Session stays alive after tab snooze**: auth token refreshes when a snoozed tab wakes up.
- **Maintenance banner**: appears automatically when the server is briefly unreachable.
- **"What's new?" banner**: shown once after each minor version update.
- **Fixed time in basic mode**: available without enabling Advanced mode.
- **Undo bar auto-dismisses**: disappears after 10 seconds of inactivity.

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

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
