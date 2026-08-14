<template>
  <div class="uni-shell">
    <!-- 顶栏 -->
    <header class="uni-topbar">
      <span class="uni-topbar__title">🌌 模拟宇宙</span>
      <span class="uni-topbar__info">位面 {{ uniState.plane }} · 第 {{ uniState.floor }} 层</span>
      <span class="uni-topbar__stat" title="宇宙碎片">🪙 {{ uniState.shards }}</span>
      <span class="uni-topbar__stat" title="祝福">🙏 {{ uniState.blessings.length }}</span>
      <span class="uni-topbar__stat" title="奇物">✨ {{ uniState.curios.length }}</span>
      <span class="uni-topbar__stat" title="方程">📐 {{ uniState.equations.length }}</span>
      <span class="uni-topbar__spacer"></span>
      <button class="uni-btn uni-btn--sm" @click="bagOpen = true">🎒 背包</button>
      <button class="uni-btn uni-btn--sm" @click="uni.saveUni()">💾 存档</button>
      <button class="uni-btn uni-btn--sm" @click="onQuit">🚪 退出</button>
    </header>

    <!-- 选角 -->
    <section v-if="uiMode === 'charsel'" class="uni-panel">
      <h2 class="uni-panel__title">选择 4 名出战角色</h2>
      <p class="uni-panel__desc">已选 {{ selectedCharsList.length }}/4 —— 点击角色卡加入或移除队伍</p>
      <div class="uni-charsel">
        <button
          v-for="c in allChars"
          :key="c.id"
          class="uni-charsel__card"
          :class="{ 'uni-charsel__card--selected': isSelected(c.id) }"
          @click="uni.toggleChar(c.id)"
        >
          <div class="uni-charsel__avatar">
            <img :src="c.icon" :alt="c.name" @error="onImgError" />
            <span v-if="isSelected(c.id)" class="uni-charsel__check">✓</span>
          </div>
          <span class="uni-charsel__name">{{ c.name }}</span>
          <span class="uni-charsel__info">{{ UNI_SKILLS[c.id]?.name }}</span>
        </button>
      </div>
      <button
        class="uni-btn uni-btn--primary uni-btn--big"
        :disabled="selectedCharsList.length !== 4"
        @click="confirmCharsel"
      >
        🚀 出发（{{ selectedCharsList.length }}/4）
      </button>
    </section>

    <!-- 普通层 2 选 1 -->
    <section v-if="uiMode === 'choice'" class="uni-panel uni-panel--choice">
      <h2 class="uni-panel__title">选择本层内容</h2>
      <p class="uni-panel__desc">前方出现两条岔路，选择其一继续探索</p>
      <div class="uni-choice">
        <button
          v-for="(opt, i) in uniState.pendingChoice?.options || []"
          :key="i"
          class="uni-choice__card"
          @click="uni.doChooseContent(i)"
        >
          <span class="uni-choice__icon">{{ regionIcon(opt) }}</span>
          <span class="uni-choice__name">{{ regionName(opt) }}</span>
        </button>
      </div>
    </section>

    <!-- 战斗 -->
    <section v-if="uiMode === 'battle'" class="uni-battle">
      <!-- 行动顺序条 -->
      <div class="uni-order">
        <div
          v-for="(idx, i) in orderList"
          :key="'o' + i"
          class="uni-order__slot"
          :class="orderClass(i, idx)"
        >
          <img
            class="uni-order__avatar"
            :src="iconOf(idx)"
            :alt="uniState.team[idx].name"
            @error="onImgError"
          />
          <span class="uni-order__name">{{ uniState.team[idx].name }}</span>
        </div>
      </div>

      <div class="uni-battle__board">
        <div class="uni-battle__team">
          <div
            v-for="t in uniState.team"
            :key="t.index"
            class="uni-member"
            :class="{
              'uni-member--dead': !t.alive,
              'uni-member--active': activeIdx === t.index,
              'uni-member--hit': fxCount('member', t.index) > 0,
              'uni-member--target': targetMode === 'member' && t.alive,
            }"
            @click="onMemberClick(t.index)"
          >
            <div class="uni-member__head">
              <div class="uni-member__avatar">
                <img :src="iconOf(t.index)" :alt="t.name" @error="onImgError" />
                <span v-if="!t.alive" class="uni-member__skull">💀</span>
              </div>
              <div class="uni-member__main">
                <div class="uni-member__name">{{ t.name }}</div>
                <div class="uni-member__hp">
                  <div class="uni-bar">
                    <div
                      class="uni-bar__fill uni-bar__fill--hp"
                      :style="{ width: hpPct(t) + '%' }"
                    ></div>
                  </div>
                  <span class="uni-member__hpnum">{{ t.hp }}/{{ t.maxHp }}</span>
                </div>
              </div>
              <span
                v-if="lastDamage && lastDamage.type === 'member' && lastDamage.idx === t.index"
                :key="'md' + lastDamage.seq"
                class="uni-dmg-float"
              >-{{ lastDamage.dmg }}</span>
            </div>
            <div class="uni-member__flags">
              <span v-if="t.shield > 0" class="uni-tag uni-tag--shield">🛡️{{ t.shield }}</span>
              <span v-if="t.status.spirit > 0" class="uni-tag uni-tag--spirit">🔥战意{{ t.status.spirit }}/{{ t.status.spiritCap }}</span>
              <span v-if="t.status.zhandu > 0" class="uni-tag uni-tag--spirit">⚡战意{{ t.status.zhandu }}层</span>
              <span v-if="(t.status.atkBonus || 0) > 0 || (t.status.defBonus || 0) > 0" class="uni-tag uni-tag--moon">🌙月相+{{ t.status.atkBonus || t.status.defBonus }}</span>
              <span v-if="t.status.stunned" class="uni-tag uni-tag--bad">💫眩晕</span>
              <span v-if="t.status.puppet" class="uni-tag uni-tag--bad">🎭傀儡</span>
              <span v-if="t.status.dot > 0" class="uni-tag uni-tag--dot">🔥dot{{ t.status.dot }}</span>
              <span v-if="t.status.healCut > 0" class="uni-tag uni-tag--bad">💉减疗</span>
              <span v-if="t.status.taunt > 0" class="uni-tag uni-tag--bad">🎯集火{{ t.status.taunt }}</span>
            </div>
            <div class="uni-member__skill">
              {{ skillName(t) }}
              <span v-if="t.skillCooldown > 0" class="uni-member__cd">冷却{{ t.skillCooldown }}</span>
              <span v-else-if="skillType(t) === 'active'" class="uni-member__ready">✓ 可用</span>
              <span v-else class="uni-member__passive">被动</span>
            </div>
            <div v-for="f in fxFor('member', t.index)" :key="f.id" class="uni-fx" :class="'uni-fx--' + f.tone">
              {{ f.text }}
            </div>
          </div>
        </div>

        <div class="uni-battle__enemies">
          <div
            v-for="e in uniState.combat?.enemies || []"
            :key="e.id"
            class="uni-enemy"
            :class="{
              'uni-enemy--dead': !e.alive,
              'uni-enemy--target': targetMode === 'enemy' && selectedEnemy === e.id,
              'uni-enemy--hit': fxCount('enemy', e.id) > 0,
            }"
            @click="onEnemyClick(e.id)"
          >
            <div class="uni-enemy__name">{{ e.name }}</div>
            <div class="uni-enemy__hp">
              <div class="uni-bar">
                <div
                  class="uni-bar__fill uni-bar__fill--enemy"
                  :style="{ width: (e.hp / e.maxHp) * 100 + '%' }"
                ></div>
              </div>
              <span class="uni-enemy__hpnum">{{ e.hp }}/{{ e.maxHp }}</span>
              <span
                v-if="lastDamage && lastDamage.type === 'enemy' && lastDamage.idx === e.id"
                :key="'ed' + lastDamage.seq"
                class="uni-dmg-float"
              >-{{ lastDamage.dmg }}</span>
            </div>
            <div class="uni-enemy__flags">
              <span v-if="e.shield > 0" class="uni-tag uni-tag--shield">🛡️{{ e.shield }}</span>
              <span v-if="e.stunnedTurns > 0" class="uni-tag uni-tag--bad">💫{{ e.stunnedTurns }}</span>
              <span v-if="e.dotTurns > 0" class="uni-tag uni-tag--dot">🔥{{ e.dotTurns }}</span>
              <span v-if="e.locked && e.locked.length > 0" class="uni-tag uni-tag--bad">🎯锁{{ e.locked.length }}</span>
              <span v-if="e.kind === 'elite'" class="uni-tag uni-tag--elite">精英</span>
              <span v-if="e.kind === 'boss'" class="uni-tag uni-tag--boss">首领</span>
            </div>
            <div v-for="f in fxFor('enemy', e.id)" :key="f.id" class="uni-fx" :class="'uni-fx--' + f.tone">
              {{ f.text }}
            </div>
          </div>
        </div>
      </div>

      <div class="uni-battle__action">
        <div v-if="active" class="uni-battle__actor">
          <span class="uni-battle__actorname">{{ active.name }} 的回合</span>
          <span v-if="drawnPoker" class="uni-poker">
            <span class="uni-poker__rank" :class="'uni-poker__rank--' + drawnPoker.suit">{{ drawnPoker.rank }}</span>
            <span class="uni-poker__suit">{{ drawnPoker.suit }}</span>
          </span>
          <span v-if="targetMode === 'enemy'" class="uni-battle__hint">→ 点击敌人目标</span>
          <span v-else-if="targetMode === 'member'" class="uni-battle__hint">→ 点击要加护盾的成员</span>
          <span v-else-if="actionChoice" class="uni-battle__hint">抽到 {{ drawnPoker?.rank }}{{ drawnPoker?.suit }}（{{ drawnPoker?.value }} 点）</span>
          <span class="uni-battle__turn">第 {{ uniState.combat.round }} 回合</span>
        </div>
        <div v-if="!actionChoice && !targetMode" class="uni-battle__buttons">
          <button class="uni-btn uni-btn--attack" :disabled="!canAct" @click="onAttackClick">⚔️ 普攻</button>
          <button class="uni-btn uni-btn--defense" :disabled="!canAct" @click="onDefenseClick">🛡️ 防御</button>
          <button
            class="uni-btn uni-btn--skill"
            :disabled="!canSkill"
            @click="onSkillClick"
          >
            💥 开大{{ skillCdText }}
          </button>
        </div>
        <div v-else-if="actionChoice && !targetMode" class="uni-battle__buttons">
          <button
            class="uni-btn uni-btn--attack"
            @click="onExecuteAttack"
          >
            ⚔️ 执行攻击（{{ drawnPoker?.value }}）
          </button>
          <button v-if="actionChoice === 'defense'" class="uni-btn uni-btn--defense" @click="onExecuteDefense">
            🛡️ 执行防御（{{ drawnPoker?.value }}）
          </button>
          <button class="uni-btn uni-btn--cancel" @click="onCancelAction">✖ 取消</button>
        </div>
        <div v-if="battleMsg" class="uni-battle__msg">{{ battleMsg }}</div>
      </div>
    </section>

    <!-- 背包弹层：祝福 / 奇物 / 方程 -->
    <div v-if="bagOpen" class="uni-modal">
      <div class="uni-modal__box uni-modal__box--wide">
        <h3 class="uni-modal__title">🎒 背包</h3>
        <div class="uni-bag-tabs">
          <button
            class="uni-btn uni-btn--sm"
            :class="{ 'uni-btn--active': bagTab === 'blessing' }"
            @click="bagTab = 'blessing'"
          >
            🙏 祝福（{{ uniState.blessings.length }}）
          </button>
          <button
            class="uni-btn uni-btn--sm"
            :class="{ 'uni-btn--active': bagTab === 'curio' }"
            @click="bagTab = 'curio'"
          >
            ✨ 奇物（{{ uniState.curios.length }}）
          </button>
          <button
            class="uni-btn uni-btn--sm"
            :class="{ 'uni-btn--active': bagTab === 'equation' }"
            @click="bagTab = 'equation'"
          >
            📐 方程（{{ uniState.equations.length }}）
          </button>
          <button
            class="uni-btn uni-btn--sm uni-btn--album"
            :class="{ 'uni-btn--active': bagTab === 'album' }"
            @click="bagTab = 'album'"
          >
            📖 图鉴
          </button>
        </div>
        <!-- 图鉴：全部祝福/奇物/方程 -->
        <div v-if="bagTab === 'album'" class="uni-album">
          <div class="uni-bag-tabs">
            <button
              class="uni-btn uni-btn--sm"
              :class="{ 'uni-btn--active': albumKind === 'blessing' }"
              @click="albumKind = 'blessing'"
            >
              🙏 祝福（{{ albumBlessings.length }}）
            </button>
            <button
              class="uni-btn uni-btn--sm"
              :class="{ 'uni-btn--active': albumKind === 'curio' }"
              @click="albumKind = 'curio'"
            >
              ✨ 奇物（{{ albumCurios.length }}）
            </button>
            <button
              class="uni-btn uni-btn--sm"
              :class="{ 'uni-btn--active': albumKind === 'equation' }"
              @click="albumKind = 'equation'"
            >
              📐 方程（{{ albumEquations.length }}）
            </button>
          </div>
          <div class="uni-bag-list">
            <div
              v-for="(item, i) in albumList"
              :key="'a' + albumKind + i"
              class="uni-bag-item"
              :class="{
                'uni-bag-item--open': expandedKey === 'album-' + i,
                'uni-bag-item--owned': isOwned(albumKind, item.id),
              }"
              @click="toggleDetail('album', i)"
            >
              <div class="uni-bag-item__head">
                <span class="uni-bag-item__name">
                  <span class="uni-star">{{ '★'.repeat(item.star) }}</span>
                  {{ item.name }}
                  <span v-if="isOwned(albumKind, item.id)" class="uni-tag uni-tag--boost">持有</span>
                </span>
                <span class="uni-bag-item__meta">
                  <span v-if="albumKind === 'blessing' || albumKind === 'equation'" class="uni-tag">{{ item.fate }}</span>
                  <span v-if="albumKind === 'curio' && item.negative" class="uni-tag uni-tag--bad">负面</span>
                  <span class="uni-bag-item__arrow">{{ expandedKey === 'album-' + i ? '▲' : '▼' }}</span>
                </span>
              </div>
              <div v-if="expandedKey === 'album-' + i" class="uni-bag-item__desc">
                {{ item.desc }}
              </div>
            </div>
          </div>
        </div>
        <!-- 祝福列表 -->
        <div v-if="bagTab === 'blessing'" class="uni-bag-list">
          <div v-if="!uniState.blessings.length" class="uni-bag-empty">尚未获得祝福</div>
          <div
            v-for="(b, i) in uniState.blessings"
            :key="'b' + i"
            class="uni-bag-item"
            :class="{ 'uni-bag-item--open': expandedKey === 'blessing-' + i }"
            @click="toggleDetail('blessing', i)"
          >
            <div class="uni-bag-item__head">
              <span class="uni-bag-item__name">
                <span class="uni-star">{{ '★'.repeat(b.star) }}</span>
                {{ bagBlessing(b.id).name }}
              </span>
              <span class="uni-bag-item__meta">
                <span v-if="(b.enhanced || 1) > 1 || b.heatEnhanced" class="uni-tag uni-tag--boost">
                  强化 ×{{ b.enhanced || 1 }}{{ b.heatEnhanced ? '×' + b.heatEnhanced : '' }}
                </span>
                <span class="uni-tag">{{ bagBlessing(b.id).fate }}</span>
                <span class="uni-bag-item__arrow">{{ expandedKey === 'blessing-' + i ? '▲' : '▼' }}</span>
              </span>
            </div>
            <div v-if="expandedKey === 'blessing-' + i" class="uni-bag-item__desc">
              {{ bagBlessing(b.id).desc }}
            </div>
          </div>
        </div>
        <!-- 奇物列表 -->
        <div v-if="bagTab === 'curio'" class="uni-bag-list">
          <div v-if="!uniState.curios.length" class="uni-bag-empty">尚未获得奇物</div>
          <div
            v-for="(c, i) in uniState.curios"
            :key="'c' + i"
            class="uni-bag-item"
            :class="{ 'uni-bag-item--open': expandedKey === 'curio-' + i }"
            @click="toggleDetail('curio', i)"
          >
            <div class="uni-bag-item__head">
              <span class="uni-bag-item__name">
                <span v-if="c.star > 0" class="uni-star">{{ '★'.repeat(c.star) }}</span>
                {{ bagCurio(c.id).name }}
              </span>
              <span class="uni-bag-item__meta">
                <span v-if="bagCurio(c.id).negative" class="uni-tag uni-tag--bad">负面</span>
                <span class="uni-bag-item__arrow">{{ expandedKey === 'curio-' + i ? '▲' : '▼' }}</span>
              </span>
            </div>
            <div v-if="expandedKey === 'curio-' + i" class="uni-bag-item__desc">
              {{ bagCurio(c.id).desc }}
            </div>
          </div>
        </div>
        <!-- 方程列表 -->
        <div v-if="bagTab === 'equation'" class="uni-bag-list">
          <div v-if="!uniState.equations.length" class="uni-bag-empty">尚未获得方程</div>
          <div
            v-for="(e, i) in uniState.equations"
            :key="'e' + i"
            class="uni-bag-item"
            :class="{ 'uni-bag-item--open': expandedKey === 'equation-' + i }"
            @click="toggleDetail('equation', i)"
          >
            <div class="uni-bag-item__head">
              <span class="uni-bag-item__name">
                <span class="uni-star">{{ '★'.repeat(e.star) }}</span>
                {{ bagEquation(e.id).name }}
              </span>
              <span class="uni-bag-item__meta">
                <span class="uni-tag">{{ bagEquation(e.id).fate }}</span>
                <span class="uni-bag-item__arrow">{{ expandedKey === 'equation-' + i ? '▲' : '▼' }}</span>
              </span>
            </div>
            <div v-if="expandedKey === 'equation-' + i" class="uni-bag-item__desc">
              {{ bagEquation(e.id).desc }}
            </div>
          </div>
        </div>
        <button class="uni-btn uni-btn--sm uni-modal__cancel" @click="bagOpen = false">关闭</button>
      </div>
    </div>

    <!-- 技能分支弹层（莉奈娅盾/dot、纳西妲选人） -->
    <div v-if="skillBranch" class="uni-modal">
      <div class="uni-modal__box">
        <h3 v-if="skillBranch.type === 'liniya'" class="uni-modal__title">{{ active?.name }}：选择技能</h3>
        <h3 v-else class="uni-modal__title">{{ active?.name }}：选择立即行动的角色（可 {{ nahidaMax }} 人）</h3>
        <template v-if="skillBranch.type === 'liniya'">
          <button class="uni-btn uni-btn--big" @click="doLiniyaBranch('shield')">🛡️ 一技能：全队获得盾</button>
          <button class="uni-btn uni-btn--big" @click="doLiniyaBranch('dot')">🔥 二技能：敌方 dot</button>
        </template>
        <template v-else>
          <div class="uni-modal__members">
            <button
              v-for="m in uniState.team"
              :key="m.index"
              class="uni-charsel__card"
              :class="{
                'uni-charsel__card--selected': skillBranch.selected.includes(m.index),
                'uni-charsel__card--disabled': !m.alive,
              }"
              @click="toggleNahidaMember(m.index)"
            >
              <div class="uni-charsel__avatar">
                <img :src="iconOf(m.index)" :alt="m.name" @error="onImgError" />
              </div>
              <span class="uni-charsel__name">{{ m.name }}</span>
            </button>
          </div>
          <button class="uni-btn uni-btn--primary" :disabled="!skillBranch.selected.length" @click="confirmNahida">
            确认（{{ skillBranch.selected.length }}/{{ nahidaMax }}）
          </button>
        </template>
        <button class="uni-btn uni-btn--sm uni-modal__cancel" @click="skillBranch = null">取消</button>
      </div>
    </div>

    <!-- 转化第三波 -->
    <section v-if="uiMode === 'wave-clear'" class="uni-panel">
      <h2 class="uni-panel__title">✅ 转化：两波已灭（及格）</h2>
      <p class="uni-panel__desc">可以撤退保底，或挑战第三波精英（每消灭 1 个 +150 碎片）</p>
      <div class="uni-choice">
        <button class="uni-btn uni-btn--primary" @click="uni.doThirdWave(false)">🏳️ 撤退（及格奖励）</button>
        <button class="uni-btn uni-btn--danger" @click="uni.doThirdWave(true)">⚔️ 挑战第三波</button>
      </div>
    </section>

    <!-- 战斗胜利 -->
    <section v-if="uiMode === 'reward'" class="uni-panel">
      <h2 class="uni-panel__title">🎉 战斗胜利</h2>
      <template v-if="pendingPick">
        <p class="uni-panel__desc">选择祝福（{{ pendingPick.starRange[0] }}~{{ pendingPick.starRange[1] }} 星）</p>
        <div class="uni-choice">
          <button
            v-for="id in pendingPick.candidates"
            :key="id"
            class="uni-choice__card"
            @click="uni.doBlessingPick(id)"
          >
            <span class="uni-choice__icon">🙏</span>
            <span class="uni-choice__name">{{ uni.blessingName(id) }}</span>
          </button>
        </div>
      </template>
      <template v-else>
        <p v-if="uniState.combat?.lastReward?.shards" class="uni-panel__gain">
          +{{ uniState.combat.lastReward.shards }} 🪙
        </p>
        <p v-if="uniState.combat?.lastReward?.blessingPicks" class="uni-panel__desc">
          可进行 {{ uniState.combat.lastReward.blessingPicks }} 次祝福三选一
        </p>
        <button class="uni-btn uni-btn--primary" @click="uni.goNext()">前往下一区域 →</button>
      </template>
    </section>

    <!-- 事件 -->
    <section v-if="uiMode === 'event'" class="uni-panel">
      <h2 class="uni-panel__title">{{ ev?.title }}</h2>
      <p class="uni-panel__desc">{{ ev?.desc }}</p>
      <div class="uni-choice">
        <button
          v-for="(opt, i) in ev?.options || []"
          :key="i"
          class="uni-choice__card"
          @click="uni.doEventOption(i)"
        >
          <span class="uni-choice__name">{{ opt.text }}</span>
        </button>
      </div>
    </section>

    <!-- 事件结果 -->
    <section v-if="uiMode === 'event-result'" class="uni-panel">
      <h2 class="uni-panel__title">{{ eventResult?.eventTitle }}</h2>
      <p class="uni-panel__desc">{{ eventResult?.outcome?.text }}</p>
      <div class="uni-event-fx">
        <span
          v-for="(fx, i) in eventResult?.effects || []"
          :key="i"
          class="uni-tag uni-tag--fx"
          :class="{ 'uni-tag--none': fx === '（无效果）' }"
        >{{ fx }}</span>
      </div>
      <template v-if="skillTargetPending">
        <p class="uni-panel__desc">选择角色升级技能（+{{ skillTargetPending }} 级）</p>
        <div class="uni-choice">
          <button
            v-for="t in upgradable"
            :key="t.index"
            class="uni-choice__card"
            @click="uni.doSkillTarget(t.index)"
          >
            <img class="uni-choice__avatar" :src="iconOf(t.index)" :alt="t.name" @error="onImgError" />
            <span class="uni-choice__name">{{ t.name }}（Lv{{ t.skillLevel }}）</span>
          </button>
        </div>
      </template>
      <template v-else-if="pendingPick">
        <p class="uni-panel__desc">选择祝福（{{ pendingPick.starRange[0] }}~{{ pendingPick.starRange[1] }} 星）</p>
        <div class="uni-choice">
          <button
            v-for="id in pendingPick.candidates"
            :key="id"
            class="uni-choice__card"
            @click="uni.doBlessingPick(id)"
          >
            <span class="uni-choice__name">{{ uni.blessingName(id) }}</span>
          </button>
        </div>
      </template>
      <template v-else>
        <button class="uni-btn uni-btn--primary" @click="uni.goNext()">前往下一区域 →</button>
      </template>
    </section>

    <!-- 商店 / 休整 -->
    <section v-if="uiMode === 'shop' || uiMode === 'rest'" class="uni-panel">
      <h2 class="uni-panel__title">{{ uiMode === 'shop' ? '🛒 商店' : '🏕️ 休整' }}</h2>
      <p v-if="uiMode === 'rest'" class="uni-panel__desc">全队生命已回满；可购买奇物与祝福；死亡角色可用 150 碎片复活</p>
      <div v-if="uiMode === 'rest'" class="uni-rest-revive">
        <button
          v-for="t in uniState.team.filter((x) => !x.alive)"
          :key="t.index"
          class="uni-btn uni-btn--danger"
          @click="uni.doRevive(t.index)"
        >
          复活 {{ t.name }}（150 碎片）
        </button>
      </div>
      <div class="uni-shop-section">
        <h3 class="uni-shop-section__title">🙏 祝福</h3>
        <div class="uni-shop-list">
          <div v-for="(item, i) in uniState.shopStock?.blessing || []" :key="i" class="uni-shop-item">
            <span class="uni-shop-item__name">
              <span class="uni-star">{{ '★'.repeat(item.star) }}</span>
              {{ uni.blessingName(item.id) }}
            </span>
            <button
              class="uni-btn uni-btn--sm"
              :disabled="item.sold || uniState.shards < shopPrice(uniState, 'blessing', item.star)"
              @click="uni.doShopBuy('blessing', i)"
            >
              {{ shopPrice(uniState, 'blessing', item.star) }} 🪙
            </button>
          </div>
        </div>
      </div>
      <div class="uni-shop-section">
        <h3 class="uni-shop-section__title">✨ 奇物</h3>
        <div class="uni-shop-list">
          <div v-for="(item, i) in uniState.shopStock?.curio || []" :key="i" class="uni-shop-item">
            <span class="uni-shop-item__name">
              <span class="uni-star">{{ '★'.repeat(item.star) }}</span>
              {{ uni.curioName(item.id) }}
            </span>
            <button
              class="uni-btn uni-btn--sm"
              :disabled="item.sold || uniState.shards < shopPrice(uniState, 'curio', item.star)"
              @click="uni.doShopBuy('curio', i)"
            >
              {{ shopPrice(uniState, 'curio', item.star) }} 🪙
            </button>
          </div>
        </div>
      </div>
      <div v-if="uiMode === 'shop'" class="uni-shop-section">
        <h3 class="uni-shop-section__title">📐 方程</h3>
        <div class="uni-shop-list">
          <div v-for="(item, i) in uniState.shopStock?.equation || []" :key="i" class="uni-shop-item">
            <span class="uni-shop-item__name">
              <span class="uni-star">{{ '★'.repeat(item.star) }}</span>
              {{ uni.equationName(item.id) }}
            </span>
            <button
              class="uni-btn uni-btn--sm"
              :disabled="item.sold || uniState.shards < shopPrice(uniState, 'equation', item.star)"
              @click="uni.doShopBuy('equation', i)"
            >
              {{ shopPrice(uniState, 'equation', item.star) }} 🪙
            </button>
          </div>
        </div>
      </div>
      <button class="uni-btn uni-btn--primary" @click="uni.goNext()">离开</button>
    </section>

    <!-- 造物调试台 -->
    <section v-if="uiMode === 'workbench'" class="uni-panel">
      <h2 class="uni-panel__title">🔧 造物调试台（热量 {{ uniState.heat }}）</h2>
      <p class="uni-panel__desc">强化祝福（效果 ×2）或覆写祝福/方程，然后挑战首领</p>
      <div class="uni-shop-section">
        <h3 class="uni-shop-section__title">🔥 祝福强化（1/2/3 星需 1/2/3 热量）</h3>
        <div class="uni-shop-list">
          <div v-for="(b, i) in uniState.blessings" :key="i" class="uni-shop-item">
            <span class="uni-shop-item__name">
              {{ uni.blessingName(b.id) }}
              <span class="uni-star">{{ '★'.repeat(b.star) }}</span>
              <span v-if="(b.enhanced || 1) > 1 || b.heatEnhanced" class="uni-tag uni-tag--boost">
                ×{{ b.enhanced || 1 }}{{ b.heatEnhanced ? '×' + b.heatEnhanced : '' }}
              </span>
            </span>
            <button class="uni-btn uni-btn--sm" :disabled="uniState.heat < b.star" @click="uni.doHeatStrengthen(i)">
              强化（{{ b.star }} 热量）
            </button>
          </div>
        </div>
      </div>
      <div class="uni-shop-section">
        <h3 class="uni-shop-section__title">♻️ 覆写祝福（{{ uniState.overwritePrice }} 🪙）</h3>
        <div class="uni-shop-list">
          <div v-for="(b, i) in uniState.blessings" :key="'o' + i" class="uni-shop-item">
            <span class="uni-shop-item__name">{{ uni.blessingName(b.id) }}</span>
            <button class="uni-btn uni-btn--sm" @click="uni.doOverwriteBlessing(i)">覆写</button>
          </div>
        </div>
      </div>
      <div class="uni-shop-section">
        <h3 class="uni-shop-section__title">♻️ 覆写方程（{{ uniState.overwritePrice }} 🪙）</h3>
        <div class="uni-shop-list">
          <div v-for="(e, i) in uniState.equations" :key="'eq' + i" class="uni-shop-item">
            <span class="uni-shop-item__name">{{ uni.equationName(e.id) }}</span>
            <button class="uni-btn uni-btn--sm" @click="uni.doOverwriteEquation(i)">覆写</button>
          </div>
        </div>
      </div>
      <button class="uni-btn uni-btn--danger uni-btn--big" v-if="uniState.region?.type === 'boss'" @click="uni.startBattle()">⚔️ 挑战首领</button>
      <button class="uni-btn uni-btn--primary uni-btn--big" v-if="uniState.region?.type === 'oddity'" @click="uni.goNext()">完成调试 →</button>
    </section>

    <!-- 奇遇 / 财富 -->
    <section v-if="uiMode === 'oddity' || uiMode === 'fortune'" class="uni-panel">
      <h2 class="uni-panel__title">{{ uiMode === 'oddity' ? '✨ 奇遇' : '💰 财富' }}</h2>
      <p class="uni-panel__desc">{{ uiMode === 'oddity' ? oddityText : '获得 300 宇宙碎片' }}</p>
      <template v-if="uiMode === 'oddity' && uniState.region?.oddityEffect === 'workbench'">
        <button class="uni-btn uni-btn--primary" @click="uni.enterOddityWorkbench()">🔧 进入造物调试台</button>
      </template>
      <template v-else>
        <button class="uni-btn uni-btn--primary" @click="uni.goNext()">前往下一区域 →</button>
      </template>
    </section>

    <!-- 终局 -->
    <section v-if="uiMode === 'gameover'" class="uni-panel uni-panel--over">
      <h2 class="uni-panel__title">💀 终局</h2>
      <p class="uni-panel__desc">到达第 {{ uniState.floor }} 层 · 位面 {{ uniState.plane }}</p>
      <p class="uni-panel__desc">祝福 {{ uniState.blessings.length }} · 奇物 {{ uniState.curios.length }} · 方程 {{ uniState.equations.length }}</p>
      <button class="uni-btn" @click="onQuit">返回主菜单</button>
    </section>

    <DevLogPanel :entries="uniState.devLog?.entries || []" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import DevLogPanel from "../components/DevLogPanel.vue";
