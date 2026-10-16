import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Ignore all env files, including ancestor Fellestall configuration.
  envDir: false,
  envPrefix: "BERGEN_PUBLIC_",
  plugins: [react()],
  server: { port: 5180, strictPort: true, fs: { strict: true } },
  preview: { port: 4180, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
