# SHIKSHA ACADEMY — PRODUCTION DEPLOYMENT CHECKLIST

## 1. BACKEND DEPLOYMENT CHECKLIST

- [ ] **Production Python Environment**: Deploy Python 3.10+ virtual environment using WSGI/ASGI server (e.g. `uvicorn` or `gunicorn` with uvicorn workers).
- [ ] **PostgreSQL DATABASE_URL**: Set `DATABASE_URL` to production PostgreSQL / Supabase connection string.
- [ ] **JWT & Application Secrets**: Generate and configure high-entropy `SECRET_KEY` via environment variable (do not use dev default).
- [ ] **CORS Production Origin**: Configure `CORS_ORIGINS` environment variable to explicitly allow only the production frontend web origin(s).
- [ ] **Debug Mode Disabled**: Ensure OpenAPI docs / debug endpoints are restricted or secured in production.
- [ ] **HTTPS Enforcement**: Terminate TLS at load balancer / reverse proxy (Nginx / Cloudflare) to enforce HTTPS.
- [ ] **Health Endpoint**: Monitor `/health` endpoint for uptime verification.
- [ ] **Database Migrations & Schema**: Execute initial schema creation (`Base.metadata.create_all`) or migration scripts against PostgreSQL.
- [ ] **Backup Procedure**: Configure automated point-in-time PostgreSQL backups and WAL archiving on Supabase/PostgreSQL provider.

---

## 2. FRONTEND DEPLOYMENT CHECKLIST

- [ ] **Production API URL**: Set `VITE_API_URL` to production HTTPS backend domain during `npm run build`.
- [ ] **Production Build**: Generate optimized asset bundle via `npm run build` in `apps/web`.
- [ ] **HTTPS**: Serve PWA assets over HTTPS (required for Service Worker & Web Crypto API).
- [ ] **PWA Manifest**: `manifest.json` present with valid app icons, `theme_color`, and `display: standalone`.
- [ ] **Service Worker**: `sw.js` registered, caching application shell with stale-while-revalidate strategy.
- [ ] **Offline Functionality**: Local authentication, IndexedDB storage, and sync queue operate seamlessly offline.
- [ ] **IndexedDB**: Dexie.js database schema initialized with zero initial demo data.
- [ ] **Installability**: Meets PWA installability criteria for desktop and mobile browsers.

---

## 3. SECURITY CHECKLIST

- [ ] **No Secrets in Git**: `.env` and sensitive credentials ignored via `.gitignore`.
- [ ] **No Default Admin Password**: Admin user created with strong initial password supplied via `ADMIN_INITIAL_PASSWORD` environment variable.
- [ ] **No Demo Data**: Automatic sample student/payment seeding disabled in production builds.
- [ ] **RBAC Enforced**: API routes protected by role permissions (`student:read`, `payment:create`, `payment:correct`, `audit:view`, `sync:execute`).
- [ ] **Audit Logging**: All payment creations, corrections, and system changes logged to `audit_logs` table.
- [ ] **Device Authorization**: Synchronizations restricted to registered and active device tokens (`HTTP 403` on unauthorized devices).
- [ ] **HTTPS Only**: All client-server communications encrypted via TLS 1.3.
- [ ] **Secure Production Configuration**: No hardcoded development fallbacks in active use.

---

## 4. FINANCIAL INTEGRITY CHECKLIST

- [ ] **Admission Fee**: Distinct admission fee tracking per student fee account.
- [ ] **Tuition Fee**: Class-based tuition fee structures with manual override capability.
- [ ] **Class-Based Fee Structure**: Fee structures tied to Academic Year and Class Level.
- [ ] **Payment Recording**: Staff recording of manual payments with receipt references.
- [ ] **Payment Modes**: Support for CASH and UPI payment modes with optional reference numbers.
- [ ] **Partial Payments**: Full support for partial payments, dynamically calculating remaining balance.
- [ ] **Outstanding Balance Calculation**: Outstanding fee recalculated inside database transactions.
- [ ] **Correction Audit Trail**: Payment corrections stored in `payment_edit_history` with audit log trail.
- [ ] **PostgreSQL Concurrency Protection**: Pessimistic row locking (`SELECT ... FOR UPDATE`) prevents concurrent overpayment vulnerabilities (PG-1, PG-2, PG-3 verified).
- [ ] **client_tx_id Idempotency**: Unique constraint on `client_tx_id` prevents duplicate payment submissions during offline sync pushes.