import { SHOP_PRICE, REGION_META, UNI_SKILLS } from "./logic/uniConstants.js";
import { CHARACTERS } from "./logic/uniState.js";
import { BLESSINGS, CURIOS, EQUATIONS } from "./logic/uniBuffs.js";
import { shopPrice as uniShopPrice } from "./logic/uniShop.js";

const props = defineProps({
  uni: { type: Object, required: true },
});
const emit = defineEmits(["quit"]);

const uniState = props.uni.uniState;

// ---- 视图状态（解包 ref） ----
const battleMsg = computed(() => props.uni.battleMsg.value);
const uiMode = computed(() => props.uni.uiMode.value);
const eventResult = computed(() => props.uni.eventResult.value);
const skillTargetPending = computed(() => props.uni.skillTargetPending.value);

// ---- 战斗状态 ----
const targetMode = ref(null); // null | 'enemy' | 'member'
const actionChoice = ref(null); // null | 'attack' | 'defense'（已抽牌等待确认）
const pendingSkill = ref(false); // 当前 enemy 目标选择是否用于开大（温迪/雷电）
const lastDamage = computed(() => uniState.combat?.lastDamage || null);
const drawnPoker = computed(() => uniState.combat?.pendingPoker?.[0] || null);
const selectedEnemy = ref(null);
const activeIdx = computed(() => uniState.combat?.activeIdx ?? null);
const active = computed(() => {
  const c = uniState.combat;
  return c && c.activeIdx != null ? uniState.team[c.activeIdx] : null;
});
const canAct = computed(
  () => uniState.combat?.phase === "player-action" && active.value?.alive,
);
const canSkill = computed(() => {
  if (!active.value) return false;
  return props.uni.canSkill(active.value.index).ok;
});
const skillCdText = computed(() => {
  if (!active.value) return "";
  const info = props.uni.skillInfo(active.value.index);
  if (!info || info.type !== "active") return "";
  return info.cooldown > 0 ? `（冷却${info.cooldown}）` : "";
});

