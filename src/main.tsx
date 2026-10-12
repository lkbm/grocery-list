import { Hono } from 'hono';
import { blankList } from './App';
import { mergeListData, parseListData } from './merge';

const MAX_LIST_BYTES = 512 * 1024; // 512KiB
const VALID_KEY = /^[a-zA-Z0-9_-]{1,128}$/;

function isValidKey(key: string): boolean {
	return VALID_KEY.test(key);
}

export interface Env {
	GROCERYLIST: DurableObjectNamespace;
	GROCERY_RATE_LIMITER: {
		limit(opts: { key: string }): Promise<{ success: boolean }>;
	};
}

export class GroceryList {
	state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') === 'websocket') {
			// const origin = request.headers.get('Origin');
			// const url = new URL(request.url);
			// if (origin !== null && origin !== `https://${url.hostname}` && origin === 'http://localhost' || /^http:\/\/localhost:\d+$/.test(origin || '')) {
			// 	return new Response('Forbidden', { status: 403 });
			// }
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
			const sanitized = parseListData(body);
			if (!sanitized) return new Response('Invalid list data', { status: 400 });
			const stored = JSON.stringify(sanitized);
			await this.state.storage.put('data', stored);
			// Broadcast to any connected WS clients (e.g. when options list is updated via REST)
			this.broadcast(stored);
			return new Response(JSON.stringify({ success: true }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response('Method not allowed', { status: 405 });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== 'string') {
			ws.close(1003, 'Binary messages not supported');
			return;
		}
		if (new TextEncoder().encode(message).length > MAX_LIST_BYTES) {
			ws.close(1009, 'Message too large');
			return;
		}
		const incoming = parseListData(message);
		if (!incoming) {
			ws.close(1008, 'Invalid list data');
			return;
		}
		try {
			const existing = await this.state.storage.get<string>('data');
			const existingData = existing ? parseListData(existing) : blankList;
			if (!existingData) {
				// Don't merge into a blank list here - the next write would wipe whatever is stored
				console.error('Stored list data is corrupt; refusing to overwrite');
				ws.close(1011, 'Stored list data is corrupt');
				return;
			}

			const merged = mergeListData(existingData, incoming);

			const mergedStr = JSON.stringify(merged);
			if (new TextEncoder().encode(mergedStr).length > MAX_LIST_BYTES) {
				ws.close(1009, 'List size limit exceeded');
				return;
			}
			await this.state.storage.put('data', mergedStr);
			this.broadcast(mergedStr);
		} catch (error) {
			console.error('Failed to save list update:', error);
			ws.close(1011, 'Internal error');
		}
	}

	// Send to every connected client; one dead socket mustn't stop the rest getting the update
	broadcast(message: string): void {
		for (const client of this.state.getWebSockets()) {
			try {
				client.send(message);
			} catch (error) {
				console.error('Failed to send to WebSocket client:', error);
			}
		}
	}

	webSocketClose(): void {
		// runtime closes the socket; nothing to do
	}

	async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		console.error('WebSocket error:', error);
		try {
			ws.close(1011, 'WebSocket error');
		} catch {
			// Already closed
		}
	}
}

const app = new Hono<{ Bindings: Env }>();

app.onError((error, c) => {
	console.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, error);
	return c.text('Internal server error', 500);
});

app.use('*', async (c, next) => {
	const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
	const { success } = await c.env.GROCERY_RATE_LIMITER.limit({ key: ip });

	if (!success) return c.text('Too many requests', 429);

	return next();
});

// The HTML shell and its assets are served by [assets] in wrangler.toml before this worker runs;
// their security headers live in public/_headers. Only /api/* requests reach the routes below.

app.get('/api/ws/:key', async (c) => {
	const key = c.req.param('key');
	if (!isValidKey(key)) return c.text('Invalid list name', 400);
	const id = c.env.GROCERYLIST.idFromName(key);
	const stub = c.env.GROCERYLIST.get(id);
	return stub.fetch(c.req.raw);
});

app.get('/api/state/:key', async (c) => {
	const key = c.req.param('key');
	if (!isValidKey(key)) return c.text('Invalid list name', 400);
	const id = c.env.GROCERYLIST.idFromName(key);
	const stub = c.env.GROCERYLIST.get(id);
	return stub.fetch(c.req.raw);
});

app.put('/api/state/:key', async (c) => {
	const key = c.req.param('key');
	if (!isValidKey(key)) return c.text('Invalid list name', 400);
	const id = c.env.GROCERYLIST.idFromName(key);
	const stub = c.env.GROCERYLIST.get(id);
	return stub.fetch(c.req.raw);
});

export default app;
