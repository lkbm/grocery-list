import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";
import { blankList } from './App';

export interface Env {
	GROCERYLIST: DurableObjectNamespace;
}

export class GroceryList {
	state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		if (request.method === 'GET') {
			const data = await this.state.storage.get<string>('data');
			return new Response(data ?? JSON.stringify(blankList), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		if (request.method === 'PUT') {
			const body = await request.text();
			await this.state.storage.put('data', body);
			return new Response(JSON.stringify({ success: true }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response('Method not allowed', { status: 405 });
	}
}

const app = new Hono<{ Bindings: Env }>();

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