// ---- 行动顺序条 ----
const orderList = computed(() => uniState.combat?.actionOrder || []);
function orderClass(i, idx) {
  const c = uniState.combat;
  if (!c) return "";
  if (!uniState.team[idx].alive) return "uni-order__slot--dead";
  if (i < c.turnIdx) return "uni-order__slot--done";
  if (i === c.turnIdx && c.phase === "player-action") return "uni-order__slot--current";
  return "uni-order__slot--next";
}

// ---- 头像 ----
function iconOf(idx) {
  return CHARACTERS[uniState.team[idx].charId]?.icon || "";
}
function onImgError(e) {
  e.target.style.visibility = "hidden"; // 图片缺失时隐藏，不显示破图
}

// ---- 飘字 / 受击动画（数据源：devLog 结构化条目） ----
const fxList = ref([]);
let fxSeq = 0;
watch(
  () => uniState.devLog?.entries?.length || 0,
  () => {
    const entries = uniState.devLog?.entries;
    if (!entries?.length) return;
    const last = entries[entries.length - 1];
    const d = last?.data || {};
    const msg = last?.msg || "";
    // 只对「实际伤害结算」日志飘字（避免 playerAttack 声明日志重复飘字）
    if (msg.includes("造成伤害") && d.enemyIdx != null && d.dmg != null) {
      spawnFx("enemy", d.enemyIdx, `-${d.dmg}`, d.dmg > 0 ? "dmg" : "shield");
    } else if (msg.includes("受到伤害") && d.memberIdx != null && d.hpDmg != null && d.hpDmg > 0) {
      spawnFx("member", d.memberIdx, `-${d.hpDmg}`, "dmg");
    }
  },
);
function spawnFx(kind, targetIdx, text, tone = "dmg") {
  const id = ++fxSeq;
  fxList.value.push({ id, kind, targetIdx, text, tone });
  setTimeout(() => {
    fxList.value = fxList.value.filter((f) => f.id !== id);
  }, 1000);
}
function fxFor(kind, targetIdx) {
  return fxList.value.filter((f) => f.kind === kind && f.targetIdx === targetIdx);
}
function fxCount(kind, targetIdx) {
  return fxFor(kind, targetIdx).length;
}

