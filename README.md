# Golden Nuggets — Admin CMS + Mobile API

Production-ready admin CMS + mobile API for the Golden Nuggets sermon streaming platform.

## Architecture

```
Admin Panel (React)
        ↓
FastAPI Backend  (/api/v1/*)
        ↓
Repository Layer (repositories/)          ← swap for Supabase Postgres
        ↓
MongoDB / Motor
        ↓
Storage Provider (storage/)                ← swap for Supabase Storage
        ↓
Emergent Object Storage
        ↓
React Native Mobile App (consumes /api/v1/mobile/*)
```

## Two things to change when going to Supabase

1. **Database** — MongoDB → Supabase Postgres
   - Implement `SupabaseRepository(BaseRepository)` in `backend/repositories/supabase.py`.
   - Set `Repository = SupabaseRepository` in `backend/repositories/__init__.py`.
   - Nothing else needs to change.

2. **Storage** — Emergent Object Storage → Supabase Storage
   - Implement `SupabaseStorageProvider(StorageProvider)` in `backend/storage/supabase.py` (recipe already in the file).
   - Change `get_storage_provider()` in `backend/storage/__init__.py` to return `SupabaseStorageProvider()`.
   - Nothing else needs to change.

## Ports

- Frontend: 3000 (React + CRA + craco)
- Backend: 8001 (FastAPI + Uvicorn)
- MongoDB: use `MONGO_URL` env var

## API

- `/api/v1/auth/{login,logout,me,refresh}` — JWT (httpOnly cookies, 12h access / 7d refresh, bcrypt, brute-force lockout, rate limited)
- `/api/v1/admin/*` — full admin CMS
- `/api/v1/mobile/*` — public mobile-facing endpoints + analytics event ingestion

## Seed admin
`admin@goldennuggets.com` / `Admin@123` (auto-seeded on first startup)
