# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Grocery list SPA: Preact + TypeScript + Vite frontend, Hono on Cloudflare Workers, one Durable Object per list. Lists sync live between devices over WebSockets.

Deployed via the `cf` CLI (config in `cloudflare.config.ts`; Wrangler build settings in `wrangler.config.ts`). Requires Node >= 22.18 (see .nvmrc).

## Architecture

### Sync model
- Each list is a `GroceryList` Durable Object keyed by list name. Clients connect to `GET /api/ws/:key` (WebSocket upgrade); the DO sends the stored list on connect.
- Clients send their whole `ListData` on every local change. The DO merges it into the stored copy (`mergeListData`), saves, and broadcasts the merged result to all connected clients.
- Merging happens only on the server. Clients don't merge; they replace local state with whatever the server sends (optimistic updates, then server wins).
- Conflict resolution is timestamp-based (`lastUpdated` / `deletedAt`), so deletes use soft-delete flags and tombstones rather than removal.

### Frontend
- src/App.tsx: main list UI and item actions
- src/websockets.ts: `useSyncedList` (one list's state over a socket, reconnect with backoff) plus the hooks for the main list and its options list. The options list is also backed up to localStorage, and if the server returns it empty, a banner offers to restore the backup.
- src/AddItems.tsx, src/RecipeModal.tsx: picking items from the options list; creating and editing recipes

### Backend (src/main.tsx)
- `GET /api/ws/:key`: WebSocket sync (the path the app uses)
- `GET`/`PUT /api/state/:key`: legacy REST, unused by the client. `PUT` overwrites the stored list without merging, then broadcasts.
- Static assets are served from `dist` by `assetsDirectory` before the worker runs (security headers in public/_headers); only `/api/*` reaches Hono.
- Rate-limited via the `GROCERY_RATE_LIMITER` binding; list keys must match `^[a-zA-Z0-9_-]{1,128}$`, payloads ≤ 512KiB.
- Pure sanitize/merge logic lives in src/merge.ts (tested in src/merge.test.ts); keep it free of worker and app imports so tests can load it.

## Common Commands

```bash
make dev / make deploy / make build   # cf dev, cf deploy, npm run build
npm test                              # Vitest (npm run test:watch for watch mode)
npm run types                         # Regenerate .cloudflare/types (build does this too)
make lint / make format               # oxlint / oxfmt (npm run lint still runs ESLint)
```

## Data Model

See src/types.ts. `ListData` holds `items`, `recipeOrder`, `storeSections`, and the tombstone arrays `deletedRecipes` / `deletedSections`. The tombstones stop a merge from bringing back a recipe or section that was deleted or renamed. Items can belong to recipes (`recipes`); items with no recipe are "default items".

Items are sorted by user-defined store sections (`storeSections` in the options list). New lists start with none; users add, remove, and reorder them in "Sort Items" mode.

## Development Notes
- Hash-based routing selects the list (e.g. #my-list)
- Each list has a corresponding "-options" list holding available items, recipes and store sections
- list, list-options, list-options-options, etc. are all just lists. Don't write special code for list names ending in -options. (Known exception, kept deliberately for now: `useOptionsSocket` in src/websockets.ts doesn't append a second "-options".)

## TODOs
* Import/export option?
* Lazy-load sort mode
* "Sort by store" -- let me list the arrangement of items by store somehow. If I'm at Aldi, I click the "Aldi" button and it sorts by their layout.
* Price comparison info?
