import { describe, it, expect } from "vitest";

import { useBrawlController } from "./useBrawlController.js";
import { DRAFT_SEQUENCE } from "./useBrawlController.js";

function finishDraft(c, ai = false) {
  let guard = 0;
  while (!c.draftFinished.value && guard++ < 40) {
    const step = c.currentDraftStep.value;
    if (ai && step.side === 1) {
      c.aiDraftAction();
    } else {
      c.draftAction(c.availableIds.value[0]);
    }
  }
}

describe("useBrawlController — Ban/Pick 与开局", () => {
  it("Ban/Pick 共 10 步，双方各 Ban 2 选 3", () => {
    const c = useBrawlController();
    c.initSetup({ opponentMode: "hotseat" });
    c.startDraft();
    finishDraft(c);
    expect(DRAFT_SEQUENCE).toHaveLength(10);
    expect(c.draft.bans).toHaveLength(4);
    expect(c.draft.picks[0]).toHaveLength(3);
    expect(c.draft.picks[1]).toHaveLength(3);
    const all = [...c.draft.bans, ...c.draft.picks[0], ...c.draft.picks[1]];
    expect(new Set(all).size).toBe(all.length); // 不重复
  });

  it("AI 模式下 AI 自动 Ban/Pick", () => {
    const c = useBrawlController();
    c.initSetup({ opponentMode: "ai" });
    c.startDraft();
    finishDraft(c, true);
    expect(c.draft.picks[1]).toHaveLength(3);
    expect(c.draft.picks[0]).toHaveLength(3);
  });

  it("开始比赛后 6 名英雄 + 每队 5 塔", () => {
    const c = useBrawlController();
    c.initSetup({ opponentMode: "hotseat", weather: true });
    c.startDraft();
    finishDraft(c);
    expect(c.startMatch()).toBe(true);
    expect(c.uiMode.value).toBe("match");
    expect(c.gameState.players).toHaveLength(6);
    expect(c.gameState.towers).toHaveLength(10);
    expect(c.gameState.mode.id).toBe("brawl");
    // 圣遗物槽位按选人顺序分配（默认不带）
    expect(c.gameState.players.every((p) => p.artifact.id === null)).toBe(true);
  });

  it("阵营与角色不重复，队伍标记正确", () => {
    const c = useBrawlController();
    c.initSetup({ opponentMode: "hotseat" });
    c.startDraft();
    finishDraft(c);
    c.startMatch();
    const ids = c.gameState.players.map((p) => p.characterId);
    expect(new Set(ids).size).toBe(6);
    expect(c.gameState.players.filter((p) => p.teamId === 0)).toHaveLength(3);
    expect(c.gameState.players.filter((p) => p.teamId === 1)).toHaveLength(3);
  });
});

describe("useBrawlController — 存档", () => {
  it("save → reset → restore 后官兵与塔恢复", () => {
    const c = useBrawlController();
    c.initSetup({ opponentMode: "hotseat", weather: true });
    c.startDraft();
    finishDraft(c);
    c.startMatch();

    // 打一张牌，确保局面不是初始态
    c.gameState.round = 3;
    const data = JSON.parse(JSON.stringify(c.saveBrawl()));
    expect(data.gameMode).toBe("brawl");
    expect(data.gameState.state.players).toHaveLength(6);
    expect(data.gameState.state.towers).toHaveLength(10);

    c.resetBrawl();
    expect(c.gameState.players).toHaveLength(0);

    const ok = c.restoreBrawl(data);
    expect(ok).toBe(true);
    expect(c.uiMode.value).toBe("match");
    expect(c.gameState.players).toHaveLength(6);
    expect(c.gameState.towers).toHaveLength(10);
    expect(c.gameState.round).toBe(3);
  });
});
