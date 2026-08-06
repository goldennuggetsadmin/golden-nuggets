# Golden Nuggets Admin Panel

React-based Content Management System for Golden Nuggets Ministry.

## Tech Stack

- **Framework**: Create React App + CRACO
- **UI**: Tailwind CSS + shadcn/ui
- **State**: React Query (TanStack Query v5)
- **Routing**: React Router v7
- **Charts**: Recharts
- **Auth**: JWT (stored in localStorage)

## Setup

```bash
npm install --legacy-peer-deps
```

Create a `.env` file:

```env
REACT_APP_BACKEND_URL=https://your-backend-url.up.railway.app
```

## Development

```bash
npm start
```

## Production Build

```bash
npm run build
```

## Deployment — Cloudflare Pages

| Setting | Value |
|---|---|
| Build command | `npm install --legacy-peer-deps && npm run build` |
| Build output directory | `build` |
| Node version | `20` |

### Environment Variables (set in Cloudflare Dashboard)

| Variable | Value |
|---|---|
| `REACT_APP_BACKEND_URL` | `https://your-backend-url.up.railway.app` |

## Pages

- `/` — Dashboard
- `/sermons` — Sermon Library (CRUD)
- `/sermons/new` — Create Sermon
- `/sermons/:id/edit` — Edit Sermon
- `/meetings` — Meetings
- `/import` — Import Center
- `/series` — Series Management
- `/notifications` — Push Notifications
- `/categories` — Categories
- `/media` — Media Manager
- `/home-screen` — Home Screen Management
- `/activity` — Activity Log
- `/login` — Login
