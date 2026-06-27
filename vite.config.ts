import { defineConfig } from "vite";

// Static site for GitHub Pages — base is set by the standardization pass if needed.
export default defineConfig({
  base: "./",
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
