# ⚡ PWA Performance Optimization Guide — Minhas Metas

**Goal**: Make Minhas Metas load 30-50% faster and work reliably offline  
**Target Metrics**:
- First Contentful Paint (FCP): < 1.5 seconds
- Largest Contentful Paint (LCP): < 2.5 seconds
- Cumulative Layout Shift (CLS): < 0.1
- Lighthouse Score: > 90

---

## 📊 Current Performance Baseline

**Before Optimization** (example):
```
FCP:  2.3s   ⚠️ (target: 1.5s)
LCP:  3.8s   ❌ (target: 2.5s)
CLS:  0.15   ⚠️ (target: 0.1)
TTI:  4.2s   ⚠️ (Time to Interactive)
Lighthouse: 72  ⚠️ (target: 90+)
```

**After Optimization** (expected):
```
FCP:  1.2s   ✅
LCP:  2.1s   ✅
CLS:  0.08   ✅
TTI:  2.8s   ✅
Lighthouse: 94+ ✅
```

---

## 🚀 Quick Wins (Implement First — 30 minutes)

### 1. Minify CSS & JavaScript

**Current State**: Likely unminified  
**Impact**: ~40% file size reduction

```bash
# Install minifier
npm install --save-dev esbuild

# Add to package.json
"scripts": {
  "build": "esbuild src/main.js --bundle --minify --outfile=dist/main.min.js",
  "build:css": "cssnano src/style.css --output dist/style.min.css"
}

# Build
npm run build
```

**HTML Update**:
```html
<!-- Before -->
<script src="js/main.js"></script>
<link rel="stylesheet" href="css/style.css">

<!-- After -->
<script src="js/main.min.js" defer></script>
<link rel="stylesheet" href="css/style.min.css">
```

**Expected Gain**: FCP -0.8s, LCP -1s

---

### 2. Enable Gzip Compression in Nginx

**File**: `/root/stack/nginx.conf`

```nginx
http {
  # Add this block
  gzip on;
  gzip_vary on;
  gzip_min_length 1000;
  gzip_types text/plain text/css text/xml text/javascript 
             application/x-javascript application/xml+rss;
  gzip_comp_level 6;
  
  # ... rest of config
}
```

**Verification**:
```bash
# Restart Nginx
docker compose restart nginx

# Test compression
curl -I -H "Accept-Encoding: gzip" https://metas.campostecnologia.cloud/
# Should include: Content-Encoding: gzip
```

**Expected Gain**: File sizes ~60% smaller over network

---

### 3. Cache CSS & JS Files (Browser Cache)

**Nginx Config**: `/root/stack/nginx.conf`

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$ {
  # Static assets: cache for 30 days
  expires 30d;
  add_header Cache-Control "public, immutable";
}

location ~* \.(html)$ {
  # HTML: cache for 1 hour only (to allow updates)
  expires 1h;
  add_header Cache-Control "public, must-revalidate";
}
```

**Verification**:
```bash
docker compose restart nginx

# Test cache headers
curl -I https://metas.campostecnologia.cloud/css/style.min.css
# Should show: Cache-Control: public, immutable
```

**Expected Gain**: Repeat visits load 90% faster

---

### 4. Optimize Service Worker Caching

**File**: `service-worker.js`

**Current (Slow)**:
```javascript
// Cache everything on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('v1').then((cache) => {
      return cache.addAll([
        '/css/style.css',
        '/js/main.js',
        '/images/logo.png',
        // ... 50+ assets (slow!)
      ]);
    })
  );
});
```

**Optimized (Fast)**:
```javascript
const CACHE_VERSION = 'v1.2.0'; // Match your app version
const CRITICAL_ASSETS = [
  '/index.html',
  '/css/style.min.css',
  '/js/main.min.js',
];

const OPTIONAL_ASSETS = [
  '/images/logo.png',
  '/fonts/roboto.woff2',
  // Heavy assets cached on first use
];

self.addEventListener('install', (event) => {
  // Only cache critical assets (fast install)
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(CRITICAL_ASSETS);
    })
  );
  self.skipWaiting(); // Update immediately
});

