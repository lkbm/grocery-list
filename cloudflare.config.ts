import { bindings, defineConfig, exports } from "cf/config";

export default defineConfig({
	worker: {
		name: "grocery-list",
		compatibilityDate: "2026-04-14",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/main.tsx",
		env: {
			GROCERYLIST: bindings.durableObject({
				worker: "grocery-list",
				exportName: "GroceryList",
			}),
			GROCERY_RATE_LIMITER: bindings.rateLimit({
				namespace: "1001",
				simple: {
					limit: 60,
					period: 60,
				},
			}),
		},
		exports: {
			// Created via Wrangler migration v1 with `new_classes`, so it is KV-backed, not SQLite.
			GroceryList: exports.durableObject({ storage: "legacy-kv" }),
		},
	},
});
