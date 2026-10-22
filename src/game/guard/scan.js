// 结构护栏的扫描器：纯函数，不读文件（文件 IO 留给 *.test.js）。
// 拆出来的唯一目的：让测试能用「反例」证明护栏真的会报错——
// 一条永远绿的护栏比没有护栏更坏，因为它会制造虚假安全感。

/** src/game 不得引用的前端框架包 */
export const FRAMEWORK_IMPORTS = [
  { name: "vue", re: /\bfrom\s+["']vue["']/ },
  { name: "pixi", re: /\bfrom\s+["']@?pixi[^"']*["']/ },
  { name: "gsap", re: /\bfrom\s+["']gsap[^"']*["']/ },
];

/**
 * src/game 不得使用的浏览器 / 宿主 API。
 * 例外：window.__GAME_LOG_LEVEL__（gameLogger.js 的调试开关，见 CLAUDE.md 调试工具），
 * 所以这里不拦裸 window，只拦明确属于渲染层的入口。
 */
export const HOST_APIS = [
  { name: "document", re: /\bdocument\./ },
  { name: "localStorage", re: /\blocalStorage\b/ },
  { name: "sessionStorage", re: /\bsessionStorage\b/ },
  { name: "navigator", re: /\bnavigator\./ },
  { name: "requestAnimationFrame", re: /\brequestAnimationFrame\b/ },
  { name: "fetch", re: /\bfetch\s*\(/ },
];

/**
 * 目标解析不得自己重写「uid 优先」的查找。
 * index 是渲染序、uid 是身份，两者的大小范围重叠，uid 优先就会把敌人解析成自己。
 * 唯一裁决处：src/game/core/units.js → unitByIndexOrUid()（index 优先，uid 兜底）。
 */
export const UID_FIRST_LOOKUP = [
  { name: "uid-first-find", re: /\.find\(\s*\(?\w+\)?\s*=>\s*\w+\.uid\s*===/ },
];

/** 逐行扫描，返回命中项（含行号，便于直接指出修复位置） */
export function scan(source, rules) {
  const hits = [];
  source.split("\n").forEach((line, i) => {
    for (const rule of rules) {
      if (rule.re.test(line)) {
        hits.push({ rule: rule.name, line: i + 1, text: line.trim() });
      }
    }
  });
  return hits;
}
