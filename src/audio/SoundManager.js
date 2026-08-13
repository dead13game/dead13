// 音效播放器 — 浏览器 API（HTMLAudio），单例
// 音频文件约定：public/sfx/{name}.mp3，构建后拷贝到 dist/sfx/
// 文件缺失时自动静默（记入黑名单，不再重试），不影响游戏运行。
// 相对路径解析：GitHub Pages 子路径（/13street/）与 file:// 均可用。

/** 音效文件表：类型 → 文件名（相对 dist 根） */
const SFX_FILES = {
  attack: "sfx/attack.wav", // 发起攻击摸牌时
  defense: "sfx/defense.wav", // 执行防御摸防御牌时
  gamble: "sfx/gamble.wav", // 执行赌命抽牌时
  skill: "sfx/skill.wav", // 成功释放主动技能时
  shield_break: "sfx/shield-break.wav", // 防御牌被击穿
  kill: "sfx/kill.mp3", // 有玩家阵亡时
  match_end: "sfx/match-end.wav", // 联赛/世界杯单场结束
  trap_break: "sfx/shield-break.wav", // 攻击值 > 陷阱值，击破陷阱
  trap_reflect: "sfx/hit.wav", // 陷阱反弹，攻击者受伤
  trap_tie: "sfx/hit.wav", // 陷阱平局，双方受伤
  click: "sfx/click.wav", // 主菜单点击（选择模式/选择角色，战斗内不播）
  hit: "sfx/hit.wav", // 掉血命中（敌我均生效）
  lose: "sfx/lose.wav", // 游戏结束且玩家失败
};

/** 背景音乐表：场景 → 文件名 */
const BGM_FILES = {
  menu: "sfx/bgm-main.mp3", // 主菜单/选角
  battle1: "sfx/bgm-battle1.mp3", // 战斗 BGM 1
  battle2: "sfx/bgm-battle2.mp3", // 战斗 BGM 2
};

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
    this._bgmName = null; // 当前 BGM 场景名
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

  /**
   * 播放/切换背景音乐（需在用户交互后调用，浏览器自动播放策略）。
   * @param {string} name - BGM 场景名：'menu' | 'battle1' | 'battle2'
   *   同名已在播则无操作；切换场景会停掉旧 BGM 换新源。
   */
  playBgm(name = "menu") {
    const file = BGM_FILES[name];
    if (!file) return;

    // 同一场景且已在播放：不打断
    if (this._bgm && this._bgmName === name && !this._bgm.paused) return;

    // 停掉旧的
    if (this._bgm) {
      this._bgm.pause();
      this._bgm = null;
    }

    const bgm = new Audio(file);
    bgm.loop = true;
    bgm.volume = this._bgmVolume;
    bgm.addEventListener("error", () => {
      this._bgm = null; // 文件缺失，重试时重新创建
      this._bgmName = null;
    });
    this._bgm = bgm;
    this._bgmName = name;

    if (this._bgmMuted) return;
    bgm.play().catch(() => {
      /* 自动播放策略拦截：等下一次交互 */
    });
  }

  /** 暂停背景音乐 */
  stopBgm() {
    if (this._bgm) {
      this._bgm.pause();
      this._bgm.currentTime = 0;
    }
    this._bgmName = null;
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
