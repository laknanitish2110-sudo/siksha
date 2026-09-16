# Shiksha Academy — Production Deployment Guide

This guide details the manual production deployment procedure for Shiksha Academy.

## Target Architecture

```text
GitHub Repository
   │
   ├── Frontend (apps/web) ──────────► Vercel (React Vite PWA)
   │                                        │
   │                                   HTTPS REST API
   │                                        ▼
   └── Backend (apps/api) ───────────► Render (FastAPI + SQLAlchemy)
                                            │
                                      PostgreSQL SSL
                                            ▼
                                      Supabase PostgreSQL
```

---

## 1. GitHub Preparation

1. Ensure all code changes are pushed to your primary repository branch (e.g. `main` or `master`).
2. Verify that `.gitignore` in the repository root and subdirectories ignore local `.env` files and database instances (`*.db`).
3. Confirm build checks pass locally before deploying:
   - Backend: `apps/api/.venv/Scripts/python.exe -m pytest -v`
   - Frontend: `npm run build --prefix apps/web`

---

## 2. Supabase PostgreSQL Configuration

1. Log into your [Supabase Dashboard](https://supabase.com).
2. Select your project or create a new project.
3. Navigate to **Project Settings** -> **Database**.
4. Retrieve your **Connection String** (Transaction Pooler or Direct Connection):
   ```text
   postgresql://postgres:<PASSWORD>@db.<YOUR-PROJECT-REF>.supabase.co:5432/postgres?sslmode=require
   ```
5. Ensure IP restrictions / firewall rules allow incoming connections from Render.

---

## 3. Render Backend Deployment

1. Log into [Render](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Set the build parameters:
   - **Name**: `shiksha-api`
   - **Root Directory**: `apps/api`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
5. Configure Environment Variables in Render:
   - `ENVIRONMENT` = `production`
   - `DATABASE_URL` = `<SUPABASE_POSTGRES_CONNECTION_STRING>`
   - `SECRET_KEY` = `<GENERATE_SECURE_64_CHAR_HEX_KEY>`
   - `ADMIN_INITIAL_PASSWORD` = `<SET_SECURE_INITIAL_ADMIN_PASSWORD>`
   - `CORS_ORIGINS` = `https://<YOUR-VERCEL-FRONTEND-APP>.vercel.app`
6. Click **Deploy Web Service**.
7. Note down your Render API URL (e.g. `https://shiksha-api.onrender.com`).

---

## 4. Vercel Frontend Deployment

1. Log into [Vercel](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository.
4. Set the project configuration:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Configure Environment Variables in Vercel:
   - `VITE_API_URL` = `https://<YOUR-RENDER-BACKEND-URL>.onrender.com`
6. Click **Deploy**.
7. Note down your production Vercel frontend URL (e.g. `https://shiksha-academy.vercel.app`).

---

## 5. Environment Variables Reference

### Backend (`apps/api`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Must be `production` | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:pass@host:5432/postgres?sslmode=require` |
| `SECRET_KEY` | JWT signing key (min 32 chars) | `<GENERATE_HIGH_ENTROPY_KEY>` |
| `ADMIN_INITIAL_PASSWORD` | Initial seed admin password | `<SET_INITIAL_ADMIN_PASSWORD>` |
| `CORS_ORIGINS` | Comma-separated frontend URLs | `https://shiksha-academy.vercel.app` |

### Frontend (`apps/web`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | Production FastAPI backend URL | `https://shiksha-api.onrender.com` |

---

## 6. CORS Configuration

1. After obtaining your Vercel deployment domain, update `CORS_ORIGINS` on Render:
   ```text
   CORS_ORIGINS=https://shiksha-academy.vercel.app
   ```
2. If custom domains are added later, add them as comma-separated values:
   ```text
   CORS_ORIGINS=https://shiksha-academy.vercel.app,https://academy.yourdomain.com
   ```
3. Save changes in Render to trigger automatic redeployment.

---

## 7. Health Check Verification

Test backend health endpoint via curl or browser:

```bash
curl -i https://<YOUR-RENDER-BACKEND-URL>.onrender.com/health
```

Expected HTTP Response:
```json
HTTP/1.1 200 OK
Content-Type: application/json

{"status": "healthy", "service": "shiksha-api"}
```

---

## 8. First Admin Login

1. Open your production web application in Chrome/Edge: `https://<YOUR-VERCEL-FRONTEND-APP>.vercel.app`.
2. Login with the initial credentials:
   - **Username**: `admin`
   - **Password**: `<ADMIN_INITIAL_PASSWORD>` (configured during Render setup)
3. Navigate to **User Management** and create staff operator accounts for desk cashiers.

---

## 9. PWA Installation

1. Open the production URL on mobile or desktop browser (Chrome/Edge/Safari).
2. Click **Install App** or **Add to Home Screen**.
3. Verify PWA launches in standalone mode without browser navigation chrome.
4. Verify service worker (`sw.js`) registers successfully under browser developer tools -> Application -> Service Workers.

---

## 10. Production Smoke Test

Execute this verification sequence:

1. **Online Student Registration**: Create a student record; verify record persists in Supabase.
2. **Fee Collection**: Record a tuition payment using Cash and another using UPI.
3. **Receipt Generation**: Generate a PDF receipt for a payment; verify proper rendering.
4. **Offline Mode Verification**:
   - Turn off internet / enable Offline Mode in browser DevTools.
   - Record a new payment (stored in Dexie IndexedDB outbox).
   - Turn internet back on and verify sync completes successfully.
5. **Concurrency Test**: Ensure multiple staff accounts can operate simultaneously without race conditions.

---

## 11. Rollback Procedure

### Backend (Render)
1. In Render Dashboard, go to **Deploys**.
2. Find the last known working deployment commit.
3. Click **Rollback** to instantly restore the prior backend build.

### Frontend (Vercel)
1. In Vercel Dashboard, go to **Deployments**.
2. Select the previous stable deployment.
3. Click **Promote to Production**.