self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // API calls: network first
  if (event.request.url.includes('/api/')) {
    return event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful responses
          const cache = caches.open(CACHE_VERSION);
          cache.then((c) => c.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
  
  // Static assets: cache first
  if (event.request.url.match(/\.(js|css|png|jpg|svg)$/)) {
    return event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
  
  // HTML: network first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        caches.open(CACHE_VERSION).then((c) => c.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
```

**Expected Gain**: Offline loads instantly (< 500ms), online stays current

---

## 🎯 Medium Effort (1-2 hours)

### 5. Lazy Load Images

**Current** (all images load at once):
```html
<img src="/images/goal-icon.png" alt="Goal">
```

**Optimized** (load when visible):
```html
<img src="/images/goal-icon.png" 
     alt="Goal"
     loading="lazy"
     decoding="async">
```

**Or with IntersectionObserver** (better control):
```javascript
const imageObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      img.classList.add('loaded');
      imageObserver.unobserve(img);
    }
  });
});

document.querySelectorAll('img[data-src]').forEach((img) => {
  imageObserver.observe(img);
});
```

**HTML**:
```html
<img data-src="/images/goal-icon.png" 
     alt="Goal"
     src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">
     <!-- transparent 1x1 placeholder -->
```

**Expected Gain**: Initial load -0.5s, LCP -0.8s

---

### 6. Optimize Supabase Queries

**Slow Query**:
```javascript
// Fetches ALL data
const { data: metas } = await supabase
  .from('metas')
  .select('*, habits(*, progress(*))');
// 1000+ records if user has many
```

**Optimized Query**:
```javascript
// Fetch only needed data, paginated
const PAGE_SIZE = 20;
const { data: metas, count } = await supabase
  .from('metas')
  .select('id, title, status, created_at', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(0, PAGE_SIZE - 1);

// Fetch habits only when user clicks on a meta
async function loadMetaDetails(metaId) {
  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .eq('meta_id', metaId);
  return habits;
}
```

**Caching Layer**:
```javascript
// Cache queries for 5 minutes
class MetasCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5 minutes
  }
  
  async getMetas(userId) {
    const key = `metas_${userId}`;
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.time < this.ttl) {
      return cached.data;
    }
    
    const { data } = await supabase
      .from('metas')
      .select('id, title, status')
      .eq('user_id', userId);
    
    this.cache.set(key, { data, time: Date.now() });
    return data;
  }
  
  invalidate(userId) {
    this.cache.delete(`metas_${userId}`);
  }
}

const metasCache = new MetasCache();
```

**Expected Gain**: API calls -50%, query time -70%

---

### 7. Code Splitting (Load What's Needed)

**Current** (one big bundle):
```javascript
import { adminPanel } from './admin';
import { analytics } from './analytics';
import { notifications } from './notifications';

export const app = { adminPanel, analytics, notifications };
// All 500KB loaded, even if user isn't admin
```

**Optimized** (lazy load):
```javascript
// Only load when needed
const adminPanel = () => import('./admin');
const analytics = () => import('./analytics');
const notifications = () => import('./notifications');

// In your code:
if (user.isAdmin) {
  const admin = await adminPanel();
  admin.init();
}
```

**Expected Gain**: Initial bundle -300KB, FCP -1.2s

---

## 🔬 Advanced Optimizations (3+ hours)

### 8. Critical CSS Inlining

**Concept**: Inline CSS for above-the-fold content

**Current**:
```html
<head>
  <link rel="stylesheet" href="/css/style.min.css">
  <!-- Has to download full CSS before rendering -->
</head>
```

**Optimized**:
```html
<head>
  <style>
    /* Critical CSS inlined - renders immediately */
    body { font-family: sans-serif; }
    header { background: #333; }
    .hero { height: 100vh; }
    /* ~5KB of essential styles */
  </style>
  
  <!-- Load full CSS async -->
  <link rel="stylesheet" href="/css/style.min.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="/css/style.min.css"></noscript>
</head>
```

**Expected Gain**: LCP -1.5s

---

### 9. Web Vitals Monitoring

**Add to your app**:
```javascript
// Monitor Core Web Vitals
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendMetric(name, value) {
  // Send to analytics (Sentry, LogRocket, etc.)
  console.log(`${name}:`, value);
}

getCLS(sendMetric);
getFID(sendMetric);
getFCP(sendMetric);
getLCP(sendMetric);
getTTFB(sendMetric);
```

**Or use Lighthouse CI** (automated):
```bash
# Install
npm install --save-dev @lhci/cli

# Run before each deploy
lhci autorun --config=lighthouserc.json
```

**lighthouserc.json**:
```json
{
  "ci": {
    "collect": {
      "url": ["https://metas.campostecnologia.cloud"],
      "numberOfRuns": 3
    },
    "upload": {
      "target": "temporary-public-storage"
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }]
      }
    }
  }
}
```

---

### 10. Database Query Optimization

**Analyze slow queries**:
```bash
# In Supabase Console → SQL Editor
-- Find slow queries
EXPLAIN ANALYZE 
SELECT * FROM metas WHERE user_id = '...' ORDER BY created_at;

