# Minhas Metas PWA — Everything Claude Code Configuration

## 📋 Project Context

**Application**: Minhas Metas — Personal Goals & Habits Tracking PWA  
**Stack**: Vanilla HTML/JS, Supabase, Nginx, PWA (offline-first)  
**Infrastructure**: Hostinger VPS (Ubuntu 22), Docker Compose  
**Environments**:
- 🟢 Production: `metas.campostecnologia.cloud`
- 🔵 Staging: `dev.metas.campostecnologia.cloud`

**Database**: Supabase Project `tpcawmrblanpkgoqisgw`  
**Authentication**: Google OAuth (Google Identity Services v1) + sessionStorage  
**Monetization**: Freemium model (Hotmart/Kiwify)  
**Users**: Active paying customers (premium features)

---

## 🎯 Active Agents (ENABLED)

### 1. **security-reviewer** ⚠️ CRITICAL
**Purpose**: OAuth flow, admin panel access, data protection  
**Validates**:
- Google OAuth token handling (sessionStorage only, not localStorage)
- Admin panel (`/admin/`) access control via OWNER_EMAILS
- CORS headers in Nginx (prevent XSS attacks)
- Supabase RLS (Row Level Security) policies
- Sensitive data in logs (user IDs, tokens must be masked)

**Triggers On**:
- Any auth-related code changes
- Admin panel modifications
- New API calls to Supabase
- Environment variable changes

**Example**: When you update OAuth code, ECC checks:
```
✅ Token stored in sessionStorage? 
✅ Admin routes behind OWNER_EMAILS check?
✅ CORS headers strict?
✅ No console.log(token)?
```

---

### 2. **database-reviewer** 🗄️ HIGH PRIORITY
**Purpose**: Supabase schema validation, migration safety  
**Validates**:
- Table constraints (UNIQUE, PRIMARY KEY, NOT NULL)
- Foreign key relationships
- Column types match Supabase expectations
- Migrations won't cause data loss
- Index performance

**Critical for Metas**:
- `metas_data` table: user_id + metas relationship
- UNIQUE constraints (you had a sync failure before)
- Email uniqueness for OAuth users
- TTL/archival columns if implemented

**Triggers On**:
- New SQL migrations
- Schema changes via Supabase Studio
- Bulk data operations

**Example**: Before deploying update to metas_data:
```
✅ UNIQUE constraint on (user_id, meta_id)?
✅ No orphaned foreign keys?
✅ Can old data migrate safely?
```

---

### 3. **code-quality-reviewer** 💻 MEDIUM PRIORITY
**Purpose**: Vanilla JS quality, memory leaks, performance  
**Validates**:
- Event listeners are properly removed (memory leak prevention)
- DOM queries optimized (not in loops)
- Service Worker lifecycle correct
- IndexedDB operations async/await
- CSS doesn't cause repaints unnecessarily

**Important for Metas** (vanilla JS):
- Modal open/close handlers
- Form event listeners
- Data sync listeners
- Service Worker update listeners

**Triggers On**:
- JavaScript file changes
- Service Worker updates
- Event handler modifications

**Example**: When you add a new click listener:
```
⚠️ WARNING: Event listener added but never removed
✅ Add: element.removeEventListener('click', handler) in cleanup
```

---

### 4. **integration-tester** 🔄 HIGH PRIORITY
**Purpose**: Staging ↔ Production consistency  
**Validates**:
- Staging config matches prod (except DB project ID)
- Nginx configs synchronized
- Feature flags work in both environments
- User data doesn't leak from staging to prod
- Database backups before major changes

**Critical for Metas**:
- Freemium logic works in staging before prod
- Premium user flags consistent
- OAuth callbacks point to correct environment

**Triggers On**:
- Staging deployments
- Production deployments
- Environment config changes
- Premium feature rollout

---

### 5. **documentation-sync** 📖 OPTIONAL (Recommended)
**Purpose**: Auto-generate docs from code  
**Validates**:
- Admin panel features documented
- Premium vs Free features listed
- Changelog updated with commits
- API endpoints documented

**Bonus for Metas**:
- Auto-generate "What's New" from commits
- Premium features list for Hotmart/Kiwify
- User guide from code comments

---

