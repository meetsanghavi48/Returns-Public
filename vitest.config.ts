import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "app/utils/**",
        "app/adapters/**",
        "app/services/**",
      ],
      exclude: [
        "app/services/shopify.server.ts",
        "app/services/admin-session.server.ts",
      ],
    },
  },
});
