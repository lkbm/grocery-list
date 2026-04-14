import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/cloudflare-workers";
import { blankList } from './App';
import { Item, ListData } from './types';

const MAX_LIST_BYTES = 512 * 1024; // 512KiB
const VALID_STATUSES = new Set(["need", "carted"]);

// Clamp an ISO timestamp to the current time if it's in the future or invalid.
function clampTimestamp(iso: string): string {
	const now = Date.now();
	const parsed = Date.parse(iso);
	if (isNaN(parsed) || parsed > now) return new Date(now).toISOString();
	return iso;
}

function sanitizeItem(raw: unknown): Item | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.name !== 'string' || !obj.name.trim()) return null;

	const item: Item = { name: obj.name.trim() };
	if (obj.status !== undefined && obj.status !== null) {
		if (!VALID_STATUSES.has(obj.status as string)) return null;
		item.status = obj.status as "need" | "carted";
	}
	if (typeof obj.category === 'string') item.category = obj.category;
	if (Array.isArray(obj.recipes) && obj.recipes.every(r => typeof r === 'string'))
		item.recipes = obj.recipes;
	if (typeof obj.dateAdded === 'string') item.dateAdded = clampTimestamp(obj.dateAdded);
	if (typeof obj.lastUpdated === 'string') item.lastUpdated = clampTimestamp(obj.lastUpdated);
	if (typeof obj.deleted === 'boolean') item.deleted = obj.deleted;
	if (typeof obj.deletedAt === 'string') item.deletedAt = clampTimestamp(obj.deletedAt);
	if (typeof obj.sortIndex === 'number') item.sortIndex = obj.sortIndex;
	return item;
}

function sanitizeStringArray(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((s): s is string => typeof s === 'string');
}

// Parse and validate incoming list data, stripping unknown fields and clamping
// future timestamps. Returns null if the payload is structurally invalid.
function sanitizeListData(raw: unknown): ListData | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	if (!Array.isArray(obj.items)) return null;
	return {
		items: obj.items.map(sanitizeItem).filter((i): i is Item => i !== null),
		recipeOrder: sanitizeStringArray(obj.recipeOrder),
		storeSections: sanitizeStringArray(obj.storeSections),
	};
}

export interface Env {
	GROCERYLIST: DurableObjectNamespace;
}

const getNewestOfEachItem = (itemList: Item[]): Item[] => {
	const latestItems: { [key: string]: Item } = {};
	itemList.forEach(item => {
		const existing = latestItems[item.name];
		const itemLastUpdated = item.lastUpdated || "1970-01-01T00:00:00Z";
		const existingLastUpdated = existing?.lastUpdated || "1970-01-01T00:00:00Z";
		if (!existing || itemLastUpdated > existingLastUpdated) {
			latestItems[item.name] = item;
		}
	});
	return Object.values(latestItems);
};

// Union merge preserving existing order, appending new entries from incoming
const mergeOrdered = (existing: string[], incoming: string[]): string[] => {
	const result = [...existing];
	for (const item of incoming) {
		if (!result.includes(item)) result.push(item);
	}
	return result;
};

export class GroceryList {
	state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') === 'websocket') {
			const origin = request.headers.get('Origin');
			const url = new URL(request.url);
			if (origin !== null && origin !== `https://${url.hostname}`) {
				return new Response('Forbidden', { status: 403 });
			}
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);
			this.state.acceptWebSocket(server);
			const data = await this.state.storage.get<string>('data');
			server.send(data ?? JSON.stringify(blankList));
			return new Response(null, { status: 101, webSocket: client });
		}

		if (request.method === 'GET') {
			const data = await this.state.storage.get<string>('data');
			return new Response(data ?? JSON.stringify(blankList), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		if (request.method === 'PUT') {
			const body = await request.text();
			if (new TextEncoder().encode(body).length > MAX_LIST_BYTES)
				return new Response('Payload too large', { status: 413 });
			const sanitized = sanitizeListData(JSON.parse(body));
			if (!sanitized)
				return new Response('Invalid list data', { status: 400 });
			const stored = JSON.stringify(sanitized);
			await this.state.storage.put('data', stored);
			// Broadcast to any connected WS clients (e.g. when options list is updated via REST)
			for (const ws of this.state.getWebSockets()) {
				ws.send(stored);
			}
			return new Response(JSON.stringify({ success: true }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response('Method not allowed', { status: 405 });
	}

	async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
		if (new TextEncoder().encode(message).length > MAX_LIST_BYTES) {
			ws.close(1009, 'Message too large');
			return;
		}
		const incoming = sanitizeListData(JSON.parse(message));
		if (!incoming) {
			ws.close(1008, 'Invalid list data');
			return;
		}
		const existing = await this.state.storage.get<string>('data');
		const existingData: ListData = existing ? JSON.parse(existing) : blankList;

		const merged: ListData = {
			items: getNewestOfEachItem([...existingData.items, ...incoming.items]),
			recipeOrder: mergeOrdered(existingData.recipeOrder, incoming.recipeOrder),
			storeSections: mergeOrdered(existingData.storeSections, incoming.storeSections),
		};

		const mergedStr = JSON.stringify(merged);
		if (new TextEncoder().encode(mergedStr).length > MAX_LIST_BYTES) {
			ws.close(1009, 'List size limit exceeded');
			return;
		}
		await this.state.storage.put('data', mergedStr);

		for (const client of this.state.getWebSockets()) {
			client.send(mergedStr);
		}
	}

	webSocketClose(): void {
		// runtime closes the socket; nothing to do
	}

	async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		console.error('WebSocket error:', error);
		ws.close();
	}
}

const app = new Hono<{ Bindings: Env }>();

const secureHeadersMiddleware = secureHeaders({
	xFrameOptions: "DENY",
	xContentTypeOptions: "nosniff",
	contentSecurityPolicy: {
		defaultSrc: ["'self'"],
		scriptSrc: ["'self'"],
		styleSrc: ["'self'", "'unsafe-inline'"],
		connectSrc: ["'self'"],
		imgSrc: ["'self'", "data:"],
		objectSrc: ["'none'"],
		frameAncestors: ["'none'"],
	},
});

// Security headers only apply to the HTML shell — not API responses or WS upgrades.
app.use("*", async (c, next) => {
	if (c.req.path.startsWith("/api/") || c.req.header("Upgrade") === "websocket") return next();
	return secureHeadersMiddleware(c, next);
});

app.get("/api/ws/:key", async (c) => {
	const id = c.env.GROCERYLIST.idFromName(c.req.param("key"));
	const stub = c.env.GROCERYLIST.get(id);
	return stub.fetch(c.req.raw);
});

app.get("/api/state/:key", async (c) => {
	const id = c.env.GROCERYLIST.idFromName(c.req.param("key"));
	const stub = c.env.GROCERYLIST.get(id);
	return stub.fetch(c.req.raw);
});

app.put("/api/state/:key", async (c) => {
	const id = c.env.GROCERYLIST.idFromName(c.req.param("key"));
	const stub = c.env.GROCERYLIST.get(id);
	return stub.fetch(c.req.raw);
});

// Serve static assets
app.get("*", serveStatic({
	root: "./dist",
	rewriteRequestPath: (path) => {
		if (path === "/") return "/index.html";
		return path;
	},
	manifest: {}
}));

export default app;