## 🔴 Disabled Agents (NOT needed for Metas)

```
- typescript-reviewer: Disabled (not TypeScript)
- c++-reviewer: Disabled (not C++)
- python-reviewer: Disabled (no Python backend)
- docker-reviewer: Disabled (simple Nginx setup)
```

---

## 🛡️ Critical Rules for Metas

### Rule 1: Token Security
```javascript
// ✅ ALLOWED
sessionStorage.setItem('google_token', token)

// ❌ FORBIDDEN (ECC will flag)
localStorage.setItem('google_token', token)
console.log('Token:', token)
window.token = token
```

### Rule 2: Admin Panel Protection
```javascript
// ✅ REQUIRED
const OWNER_EMAILS = ['marcus@campostecnologia.cloud']

function checkAdmin() {
  if (!OWNER_EMAILS.includes(user.email)) {
    return false // deny
  }
  // allow
}

// ❌ FORBIDDEN
if (user.id === 'some_hardcoded_id') { /* admin */ }
```

### Rule 3: Premium Logic (Server-Side Validated)
```javascript
// ✅ Trust backend
const isPremium = sessionStorage.getItem('user_premium')

// ❌ Trust client (ECC will flag as security risk)
const isPremium = true // NEVER!
```

### Rule 4: Service Worker Testing
```
// ✅ Test in staging FIRST
// Then push to production

// ❌ Update Service Worker in production directly
```

### Rule 5: Database Migrations
```sql
-- ✅ Document migrations
CREATE TABLE migration_log (
  version INT,
  applied_at TIMESTAMP
);

-- ✅ Test on staging first
-- Then apply to production

-- ❌ ALTER TABLE in production without backup
```

---

## 📊 Expected Outcomes

### Security
- ✅ Zero token leaks to localStorage/console
- ✅ Admin panel protected 100%
- ✅ CORS attacks prevented
- ✅ XSS vulnerabilities caught early

### Database
- ✅ Zero sync failures (like your previous UNIQUE constraint issue)
- ✅ Migrations validated before deployment
- ✅ Data consistency guaranteed

### Performance
- ✅ No memory leaks from event listeners
- ✅ Service Worker working offline correctly
- ✅ PWA loads 20-30% faster

### Reliability
- ✅ Staging = Production behavior
- ✅ Freemium logic consistent
- ✅ Premium features gated properly

---

## 🚀 Usage

### Installation
```bash
cd ~/metas
/plugin install everything-claude-code
```

### Daily Workflow
```bash
# When developing
claude

# In Claude Code session
> I'm adding new premium feature for habit streaks
> [Claude automatically activates: security-reviewer, database-reviewer, code-quality-reviewer]
> [ECC checks: Is premium gated? Is data persisted safely? Is code clean?]

> Deploy to staging
> [Claude activates: integration-tester]
> [ECC checks: Staging matches prod config? No data leaks?]
```

### Review Before Commit
```bash
> Review my code for security and performance
> [All agents run]
> [Get feedback on: tokens, database, memory, staging sync]

git commit -m "feat: add habit streak counter with premium gate"
```

---

## 📁 Related Configuration Files

- **`SECURITY_AUDIT.md`** — Manual security checklist (run monthly)
- **`validate-database.js`** — Script to validate Supabase schema
- **`PWA_PERFORMANCE.md`** — Performance optimization guide
- **`Nginx config`** — `/root/stack/nginx.conf` (CORS settings)

---

## ⚠️ Known Issues to Watch

1. **Google OAuth + PWA Standalone**: CORS headers must allow googleapis.com
2. **SessionStorage in Dev Tools**: Users can see tokens (normal for web)
3. **Service Worker Updates**: Requires user refresh (or background sync)
4. **Supabase RLS**: Must be tested thoroughly before prod deploy
5. **Offline Mode**: Sync conflicts if changes made offline + online simultaneously

---

## 📞 Questions?

If ECC suggests something unclear:
- Check `SECURITY_AUDIT.md` for security
- Check `PWA_PERFORMANCE.md` for performance
- Check `validate-database.js` for database issues

---

**Last Updated**: June 5, 2026  
**Version**: 1.0  
**Owner**: Marcus Vinicius (@camp.ostech)
