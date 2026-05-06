import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const reactPath = path.resolve(__dirname, "node_modules/react");
const reactDomPath = path.resolve(__dirname, "node_modules/react-dom");

function getNodePackageName(id: string) {
  const normalized = id.split("?")[0].replace(/\\/g, "/");
  const nodeModulesMarker = "/node_modules/";
  const index = normalized.lastIndexOf(nodeModulesMarker);

  if (index === -1) return null;

  const packagePath = normalized.slice(index + nodeModulesMarker.length);
  const segments = packagePath.split("/");

  if (segments[0]?.startsWith("@")) {
    return segments.length > 1 ? `${segments[0]}/${segments[1]}` : null;
  }

  return segments[0] || null;
}

function isReactRuntimePackage(packageName: string) {
  return (
    packageName === "react" ||
    packageName === "react-dom" ||
    packageName === "scheduler" ||
    packageName === "use-sync-external-store" ||
    packageName.startsWith("@radix-ui/") ||
    packageName.startsWith("@floating-ui/") ||
    [
      "@tanstack/react-query",
      "cmdk",
      "class-variance-authority",
      "clsx",
      "lucide-react",
      "react-router",
      "react-router-dom",
      "react-remove-scroll",
      "react-remove-scroll-bar",
      "react-style-singleton",
      "sonner",
      "tailwind-merge",
      "use-callback-ref",
      "use-sidecar",
      "vaul",
    ].includes(packageName)
  );
}

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
          const packageName = getNodePackageName(id);

          if (!packageName) return;
          if (isReactRuntimePackage(packageName)) return "vendor-react";
          if (packageName.startsWith("@supabase/")) return "vendor-supabase";
          if (packageName.startsWith("@tanstack/")) return "vendor-query";
          if (packageName === "recharts") return "vendor-chart";
          if (packageName === "react-hook-form" || packageName === "@hookform/resolvers" || packageName === "zod") {
            return "vendor-form";
          }
          if (packageName === "date-fns") return "vendor-date";
          return undefined;
        },
      },
    },
  },
}));