// ---- 事件 / 商店 ----
const ev = computed(() => props.uni.getCurrentEvent());
const pendingPick = computed(() => props.uni.currentBlessingPick());
const upgradable = computed(() =>
  uniState.team.filter((t) => t.alive && t.charId !== 11),
);

// ---- 背包弹层 ----
const bagOpen = ref(false);
const bagTab = ref("blessing");
const albumKind = ref("blessing");
const expandedKey = ref(null);
const albumBlessings = computed(() =>
  Object.values(BLESSINGS).sort((a, b) => a.star - b.star || a.id.localeCompare(b.id)),
);
const albumCurios = computed(() =>
  Object.values(CURIOS).sort((a, b) => a.star - b.star || a.id.localeCompare(b.id)),
);
const albumEquations = computed(() =>
  Object.values(EQUATIONS).sort((a, b) => a.star - b.star || a.id.localeCompare(b.id)),
);
const albumList = computed(() => {
  if (albumKind.value === "curio") return albumCurios.value;
  if (albumKind.value === "equation") return albumEquations.value;
  return albumBlessings.value;
});
function isOwned(kind, id) {
  if (kind === "curio") return uniState.curios.some((c) => c.id === id);
  if (kind === "equation") return uniState.equations.some((e) => e.id === id);
  return uniState.blessings.some((b) => b.id === id);
}
function toggleDetail(kind, i) {
  const key = kind + "-" + i;
  expandedKey.value = expandedKey.value === key ? null : key;
}
function bagBlessing(id) {
  return BLESSINGS[id] || { name: id, desc: "", fate: "" };
}
function bagCurio(id) {
  return CURIOS[id] || { name: id, desc: "" };
}
function bagEquation(id) {
  return EQUATIONS[id] || { name: id, desc: "", fate: "" };
}

