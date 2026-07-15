import { readFileSync, writeFileSync, cpSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");

let html = readFileSync(join(distDir, "index.html"), "utf-8");

// 1. 内联 CSS
html = html.replace(
  /<link[^>]*href="\.\/assets\/([^"]+)"[^>]*\/?>/g,
  (match, filename) => {
    const css = readFileSync(join(distDir, "assets", filename), "utf-8");
    return `<style>${css}</style>`;
  },
);

// 2. 内联 JS（codeSplitting:false 已消除动态 import，只有一个主 bundle）
html = html.replace(
  /<script[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/g,
  (match, filename) => {
    let js = readFileSync(join(distDir, "assets", filename), "utf-8");

    // 修复视频资源路径：
    // 1. JS 中的 import.meta.url 基准变了（assets/ → index.html）
    js = js.replace(
      /new URL\(`(amine-[^`]+\.mp4)`,import\.meta\.url\)/g,
      "new URL(`./assets/$1`,import.meta.url)",
    );
    // 2. 模板中的绝对路径 /amine.mp4 → ./amine.mp4（file:// 兼容）
    js = js.replaceAll('"/amine.mp4"', '"./amine.mp4"');

    return `<script type="module">${js}</script>`;
  },
);

writeFileSync(join(distDir, "index.html"), html, "utf-8");

// 3. 复制 images
const srcImages = join(rootDir, "images");
const dstImages = join(distDir, "images");
if (existsSync(srcImages)) {
  cpSync(srcImages, dstImages, { recursive: true, force: true });
  console.log("postbuild: 图片已复制到 dist/images");
}

console.log("postbuild: CSS+JS 已内联");
