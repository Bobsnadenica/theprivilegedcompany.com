import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const runtimeEnv = (
  globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
).process?.env ?? {};
const requestedBase = runtimeEnv.SITE_BASE_PATH?.trim() || "/dev/bg/";
const base = requestedBase === "/" ? "/" : `/${requestedBase.replace(/^\/+|\/+$/g, "")}/`;

export default defineConfig({
  base,
  root: "app",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});