// ---- 选角 ----
const allChars = computed(() => Object.values(CHARACTERS));
const selectedCharsList = computed(() => props.uni.selectedChars.value);
function isSelected(charId) {
  return selectedCharsList.value.includes(charId);
}
function confirmCharsel() {
  props.uni.startUni();
}

// ---- 技能分支弹层（莉奈娅盾/dot、纳西妲选人） ----
const skillBranch = ref(null); // { type: 'liniya' } | { type: 'nahida', selected: [] }
const nahidaMax = computed(() => {
  if (!active.value || active.value.charId !== 4) return 1;
  const lv = Math.min(active.value.skillLevel, 10);
  return UNI_SKILLS[4].values[lv - 1] || 1;
});
function doLiniyaBranch(branch) {
  const r = props.uni.doSkill(undefined, { branch });
  if (r.ok) skillBranch.value = null;
}
function toggleNahidaMember(idx) {
  const s = skillBranch.value;
  if (!s) return;
  const i = s.selected.indexOf(idx);
  if (i >= 0) s.selected.splice(i, 1);
  else if (s.selected.length < nahidaMax.value) s.selected.push(idx);
}
function confirmNahida() {
  const s = skillBranch.value;
  if (!s || !s.selected.length) return;
  const r = props.uni.doSkill(undefined, { members: s.selected });
  if (r.ok) skillBranch.value = null;
}

