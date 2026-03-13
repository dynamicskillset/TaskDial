# Changelog

All notable changes to TaskDial are documented here. TaskDial uses [PrideVer](https://pridever.org): `PROUD.DEFAULT.SHAME`.

---

### v1.3.3 — 2026-03-13

Bug fixes.

- **Mobile logouts fixed**: the refresh token cookie is now `SameSite=Lax` so iOS Safari no longer blocks it when the installed PWA navigates. The tab-visibility refresh is also throttled to once per 10 seconds to prevent rapid-fire calls when the OS cycles the app in and out of the foreground.
- **Encrypted blobs on login fixed**: the encryption key is now fully restored before the app renders, so tasks are never displayed as ciphertext on slow mobile devices.
- **Repeated desktop notifications fixed**: the notification deduplication key is now the task ID alone, so a flexible task that gets rescheduled each minute no longer fires a new notification every minute.
- **Time removal now syncs**: clearing a fixed start time from a task or break now correctly sends a `null` to the server rather than omitting the field, so the change persists across devices.
- **"What's new?" no longer appears for patch releases**: the banner now only shows when the minor (DEFAULT) version changes. Brand-new users no longer see it either.
- **Move-to submenu opens first time**: the reschedule submenu now appears on the first tap of the calendar icon in the actions menu.

### v1.3.2 — 2026-03-13

- **Ellipsis actions menu**: task actions (move, edit, delete) are now tucked behind a `…` button, keeping the task row cleaner.
- **Task titles wrap**: long task titles no longer overflow their row on narrow screens.
- **Backlog tag filter**: the tag filter in the backlog panel now works the same way as the main list filter.

### v1.3.1 — 2026-03-12

- **Forgot password link**: corrected a CSS conflict that caused the "Forgot password?" link to inherit the wrong colour and text decoration.

### v1.3.0 — 2026-03-11

- **Password reset**: users can now reset their password via email. Resetting rotates the encryption salt and revokes all existing sessions.
- **Multi-use invite codes**: invite tokens can now be used more than once, with optional use limits and per-redemption tracking. Revocation works correctly.
- **Session stays alive after tab snooze**: the app refreshes its auth token when a snoozed tab wakes up, preventing unexpected sign-outs in browsers like Zen.
- **Maintenance banner**: a banner appears automatically when the server is briefly unreachable during an update.
- **"What's new?" banner**: a dismissable notice appears once after each minor version update, linking to the changelog.
- **Clickable version number**: the version in the top corner links to the GitHub changelog.
- **Feedback links**: a GitHub issue link appears in the Help modal and in Settings → Account (Advanced mode).
- **Fixed time in basic mode**: the fixed time toggle is now available without enabling Advanced mode.
- **Undo bar auto-dismisses**: the undo/redo bar disappears after 10 seconds of inactivity.
- **PrideVer**: the project now uses [PrideVer](https://pridever.org) (`PROUD.DEFAULT.SHAME`) versioning.

---

### v1.2.6 — 2026-03-10

- **Advanced mode hides calendar events**: turning off Advanced mode removes calendar arcs from the clock and hides the calendar panel.
- **Simpler task form**: fixed time, important flag, tag, and repeat options are hidden in the task form unless Advanced mode is on.
- **Animated tick on task completion**: the checkmark draws itself when you mark a task done.
- **Warmer empty and all-done states**: friendlier copy and a brief pop animation on the "All done" tick.
- **Help modal rewritten**: all sections and FAQ answers are shorter and clearer.
- **Settings close button**: now a plain cross, consistent with the rest of the UI.

### v1.2.5 — 2026-03-10

- **Redesigned settings panel**: organised into five tabs — Look, Schedule, Calendars, Timer, and Account.
- **Theme picker**: Light, System, and Dark shown as three clear buttons.
- **Colour scheme picker**: each swatch now shows its name.
- **Pomodoro cycle length**: configurable number of focus sessions before a long break.
- **Account tab**: export, import, and account deletion always visible.
- **Performance**: clock face redraws once per minute instead of once per second.
- **Click outside to close**: clicking outside the settings panel closes it.

### v1.2.4 — 2026-03-10

- **Month in the date strip**: current month and year shown in the week navigation bar.
- **Tag colours**: tags on the same day are now always clearly distinct colours.
- **Smoother day switching**: task list updates immediately when switching days.
- **Delete user confirmation**: admin dashboard requires a second click to confirm before deleting a user.
- **Privacy policy**: data controller listed as Dynamic Skillset Ltd.

### v1.2.3 — 2026-03-10

- **End-to-end encryption**: task titles, tags, and notes are encrypted on your device before being sent to the server. The key is derived from your password and never leaves your browser.
- **Calendar URLs stay private**: iCal URLs stored only in your browser, never synced to the server.
- **Better login speed**: password verification runs in the background rather than blocking the server.
- **Week navigation**: a week strip replaces single previous/next arrows; week arrows move a full week at a time.
- **Multiple tags**: tasks can have several tags, separated by commas.
- **Clock hand colour**: uses a complementary colour for better visibility.

### v1.2.1 — 2026-03-10

- **Berry default colour scheme** for new users.
- **Working days**: choose which days you work; day arrows skip non-working days.
- **Accessibility**: clock arcs report active state to screen readers; action buttons are full 44×44px touch targets.

---

### v1.1.1 — 2026-03-10

- **Privacy policy**: full policy at `/privacy`, linked from the login page and help panel.
- **Login inputs**: email and password fields now have a visible border.

### v1.1.0 — 2026-03-10

- **Multi-user support**: each person sees only their own tasks and settings.
- **Sign up and log in**: create an account with an invite code; sessions refresh automatically.
- **Admin dashboard**: manage users, invite codes, and audit log at `/admin`.
- **Security**: passwords hashed, tokens in secure httpOnly cookies, all data scoped per user.

---

### v1.0.4 — 2026-03-09

- **Drag to reorder**: drag tasks up and down the list to change their order on the clock.
- **Accessibility**: screen readers get clear descriptions for the Pomodoro timer, recurring task badge, conflict and overflow warnings.

### v1.0.3 — 2026-03-09

- **Undo/redo**: Cmd+Z / Cmd+Shift+Z, or use the bar at the bottom of the screen.
- **Tag filtering**: filter pills appear above the task list when tasks have different tags.
- **First-time onboarding**: new users see a short explanation with a link to demo mode.
- **Browser notifications**: notifies you when a scheduled task is about to start.

### v1.0.2 — 2026-03-09

- Highlight colour defaults to warm gold.
- Tags assigned distinct colours.
- Pomodoro timer ring follows the active highlight colour.
- Demo mode shows different tasks on different days.

### v1.0.1 — 2026-03-09

- Calendar events from other time zones appear at the correct local time.
- Version number shown in the top-left corner.
- Task titles on mobile wrap instead of being cut off.

### v1.0.0 — 2026-03-05

First release: clock face visualisation, Pomodoro timer, task management, calendar feeds, recurring tasks, backlog, colour schemes, offline sync, PWA install, help page.
