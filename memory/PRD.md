# Golden Nuggets — Admin CMS (PRD)

## Problem Statement (verbatim summary)
Production-ready Admin CMS for a Christian sermon streaming platform. Preserve Lovable UI exactly. Admin Panel → FastAPI → Database → Storage → React Native mobile app. The only changes required to go live on Supabase are (1) swap the DB repository and (2) swap the storage provider.

## Stack
- Frontend: React 19 (CRA + craco), Tailwind CSS v3 (Lovable oklch theme preserved), React Query, React Router v7, Sonner toasts, Lucide icons, Fraunces + Inter fonts.
- Backend: FastAPI, MongoDB (motor), bcrypt, PyJWT, httpx + BeautifulSoup, slowapi (rate limiting).
- Storage: Emergent Object Storage behind a `StorageProvider` interface.
- Repository: Mongo behind a `BaseRepository` interface.

## Architecture (swap points marked)
```
Admin Panel  (React) ─▶  FastAPI (/api/v1/*)
                          │
                          ├─▶ Repository layer  ⇦ [SWAP → SupabaseRepository]
                          │       │
                          │       └─▶ MongoDB (motor)
                          │
                          └─▶ StorageProvider ⇦ [SWAP → SupabaseStorageProvider]
                                  │
                                  └─▶ Emergent Object Storage
```
Mobile app hits `/api/v1/mobile/*` only. Admin panel hits `/api/v1/auth/*` + `/api/v1/admin/*`.

## User Personas
- **Head Admin (Pastor)** — full CMS access.
- **Editor** (role reserved, same access today; middleware ready for split later).
- **Mobile listener** — read-only consumer via mobile API.

## API surface (production)
### Auth (`/api/v1/auth`)
POST /login (10/min rate-limited, brute-force lockout at 5 failures / 15 min), POST /logout, GET /me, POST /refresh.

### Admin (`/api/v1/admin`)
- **/sermons** — CRUD, /publish, /unpublish, /toggle-featured, /archive, /restore, /duplicate, /bulk (publish|unpublish|feature|unfeature|delete|archive|restore|assign-category).
- **/meetings** — CRUD, /publish, /archive, /restore.
- **/categories** — CRUD, nested (parent_id, self-parent guarded, delete reparents children), /{id}/assign, /{id}/unassign.
- **/media** — upload, list, usage, /{id}/replace, /{id}/delete (soft), /file/{id} (proxy stream).
- **/import** — /preview (Branham.org scraper, metadata only), /publish.
- **/dashboard** — /stats, /recent-sermons, /recent-imports, /upcoming-meetings, /activity.
- **/settings** — get, patch.
- **/activity** — searchable/filterable audit log.
- **/home** — get + patch (drives mobile home screen).
- **/notifications** — CRUD, /publish, /schedule, /cancel.

### Mobile (`/api/v1/mobile`) — public
- /sermons (list + detail, published-only, admin fields stripped)
- /meetings (list + detail)
- /categories
- /home (aggregated payload: banner + featured + recent + categories + upcoming)
- /analytics/event (play, pause, completed, download, favorite, unfavorite, search, share — auto-increments sermon counters)
- /media/{path:path} (fallback proxy for provider-hosted files)

## Cross-cutting
- Every admin action logged to `activity_log` via `services/log()` (actor, ip, user-agent, entity, message, status, timestamp, metadata).
- Rate limiting on /auth/login (10/min); brute-force lockout with X-Forwarded-For-aware IP resolution.
- JWT stored in httpOnly cookies (`secure=True, samesite=lax`), 12h access / 7d refresh.
- All errors returned with structured `detail`.
- Frontend queries cached by React Query with proper invalidation on mutations.
- Storage abstracted → `storage/base.py` + `storage/emergent.py` + `storage/supabase.py` (stub with implementation recipe).
- DB abstracted → `repositories/base.py` + `repositories/mongo.py` + `repositories/supabase.py` (stub) + `repositories/entities.py` (one line per collection).

## Implemented milestones
- **2026-02 iteration 1** — MVP: auth, sermon/meeting/category CRUD, manual upload, hybrid import, dashboard, settings, media, storage abstraction. Test result: 100% pass (36 backend + full frontend).
- **2026-02 iteration 2** — Production: /api/v1 versioning, repository layer, activity log, notifications, home management, mobile APIs, archive/restore/duplicate, bulk assign-category, media replace, nested categories, rate limiting. Test result: **70/70 backend pytest, 100% frontend**. One hardened bug (X-Forwarded-For for brute-force lockout).

## Migration checklist (Supabase)
1. Implement `SupabaseRepository(BaseRepository)` in `backend/repositories/supabase.py`. Change `Repository = MongoRepository` → `SupabaseRepository` in `repositories/__init__.py`.
2. Implement `SupabaseStorageProvider(StorageProvider)` in `backend/storage/supabase.py` (recipe already in the file). Change `get_storage_provider()` in `storage/__init__.py`.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `backend/.env`.
4. Nothing else needs to change.

## Backlog (P1 → P3)
- **P2** — split `admin` vs `editor` roles at middleware level (`require_role("admin")` decorator already scoped by `require_admin`).
- **P2** — Firebase FCM wiring for `/notifications/{id}/publish` (endpoint already dispatches — just plug SDK).
- **P2** — Analytics dashboard reading from `mobile_events` (top sermons, plays over time, per-language).
- **P3** — S3-style multipart resumable upload for large audio files (>500 MB).
- **P3** — CSRF token endpoint if any subdomain / cross-origin admin surface is added later.
- **P3** — `run_in_executor` wrapper for provider IO to unblock event loop under high concurrency.

## Files of note
- `/app/backend/server.py` — mounts all v1 routers, rate limit middleware, CORS.
- `/app/backend/auth.py` — versioned auth, rate-limited login, brute-force lockout (X-Forwarded-For-aware).
- `/app/backend/repositories/` — base + mongo + supabase-stub + entities factory.
- `/app/backend/storage/` — base + emergent + supabase-stub.
- `/app/backend/routers/` — sermons, meetings, categories, media, import_center, dashboard, settings, activity, home, notifications, mobile.
- `/app/backend/services/` — activity logging + rate limit config.
- `/app/backend/models.py` — Pydantic models with archive fields + play/download/favorite counters + HomeConfig + Notification + MobileEvent.
- `/app/frontend/src/App.js` — versioned routing + new page routes.
- `/app/frontend/src/lib/api.js` — axios baseURL `${BACKEND_URL}/api/v1`, MEDIA_FILE_URL helper.
- `/app/frontend/src/components/AdminLayout.jsx` — sidebar with Dashboard, Sermon Library, Meetings, Import Center, Categories, Media Manager, Home Management, Notifications, Activity Log, Settings.
- `/app/frontend/src/pages/` — all admin pages including the three new ones: ActivityLog.jsx, Notifications.jsx, HomeManagement.jsx.
