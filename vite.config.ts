import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
  fmt: {
    ignorePatterns: ["dist/**", "dist-electron/**", "dist-scripts/**", "release/**", "docs/**"],
    sortPackageJson: true,
  },
  lint: {
    ignorePatterns: ["dist/**", "dist-electron/**", "dist-scripts/**", "release/**", "docs/**"],
  },
  staged: {
    "*.{js,jsx,ts,tsx,css,json,md}": "vp check --fix",
  },
});
