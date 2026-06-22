# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Minhas Metas** is a Portuguese-language personal goals tracker PWA. It is a **single-file application**: all HTML, CSS, and JavaScript live in `index.html`. There is no build system, no package manager, and no compilation step.

- Production: `metas.campostecnologia.cloud`
- Staging: `dev.metas.campostecnologia.cloud`
- Infrastructure: Hostinger VPS (Ubuntu 22), Docker Compose + Nginx

## Running the App

Since there is no build process, open `index.html` directly in a browser or serve it with any static server:

```bash
# Simplest option
python3 -m http.server 8080
# then open http://localhost:8080

# Or with Node
npx serve .
```

There are no tests, no linter, and no CI pipeline defined in this repo.

## Validating the Supabase Database

```bash
export SUPABASE_URL="https://tpcawmrblanpkgoqisgw.supabase.co"
export SUPABASE_ANON_KEY="<your-key>"
npm install @supabase/supabase-js   # one-time
node scripts/validate-database.js
```

Run this before every production deploy. It checks table structure, RLS policies, constraints, and query performance.

## Architecture

### Single-file layout (`index.html`)

The file is structured as:
1. `<head>` — CSS custom properties (design tokens) and all styles
2. `<body>` — Three page `<div>`s (`#page-register`, `#page-calendar`, `#page-dashboard`) + bottom `<nav>`
3. `<script>` — All application logic as plain functions

### The GOALS Array

The seven tracked goals are **hardcoded** in the `GOALS` constant at the top of the script block:

```js
const GOALS = [
  {id:'km',   icon:'ti-run',     name:'Corrida / Caminhada', hasInput:true,  unit:'km'},
  {id:'gym',  icon:'ti-barbell', name:'Academia',            hasInput:false},
  {id:'sleep',icon:'ti-moon',    name:'Sono',                hasInput:true,  unit:'h'},
  // ...
];
```

Goals with `hasInput:true` render a numeric field inside the card. All logic iterates over this array — adding or removing a goal only requires changing this array.

### Data Model (localStorage)

Each day's data is stored as:
- **Key**: `goals_YYYY-MM-DD`
- **Value**: `{ km: { done: bool, value: string }, gym: { done: bool }, sleep: { done: bool, value: string }, ... }`

The `score(k)` function returns the completion ratio (0–1) for a given date key, or `-1` if no data exists. This is the single source of truth used by the calendar and dashboard.

### Three Pages

| Page | Element | Renders via |
|------|---------|-------------|
| Registro | `#page-register` | `renderGoals()` + `updateProgress()` |
| Calendário | `#page-calendar` | `renderCal()` |
| Dashboard | `#page-dashboard` | `renderDash()` + `weekChart()` |

Navigation calls `goPage(p)` which toggles `.active` on both the page and the nav button, then calls the relevant render function.

### Service Worker (`sw.js`)

Caches only `index.html` and `manifest.json` under the cache name `metas-v1`. It uses a cache-first strategy. When changing the cached file list, bump the `CACHE` version string to force re-installation.

### Supabase Backend

The Supabase integration (`tpcawmrblanpkgoqisgw`) is described in `AGENTS.md` and `scripts/validate-database.js` but is **not yet wired into `index.html`**. The current app is fully localStorage-based. The intended schema is:

- `users` (id, email, created_at)
- `metas` (id, user_id, title, created_at)
- `habits` (id, meta_id, user_id, created_at)

Authentication will use Google OAuth (Google Identity Services v1) with tokens stored in **sessionStorage only** — never localStorage.

## Security Rules

These rules apply whenever Supabase/OAuth code is added:

- **Tokens**: Always `sessionStorage`, never `localStorage` or `window.*`
- **Admin panel**: Must use an `OWNER_EMAILS` allowlist, never a hardcoded user ID
- **Premium status**: Must be validated server-side; never trust a client-side flag
- **Service Worker changes**: Test on staging (`dev.metas.campostecnologia.cloud`) before pushing to production
- **Database migrations**: Always run `validate-database.js` and test on staging first; never `ALTER TABLE` in production without a backup

## Design System

All colors and spacing are CSS custom properties on `:root` in `index.html`. The primary green is `--primary: #4CAF87`. Icons come from Tabler Icons webfont (`ti ti-*` classes), loaded from CDN.
