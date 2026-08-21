import { defineConfig } from "vitest/config";

// Static site for GitHub Pages — served from the project subpath.
//
// `defineConfig` comes from `vitest/config`, not `vite`: from Vite 8 the
// `vite` export types the config strictly and rejects the `test` block below
// (TS2769). The vitest re-export is the same `config => config` identity
// function widened to know about `test`, so the emitted config — and the built
// bundle — are unchanged.
export default defineConfig({
  base: "/crypto-lab-otp-vault/",
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
