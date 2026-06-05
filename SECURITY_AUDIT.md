# 🛡️ Security Audit Checklist — Minhas Metas PWA

**Frequency**: Monthly (or before each major release)  
**Owner**: Marcus Vinicius  
**Last Audit**: [Date]  
**Next Audit**: [Date + 30 days]

---

## 🔐 Authentication & OAuth

### Google OAuth Flow
- [ ] **Token Storage**: Verify tokens stored in `sessionStorage` only, NOT `localStorage`
  ```javascript
  // Check in browser DevTools → Application → Storage
  // sessionStorage should have: google_token, google_id_token
  // localStorage should be EMPTY of auth tokens
  ```

- [ ] **Token Expiration**: Tokens refresh before expiry
  - Expected: 3600 seconds (1 hour)
  - Check: `sessionStorage.getItem('google_token_expires_at')`

- [ ] **No Token Logging**: Search codebase for dangerous patterns
  ```bash
  # Run in project root
  grep -r "console.log.*token" --include="*.js"
  grep -r "console.log.*user" --include="*.js"
  grep -r "alert.*token" --include="*.js"
  ```
  - Expected: 0 results
  - If found: ❌ CRITICAL FIX IMMEDIATELY

- [ ] **HTTPS Only**: All OAuth redirects use HTTPS
  - Prod: `https://metas.campostecnologia.cloud/auth/callback`
  - Staging: `https://dev.metas.campostecnologia.cloud/auth/callback`
  - Check: Google Console OAuth settings

- [ ] **No Hardcoded Credentials**
  ```bash
  grep -r "client_id" --include="*.js"
  grep -r "client_secret" --include="*.js"
  ```
  - Expected: client_id only in environment variables (not committed)
  - Check: `.gitignore` includes `.env.local`

### Session Management
- [ ] **Session Timeout**: Inactive users logged out after 30 min
  - Check: `window.lastActivity` tracking
  - Test: Leave browser idle 31 min, should redirect to login

- [ ] **Single Session Per User**: Can't have 2 active sessions simultaneously
  - Test: Open metas.campostecnologia.cloud in 2 tabs
  - Expected: Second tab redirects to login, first tab stays active

- [ ] **Logout Clears Data**: All sensitive data removed on logout
  ```javascript
  // Verify in browser DevTools after logout
  sessionStorage.clear() // ✅ Should be empty
  localStorage // ✅ Should NOT contain auth data
  IndexedDB // ✅ Check if metas_cache cleared
  ```

---

## 🚨 Admin Panel Security

### Access Control (`/admin/`)
- [ ] **OWNER_EMAILS Protection**: Only authorized users can access
  ```javascript
  // Check in your code:
  const OWNER_EMAILS = ['marcus@campostecnologia.cloud']
  // Confirm: Only your email(s) listed
  // ❌ Never: admin@example.com or test@test.com
  ```

- [ ] **No URL Bypass**: Can't access `/admin/` by modifying URL
  - Test: Open `https://metas.campostecnologia.cloud/admin/`
  - If not owner: Should redirect to `/`
  - Expected: Access Denied

- [ ] **Audit Log**: Track who accessed admin panel
  - Check: Console or Supabase logs
  - Log should include: timestamp, user email, action taken

### Admin Functions
- [ ] **No Dangerous Operations**: Can't delete user data without confirmation
  - Test: Try deleting a test user
  - Expected: Confirmation dialog + password re-enter

- [ ] **Backup Before Changes**: Database backed up before bulk operations
  - Check: Supabase backup schedule
  - Expected: Daily backups enabled

---

## 🗄️ Database (Supabase)

### Row Level Security (RLS)
- [ ] **RLS Enabled**: Each table has RLS policies
  ```sql
  -- Check in Supabase Console
  -- Auth policies should restrict user access
  SELECT * FROM metas WHERE user_id = auth.uid()
  -- Users can ONLY see their own metas
  ```

- [ ] **Premium Features Gated**: Premium-only data protected
  - [ ] AI suggestions only if `user_premium = true`
  - [ ] Advanced analytics only if `user_premium = true`
  - Check: Supabase RLS policies

### Data Integrity
- [ ] **UNIQUE Constraints**: Prevent duplicate data
  - Check: `metas_data` has UNIQUE(user_id, meta_id)
  - Test: Try creating 2 identical metas
  - Expected: Error "Duplicate key"

- [ ] **NOT NULL Constraints**: Required fields always filled
  - Check: `user_id`, `name`, `created_at` are NOT NULL
  - Test: Try creating meta without name
  - Expected: Error "NOT NULL violation"

- [ ] **Foreign Keys Intact**: No orphaned records
  ```bash
  # Check for data consistency
  SELECT m.*, u.id 
  FROM metas m 
  LEFT JOIN users u ON m.user_id = u.id 
  WHERE u.id IS NULL
  -- Expected: 0 rows (no orphans)
  ```

### Backups & Recovery
- [ ] **Backup Schedule**: Daily backups enabled
  - Check: Supabase Console → Backups
  - Expected: Last backup < 24 hours ago

- [ ] **Test Recovery**: Can restore from backup if needed
  - Procedure: Test restore to staging environment
  - Expected: All data intact after restore

---

## 🌐 CORS & Network Security

### Nginx Headers
- [ ] **Strict CORS**: Only allow metas.campostecnologia.cloud
  ```nginx
  # Check in /root/stack/nginx.conf
  add_header 'Access-Control-Allow-Origin' 'https://metas.campostecnologia.cloud';
  # Should NOT be '*' (wildcard)
  ```

