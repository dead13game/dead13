import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // gameState.js 等纯逻辑文件不需要 DOM
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
