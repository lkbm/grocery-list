/*
import { Hono } from "hono";
import { serveStatic } from "hono/cloudflare-workers";

export interface Env {
	GROCERYLIST: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();
console.debug("LKBM index.ts");

// API routes
app.get("/api/state/:key", async (c) => {
	const key = c.req.param("key");
	const value = await c.env.GROCERYLIST.get(key);
	return c.json({ value });
});

app.put("/api/state/:key", async (c) => {
	const key = c.req.param("key");
	const { value } = await c.req.json();
	await c.env.GROCERYLIST.put(key, value);
	return c.json({ success: true });
});

// Serve static assets
app.get("/assets/*", serveStatic({ root: "./", manifest: {} }));
app.get("/*", serveStatic({ root: "./", manifest: {} }));
// Add index.html to the root:
app.get("/", serveStatic({ root: "./", manifest: {} }));

// app.get("/assets/*", serveStatic({ root: "./" }));
// app.get("/*", serveStatic({ root: "./" }));

export default app;
*/
