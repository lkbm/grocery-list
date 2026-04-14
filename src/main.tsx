import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";
import { blankList } from './App';
import { Item, ListData } from './types';

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
			await this.state.storage.put('data', body);
			// Broadcast to any connected WS clients (e.g. when options list is updated via REST)
			for (const ws of this.state.getWebSockets()) {
				ws.send(body);
			}
			return new Response(JSON.stringify({ success: true }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response('Method not allowed', { status: 405 });
	}

	async webSocketMessage(_ws: WebSocket, message: string): Promise<void> {
		const incoming = JSON.parse(message) as ListData;
		const existing = await this.state.storage.get<string>('data');
		const existingData: ListData = existing ? JSON.parse(existing) : blankList;

		const merged: ListData = {
			items: getNewestOfEachItem([...existingData.items, ...incoming.items]),
			recipeOrder: mergeOrdered(existingData.recipeOrder, incoming.recipeOrder),
			storeSections: mergeOrdered(existingData.storeSections, incoming.storeSections),
		};

		const mergedStr = JSON.stringify(merged);
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
