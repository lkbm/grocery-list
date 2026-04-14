# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a grocery list application built with:
- **Frontend**: Preact (React alternative) with TypeScript and Vite
- **Backend**: Hono framework running on Cloudflare Workers
- **Storage**: Cloudflare Durable Objects for persistent data storage
- **Deployment**: Cloudflare Workers via Wrangler

The application is a single-page app that allows users to manage grocery lists with categories, item status tracking, and automatic syncing between devices.

## Architecture

### Frontend (src/App.tsx)
- Main grocery list component with item management
- Uses Preact hooks for state management
- Implements auto-save with 2-second debounce
- Handles client-server state merging to prevent conflicts
- Categories items by store sections (produce, dairy, etc.)

### Backend (src/main.tsx)
- Hono server with simple REST API:
  - `GET /api/state/:key` - retrieve list data
  - `PUT /api/state/:key` - save list data
- Serves static assets from /dist
- Uses Cloudflare Durable Objects for persistence

### Build Configuration
- Vite with Preact preset
- TypeScript with separate configs for app and node code
- Bundle visualization enabled
- React compatibility layer (preact/compat)

## Common Commands

```bash
# Development
npm run dev          # Start development server

# Build and Deploy  
npm run build        # TypeScript compile + Vite build
npm run deploy       # Deploy to Cloudflare Workers

# Code Quality
npm run lint         # ESLint checking
npm run preview      # Preview production build
```

## Key Data Structures

### Item Interface
```typescript
interface Item {
  name: string;
  status?: string;        // "need" | "carted"
  category?: string;      // Store section
  dateAdded?: string;     // ISO timestamp
  lastUpdated?: string;   // ISO timestamp for conflict resolution
  deleted?: boolean;      // Soft delete flag
  deletedAt?: string;     // ISO timestamp
}
```

### Store Categories
Items are sorted by user-defined store sections (stored in `storeSections` array in options data). Default sections are provided for new lists but users can add, remove, and reorder sections via "Sort Items" mode.

## Development Notes
- Uses hash-based routing for different lists (e.g., #my-list)
- Each list has a corresponding "-options" list for available items
- list, list-options, list-options-options, etc. are all just lists. Don't do special code for of a list name ends with -options.
- Implements optimistic UI updates with server conflict resolution
- Auto-saves every 2 seconds when list changes
- Supports multiple concurrent users via timestamp-based merging

## TODOs
* Consider ratelimiting backend. Maybe some logging, as well.
* Sanitize list names.
* "Disconnected" "button" is ugly.
* Import/export option?
* ListItem is a div-input, but AvailableItem and CustomItem are buttons. I'd like shared element types so the styles are more consistent.
* Lazy-load sort mode
* "Sort by store" -- let me list the arrangement of items by store somehow. If I'm at Aldi, I click the "Aldi" button and it sorts by their layout.
* Price comparison info?
