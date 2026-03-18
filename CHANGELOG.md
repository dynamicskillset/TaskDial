# Changelog

All notable changes to TaskDial are documented here. TaskDial uses [PrideVer](https://pridever.org): `PROUD.DEFAULT.SHAME`.

---

### v1.5.1 — 2026-03-18

Bug fixes and settings polish.

- **Actions menu no longer hidden under the next item on break tasks**: break items carry `opacity: 0.6`, which creates a CSS stacking context that confined the fixed-position menu. The menu is now rendered via a React portal into `document.body`, so it always appears on top regardless of the parent item's opacity.
- **Duration quick-picks moved to Settings → Schedule**: these presets relate to how long tasks and breaks are, not to the Pomodoro timer — Schedule is the right home. The Timer tab is now Pomodoro-only, making its name accurate.
- **Duration quick-picks redesigned as editable pill chips**: replaced the number-spinner inputs and separate +/− row buttons with rounded pill chips. Each pill contains a spinner-free inline number input; hover reveals a × to remove that slot; a dashed circle + adds a new one.
- **Duplicate settings rows removed from Calendars tab**: Recurring tasks, Backlog, and Day time summary toggles were incorrectly appearing on both the Schedule and Calendars tabs. They now appear only under Schedule.

---

### v1.5.0 — 2026-03-18

Four improvements: two bug fixes affecting daily use and two enhancements.

- **Break edit now persists** (#47A): editing a break task (title, duration, fixed time) was silently ignored. `isBreak` is now tracked in local form state rather than read from the prop at submit time, making it resilient to any re-render between form open and submit.
- **Actions menu no longer clipped on mobile** (#47B): the three-dot `…` menu now positions itself with `position: fixed` using coordinates from `getBoundingClientRect()`, so it is never clipped by the `overflow: hidden` container on the task list panel. Flip-upward logic prevents it going off the bottom of the screen.
- **Configurable duration quick-picks** (#48): task and break duration presets are now editable in Settings → Timer. Add or remove slots (2–5 per row), with per-slot number inputs validated to 1–480 min for tasks and 1–120 min for breaks. Defaults remain `[15, 25, 30, 45, 60]` for tasks and `[5, 10, 15, 30]` for breaks. Syncs across devices.
- **Task colour matches tag colour** (#49): the left-border accent on task list rows now derives its colour directly from the task's tag hue (via `tagHueMap`), exactly matching the clock-face arc colour and the tag pill colour. Backlog items get the same treatment. Untagged tasks fall back to the arc-order colour as before.
- **Decryption errors handled gracefully** (#46 defensive fix): if one or more tasks cannot be decrypted (e.g. the key is not yet ready), those tasks are dropped individually rather than failing the entire fetch. A warning banner is shown in the task list and the count is logged to the console.

---

### v1.4.2 — 2026-03-15

Bug fixes and UX polish following Stephen Downes' Firefox/Windows 11 testing (continued).

- **Onboarding tooltips no longer jump** (#30): removed `scrollIntoView` (the primary cause — it shifted the page after positions were already calculated); tooltip now fades in at each step without any layout change.
- **Week nav arrow hit area fixed** (#38): the `‹` / `›` buttons are now 28×28 px, matching the 14×14 arrow SVG they contain.
- **Week-start-day preference** (#33): new Monday/Sunday control in Settings → Schedule. Defaults to Monday. The week bar updates immediately and the preference syncs across devices.
- **Calendar sync confirms success** (#36): after loading, the status line now reads "3 events today · Synced 14:32" (or "No events for this date · Synced 14:32"), so you can confirm the sync worked even when today has no events.

---

### v1.4.1 — 2026-03-15

Bug fixes and UX polish following Stephen Downes' Firefox/Windows 11 testing of v1.4.0.

- **Clockface shows correct date when viewing other days**: the centre of the clock now displays the day you're viewing (not always today's date); the real-time clock hand is suppressed on non-today views.
- **Calendar events no longer disappear on refresh**: a transient network failure during a calendar sync no longer wipes out events that were already loaded; the cache is preserved and only updated on successful fetches.
- **Calendar events no longer disappear when navigating days**: same root cause as above — fixed together.
- **Task edit form uses the task's own date**: when you edit a task scheduled for a different day, conflict detection now checks that day's schedule rather than the day you're currently viewing. The form also shows which date the task is scheduled for.
- **Theme background colour updates correctly**: the `<html>` element now inherits the background colour CSS variable, so switching colour schemes no longer leaves a mismatched strip behind the app content.
- **Layout shift on view switch fixed**: `scrollbar-gutter: stable` reserves space for the scrollbar so the page doesn't jump when switching between views with and without overflow.
- **"Your day is clear" is now tappable**: tapping the empty-state message opens the task form directly, the same as the + button.
- **iCal guide links styled and expanded**: links in the calendar setup guide are now coloured and underlined rather than appearing as plain text. The Google Calendar step links to the web app; the Proton Calendar step links directly to calendar settings. Step-by-step instructions now include "Paste the link and click Load".

---

### v1.4.0 — 2026-03-13

- **Flash when time's up**: the clock arc for an overrunning task pulses to draw your attention. A toast appears with options to extend by 15 minutes, mark it done, or dismiss. A browser notification fires once per task (if you've granted permission). The flash can be turned off in Settings → Look.
- **Onboarding walkthrough**: new users get a five-step guided tour that spotlights the clock, task list, task form, and settings button. The tour launches in demo mode so the clock is populated from the start. You can replay it any time from Settings → Account.

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
