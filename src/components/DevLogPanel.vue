<template>
  <div v-if="visible" class="dev-log-overlay">
    <div class="dev-log-panel">
      <!-- 标题栏 -->
      <div class="dl-header">
        <span class="dl-title">🛠 开发日志</span>
        <span class="dl-count"
          >{{ filteredEntries.length }} / {{ entries.length }}</span
        >
        <button
          class="dl-btn dl-btn-close"
          @click="visible = false"
          title="关闭 (Ctrl+Shift+D)"
        >
          ✕
        </button>
      </div>

      <!-- 工具栏 -->
      <div class="dl-toolbar">
        <select v-model="filterLevel" class="dl-select">
          <option value="">全部级别</option>
          <option value="DEBUG">🔍 调试</option>
          <option value="INFO">ℹ 信息</option>
          <option value="WARN">⚠ 警告</option>
          <option value="ERROR">✖ 错误</option>
        </select>
        <select v-model="filterCat" class="dl-select">
          <option value="">全部分类</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <input
          v-model="searchText"
          class="dl-search"
          type="text"
          placeholder="搜索..."
        />
        <button class="dl-btn" @click="exportLog" title="导出为文本文件">
          导出
        </button>
        <button class="dl-btn dl-btn-danger" @click="clearLog" title="清空日志">
          清空
        </button>
      </div>

      <!-- 条目列表 -->
      <div class="dl-entries" ref="entriesRef">
        <div
          v-for="(entry, idx) in filteredEntries"
          :key="idx"
          class="dl-entry"
          :class="[
            `dl-${entry.level.toLowerCase()}`,
            { 'dl-expanded': expandedIdx === idx },
          ]"
          @click="toggleExpand(idx)"
        >
          <div class="dl-entry-header">
            <span class="dl-entry-icon">{{ levelIcon(entry.level) }}</span>
            <span class="dl-entry-time">{{ formatTime(entry.ts) }}</span>
            <span class="dl-entry-cat">[{{ entry.cat }}]</span>
            <span class="dl-entry-round">回合{{ entry.round }}</span>
            <span class="dl-entry-msg">{{ entry.msg }}</span>
          </div>
          <div v-if="expandedIdx === idx && entry.data" class="dl-entry-data">
            <pre>{{ JSON.stringify(entry.data, null, 2) }}</pre>
          </div>
        </div>
        <div v-if="filteredEntries.length === 0" class="dl-empty">
          {{
            entries.length === 0
              ? "暂无日志（进行游戏操作后自动记录）"
              : "无匹配条目"
          }}
        </div>
      </div>

      <!-- 快捷键提示 -->
      <div class="dl-footer">Ctrl+Shift+D 切换面板 · 点击条目展开详情</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";

const props = defineProps({
  entries: { type: Array, required: true },
});

const visible = ref(false);
const filterLevel = ref("");
const filterCat = ref("");
const searchText = ref("");
const expandedIdx = ref(-1);
const entriesRef = ref(null);

// 从条目中提取所有出现过的分类
const categories = computed(() => {
  const set = new Set();
  for (const e of props.entries) {
    if (e.cat) set.add(e.cat);
  }
  return [...set].sort();
});

// 过滤后的条目（最新在底部）
const filteredEntries = computed(() => {
  let result = [...props.entries];
  if (filterLevel.value) {
    result = result.filter((e) => e.level === filterLevel.value);
  }
  if (filterCat.value) {
    result = result.filter((e) => e.cat === filterCat.value);
  }
  if (searchText.value) {
    const s = searchText.value.toLowerCase();
    result = result.filter(
      (e) =>
        e.msg.toLowerCase().includes(s) ||
        e.cat.toLowerCase().includes(s) ||
        e.turn.toLowerCase().includes(s),
    );
  }
  return result;
});

// 自动滚动到底部
watch(
  () => filteredEntries.value.length,
  async () => {
    await nextTick();
    if (entriesRef.value) {
      entriesRef.value.scrollTop = entriesRef.value.scrollHeight;
    }
  },
);

/** 格式化时间 */
function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/** 级别图标 */
function levelIcon(level) {
  switch (level) {
    case "ERROR":
      return "✖";
    case "WARN":
      return "⚠";
    case "INFO":
      return "ℹ";
    case "DEBUG":
      return "●";
    default:
      return "·";
  }
}

/** 展开/收起条目 */
function toggleExpand(idx) {
  expandedIdx.value = expandedIdx.value === idx ? -1 : idx;
}

