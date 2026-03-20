# Code Hub — Technical Debt & Future Improvements

Generated: 2026-03-20
Status: Post-security-hardening audit

---

## 🔴 HIGH PRIORITY

### TD-001 — Sessions lost on server restart
**Problem:** Session tokens are stored in-memory (`Map`). Every time `node server.js` restarts, all logged-in users are kicked out and must re-login.
**Impact:** Poor UX in shared-folder deployments where the server may restart.
**Fix options:**
- Persist sessions to a JSON file (simple, low-overhead)
- Use `express-session` with file-store (`session-file-store`)
- Upgrade to Redis if the team ever has a Linux server

### TD-002 — No HTTPS / TLS
**Problem:** All traffic (including PINs during login/register) travels in cleartext over HTTP.
**Impact:** PINs and session tokens visible on the LAN to any packet sniffer (Wireshark, etc.)
**Fix options:**
- Generate a self-signed cert with `mkcert` and add `https.createServer({ key, cert }, app)` in `server.js`
- Put a reverse proxy (nginx, IIS ARR) in front with a proper corp cert
- Minimum: use an internal CA cert issued by AT&T IT

### TD-003 — Single shared data store (no concurrency control)
**Problem:** `data.json` uses atomic rename (safe for single writer) but if two techs save snippets simultaneously, one write will silently overwrite the other.
**Impact:** Data loss under concurrent writes.
**Fix options:**
- Add a write queue / mutex (e.g., `async-mutex` package)
- Upgrade to SQLite (`better-sqlite3`) for proper row-level writes
- Short-term: show a "last saved by" timestamp in the UI to detect conflicts

---

## 🟡 MEDIUM PRIORITY

### TD-004 — No session refresh / sliding expiry
**Problem:** Sessions expire 8 hours after creation (hard TTL), regardless of activity.
**Impact:** A tech who actively uses the app for 9 hours gets kicked mid-session.
**Fix:** Update `createdAt` → `lastUsedAt` in session store; reset on each authenticated request.

### TD-005 — Rate limiter is in-memory and IP-based only
**Problem:** Rate limit state resets on server restart. Also, shared-NAT environments (all techs behind same corporate IP) could have one tech trigger the block for everyone.
**Impact:** After restart, brute-force window resets. Shared-IP false positives.
**Fix:** Rate limit per `attuid` (included in login body) in addition to IP. Persist counter to file between restarts.

### TD-006 — `hub-audit.log` grows indefinitely
**Problem:** The audit log file is append-only with no rotation.
**Impact:** Over months/years the log file can grow to GB size.
**Fix:** Implement log rotation — keep last 30 days or 50 MB, whichever comes first. Use `winston` with `DailyRotateFile` transport, or a simple manual rotation on startup.

### TD-007 — PowerShell `elevated-terminal` runs as current OS user
**Problem:** Whoever starts `node server.js` owns all `runas` executions. If that user is an admin, every tech gets admin-level command execution.
**Impact:** Privilege escalation if a low-privilege account can use the terminal feature.
**Fix options:**
- Add a role/permission field to `users.json` (`role: "admin" | "user"`)
- Gate the elevated-terminal endpoint by role in `requireAuth`
- Audit and alert on every exec (already logging — but no alert mechanism)

### TD-008 — No input length limit on ATTUID at registration
**Problem:** `attuid` is not length-validated server-side during registration. A malicious input of 10,000 characters would be stored in `users.json`.
**Impact:** Minimal (stored string only), but could cause visual bugs or inflate file size.
**Fix:** Add `if (attuid.length > 20) return res.status(400).json({ error: '...' })` in the register handler.

### TD-009 — Export endpoints stream full data.json to any authenticated user
**Problem:** Any logged-in tech can export the entire snippet database (JSON or XLSX).
**Impact:** If a tech's account is compromised, all corporate snippets are exfiltrated in one request.
**Fix options:**
- Add an `admin` role check to export endpoints
- Rate-limit exports per user (e.g., max 5 per hour)

---

## 🟢 LOW PRIORITY / NICE-TO-HAVE

### TD-010 — No email/notification on failed login attempts
**Problem:** The rate limiter blocks after 10 attempts but nobody is alerted.
**Impact:** Brute-force attempts go unnoticed until someone reads the log.
**Fix:** Send an email alert (or Teams webhook) when an IP is rate-limited.

### TD-011 — `users.json` stores `settings.servers` including hostnames/IPs
**Problem:** Server connection details (hostnames, domains) are stored in plaintext in `users.json`.
**Impact:** If `users.json` is accidentally committed or shared, internal infrastructure topology leaks.
**Fix:** Encrypt sensitive settings fields at rest using a static server-side key, or store server lists separately from user profiles.

### TD-012 — No automated tests
**Problem:** There are zero unit or integration tests. All QA is manual.
**Impact:** Regressions are caught only after deployment.
**Fix:** Add `vitest` for frontend unit tests and `supertest` for API integration tests. Prioritize auth flow and snippet save/load.

### TD-013 — Frontend has no error boundary
**Problem:** An unhandled React error in any component crashes the entire app with a white screen.
**Impact:** Poor UX — user sees blank page with no recovery path.
**Fix:** Wrap the app root in a `<ErrorBoundary>` component with a friendly "algo salió mal — recargar" message.

### TD-014 — Favicon is SVG but IE/Edge legacy don't support SVG favicons
**Problem:** `favicon.svg` is not supported in older Edge (EdgeHTML) and IE11.
**Impact:** Corporate PCs on older Windows may show a generic browser icon.
**Fix:** Add a `favicon.ico` fallback (16×16 + 32×32 ICO) alongside the SVG in `public/`.

### TD-015 — `node_modules` must be copied manually for air-gapped deployment
**Problem:** Corporate network blocks npmjs.org. `node_modules` (≈150 MB) must be manually copied via USB or shared drive.
**Impact:** Friction for new deployments; risk of version mismatch.
**Fix options:**
- Create a ZIP artifact (server + dist + node_modules) and host it on internal SharePoint
- Set up an internal npm mirror (Verdaccio) on the corporate intranet
- Use `npm pack` to bundle only prod dependencies

---

## Already Fixed (this sprint)

| # | Issue | Fix |
|---|-------|-----|
| ✅ | 6 unauthenticated API endpoints | Added `requireAuth` middleware |
| ✅ | `isValidIdent()` defined but never called | Now called in elevated-terminal |
| ✅ | Prototype pollution via settings spread | `ALLOWED_SETTINGS` whitelist |
| ✅ | No logout endpoint (tokens lived forever) | `POST /api/auth/logout` added |
| ✅ | Snippets/tools accepted arbitrary fields | `sanitizeSnippet()` / `sanitizeTool()` |
| ✅ | 4-digit PIN minimum | Raised to 6 digits + digits-only check |
| ✅ | Client logout only cleared localStorage | Now invalidates server-side token |
| ✅ | Hardcoded neon green CSS | Replaced with `var(--accent)` |
| ✅ | API URL hardcoded to localhost | Dynamic: `/api` in prod, localhost in dev |
| ✅ | CORS too restrictive for LAN | Added RFC-1918 range allowlist |
