import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
	plugins: [react(), visualizer({ open: true, filename: "bundle-visualization.html" })],
	base: "/",
	build: {
		outDir: "dist",
		rollupOptions: {
			treeshake: true,
			input: "index.html",
			output: {
				// Handle JS entry chunks
				entryFileNames: "assets/[name].[hash].js",
				// Handle CSS and other assets
				assetFileNames: (assetInfo) => {
					if (!assetInfo.name) return "assets/[name].[hash][extname]";

					const info = assetInfo.name.split(".");
					const ext = info[info.length - 1];

					if (["svg", "json"].includes(ext)) {
						return `[name].[ext]`;
					}

					return `assets/[name].[hash][extname]`;
				},
				// Handle dynamic imports and code splitting
				chunkFileNames: "assets/[name].[hash].js",
			},
		},
	},
});
