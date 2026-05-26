import { readFileSync, writeFileSync, cpSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const distDir = join(rootDir, 'dist')

// 1. 读取构建产物
let html = readFileSync(join(distDir, 'index.html'), 'utf-8')

// 2. 内联 CSS
html = html.replace(
  /<link[^>]*href="\.\/assets\/([^"]+)"[^>]*\/?>/,
  (match, filename) => {
    const css = readFileSync(join(distDir, 'assets', filename), 'utf-8')
    return `<style>${css}</style>`
  }
)

// 3. 内联 JS
html = html.replace(
  /<script[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/,
  (match, filename) => {
    const js = readFileSync(join(distDir, 'assets', filename), 'utf-8')
    return `<script>${js}</script>`
  }
)

// 4. 把 <script>...</script> 从 <head> 挪到 <body> 底部
const scriptStart = html.indexOf('<script>')
const scriptEnd = html.indexOf('</script>') + '</script>'.length
const scriptTag = html.slice(scriptStart, scriptEnd)
html = html.slice(0, scriptStart) + html.slice(scriptEnd)
const bodyClose = html.lastIndexOf('</body>')
html = html.slice(0, bodyClose) + scriptTag + '\n' + html.slice(bodyClose)

writeFileSync(join(distDir, 'index.html'), html, 'utf-8')

// 5. 复制 images 到 dist
const srcImages = join(rootDir, 'images')
const dstImages = join(distDir, 'images')
if (existsSync(srcImages)) {
  cpSync(srcImages, dstImages, { recursive: true, force: true })
  console.log('postbuild: 图片已复制到 dist/images')
}

console.log('postbuild: JS+CSS 已内联，脚本移到了 </body> 前')