const oddityText = computed(() => {
  const fx = uniState.region?.oddityEffect;
  if (fx === "shards") return "获得 800 宇宙碎片";
  if (fx === "workbench") return "可进行一次造物调试台";
  return "强化 8 个随机祝福";
});

// ---- 方法 ----
function regionIcon(type) {
  return REGION_META[type]?.icon || "❓";
}
function regionName(type) {
  return REGION_META[type]?.name || type;
}
function skillName(t) {
  return UNI_SKILLS[t.charId]?.name || "";
}
function skillType(t) {
  return UNI_SKILLS[t.charId]?.type || "";
}
function hpPct(t) {
  return Math.max(0, Math.min(100, (t.hp / t.maxHp) * 100));
}
function shopPrice(state, type, star) {
  return uniShopPrice(state, type, star);
}

function onAttackClick() {
  const r = props.uni.chooseAction("attack");
  if (r.ok) actionChoice.value = "attack";
}
function onDefenseClick() {
  const r = props.uni.chooseAction("defense");
  if (r.ok) actionChoice.value = "defense";
}
function onExecuteAttack() {
  actionChoice.value = null;
  pendingSkill.value = false;
  targetMode.value = "enemy";
  selectedEnemy.value = null;
  battleMsg.value = "选择目标敌人";
}
function onExecuteDefense() {
  actionChoice.value = null;
  targetMode.value = "member";
  battleMsg.value = "选择要加护盾的成员";
}
function onCancelAction() {
  if (uniState.combat) uniState.combat.pendingPoker = [];
  actionChoice.value = null;
  battleMsg.value = "";
}
function onEnemyClick(enemyId) {
  if (targetMode.value !== "enemy") return;
  // 开大选目标（温迪/雷电）→ 施放技能；否则 → 普攻
  const r = pendingSkill.value
    ? props.uni.doSkill(enemyId, {})
    : props.uni.doAttack(enemyId);
  if (r.ok) {
    targetMode.value = null;
    pendingSkill.value = false;
  }
}
function onMemberClick(memberIdx) {
  if (targetMode.value === "member") {
    const r = props.uni.doDefense(memberIdx);
    if (r.ok) targetMode.value = null;
  }
}
function onSkillClick() {
  const t = active.value;
  const info = props.uni.skillInfo(t.index);
  if (!info) return;
  pendingSkill.value = false;
  // 需要选目标的技能：温迪/雷电将军（选敌人）
  if ([1, 3].includes(t.charId)) {
    targetMode.value = "enemy";
    pendingSkill.value = true;
    selectedEnemy.value = null;
    battleMsg.value = "选择大招目标";
    return;
  }
  // 纳西妲：弹选人面板（选 1-N 人立即行动）
  if (t.charId === 4) {
    skillBranch.value = { type: "nahida", selected: [] };
    return;
  }
  // 莉奈娅：弹分支（一技能盾 / 二技能 dot）
  if (t.charId === 9) {
    skillBranch.value = { type: "liniya" };
    return;
  }
  // 其余无目标技能直接放
  const r = props.uni.doSkill(undefined, {});
  if (r.ok) {
    targetMode.value = null;
    pendingSkill.value = false;
  }
}
function onQuit() {
  emit("quit");
}
</script>

