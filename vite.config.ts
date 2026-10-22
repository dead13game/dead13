import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // GitHub Pages 部署：使用相对路径
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // 不分割代码：避免 file:// 协议下动态 import() 加载外部 chunk 失败
    // PixiJS 的环境检测动态 import 全部内联到主 bundle
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
});
