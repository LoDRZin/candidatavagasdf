import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Local admin credentials are read from the gitignored .dev.vars file.

export default defineConfig(({ command, mode }) => {
  if (command === "build") process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
  if (mode === 'staging') process.env.CLOUDFLARE_ENV = 'staging';
  return { plugins: [react(), cloudflare()], build: { cssCodeSplit: true, cssMinify: 'lightningcss' } };
});