-- Add indexes for common queries
CREATE INDEX idx_metas_user_id ON metas(user_id);
CREATE INDEX idx_metas_user_created ON metas(user_id, created_at DESC);
```

---

## 📈 Testing & Validation

### Before & After Comparison

**Run Lighthouse**:
```bash
# Install
npm install -g lighthouse

# Run audit (production)
lighthouse https://metas.campostecnologia.cloud --view

# Run audit (staging)
lighthouse https://dev.metas.campostecnologia.cloud --view
```

**Check Network Performance**:
```bash
# Chrome DevTools → Network tab
# 1. Open app
# 2. Throttle to "Slow 3G"
# 3. Record load time
# Target: < 5 seconds even on slow network
```

**Synthetic Monitoring** (automated):
```bash
# Use service like Checkly or Datadog
# Monitors real-world performance continuously
# Alerts if performance degrades
```

---

## 🎯 Implementation Roadmap

**Week 1** (Quick Wins):
- [ ] Minify CSS/JS
- [ ] Enable Gzip compression
- [ ] Browser caching headers
- **Expected improvement**: Lighthouse 72 → 80

**Week 2** (Medium):
- [ ] Optimize Service Worker
- [ ] Lazy load images
- [ ] Paginate Supabase queries
- [ ] Code splitting
- **Expected improvement**: Lighthouse 80 → 88

**Week 3** (Advanced):
- [ ] Critical CSS inlining
- [ ] Web Vitals monitoring
- [ ] Database indexing
- **Expected improvement**: Lighthouse 88 → 94+

---

## ✅ Performance Checklist

- [ ] Minified CSS & JS
- [ ] Gzip compression enabled
- [ ] Cache headers set correctly
- [ ] Service Worker optimized
- [ ] Images lazy loaded
- [ ] Database queries paginated
- [ ] No memory leaks in vanilla JS
- [ ] Critical CSS inlined
- [ ] Lighthouse score > 90
- [ ] Core Web Vitals in green zone
- [ ] Performance stable across 3 runs
- [ ] Monitoring configured

---

## 📊 Monitoring Dashboard Example

```
Minhas Metas Performance Dashboard
==================================

FCP:  1.2s  ✅ (target: 1.5s)
LCP:  2.0s  ✅ (target: 2.5s)
CLS:  0.08  ✅ (target: 0.1)
TTI:  2.8s  ✅

Lighthouse:    94/100
Network:       3G: 4.2s, 4G: 1.8s
API Response:  240ms average
Database:      95th percentile < 200ms

Last Updated: 2026-06-05 14:30 UTC
Monitoring: Active (hourly checks)
```

---

## 📚 Resources

- [Web Vitals Guide](https://web.dev/vitals/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
- [Service Worker Best Practices](https://developer.chrome.com/docs/workbox/service-worker-overview/)
- [Supabase Performance](https://supabase.com/docs/guides/database/performance)
- [PWA Checklist](https://web.dev/pwa-checklist/)

---

## 🚀 Expected Results

After implementing all optimizations:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Lighthouse Score | 72 | 94 | +22 points |
| FCP | 2.3s | 1.2s | -48% |
| LCP | 3.8s | 2.0s | -47% |
| CLS | 0.15 | 0.08 | -47% |
| Load on 3G | 8.2s | 4.2s | -49% |
| Repeat Visits | 4.5s | 0.8s | -82% |

**User Impact**: App feels 5-10x faster, especially on mobile/slow networks

---

**Questions?** Review with ECC's `code-quality-reviewer` agent when implementing changes.
