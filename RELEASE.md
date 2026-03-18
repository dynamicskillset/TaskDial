# Release checklist

Follow this in order every time. Do not skip steps.

## 1. Before writing any code

- [ ] Open / confirm GitHub issue(s) for the work
- [ ] Agree version number: patch (SHAME) for bug fixes, minor (DEFAULT) for features, major (PROUD) for breaking changes

## 2. During development

- [ ] Run tests before committing: `cd app && npm test`
- [ ] Keep `HANDOFF.md` up to date so context is never lost between sessions

## 3. Ready to ship

- [ ] Bump version in `app/package.json` and `server/package.json`
- [ ] Restart the Vite dev server after bumping (`npm run dev`) — APP_VERSION is baked at startup
- [ ] Write **CHANGELOG.md** entry (full detail, bullet per change)
- [ ] Write **README.md** entry (condensed, one or two bullets per feature)
- [ ] **README.md pruning rule**: when writing a DEFAULT (minor) release entry, remove all patch entries from the previous DEFAULT cycle. Keep only the most recent DEFAULT entry plus the current one as rolling history. Full detail always lives in CHANGELOG.md.
- [ ] Run tests one final time: `cd app && npm test`
- [ ] Commit everything: `git add -A && git commit -m "feat: vX.Y.Z — short description"`
- [ ] **If a build-fix commit is needed after the main commit**: update CHANGELOG.md and README.md before that commit too — every commit that goes out must have docs that match it

## 4. Deploy

Run `./deploy.sh` — it handles build, DB backup, rsync (no `--delete`), `npm install`, and pm2 restart.

**Never run rsync manually with `--delete` against the server directory.** That's how the v1.4.0 incident happened.

After the script finishes:
- [ ] Check `https://taskdial.dynamicskillset.com/health` returns `{"status":"ok",...}`
- [ ] Log in and confirm the version shown in Settings matches the released version
- [ ] Spot-check the new feature works on the live site

## 5. After shipping

- [ ] Close the relevant GitHub issue(s)
- [ ] Update `HANDOFF.md` with what was done and what's next
- [ ] If it was a minor (DEFAULT) release, check that the "What's new?" banner appears and links to the right changelog section

## VPS quick reference

| Thing | Value |
|---|---|
| SSH | `root@80.78.23.57` |
| App root | `/opt/taskdial/` |
| pm2 process | `taskdial` |
| DB | `/opt/taskdial/server/chronotasker.db` |
| Env file | `/opt/taskdial/server/.env` |
| Restart (env change) | `pm2 restart taskdial --update-env` |
| Logs | `pm2 logs taskdial --lines 50` |
