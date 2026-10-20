// 差分对拍:轨迹比较
//
// 目标不是"找不同",而是"给出第一个不同点的路径",便于定位。

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** 深度比较,返回第一个差异 { path, a, b } 或 null */
export function firstDiff(a, b, path = "$") {
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (ta !== tb) return { path, a, b, reason: `类型不同 ${ta} vs ${tb}` };

  if (ta === "array") {
    if (a.length !== b.length) {
      return { path: path + ".length", a: a.length, b: b.length, reason: "长度不同" };
    }
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }

  if (ta === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    const missing = ka.filter((k) => !kb.includes(k));
    const extra = kb.filter((k) => !ka.includes(k));
    if (missing.length) return { path, a: missing, b: extra, reason: "键只存在于 A" };
    if (extra.length) return { path, a: missing, b: extra, reason: "键只存在于 B" };
    for (const k of ka) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }

  if (a !== b) return { path, a, b, reason: "值不同" };
  return null;
}

/** 比较两条轨迹,返回首个差异(含命中的命令序号) */
export function compareTraces(base, next) {
  if (base.steps.length !== next.steps.length) {
    const n = Math.min(base.steps.length, next.steps.length);
    for (let i = 0; i < n; i++) {
      const d = diffStep(base.steps[i], next.steps[i], i);
      if (d) return d;
    }
    return {
      path: "$.steps.length",
      a: base.steps.length,
      b: next.steps.length,
      stepIndex: n,
      reason: "步数不同(前 " + n + " 步一致)",
      cmd: base.steps[n]?.cmd ?? null,
    };
  }
  for (let i = 0; i < base.steps.length; i++) {
    const d = diffStep(base.steps[i], next.steps[i], i);
    if (d) return d;
  }
  return firstDiff(base.final, next.final, "$.final");
}

function diffStep(a, b, i) {
  if (a.cmd !== b.cmd) {
    return { path: "$.cmd", a: a.cmd, b: b.cmd, stepIndex: i, reason: "命令序列分叉" };
  }
  const d = firstDiff(a.snap, b.snap, "$.snap");
  if (d) return { ...d, stepIndex: i, cmd: a.cmd };
  const dl = firstDiff(a.logs, b.logs, "$.logs");
  if (dl) return { ...dl, stepIndex: i, cmd: a.cmd };
  const ds = firstDiff(a.sounds, b.sounds, "$.sounds");
  if (ds) return { ...ds, stepIndex: i, cmd: a.cmd };
  return null;
}

export function formatDiff(diff) {
  if (!diff) return "无差异";
  const parts = [];
  if (typeof diff.stepIndex === "number") parts.push(`第 ${diff.stepIndex} 步`);
  if (diff.cmd) parts.push(`命令 ${diff.cmd}`);
  parts.push(diff.reason || "差异");
  parts.push(`路径 ${diff.path}`);
  parts.push(`旧=${JSON.stringify(diff.a)} 新=${JSON.stringify(diff.b)}`);
  return parts.join(" | ");
}