<style scoped>
.uni-shell {
  max-width: 1024px;
  margin: 0 auto;
  padding: 12px;
  color: #e8e8e8;
  font-size: 14px;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  min-height: 100vh;
  background: radial-gradient(ellipse at top, rgba(88, 60, 160, 0.25), transparent 60%);
}
/* 顶栏 */
.uni-topbar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 14px;
  background: rgba(30, 20, 60, 0.6);
  border: 1px solid rgba(140, 120, 255, 0.25);
  border-radius: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  backdrop-filter: blur(4px);
}
.uni-topbar__title {
  font-weight: bold;
  color: #ffab00;
  letter-spacing: 1px;
}
.uni-topbar__info {
  color: #c9b8ff;
}
.uni-topbar__stat {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 13px;
}
.uni-topbar__spacer {
  flex: 1;
}
/* 面板 */
.uni-panel {
  background: rgba(20, 14, 44, 0.72);
  border: 1px solid rgba(140, 120, 255, 0.22);
  border-radius: 14px;
  padding: 20px;
  text-align: center;
  backdrop-filter: blur(4px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  animation: uniPop 0.25s ease;
}
@keyframes uniPop {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.uni-panel__title {
  margin: 0 0 6px;
  color: #ffc94d;
}
.uni-panel__desc {
  color: #cfc4f0;
  margin: 8px 0 16px;
}
.uni-panel__gain {
  font-size: 22px;
  color: #ffc94d;
  font-weight: bold;
}
.uni-panel--over {
  border-color: #ff6b6b;
}
/* 选择卡 */
.uni-choice {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.uni-choice__card {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  border-radius: 12px;
  padding: 14px 18px;
  cursor: pointer;
  min-width: 170px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  font-size: 14px;
  transition: transform 0.15s, background 0.15s, border-color 0.15s;
}
.uni-choice__card:hover {
  transform: translateY(-3px);
  background: rgba(255, 171, 0, 0.15);
  border-color: rgba(255, 171, 0, 0.5);
}
.uni-choice__icon {
  font-size: 26px;
}
.uni-choice__name {
  font-weight: 600;
}
.uni-choice__avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 171, 0, 0.4);
}
/* 按钮 */
.uni-btn {
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: #fff;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  font-size: 14px;
  transition: transform 0.12s, background 0.12s;
}
.uni-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(255, 171, 0, 0.22);
}
.uni-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.uni-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.uni-btn--sm { padding: 4px 10px; font-size: 12px; }
.uni-btn--big { padding: 12px 28px; font-size: 16px; margin-top: 10px; }
.uni-btn--primary { background: #8a5cff; border-color: #8a5cff; font-weight: bold; }
.uni-btn--danger { background: #e04a4a; border-color: #e04a4a; font-weight: bold; }
.uni-btn--attack { background: #c2452e; border-color: #c2452e; font-weight: bold; }
.uni-btn--defense { background: #2e7cc2; border-color: #2e7cc2; font-weight: bold; }
.uni-btn--skill { background: #7a3fc9; border-color: #7a3fc9; font-weight: bold; }
/* 行动顺序条 */
.uni-order {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 8px 12px;
  background: rgba(20, 14, 44, 0.72);
  border: 1px solid rgba(140, 120, 255, 0.22);
  border-radius: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.uni-order__slot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  opacity: 0.6;
  transition: all 0.25s;
}
.uni-order__avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
}
.uni-order__slot--current {
  opacity: 1;
  background: rgba(255, 171, 0, 0.25);
  border-color: #ffab00;
  box-shadow: 0 0 10px rgba(255, 171, 0, 0.5);
  transform: scale(1.06);
}
.uni-order__slot--next {
  opacity: 0.85;
  border-color: rgba(255, 255, 255, 0.25);
}
.uni-order__slot--done {
  opacity: 0.35;
  text-decoration: line-through;
}
.uni-order__slot--dead {
  opacity: 0.2;
  filter: grayscale(1);
}
/* 战斗板 */
.uni-battle {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.uni-battle__board {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 12px;
}
.uni-battle__team,
.uni-battle__enemies {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* 成员卡 */
.uni-member {
  position: relative;
  background: rgba(20, 14, 44, 0.72);
  border: 1px solid rgba(140, 120, 255, 0.2);
  border-radius: 12px;
  padding: 10px 12px;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
}
.uni-member--active {
  border-color: #ffab00;
  box-shadow: 0 0 14px rgba(255, 171, 0, 0.45);
  transform: scale(1.015);
}
.uni-member--dead {
  opacity: 0.4;
  filter: grayscale(0.8);
}
.uni-member--hit {
  animation: uniHit 0.4s ease;
}
@keyframes uniHit {
  0%, 100% { background: rgba(20, 14, 44, 0.72); }
  30% { background: rgba(224, 74, 74, 0.45); }
}
.uni-member__head {
  display: flex;
  gap: 10px;
  align-items: center;
}
.uni-member__avatar {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255, 171, 0, 0.35);
  background: rgba(255, 255, 255, 0.05);
}
.uni-member__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.uni-member__skull {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: rgba(0, 0, 0, 0.5);
}
.uni-member__main {
  flex: 1;
}
.uni-member__name {
  font-weight: bold;
  font-size: 15px;
}
.uni-bar {
  height: 9px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  overflow: hidden;
  margin: 4px 0 2px;
}
.uni-bar__fill {
  height: 100%;
  transition: width 0.35s ease;
}
.uni-bar__fill--hp {
  background: linear-gradient(90deg, #4caf50, #8bc34a);
}
.uni-bar__fill--enemy {
  background: linear-gradient(90deg, #f44336, #ff8a65);
}
.uni-member__hpnum,
.uni-enemy__hpnum {
  font-size: 12px;
  color: #cfc4f0;
}
.uni-member__flags,
.uni-enemy__flags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.uni-tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
}
.uni-tag--shield { background: rgba(46, 124, 194, 0.35); }
.uni-tag--bad { background: rgba(224, 74, 74, 0.4); }
.uni-tag--dot { background: rgba(255, 120, 40, 0.4); }
.uni-tag--spirit { background: rgba(255, 120, 40, 0.55); color: #ffd9a0; }
.uni-tag--moon { background: rgba(150, 110, 255, 0.45); color: #d9c9ff; }
.uni-tag--elite { background: rgba(160, 60, 200, 0.45); }
.uni-tag--boss { background: rgba(255, 171, 0, 0.45); color: #000; }
.uni-tag--boost { background: rgba(255, 171, 0, 0.4); }
.uni-member__skill {
  margin-top: 6px;
  font-size: 12px;
  color: #b7a8e8;
}
.uni-member__cd { color: #ff8f00; margin-left: 4px; }
.uni-member__ready { color: #4caf50; margin-left: 4px; }
.uni-member__passive { color: #888; margin-left: 4px; }
/* 敌人卡 */
.uni-enemy {
  position: relative;
  background: rgba(50, 16, 24, 0.7);
  border: 1px solid rgba(255, 90, 90, 0.25);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.uni-enemy:hover {
  border-color: rgba(255, 90, 90, 0.6);
}
.uni-enemy--dead {
  opacity: 0.35;
  filter: grayscale(1);
  cursor: default;
}
.uni-enemy--target {
  border-color: #ffab00;
  box-shadow: 0 0 12px rgba(255, 171, 0, 0.6);
  transform: scale(1.03);
}
.uni-enemy--hit {
  animation: uniHitEnemy 0.4s ease;
}
@keyframes uniHitEnemy {
  0%, 100% { background: rgba(50, 16, 24, 0.7); }
  30% { background: rgba(255, 235, 59, 0.3); }
}
.uni-enemy__name {
  font-weight: bold;
  color: #ffb0b0;
}
/* 飘字 */
.uni-fx {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 18px;
  font-weight: bold;
  color: #ff6b6b;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  animation: uniFloat 1s ease-out forwards;
  z-index: 5;
}
.uni-fx--shield { color: #6bb3ff; }
@keyframes uniFloat {
  0% { opacity: 1; transform: translateY(0) scale(1.1); }
  100% { opacity: 0; transform: translateY(-30px) scale(1); }
}
/* 操作区 */
.uni-battle__action {
  background: rgba(20, 14, 44, 0.75);
  border: 1px solid rgba(140, 120, 255, 0.22);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}
.uni-battle__actor {
  margin-bottom: 10px;
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}
.uni-battle__actorname {
  font-weight: bold;
  color: #ffc94d;
}
.uni-battle__turn {
  color: #888;
  font-size: 12px;
}
.uni-poker {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(160deg, #fff, #e8e4f8);
  color: #222;
  border-radius: 8px;
  padding: 6px 12px;
  min-width: 48px;
  border: 2px solid rgba(255, 171, 0, 0.5);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
  animation: uniDeal 0.3s ease;
}
@keyframes uniDeal {
  from { transform: translateY(-14px) rotate(-4deg); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.uni-poker__rank {
  font-size: 22px;
  font-weight: bold;
  line-height: 1;
}
.uni-poker__suit {
  font-size: 18px;
}
.uni-poker__rank--♥, .uni-poker__rank--♦ { color: #d32f2f; }
.uni-poker__rank--♠, .uni-poker__rank--♣ { color: #1a1a2e; }
.uni-battle__buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.uni-battle__msg {
  margin-top: 8px;
  color: #ff8f00;
  min-height: 18px;
}
/* 商店 */
.uni-shop-section {
  text-align: left;
  margin: 12px 0;
}
.uni-shop-section__title {
  color: #ffc94d;
  margin: 6px 0;
  font-size: 15px;
}
.uni-shop-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.uni-shop-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.uni-shop-item__name {
  display: flex;
  align-items: center;
  gap: 6px;
}
.uni-star {
  color: #ffc94d;
  letter-spacing: -1px;
}
.uni-rest-revive {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
/* 选角 */
.uni-charsel {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.uni-charsel__card {
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.uni-charsel__card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 171, 0, 0.5);
}
.uni-charsel__card--selected {
  border-color: #ffab00;
  background: rgba(255, 171, 0, 0.15);
  box-shadow: 0 0 10px rgba(255, 171, 0, 0.35);
}
.uni-charsel__card--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.uni-charsel__avatar {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.06);
}
.uni-charsel__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.uni-charsel__check {
  position: absolute;
  bottom: 0;
  right: 0;
  background: #ffab00;
  color: #000;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}
.uni-charsel__name {
  font-size: 13px;
  font-weight: 600;
}
.uni-charsel__info {
  font-size: 11px;
  color: #b7a8e8;
}
/* 模态弹层 */
.uni-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(3px);
}
.uni-modal__box {
  background: linear-gradient(160deg, #241a4e, #16102e);
  border: 1px solid rgba(140, 120, 255, 0.35);
  border-radius: 16px;
  padding: 22px;
  min-width: 320px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
  animation: uniPop 0.2s ease;
}
.uni-modal__title {
  margin: 0 0 6px;
  color: #ffc94d;
}
.uni-modal__members {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.uni-modal__cancel {
  margin-top: 6px;
  opacity: 0.7;
}
/* 背包 */
.uni-modal__box--wide {
  min-width: 440px;
  max-width: 92vw;
}
.uni-bag-tabs {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.uni-btn--active {
  background: rgba(255, 171, 0, 0.25);
  border-color: #ffab00;
  color: #ffc94d;
}
.uni-bag-list {
  width: 100%;
  max-height: 50vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px;
}
.uni-bag-empty {
  color: #888;
  padding: 20px;
  text-align: center;
}
.uni-bag-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.uni-bag-item:hover {
  background: rgba(255, 171, 0, 0.08);
}
.uni-bag-item--open {
  border-color: rgba(255, 171, 0, 0.4);
}
.uni-bag-item__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.uni-bag-item__name {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.uni-bag-item__meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}
.uni-bag-item__arrow {
  color: #888;
  font-size: 11px;
}
.uni-bag-item__desc {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  color: #cfc4f0;
  font-size: 13px;
  line-height: 1.6;
  animation: uniPop 0.2s ease;
}
@media (max-width: 640px) {
  .uni-battle__board {
    grid-template-columns: 1fr;
  }
}
/* 伤害飘字 */
.uni-dmg-float {
  position: absolute;
  right: 10px;
  top: 6px;
  font-size: 16px;
  font-weight: bold;
  color: #ff6b6b;
  text-shadow: 0 0 6px rgba(255, 60, 60, 0.8);
  pointer-events: none;
  z-index: 5;
  animation: uniDmgFloat 1.1s ease-out forwards;
}
@keyframes uniDmgFloat {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-22px); }
}
/* 事件效果报告 */
.uni-event-fx {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.uni-tag--fx {
  background: rgba(120, 220, 160, 0.15);
  color: #a5e8c0;
  border: 1px solid rgba(120, 220, 160, 0.3);
}
.uni-tag--none {
  background: rgba(255, 255, 255, 0.06);
  color: #999;
  border-color: rgba(255, 255, 255, 0.12);
}
/* 图鉴 */
.uni-btn--album {
  background: rgba(90, 120, 255, 0.25);
  border-color: rgba(120, 160, 255, 0.45);
}
.uni-bag-item--owned {
  border-color: rgba(255, 190, 90, 0.4);
}
.uni-bag-item--owned .uni-bag-item__name {
  color: #ffd27a;
}
@media (max-width: 640px) {
  .uni-shell {
    padding: 8px;
  }
}
</style>
