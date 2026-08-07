// 音效播放器 — 浏览器 API（HTMLAudio），单例
// 音频文件约定：public/sfx/{name}.mp3，构建后拷贝到 dist/sfx/
// 文件缺失时自动静默（记入黑名单，不再重试），不影响游戏运行。
// 相对路径解析：GitHub Pages 子路径（/13street/）与 file:// 均可用。

/** 音效文件表：类型 → 文件名（相对 dist 根） */
const SFX_FILES = {
  attack: "sfx/attack.mp3",
  defense: "sfx/defense.mp3",
  gamble: "sfx/gamble.mp3",
  skill: "sfx/skill.mp3",
  shield_break: "sfx/shield-break.mp3",
  kill: "sfx/kill.mp3",
  match_end: "sfx/match-end.mp3",
  trap_break: "sfx/trap-break.mp3",
  trap_reflect: "sfx/trap-reflect.mp3",
  trap_tie: "sfx/trap-tie.mp3",
};

/** 主背景音乐（循环播放） */
const BGM_FILE = "sfx/bgm.mp3";

/** 同一音效最短重播间隔（ms），防止同帧多事件叠加爆音 */
const THROTTLE_MS = 120;

class SoundManager {
  constructor() {
    this._cache = new Map(); // type -> HTMLAudioElement
    this._unavailable = new Set(); // 文件缺失/解码失败的音效，跳过
    this._lastPlayed = new Map(); // type -> timestamp
    this._muted = false;
    this._volume = 0.8; // 音效音量
    this._bgmVolume = 0.5; // BGM 音量
    this._bgm = null;
    this._bgmMuted = false;
  }

  /** 音效类型是否存在（文件表里有键） */
  has(type) {
    return type in SFX_FILES;
  }

  /** 播放一个音效；文件缺失或未交互时静默失败 */
  play(type) {
    const file = SFX_FILES[type];
    if (!file || this._muted || this._unavailable.has(type)) return;

    const now = performance.now();
    const last = this._lastPlayed.get(type) || 0;
    if (now - last < THROTTLE_MS) return;
    this._lastPlayed.set(type, now);

    let audio = this._cache.get(type);
    if (!audio) {
      audio = new Audio(file);
      audio.volume = this._volume;
      audio.addEventListener("error", () => {
        this._unavailable.add(type); // 文件缺失，后续跳过
      });
      this._cache.set(type, audio);
    }

    audio.volume = this._volume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      /* 自动播放策略拦截：静默忽略 */
    });
  }

  /** 启动主背景音乐（需在用户交互后调用，浏览器自动播放策略） */
  playBgm() {
    if (this._bgm) {
      if (!this._bgm.paused) return;
    } else {
      const bgm = new Audio(BGM_FILE);
      bgm.loop = true;
      bgm.volume = this._bgmVolume;
      bgm.addEventListener("error", () => {
        this._bgm = null; // 文件缺失，重试时重新创建
      });
      this._bgm = bgm;
    }
    if (this._bgmMuted) return;
    this._bgm.play().catch(() => {
      /* 自动播放策略拦截：等下一次交互 */
    });
  }

  /** 暂停主背景音乐 */
  stopBgm() {
    if (this._bgm) {
      this._bgm.pause();
      this._bgm.currentTime = 0;
    }
  }

  /** 静音开关（音效+BGM） */
  setMuted(muted) {
    this._muted = muted;
    if (this._bgm) this._bgm.muted = muted;
  }

  get muted() {
    return this._muted;
  }

  /** 音效音量 0-1 */
  setVolume(v) {
    this._volume = v;
    this._cache.forEach((a) => (a.volume = v));
  }

  /** BGM 音量 0-1 */
  setBgmVolume(v) {
    this._bgmVolume = v;
    if (this._bgm) this._bgm.volume = v;
  }
}

export default new SoundManager();
