import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const reactPath = path.resolve(__dirname, "node_modules/react");
const reactDomPath = path.resolve(__dirname, "node_modules/react-dom");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  optimizeDeps: {
    force: true,
  },
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: path.resolve(reactPath, "index.js") },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(reactPath, "jsx-runtime.js") },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(reactPath, "jsx-dev-runtime.js") },
      { find: /^react-dom$/, replacement: path.resolve(reactDomPath, "index.js") },
      { find: /^react-dom\/client$/, replacement: path.resolve(reactDomPath, "client.js") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router-dom")) return "vendor-router";
          if (id.includes("react-dom") || id.includes("react/")) return "vendor-react";
          if (id.includes("@supabase/")) return "vendor-supabase";
          if (id.includes("@tanstack/")) return "vendor-query";
          if (id.includes("recharts")) return "vendor-chart";
          if (
            id.includes("@radix-ui/") ||
            id.includes("lucide-react") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge") ||
            id.includes("sonner") ||
            id.includes("vaul") ||
            id.includes("cmdk")
          ) {
            return "vendor-ui";
          }
          if (id.includes("react-hook-form") || id.includes("@hookform/resolvers") || id.includes("zod")) {
            return "vendor-form";
          }
          if (id.includes("date-fns")) return "vendor-date";
          return undefined;
        },
      },
    },
  },
}));