/** 导出日志 */
function exportLog() {
  // 生成格式化文本
  const header = [
    "═══════════════════════════════════════════",
    "  亡命十三街 — 开发调试日志",
    `  导出时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    `  总条目: ${props.entries.length}`,
    "═══════════════════════════════════════════",
    "",
  ].join("\n");

  const levelIcons = { DEBUG: "●", INFO: "ℹ", WARN: "⚠", ERROR: "✖" };
  const body = props.entries
    .map((e) => {
      const time = formatTime(e.ts);
      const icon = levelIcons[e.level] || "·";
      let line = `${icon} [${time}] [${e.level}] [${e.cat}] [回合${e.round}] ${e.turn ? e.turn + " " : ""}${e.msg}`;
      if (e.data && Object.keys(e.data).length > 0) {
        line +=
          "\n" +
          JSON.stringify(e.data, null, 2)
            .split("\n")
            .map((l) => `  │ ${l}`)
            .join("\n");
      }
      return line;
    })
    .join("\n");

  const text = header + body;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `devlog-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 清空日志 */
function clearLog() {
  props.entries.length = 0;
}

/** 切换面板（供外部 5 连击调用） */
function toggleDevLog() {
  visible.value = !visible.value;
}

/** 快捷键 */
function onKeyDown(e) {
  if (e.ctrlKey && e.shiftKey && e.key === "D") {
    e.preventDefault();
    visible.value = !visible.value;
  }
}

defineExpose({ toggleDevLog });

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<style scoped>
.dev-log-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 42%;
  min-width: 360px;
  z-index: 9999;
  pointer-events: auto;
}

.dev-log-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 20, 0.95);
  border-left: 2px solid rgba(255, 255, 255, 0.15);
  font-family: "Courier New", "Microsoft YaHei", monospace;
  font-size: 11px;
  color: #ccc;
  backdrop-filter: blur(8px);
}

/* ── 标题栏 ── */
.dl-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.dl-title {
  font-weight: bold;
  font-size: 13px;
  color: #e0e0e0;
}
.dl-count {
  color: #888;
  font-size: 10px;
  flex: 1;
}

/* ── 按钮 ── */
.dl-btn {
  padding: 2px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
  cursor: pointer;
  font-size: 10px;
  font-family: inherit;
}
.dl-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}
.dl-btn-close {
  border: none;
  background: none;
  font-size: 14px;
  padding: 0 4px;
  color: #999;
}
.dl-btn-close:hover {
  color: #fff;
}
.dl-btn-danger:hover {
  background: rgba(255, 60, 60, 0.3);
  border-color: rgba(255, 60, 60, 0.5);
}

/* ── 工具栏 ── */
.dl-toolbar {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-wrap: wrap;
}
.dl-select {
  padding: 2px 4px;
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  font-size: 10px;
  font-family: inherit;
}
.dl-search {
  flex: 1;
  min-width: 60px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  font-size: 10px;
  font-family: inherit;
}
.dl-search::placeholder {
  color: #666;
}

/* ── 条目列表 ── */
.dl-entries {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.dl-empty {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.dl-entry {
  padding: 3px 10px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.1s;
  line-height: 1.6;
}
.dl-entry:hover {
  background: rgba(255, 255, 255, 0.04);
}
.dl-entry.dl-debug {
  border-left-color: #666;
  color: #888;
  font-size: 10px;
}
.dl-entry.dl-info {
  border-left-color: #4fc3f7;
  color: #b0d8e8;
}
.dl-entry.dl-warn {
  border-left-color: #ffa726;
  color: #ffcc80;
}
.dl-entry.dl-error {
  border-left-color: #ef5350;
  color: #ef9a9a;
  background: rgba(255, 0, 0, 0.06);
}

.dl-entry-header {
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
}
.dl-entry-icon {
  flex-shrink: 0;
  width: 12px;
  text-align: center;
}
.dl-entry-time {
  color: #666;
  font-size: 9px;
  flex-shrink: 0;
}
.dl-entry-cat {
  color: #888;
  flex-shrink: 0;
}
.dl-entry-round {
  color: #555;
  font-size: 10px;
  flex-shrink: 0;
}
.dl-entry-msg {
  flex: 1;
  min-width: 80px;
}

/* 展开的数据 */
.dl-entry-data {
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
  overflow-x: auto;
}
.dl-entry-data pre {
  margin: 0;
  color: #aaa;
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ── 底部 ── */
.dl-footer {
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.3);
  color: #555;
  font-size: 9px;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* ── 移动端 ── */
@media (max-width: 768px) {
  .dev-log-overlay {
    width: 100%;
    min-width: unset;
    top: auto;
    bottom: 0;
    height: 45vh;
  }
  .dev-log-panel {
    border-left: none;
    border-top: 2px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px 12px 0 0;
  }
  .dl-entry {
    padding: 2px 8px;
  }
  .dl-entry-header {
    font-size: 10px;
    gap: 3px;
  }
}
</style>
