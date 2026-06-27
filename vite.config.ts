import { defineConfig } from "vite";

// Static site for GitHub Pages — served from the project subpath.
export default defineConfig({
  base: "/crypto-lab-otp-vault/",
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
