# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Minhas Metas** is a personal goals & habits tracking PWA (Progressive Web App) written in vanilla HTML/JS with no build step. The entire application lives in a single `index.html` file.

- **Production**: `metas.campostecnologia.cloud`
- **Staging**: `dev.metas.campostecnologia.cloud`
- **Infrastructure**: Hostinger VPS (Ubuntu 22), Docker Compose, Nginx
- **Database**: Supabase project `tpcawmrblanpkgoqisgw`
- **Auth**: Google OAuth (Google Identity Services v1), tokens stored in `sessionStorage` only
- **Monetization**: Freemium — premium features gated via Hotmart/Kiwify

## Architecture

The app is a single-page application with no framework, no bundler, and no `package.json`. All logic is in `index.html` inside a `<script>` block.

### Data Storage

All daily goal data is persisted to **`localStorage`** using keys of the form `goals_YYYY-MM-DD`. Each key stores an object like:
```js
{ km: { done: true, value: "5.2" }, gym: { done: false, value: "" }, ... }
```

The seven fixed goals (`GOALS` array) are defined at the top of the script. They are not user-configurable — to add or remove a goal, edit the `GOALS` array directly.

### Pages

Three pages toggled by CSS (`display:none` / `display:block`) via `goPage(p)`:

| Page | ID | Renders via |
|------|----|-------------|
| Daily registration | `page-register` | `renderGoals()` |
| Monthly calendar | `page-calendar` | `renderCal()` |
| Day dashboard / stats | `page-dashboard` | `renderDash()` |

### Key Functions

- `score(dateKey)` — returns completion ratio (0–1) for any stored day; `-1` if no data
- `getStreak()` — counts consecutive days with any goals completed, scanning back from today
- `weekChart()` — generates the HTML bar chart for the current week relative to `dashKey`
- `saveDay()` — writes current `state` to `localStorage` for today's key

### PWA

- `manifest.json` — PWA manifest (standalone display, portrait orientation)
- `sw.js` — minimal service worker: caches `index.html` and `manifest.json` under key `metas-v1`; serve-from-cache with network fallback

## Development

There is no build step. Edit `index.html` directly and open it in a browser. The service worker only activates over HTTPS or `localhost`.

To run the database validation script (requires `npm install @supabase/supabase-js` and env vars):
```bash
export SUPABASE_URL=https://tpcawmrblanpkgoqisgw.supabase.co
export SUPABASE_ANON_KEY=<key>
node scripts/ls   # validate-database.js
```

## Security Rules

These are non-negotiable constraints documented in `AGENTS.md` and `SECURITY_AUDIT.md`:

1. **Auth tokens go in `sessionStorage` only** — never `localStorage`, never `console.log`, never `window.*`
2. **Admin panel** must check `OWNER_EMAILS = ['marcus@campostecnologia.cloud']` — never gate on hardcoded user IDs
3. **Premium status** must be validated server-side; never trust a client-side flag
4. **XSS**: user-controlled values must go through `escHtml()` before any `innerHTML` insertion (see `escHtml()` helper already present in the code)
5. **Service Worker changes**: test in staging before production; never deploy SW directly to prod
6. **Database migrations**: always test on staging first; never `ALTER TABLE` in production without a backup

## Supabase Schema (expected tables)

- `users` — `id`, `email`, `created_at`
- `metas` — `id`, `user_id` (FK → users), `title`, `created_at`
- `habits` — `id`, `meta_id` (FK → metas), `user_id`, `created_at`
- UNIQUE constraint required on `(user_id, meta_id)` in `metas_data`
- RLS policies must restrict rows to `auth.uid()`

## Deployment

- Staging deploy first, then production
- Nginx config lives at `/root/stack/nginx.conf` on the VPS (CORS headers must not use wildcard `*`)
- Run `node scripts/ls` (validate-database.js) before any production deploy involving schema changes
- Monthly: follow `SECURITY_AUDIT.md` checklist (token storage, CORS headers, RLS, cert validity)