- [ ] **Security Headers Present**
  ```
  ✅ X-Frame-Options: DENY (prevent clickjacking)
  ✅ X-Content-Type-Options: nosniff (prevent MIME sniffing)
  ✅ Strict-Transport-Security: max-age=31536000 (force HTTPS)
  ✅ Content-Security-Policy: (prevent XSS)
  ```

### HTTPS & Certificates
- [ ] **SSL Certificate Valid**: Not expired, correct domain
  ```bash
  # On VPS
  echo | openssl s_client -servername metas.campostecnologia.cloud -connect metas.campostecnologia.cloud:443 | grep -A 1 "Verify return code"
  # Expected: "Verify return code: 0 (ok)"
  ```

- [ ] **Auto-Renewal Enabled**: Let's Encrypt cert renews automatically
  ```bash
  # Check certbot
  sudo certbot certificates
  # Expected: Renewal configured
  ```

---

## 📱 PWA & Offline Security

### Service Worker
- [ ] **Service Worker Caching**: Only cache safe resources
  - ❌ Never cache: auth tokens, user data
  - ✅ Cache: CSS, JS, images
  - Check: `service-worker.js` cache strategy

- [ ] **Cache Invalidation**: Old cache cleared on update
  ```javascript
  // Check: Cache version incremented
  const CACHE_VERSION = 'v1.2.0' // Should match app version
  // On Service Worker update, old cache deleted
  ```

### Offline Data Sync
- [ ] **Conflicts Handled**: If offline changes conflict with server
  - Test: Edit meta offline, then online while server changed same meta
  - Expected: Conflict resolution dialog (user chooses version)
  - ❌ Should NOT silently overwrite

- [ ] **No Sensitive Data in Cache**: IndexedDB encrypted if used
  - Check: What's stored in IndexedDB?
  - Expected: Only meta names/content, NOT tokens

---

## 🔍 Code Security

### Input Validation
- [ ] **No SQL Injection**: User input sanitized
  - Check: All Supabase queries use parameterized inputs
  - ❌ Never: `SELECT * FROM metas WHERE name = '${userInput}'`
  - ✅ Correct: Use Supabase SDK (auto-escaped)

- [ ] **No XSS Attacks**: User input escaped before display
  - Check: Meta titles/descriptions rendered safely
  - ❌ Never: `element.innerHTML = user_input`
  - ✅ Correct: `element.textContent = user_input`

- [ ] **No Path Traversal**: Can't access files outside project
  - Test: Try URL like `/../../etc/passwd`
  - Expected: 404 Not Found

### Dependencies
- [ ] **No Vulnerable Dependencies**: All npm packages up-to-date
  ```bash
  cd ~/metas
  npm audit
  # Expected: 0 vulnerabilities
  ```

- [ ] **Limited Third-Party Scripts**: Only necessary scripts loaded
  - Check: Google Analytics, fonts, etc.
  - Each script should have valid reason

---

## 🔄 Staging vs Production Parity

- [ ] **Same Nginx Config**: Staging uses identical config to prod
  - Check: `/root/stack/nginx.conf` used by both
  - Difference only: `server_name` and `upstream`

- [ ] **Same Supabase Version**: Both use compatible Supabase SDK
  - Check: `package.json` same version

- [ ] **No Test Data in Production**: Staging data never leaks to prod
  - Search: No test user emails in prod
  - Expected: 0 results for "test@test.com", "admin@admin.com"

- [ ] **Environment Variables Different**
  - Prod: `SUPABASE_PROJECT_ID = tpcawmrblanpkgoqisgw`
  - Staging: `SUPABASE_PROJECT_ID = [staging-project-id]`
  - ✅ Each environment has separate DB

---

## 🔑 Secret Management

- [ ] **No Secrets in Git**
  ```bash
  cd ~/metas
  git log -p | grep -i "password\|token\|secret" | head -10
  # Expected: 0 results
  ```

- [ ] **Environment Variables Loaded Safely**
  - Check: `.env.local` is in `.gitignore`
  - Check: Never `require('.env.local')`

- [ ] **API Keys Rotated**: Supabase/Google API keys rotated periodically
  - Last rotation: [Date]
  - Next rotation: [Date + 90 days]

---

## 📊 Monitoring & Incident Response

- [ ] **Error Logging Enabled**: Unexpected errors logged
  - Check: Sentry/LogRocket configured? Or custom logging?
  - Should capture: 404s, 500s, auth failures

- [ ] **Incident Response Plan**: Know what to do if breached
  - [ ] Who to notify?
  - [ ] How to disable compromised accounts?
  - [ ] How to restore from backup?
  - [ ] How to notify users?

- [ ] **Security Updates Monitored**
  - Subscribe to: Security bulletins from Google, Supabase, dependencies
  - Check: GitHub security alerts enabled

---

## ✅ Sign-Off

**Audit Completed By**: ________________  
**Date**: ________________  
**Status**: ☐ PASS | ☐ PASS WITH NOTES | ☐ FAIL  
**Issues Found**: 
```
- [ ] Issue 1: [Description] [Priority: HIGH/MEDIUM/LOW]
- [ ] Issue 2: [Description]
```

**Action Items**:
```
1. [Fix issue 1 by DATE]
2. [Fix issue 2 by DATE]
```

**Next Audit**: [Date + 30 days]

---

## 📚 References

- [OWASP Top 10 Web Security Risks](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth)
- [PWA Security Checklist](https://web.dev/pwa-checklist/)
- [Google OAuth Best Practices](https://developers.google.com/identity/protocols/oauth2)

---

**Tip**: Run this checklist monthly, or after major releases. ECC's `security-reviewer` will catch most issues automatically, but manual review catches edge cases.
