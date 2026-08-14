<template>
  <div class="uni-shell">
    <!-- 顶栏 -->
    <header class="uni-topbar">
      <span class="uni-topbar__title" title="连点 3 次打开开发日志" @click="onTitleClick">模拟宇宙</span>
      <span class="uni-topbar__info">位面 {{ uniState.plane }} · 第 {{ uniState.floor }} 层</span>
      <span class="uni-topbar__stat" title="宇宙碎片">{{ uniState.shards }}</span>
      <span class="uni-topbar__stat uni-topbar__stat--bless" title="祝福">{{ uniState.blessings.length }}</span>
      <span class="uni-topbar__stat uni-topbar__stat--curio" title="奇物">{{ uniState.curios.length }}</span>
      <span class="uni-topbar__stat uni-topbar__stat--equation" title="方程">{{ uniState.equations.length }}</span>
      <span class="uni-topbar__spacer"></span>
      <button class="uni-btn uni-btn--sm" @click="bagOpen = true">背包</button>
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
      <!-- PIXI 动态特效层（粒子/飘字/震屏/发牌） -->
      <canvas ref="fxCanvas" class="uni-fx-canvas"></canvas>
      <!-- 转化层：20 回合倒计时 -->
      <div
        v-if="uniState.combat?.kind === 'transform'"
        class="uni-transform-timer"
        :class="{ 'uni-transform-timer--danger': transformLeft <= 5 }"
      >
        转化 · 剩余 {{ transformLeft }} 回合及格（需灭两波）
      </div>
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
            :data-idx="t.index"
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
            :data-id="e.id"
            :class="{
              'uni-enemy--dead': !e.alive,
              'uni-enemy--target': targetMode === 'enemy' && selectedEnemy === e.id,
              'uni-enemy--hit': fxCount('enemy', e.id) > 0,
            }"
            @click="onEnemyClick(e.id)"
          >
            <div class="uni-enemy__name">
              {{ e.name }}
              <span class="uni-tag uni-tag--pattern">类别{{ e.pattern }} · {{ patternName(e) }}</span>
            </div>
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
          <button class="uni-btn uni-btn--attack" :disabled="!canAct" @click="onAttackClick">普攻</button>
          <button class="uni-btn uni-btn--defense" :disabled="!canAct" @click="onDefenseClick">防御</button>
          <button
            class="uni-btn uni-btn--skill"
            :disabled="!canSkill"
            @click="onSkillClick"
          >
            开大{{ skillCdText }}
          </button>
        </div>
        <div v-else-if="actionChoice && !targetMode" class="uni-battle__buttons">
          <button
            class="uni-btn uni-btn--attack"
            @click="onExecuteAttack"
          >
            执行攻击（{{ drawnPoker?.value }}）
          </button>
          <button v-if="actionChoice === 'defense'" class="uni-btn uni-btn--defense" @click="onExecuteDefense">
            执行防御（{{ drawnPoker?.value }}）
          </button>
          <button class="uni-btn uni-btn--cancel" @click="onCancelAction">取消</button>
        </div>
        <div v-if="battleMsg" class="uni-battle__msg">{{ battleMsg }}</div>
      </div>
    </section>

    <!-- 背包弹层：祝福 / 奇物 / 方程 -->
    <div v-if="bagOpen" class="uni-modal">
      <div class="uni-modal__box uni-modal__box--wide">
        <h3 class="uni-modal__title">背包</h3>
        <div class="uni-bag-tabs">
          <button
            class="uni-btn uni-btn--sm"
            :class="{ 'uni-btn--active': bagTab === 'blessing' }"
            @click="bagTab = 'blessing'"
          >
            祝福（{{ uniState.blessings.length }}）
          </button>
          <button
            class="uni-btn uni-btn--sm"
            :class="{ 'uni-btn--active': bagTab === 'curio' }"
            @click="bagTab = 'curio'"
          >
            奇物（{{ uniState.curios.length }}）
          </button>
          <button
            class="uni-btn uni-btn--sm"
            :class="{ 'uni-btn--active': bagTab === 'equation' }"
            @click="bagTab = 'equation'"
          >
            方程（{{ uniState.equations.length }}）
          </button>
          <button
            class="uni-btn uni-btn--sm uni-btn--album"
            :class="{ 'uni-btn--active': bagTab === 'album' }"
            @click="bagTab = 'album'"
          >
            图鉴
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
              祝福（{{ albumBlessings.length }}）
            </button>
            <button
              class="uni-btn uni-btn--sm"
              :class="{ 'uni-btn--active': albumKind === 'curio' }"
              @click="albumKind = 'curio'"
            >
              奇物（{{ albumCurios.length }}）
            </button>
            <button
              class="uni-btn uni-btn--sm"
              :class="{ 'uni-btn--active': albumKind === 'equation' }"
              @click="albumKind = 'equation'"
            >
              方程（{{ albumEquations.length }}）
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
                  <span
                    v-if="albumKind === 'equation' && isOwned('equation', item.id)"
                    class="uni-tag"
                    :class="isEquationUnlocked(uniState, item.id) ? 'uni-tag--boost' : 'uni-tag--bad'"
                  >{{ isEquationUnlocked(uniState, item.id) ? '已展开' : '未展开' }}</span>
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
                <span v-if="!isEquationUnlocked(uniState, e.id)" class="uni-tag uni-tag--bad">未展开</span>
                <span v-else class="uni-tag uni-tag--boost">已展开</span>
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
          <button class="uni-btn uni-btn--big" @click="doLiniyaBranch('shield')">一技能：全队获得盾</button>
          <button class="uni-btn uni-btn--big" @click="doLiniyaBranch('dot')">二技能：敌方 dot</button>
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
        <button class="uni-btn uni-btn--primary" @click="uni.doThirdWave(false)">撤退（及格奖励）</button>
        <button class="uni-btn uni-btn--danger" @click="uni.doThirdWave(true)">挑战第三波</button>
      </div>
    </section>

    <!-- 战斗胜利 -->
    <section v-if="uiMode === 'reward'" class="uni-panel">
      <h2 class="uni-panel__title">战斗胜利</h2>
      <template v-if="skillTargetPending">
        <template v-if="upgradable.length">
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
        <template v-else>
          <p class="uni-panel__desc">无可升级角色，技能升级奖励已放弃</p>
          <button class="uni-btn uni-btn--primary" @click="onNext()">{{ nextBtn() }}</button>
        </template>
      </template>
      <template v-else-if="pendingPick">
        <p class="uni-panel__desc">选择祝福（{{ pendingPick.starRange[0] }}~{{ pendingPick.starRange[1] }} 星）</p>
        <div class="uni-choice">
          <button
            v-for="id in pendingPick.candidates"
            :key="id"
            class="uni-choice__card"
            @click="onPickBlessing(id, $event)"
          >
            <span class="uni-choice__icon">🙏</span>
            <span class="uni-choice__name">{{ uni.blessingName(id) }}</span>
            <span class="uni-tag uni-tag--fate">{{ blessingFate(id) }}</span>
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
        <button class="uni-btn uni-btn--primary" @click="onNext()">{{ nextBtn() }}</button>
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
        <template v-if="upgradable.length">
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
        <template v-else>
          <p class="uni-panel__desc">无可升级角色，技能升级奖励已放弃</p>
          <button class="uni-btn uni-btn--primary" @click="onNext()">{{ nextBtn() }}</button>
        </template>
      </template>
      <template v-else-if="pendingPick">
        <p class="uni-panel__desc">选择祝福（{{ pendingPick.starRange[0] }}~{{ pendingPick.starRange[1] }} 星）</p>
        <div class="uni-choice">
          <button
            v-for="id in pendingPick.candidates"
            :key="id"
            class="uni-choice__card"
            @click="onPickBlessing(id, $event)"
          >
            <span class="uni-choice__name">{{ uni.blessingName(id) }}</span>
            <span class="uni-tag uni-tag--fate">{{ blessingFate(id) }}</span>
          </button>
        </div>
      </template>
      <template v-else>
        <button class="uni-btn uni-btn--primary" @click="onNext()">{{ nextBtn() }}</button>
      </template>
    </section>

    <!-- 商店 / 休整 -->
    <section v-if="uiMode === 'shop' || uiMode === 'rest'" class="uni-panel">
      <h2 class="uni-panel__title">{{ uiMode === 'shop' ? '商店' : '休整' }}</h2>
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
        <h3 class="uni-shop-section__title">祝福</h3>
        <div class="uni-shop-list">
          <div v-for="(item, i) in uniState.shopStock?.blessing || []" :key="i" class="uni-shop-item">
            <span class="uni-shop-item__name">
              <span class="uni-star">{{ '★'.repeat(item.star) }}</span>
              {{ uni.blessingName(item.id) }}
              <span class="uni-tag uni-tag--fate">{{ blessingFate(item.id) }}</span>
            </span>
            <button
              class="uni-btn uni-btn--sm"
              :disabled="item.sold || uniState.shards < shopPrice(uniState, 'blessing', item.star)"
              @click="uni.doShopBuy('blessing', i)"
            >
              {{ shopPrice(uniState, 'blessing', item.star) }} 碎片🪙
            </button>
          </div>
        </div>
      </div>
      <div class="uni-shop-section">
        <h3 class="uni-shop-section__title">奇物</h3>
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
              {{ shopPrice(uniState, 'curio', item.star) }} 碎片🪙
            </button>
          </div>
        </div>
      </div>
      <div v-if="uiMode === 'shop'" class="uni-shop-section">
        <h3 class="uni-shop-section__title">方程</h3>
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
              {{ shopPrice(uniState, 'equation', item.star) }} 碎片🪙
            </button>
          </div>
        </div>
      </div>
      <button class="uni-btn uni-btn--primary" @click="uni.goNext()">离开</button>
    </section>

    <!-- 造物调试台 -->
    <section v-if="uiMode === 'workbench'" class="uni-panel">
      <h2 class="uni-panel__title">造物调试台（热量 {{ uniState.heat }}）</h2>
      <p class="uni-panel__desc">强化祝福（效果 ×2）或覆写祝福/方程，然后挑战首领</p>
      <div class="uni-shop-section">
        <h3 class="uni-shop-section__title">祝福强化（1/2/3 星需 1/2/3 热量）</h3>
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
        <h3 class="uni-shop-section__title">覆写祝福（{{ uniState.overwritePrice }} 🪙）</h3>
        <div class="uni-shop-list">
          <div v-for="(b, i) in uniState.blessings" :key="'o' + i" class="uni-shop-item">
            <span class="uni-shop-item__name">{{ uni.blessingName(b.id) }}</span>
            <button class="uni-btn uni-btn--sm" @click="uni.doOverwriteBlessing(i)">覆写</button>
          </div>
        </div>
      </div>
      <div class="uni-shop-section">
        <h3 class="uni-shop-section__title">覆写方程（{{ uniState.overwritePrice }} 🪙）</h3>
        <div class="uni-shop-list">
          <div v-for="(e, i) in uniState.equations" :key="'eq' + i" class="uni-shop-item">
            <span class="uni-shop-item__name">{{ uni.equationName(e.id) }}</span>
            <button class="uni-btn uni-btn--sm" @click="uni.doOverwriteEquation(i)">覆写</button>
          </div>
        </div>
      </div>
      <button class="uni-btn uni-btn--danger uni-btn--big" v-if="uniState.region?.type === 'boss'" @click="uni.startBattle()">挑战首领</button>
      <button class="uni-btn uni-btn--primary uni-btn--big" v-if="uniState.region?.type === 'oddity'" @click="uni.goNext()">完成调试 →</button>
    </section>

    <!-- 奇遇 / 财富 -->
    <section v-if="uiMode === 'oddity' || uiMode === 'fortune'" class="uni-panel">
      <h2 class="uni-panel__title">{{ uiMode === 'oddity' ? '奇遇' : '财富' }}</h2>
      <p class="uni-panel__desc">{{ uiMode === 'oddity' ? oddityText : '获得 300 宇宙碎片' }}</p>
      <template v-if="uiMode === 'oddity' && uniState.region?.oddityEffect === 'workbench'">
        <button class="uni-btn uni-btn--primary" @click="uni.enterOddityWorkbench()">进入造物调试台</button>
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

    <DevLogPanel :entries="uniState.devLog?.entries || []" :open="logOpen" />

    <!-- 获得动画（祝福/奇物/方程）：背景变暗 → 卡放大显效果 → 飞向背包，单击跳过 -->
    <div v-if="blessingAnim" class="uni-bless-overlay" title="点击跳过">
      <div ref="blessCard" class="uni-bless-card" :class="'uni-bless-card--' + (blessingAnim.type || 'blessing')">
        <div class="uni-bless-card__star">{{ '★'.repeat(blessingAnim.star || 1) }}</div>
        <div class="uni-bless-card__name">{{ blessingAnim.name }}</div>
        <div class="uni-bless-card__fate">{{ blessingAnim.fate || (blessingAnim.negative ? '负面' : '') }}</div>
        <div class="uni-bless-card__desc">{{ blessingAnim.desc }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import gsap from "gsap";
import DevLogPanel from "../components/DevLogPanel.vue";
import { SHOP_PRICE, REGION_META, UNI_SKILLS, ENEMY_PATTERNS } from "./logic/uniConstants.js";
import { isEquationUnlocked } from "./logic/uniBuffs.js";
import { CHARACTERS } from "./logic/uniState.js";
import { BLESSINGS, CURIOS, EQUATIONS } from "./logic/uniBuffs.js";
import { shopPrice as uniShopPrice } from "./logic/uniShop.js";
import { createUniEffects } from "./uniPixi.js";

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

// ---- PIXI 动态特效层（粒子/飘字/震屏/发牌） ----
const fxCanvas = ref(null);
const fx = ref(null);

/** DOM 元素中心 → 特效层坐标（相对父容器，与 PIXI 渲染尺寸一致） */
function fxPos(dom) {
  if (!fxCanvas.value || !dom) return null;
  const cr = fxCanvas.value.parentElement.getBoundingClientRect();
  const r = dom.getBoundingClientRect();
  return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2 };
}

/** 战斗视图出现时初始化特效层；监听父容器尺寸变化同步 PIXI 渲染尺寸（防错位） */
let fxObserver = null;
async function ensureFx() {
  if (!fxCanvas.value || fx.value) return;
  const parent = fxCanvas.value.parentElement;
  const w = parent?.clientWidth || 800;
  const h = parent?.clientHeight || 480;
  fx.value = createUniEffects();
  await fx.value.init(fxCanvas.value, w, h);
  // 战斗区尺寸变化（窗口 resize / 波次敌人增减）→ 同步画布，避免坐标错位
  if (parent && "ResizeObserver" in window) {
    fxObserver = new ResizeObserver(() => {
      if (!fx.value) return;
      const w2 = parent.clientWidth;
      const h2 = parent.clientHeight;
      if (w2 > 0 && h2 > 0) fx.value.resize(w2, h2);
    });
    fxObserver.observe(parent);
  }
}

onMounted(() => {
  // 进入战斗视图时初始化（immediate：首层就是战斗时也要初始化）
  watch(uiMode, async (m) => {
    if (m === "battle") {
      await nextTick();
      ensureFx();
    }
  }, { immediate: true });
  // 伤害结算 → 飘字 + 粒子 + 轻微震屏 + 受击卡抖动
  watch(
    () => uniState.combat?.lastDamage?.seq,
    (seq) => {
      if (seq == null) return;
      const ld = uniState.combat.lastDamage;
      const dom = ld.type === "member"
        ? fxCanvas.value?.parentElement?.querySelector(`.uni-member[data-idx="${ld.idx}"]`)
        : fxCanvas.value?.parentElement?.querySelector(`.uni-enemy[data-id="${ld.id}"]`);
      // 受击抖动：目标卡位移抖动（确定性触发，不依赖日志）
      if (dom) {
        dom.classList.remove("uni-hit-shake");
        void dom.offsetWidth; // 强制重排以重触发动画
        dom.classList.add("uni-hit-shake");
        setTimeout(() => dom.classList.remove("uni-hit-shake"), 400);
      }
      const pos = fxPos(dom);
      if (!fx.value || !pos) return;
      const mine = ld.type === "member";
      fx.value.floatText(`-${ld.dmg}`, pos.x, pos.y, {
        color: mine ? 0xffb08a : 0xffe9b8,
        size: mine ? 24 : 26,
        crit: ld.dmg >= 12,
      });
      // 打击感：我方攻击命中 → 帧停 + 冲击波 + 白闪；我方受击 → 红闪
      if (!mine) {
        fx.value.hitstop(ld.dmg >= 12 ? 90 : 60);
        fx.value.impactRing(pos.x, pos.y, 0xfff0c0);
        fx.value.hitFlash(pos.x, pos.y, 0xfff6e0);
      }
      // 击杀敌人 → 爆散粒子
      if (!mine) {
        const enemy = uniState.combat.enemies.find((e) => e.id === ld.idx);
        if (enemy && !enemy.alive) fx.value.killBurst(pos.x, pos.y);
      }
      fx.value.burst(pos.x, pos.y, {
        color: mine ? 0xc0553f : 0xd8b26a,
        count: mine ? 16 : 22,
        speed: mine ? 200 : 300,
        lifetime: 0.6,
        size: mine ? 3.2 : 3.6,
      });
      if (mine) {
        fx.value.shake(6, 0.25);
        fx.value.flash(0xc0553f, 0.1, 0.15); // 受击红闪
      }
    },
  );
  // 抽牌 → 发牌轨迹（牌堆 → 行动目标：攻击飞向敌人 / 防御飞向被加盾成员）
  watch(
    () => uniState.combat?.lastPoker,
    (poker) => {
      if (!poker || !fx.value) return;
      const tgt = uniState.combat?.lastPokerTarget;
      let dom = null;
      if (tgt?.type === "enemy") {
        dom = fxCanvas.value?.parentElement?.querySelector(`.uni-enemy[data-id="${tgt.id}"]`);
      } else if (tgt?.type === "member") {
        dom = fxCanvas.value?.parentElement?.querySelector(`.uni-member[data-idx="${tgt.id}"]`);
      } else if (active.value) {
        dom = fxCanvas.value?.parentElement?.querySelector(`.uni-member[data-idx="${active.value.index}"]`);
      }
      const to = fxPos(dom);
      if (!to) return;
      const from = { x: (fxCanvas.value.clientWidth || 800) * 0.5, y: (fxCanvas.value.clientHeight || 480) - 16 };
      const color = tgt?.type === "enemy" ? 0xf2c96b : 0x9fd0ff;
      fx.value.deployCard(from, to, color);
      // 防御：目标成员卡显示 +护盾 蓝色飘字与蓝色光环
      if (tgt?.type === "member") {
        fx.value.gainFloat(String(poker.value || 0), to.x, to.y - 18, 0x9fd0ff);
        fx.value.impactRing(to.x, to.y, 0x9fd0ff, 26);
      }
    },
  );
  // 开大 → 技能专属演出（施放者位置为中心，攻击类技能以敌人为目标）
  watch(
    () => uniState.combat?.lastSkill?.seq,
    (seq) => {
      if (seq == null || !fx.value) return;
      const ls = uniState.combat.lastSkill;
      const actorDom = fxCanvas.value?.parentElement?.querySelector(`.uni-member[data-idx="${ls.actor}"]`);
      const center = fxPos(actorDom);
      if (!center) return;
      let target = null;
      if (ls.charId === 1 || ls.charId === 3 || ls.charId === 9) {
        const enemy = uniState.combat.enemies.find((e) => e.alive);
        if (enemy) {
          const eDom = fxCanvas.value?.parentElement?.querySelector(`.uni-enemy[data-id="${enemy.id}"]`);
          target = fxPos(eDom);
        }
      }
      fx.value.skillFx(ls.charId, center, target);
    },
  );
  // 战斗结束 → 闪光
  watch(
    () => uniState.combat?.phase,
    (p, old) => {
      if (!fx.value) return;
      if (p === "won" && old !== p) {
        fx.value.flash(0xffe9b8, 0.3, 0.35);
        fx.value.celebrate();
      } else if (p === "lost" && old !== p) {
        fx.value.flash(0xc0553f, 0.4, 0.4);
        fx.value.shake(14, 0.5);
      }
    },
  );
  // 低血量警示：全队 HP ≤ 30% 时暗红雾渐显
  watch(
    () => {
      const t = uniState.team;
      const alive = t.filter((x) => x.alive);
      if (!alive.length) return 0;
      const ratio = alive.reduce((a, x) => a + x.hp / x.maxHp, 0) / alive.length;
      return ratio;
    },
    (ratio) => {
      if (!fx.value) return;
      fx.value.setLowHpFog(ratio <= 0.3 ? 0.32 : ratio <= 0.5 ? 0.14 : 0);
    },
  );
  // 首领战氛围：进入 boss 战斗时暗红压场
  watch(
    () => uniState.combat?.kind,
    (kind, old) => {
      if (!fx.value || kind === old) return;
      if (kind === "boss") {
        fx.value.flash(0x5a1010, 0.28, 0.5);
        fx.value.shake(8, 0.4);
      }
    },
  );
  // B4 敌人行动前兆：宣布行动时对应敌人卡红框脉冲
  watch(
    () => uniState.combat?.enemyPending?.enemyIdx,
    (idx, old) => {
      const parent = fxCanvas.value?.parentElement;
      if (!parent) return;
      if (old != null) {
        parent.querySelector(`.uni-enemy[data-id="${old}"]`)?.classList.remove("uni-enemy--warn");
      }
      if (idx == null) return;
      const dom = parent.querySelector(`.uni-enemy[data-id="${idx}"]`);
      if (dom) {
        dom.classList.add("uni-enemy--warn");
        setTimeout(() => dom.classList.remove("uni-enemy--warn"), 900);
      }
    },
  );
});

onBeforeUnmount(() => {
  if (fxObserver) {
    fxObserver.disconnect();
    fxObserver = null;
  }
  fx.value?.destroy();
  fx.value = null;
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
const transformLeft = computed(() => {
  const c = uniState.combat;
  if (!c || c.kind !== "transform") return 20;
  return Math.max(0, 20 - c.round);
});

// ---- 获得动画队列（祝福/奇物/方程：变暗 → 放大显效果 → 飞向背包，逐个播放，单击跳过） ----
const animQueue = ref([]); // [{ type, id }]
const blessingAnim = ref(null); // 当前播放项 { type, star, name, fate, desc, negative }
const blessCard = ref(null);
const lastPickPos = ref(null); // 三选一按钮点击位置（动画起点）
let animPlaying = false;
let blessTween = null;
let skipHandler = null;

function itemData(type, id) {
  const src = type === "curio" ? CURIOS : type === "equation" ? EQUATIONS : BLESSINGS;
  return src[id];
}

/** 三选一：记录点击位置并结算（动画由获得 watch 队列统一播放） */
function onPickBlessing(id, e) {
  const btn = e.currentTarget;
  const r = btn.getBoundingClientRect();
  lastPickPos.value = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  props.uni.doBlessingPick(id);
}

/** 追踪获得：祝福/奇物/方程新增或强化 → 入队逐个播放 */
function trackGains(getSeq, type) {
  watch(getSeq, (str, old) => {
    if (old == null) return;
    const parse = (s) => {
      const m = new Map();
      (s || "").split(",").filter(Boolean).forEach((x) => {
        const [id, ver] = x.split("@");
        m.set(id, ver);
      });
      return m;
    };
    const now = parse(str);
    const prev = parse(old);
    for (const [id, ver] of now) {
      if (!prev.has(id) || prev.get(id) !== ver) {
        animQueue.value.push({ type, id });
        playNext();
      }
    }
  });
}
trackGains(() => uniState.blessings.map((b) => `${b.id}@${b.enhanced || 1}x${b.heatEnhanced || 1}`).join(","), "blessing");
trackGains(() => uniState.curios.map((c) => `${c.id}@${c.enhanced || 1}`).join(","), "curio");
trackGains(() => uniState.equations.map((e) => `${e.id}@${e.enhanced || 1}`).join(","), "equation");

/** 逐个播放队列 */
async function playNext() {
  if (animPlaying || !animQueue.value.length) return;
  animPlaying = true;
  const item = animQueue.value.shift();
  const d = itemData(item.type, item.id);
  if (!d) {
    animPlaying = false;
    playNext();
    return;
  }
  blessingAnim.value = {
    type: item.type,
    star: d.star,
    name: d.name,
    fate: d.fate,
    desc: d.desc,
    negative: d.negative,
  };
  await nextTick();
  if (blessCard.value) await playCardAnim(blessCard.value);
  blessingAnim.value = null;
  // C2：飞入背包后金色粒子反馈
  if (fx.value) {
    const bagEl = document.querySelector(".uni-topbar__stat--bless");
    const br = bagEl ? bagEl.getBoundingClientRect() : { left: innerWidth / 2, top: 24, width: 0, height: 0 };
    fx.value.burst(br.left + br.width / 2, br.top + br.height / 2, {
      color: 0xffd54f, count: 12, speed: 160, lifetime: 0.65, size: 3,
    });
  }
  animPlaying = false;
  playNext();
}

/** 播放单个动画（自适应缩放，单击跳过） */
function playCardAnim(card) {
  return new Promise((resolve) => {
    const a = blessingAnim.value;
    // 自适应放大：保证不超出屏幕
    const scale = Math.min((innerWidth * 0.72) / 300, (innerHeight * 0.55) / 210, 2.4);
    const cx = innerWidth / 2;
    const cy = innerHeight / 2 - 16;
    const from = lastPickPos.value || { x: cx, y: innerHeight - 60 };
    lastPickPos.value = null;
    gsap.set(card, { x: from.x, y: from.y, scale: 0.25, opacity: 0 });
    gsap.set(".uni-bless-card__desc", { opacity: 0 });
    // 背包锚点：按类型飞向对应统计格
    const anchorSel = { blessing: ".uni-topbar__stat--bless", curio: ".uni-topbar__stat--curio", equation: ".uni-topbar__stat--equation" }[a.type] || ".uni-topbar__stat--bless";
    const bagEl = document.querySelector(anchorSel);
    const br = bagEl ? bagEl.getBoundingClientRect() : { left: innerWidth / 2, top: 24, width: 0, height: 0 };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (skipHandler) {
        document.removeEventListener("click", skipHandler);
        skipHandler = null;
      }
      resolve();
    };
    // 单击跳过：终止当前动画立即完成
    skipHandler = () => {
      if (blessTween) {
        blessTween.kill();
        blessTween = null;
      }
      finish();
    };
    document.addEventListener("click", skipHandler);
    blessTween = gsap.timeline({ onComplete: finish })
      .to(card, { opacity: 1, duration: 0.1 })
      .to(card, { x: cx, y: cy, scale, duration: 0.3, ease: "power2.out" })
      .to(".uni-bless-card__desc", { opacity: 1, duration: 0.18 }, "+=0.15")
      .to(".uni-bless-card__desc", { opacity: 0, duration: 0.1 }, "+=0.75")
      .to(card, {
        x: br.left + br.width / 2,
        y: br.top + br.height / 2,
        scale: 0.2,
        opacity: 0.45,
        duration: 0.35,
        ease: "power1.in",
      });
  });
}
const hasNextEvent = computed(
  () =>
    uniState.region?.eventIds &&
    (uniState.region.eventIdx || 0) < uniState.region.eventIds.length - 1,
);
function nextBtn() {
  return hasNextEvent.value ? "下一个事件 →" : "前往下一区域 →";
}
function onNext() {
  if (hasNextEvent.value) props.uni.goNextEvent();
  else props.uni.goNext();
}
const upgradable = computed(() =>
  uniState.team.filter((t) => t.alive && t.charId !== 11),
);

// ---- 背包弹层 ----
const bagOpen = ref(false);
// 日志入口：连点 3 次「模拟宇宙」标题（1.2 秒窗口）打开开发日志
const logOpen = ref(false);
let titleClicks = 0;
let titleTimer = null;
function onTitleClick() {
  titleClicks += 1;
  if (titleTimer) clearTimeout(titleTimer);
  titleTimer = setTimeout(() => {
    titleClicks = 0;
  }, 1200);
  if (titleClicks >= 3) {
    logOpen.value = true;
    titleClicks = 0;
  }
}
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
function bagBlessing(id) {  return BLESSINGS[id] || { name: id, desc: "", fate: "" };
}
function blessingFate(id) {
  return BLESSINGS[id]?.fate || "";
}
function patternName(e) {
  return ENEMY_PATTERNS?.[e.kind]?.[e.pattern]?.name || "";
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
/* ===== 暖暗色视觉体系（月圆之夜/杀戮尖塔参考） ===== */
/* SVG 噪点材质（feTurbulence 生成纸/布/颗粒纹理，程序化材质感） */
.uni-shell {
  --noise-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E");
  --noise-cloth: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='c'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.045 0.07' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23c)' opacity='0.8'/%3E%3C/svg%3E");
  --bg-0: #131110;
  --bg-1: #1a1713;
  --bg-2: #211d17;
  --line: rgba(222, 200, 158, 0.14);
  --line-strong: rgba(222, 200, 158, 0.32);
  --gold: #c8a25f;
  --gold-dim: #8f7440;
  --text: #e7ddc6;
  --text-dim: #a09478;
  --hp: #7fae6a;
  --enemy: #c0553f;
  --shield: #6d93b4;
  --skill: #9a6ac9;
  --radius: 10px;
  --radius-sm: 6px;
  max-width: 1024px;
  margin: 0 auto;
  padding: 14px;
  color: var(--text);
  font-size: 14px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  min-height: 100vh;
  position: relative;
  background:
    radial-gradient(900px 520px at 85% -10%, rgba(120, 90, 50, 0.12), transparent 55%),
    radial-gradient(800px 500px at 8% 110%, rgba(80, 60, 40, 0.1), transparent 55%),
    linear-gradient(180deg, #141210 0%, #100e0c 100%);
}
/* 极淡纸纹噪点（替代星星闪烁） */
/* 全局布纹材质（低频噪点，模拟旧布/石材基底） */
.uni-shell::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.16;
  background-image: var(--noise-cloth);
  mix-blend-mode: soft-light;
}
/* 四角暗角（vignette，做旧） */
.uni-shell::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(0, 0, 0, 0.42) 100%);
}
.uni-shell > * {
  position: relative;
  z-index: 1;
}
/* ===== 卡片材质层：颗粒噪点 + 边缘暗角（做旧纸感） ===== */
.uni-panel::after,
.uni-topbar::after,
.uni-member::after,
.uni-enemy::after,
.uni-choice__card::after,
.uni-modal__box::after,
.uni-bag-item::after,
.uni-shop-item::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
  background-image:
    var(--noise-grain),
    radial-gradient(ellipse at 50% 35%, transparent 50%, rgba(0, 0, 0, 0.4) 100%);
  background-blend-mode: overlay, normal;
  opacity: 0.12;
}
.uni-panel > *,
.uni-topbar > *,
.uni-member > *,
.uni-enemy > *,
.uni-choice__card > *,
.uni-modal__box > *,
.uni-bag-item > *,
.uni-shop-item > * {
  position: relative;
  z-index: 1;
}
/* 顶栏：暖暗底 + 细金边 */
.uni-topbar {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 14px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-top: 2px solid var(--gold-dim);
  border-radius: var(--radius);
  margin-bottom: 12px;
  flex-wrap: wrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}
.uni-topbar__title {
  font-weight: bold;
  color: var(--gold);
  letter-spacing: 3px;
  font-size: 15px;
  cursor: pointer;
}
.uni-topbar__info {
  color: var(--text-dim);
}
.uni-topbar__stat {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--line);
  padding: 2px 9px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--text);
}
.uni-topbar__stat::before {
  content: "▪";
  color: var(--gold);
  margin-right: 5px;
  font-size: 9px;
  vertical-align: 1px;
}
.uni-topbar__spacer {
  flex: 1;
}
/* 面板：暖暗底 + 顶部色条 */
.uni-panel {
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px 20px;
  text-align: center;
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.45);
  animation: uniPop 0.2s ease;
  position: relative;
}
.uni-panel::before {
  content: "";
  position: absolute;
  top: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--gold-dim), transparent);
}
@keyframes uniPop {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.uni-panel__title {
  margin: 0 0 6px;
  color: var(--gold);
  font-size: 17px;
  letter-spacing: 2px;
}
.uni-panel__desc {
  color: var(--text-dim);
  margin: 6px 0 14px;
}
.uni-panel__gain {
  font-size: 22px;
  color: var(--gold);
  font-weight: bold;
}
.uni-panel--over {
  border-color: rgba(192, 85, 63, 0.5);
}
.uni-panel--over::before {
  background: linear-gradient(90deg, transparent, var(--enemy), transparent);
}
/* 选择卡 */
.uni-choice {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.uni-choice__card {
  background: var(--bg-1);
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: var(--radius);
  padding: 12px 16px;
  cursor: pointer;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  font-size: 14px;
  transition: transform 0.12s, border-color 0.12s;
}
.uni-choice__card:hover {
  transform: translateY(-2px);
  border-color: var(--gold);
  background: var(--bg-2);
}
.uni-choice__icon {
  font-size: 24px;
}
.uni-choice__name {
  font-weight: 600;
}
.uni-choice__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--gold-dim);
}
/* 按钮：暗色 + 类型色 */
.uni-btn {
  background: var(--bg-2);
  border: 1px solid var(--line-strong);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: 7px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: transform 0.1s, border-color 0.1s, filter 0.1s;
}
.uni-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--gold);
}
.uni-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.uni-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.uni-btn--sm { padding: 3px 9px; font-size: 12px; }
.uni-btn--big { padding: 11px 26px; font-size: 16px; margin-top: 10px; }
.uni-btn--primary { background: var(--gold-dim); border-color: var(--gold); font-weight: bold; color: #1a1408; }
.uni-btn--danger { background: #4a2018; border-color: var(--enemy); font-weight: bold; color: #ffd9c9; }
.uni-btn--attack { background: #4a2018; border-color: var(--enemy); font-weight: bold; color: #ffd9c9; }
.uni-btn--defense { background: #1c2c3a; border-color: var(--shield); font-weight: bold; color: #cfe6ff; }
.uni-btn--skill { background: #2a1c3a; border-color: var(--skill); font-weight: bold; color: #ecd9ff; }
.uni-btn--cancel { background: var(--bg-1); color: var(--text-dim); }
/* 行动顺序条 */
.uni-order {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 8px 12px;
  background: linear-gradient(160deg, rgba(30, 20, 64, 0.8), rgba(14, 8, 34, 0.86));
  border: 1px solid rgba(222, 200, 158, 0.28);
  border-radius: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
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
  background: linear-gradient(135deg, rgba(200, 162, 95, 0.35), rgba(200, 162, 95, 0.15));
  border-color: var(--gold);
  box-shadow: 0 0 14px rgba(200, 162, 95, 0.5);
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
  position: relative;
}
/* PIXI 特效画布：覆盖战斗区（尺寸由 PIXI 控制并随父容器同步），事件穿透 */
.uni-fx-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
/* 转化层倒计时 */
.uni-transform-timer {
  position: relative;
  z-index: 3;
  align-self: center;
  padding: 3px 14px;
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--gold);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--line);
  border-radius: 4px;
  margin-bottom: -4px;
}
.uni-transform-timer--danger {
  color: #ffb08a;
  border-color: var(--enemy);
  animation: uniTimerPulse 1s ease-in-out infinite;
}
@keyframes uniTimerPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.uni-battle__board {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 12px;
  position: relative;
  z-index: 1;
}
.uni-battle__team,
.uni-battle__enemies {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* 受击抖动（成员/敌人通用，lastDamage 确定性触发） */
.uni-hit-shake {
  animation: uniShakeHard 0.35s ease;
}
@keyframes uniShakeHard {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-8px) rotate(-0.7deg); }
  30% { transform: translateX(7px) rotate(0.6deg); }
  45% { transform: translateX(-5px); }
  60% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}
/* 获得动画（祝福/奇物/方程） */
.uni-bless-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(8, 6, 4, 0.72);
  animation: uniBlessDim 0.25s ease forwards;
  cursor: pointer;
}
@keyframes uniBlessDim {
  from { opacity: 0; }
  to { opacity: 1; }
}
.uni-bless-card {
  position: fixed;
  left: 0;
  top: 0;
  width: 300px;
  margin-left: -150px;
  margin-top: -105px;
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  border: 2px solid var(--gold);
  border-radius: 14px;
  padding: 18px 20px;
  text-align: center;
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.7);
  will-change: transform, opacity;
  pointer-events: none;
}
.uni-bless-card--curio { border-color: #8fd0c0; }
.uni-bless-card--equation { border-color: #b08cff; }
.uni-bless-card__star {
  color: var(--gold);
  letter-spacing: 2px;
  font-size: 14px;
}
.uni-bless-card--curio .uni-bless-card__star { color: #8fd0c0; }
.uni-bless-card--equation .uni-bless-card__star { color: #b08cff; }
.uni-bless-card__name {
  font-size: 20px;
  font-weight: bold;
  color: var(--text);
  margin: 6px 0 4px;
  letter-spacing: 1px;
}
.uni-bless-card__fate {
  font-size: 12px;
  color: var(--gold);
  margin-bottom: 10px;
}
.uni-bless-card--curio .uni-bless-card__fate { color: #8fd0c0; }
.uni-bless-card--equation .uni-bless-card__fate { color: #b08cff; }
.uni-bless-card__desc {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-dim);
  opacity: 0;
}
/* 成员卡：暖暗底 + 金色顶部条 */
.uni-member {
  position: relative;
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--line);
  border-top: 2px solid var(--gold-dim);
  border-radius: var(--radius);
  padding: 9px 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: border-color 0.15s, transform 0.12s;
}
.uni-member--active {
  border-color: var(--gold);
  border-top-color: var(--gold);
}
.uni-member--dead {
  opacity: 0.4;
  filter: grayscale(0.8);
}
.uni-member--hit {
  animation: uniHit 0.3s ease;
}
@keyframes uniHit {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  50% { transform: translateX(3px); }
  75% { transform: translateX(-2px); }
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
  border: 2px solid var(--gold-dim);
  background: rgba(0, 0, 0, 0.4);
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
  background: rgba(0, 0, 0, 0.55);
}
.uni-member__main {
  flex: 1;
}
.uni-member__name {
  font-weight: bold;
  font-size: 15px;
}
.uni-member__target {
  cursor: pointer;
}
.uni-member--target:hover {
  border-color: var(--gold);
}
/* 血条 */
.uni-bar {
  height: 8px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 3px;
  overflow: hidden;
  margin: 5px 0 3px;
}
.uni-bar__fill {
  height: 100%;
  transition: width 0.35s ease;
}
.uni-bar__fill--hp {
  background: var(--hp);
}
.uni-bar__fill--enemy {
  background: var(--enemy);
}
.uni-member__hpnum,
.uni-enemy__hpnum {
  font-size: 12px;
  color: var(--text-dim);
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
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--line);
  color: var(--text-dim);
}
.uni-tag--shield { background: rgba(109, 147, 180, 0.25); color: #bcd8f0; border-color: rgba(109, 147, 180, 0.4); }
.uni-tag--bad { background: rgba(192, 85, 63, 0.28); color: #f0b8a8; border-color: rgba(192, 85, 63, 0.45); }
.uni-tag--dot { background: rgba(200, 120, 60, 0.28); color: #f0cfa8; border-color: rgba(200, 120, 60, 0.45); }
.uni-tag--spirit { background: rgba(200, 120, 60, 0.32); color: #f0cfa8; }
.uni-tag--moon { background: rgba(140, 110, 170, 0.32); color: #dcc9ef; }
.uni-tag--fate { background: rgba(100, 130, 160, 0.3); color: #c0d8ec; font-size: 11px; }
.uni-tag--pattern { background: rgba(200, 160, 90, 0.32); color: #e8d4a8; font-size: 11px; }
.uni-tag--elite { background: rgba(154, 106, 201, 0.3); color: #dcc3f0; border-color: rgba(154, 106, 201, 0.45); }
.uni-tag--boss { background: rgba(200, 162, 95, 0.4); color: #20180a; border-color: rgba(200, 162, 95, 0.5); }
.uni-tag--boost { background: rgba(200, 162, 95, 0.35); color: #e8d4a8; }
.uni-member__skill {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.uni-member__cd { color: var(--gold); margin-left: 4px; }
.uni-member__ready { color: var(--hp); margin-left: 4px; }
.uni-member__passive { color: var(--text-dim); margin-left: 4px; }
/* 敌人卡：暖暗底 + 暗红顶部条 */
.uni-enemy {
  position: relative;
  background: linear-gradient(180deg, #241715, var(--bg-1));
  border: 1px solid var(--line);
  border-top: 2px solid var(--enemy);
  border-radius: var(--radius);
  padding: 9px 11px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: border-color 0.15s, transform 0.12s;
}
.uni-enemy:hover:not(.uni-enemy--dead) {
  border-color: var(--enemy);
  transform: translateY(-1px);
}
.uni-enemy--dead {
  opacity: 0.35;
  filter: grayscale(1);
  cursor: default;
}
.uni-enemy--target {
  border-color: var(--gold);
  border-top-color: var(--gold);
}
.uni-enemy--hit {
  animation: uniHitEnemy 0.3s ease;
}
/* B4 行动前兆：红框脉冲 */
.uni-enemy--warn {
  animation: uniWarnPulse 0.5s ease-in-out infinite;
  border-color: var(--enemy);
}
@keyframes uniWarnPulse {
  0%, 100% { box-shadow: 0 0 0 rgba(192, 85, 63, 0); }
  50% { box-shadow: 0 0 12px rgba(192, 85, 63, 0.65); }
}
@keyframes uniHitEnemy {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  50% { transform: translateX(3px); }
  75% { transform: translateX(-2px); }
}
.uni-enemy__name {
  font-weight: bold;
  color: #e8b3a5;
}
/* 操作区：暖暗底 */
.uni-battle__action {
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--line);
  border-top: 2px solid var(--gold-dim);
  border-radius: var(--radius);
  padding: 12px;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  position: relative;
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
  color: var(--gold);
}
.uni-battle__turn {
  color: var(--text-dim);
  font-size: 12px;
}
/* 扑克牌：羊皮纸质感 */
.uni-poker {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(255, 252, 240, 0.5), transparent 60%),
    linear-gradient(155deg, #f5eeda 0%, #e8dfc4 60%, #d9cdaa 100%);
  color: #2a2115;
  border-radius: 7px;
  padding: 6px 13px 5px;
  min-width: 52px;
  min-height: 62px;
  border: 1px solid rgba(0, 0, 0, 0.4);
  box-shadow:
    0 3px 8px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    inset 0 0 0 1px rgba(120, 90, 40, 0.15),
    inset 0 4px 10px rgba(90, 60, 20, 0.18);
  position: relative;
  animation: uniDeal 0.25s ease;
  transform: rotate(-1.5deg);
  overflow: hidden;
}
/* 羊皮纸噪点 + 四角暗角 */
.uni-poker::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    var(--noise-grain),
    radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(90, 60, 20, 0.25) 100%);
  opacity: 0.22;
}
.uni-poker__rank,
.uni-poker__suit {
  position: relative;
  z-index: 1;
}
@keyframes uniDeal {
  from { transform: translateY(-12px) rotate(-5deg); opacity: 0; }
  to { transform: rotate(-1.5deg); opacity: 1; }
}
.uni-poker__rank {
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  font-family: Georgia, serif;
}
.uni-poker__suit {
  font-size: 19px;
  line-height: 1.1;
}
.uni-poker__rank--♥, .uni-poker__rank--♦ { color: #a8322a; }
.uni-poker__rank--♠, .uni-poker__rank--♣ { color: #2a2115; }
.uni-battle__buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.uni-battle__msg {
  margin-top: 8px;
  color: #ffb05c;
  min-height: 18px;
  text-shadow: 0 0 8px rgba(200, 162, 95, 0.3);
}
/* 飘字：描边更醒目 */
.uni-fx {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 18px;
  font-weight: bold;
  color: #ff6b6b;
  text-shadow:
    -1px -1px 0 rgba(0, 0, 0, 0.8),
    1px -1px 0 rgba(0, 0, 0, 0.8),
    -1px 1px 0 rgba(0, 0, 0, 0.8),
    1px 1px 0 rgba(0, 0, 0, 0.8),
    0 0 10px rgba(255, 60, 60, 0.6);
  pointer-events: none;
  animation: uniFloat 1s ease-out forwards;
  z-index: 5;
}
.uni-fx--shield { color: #6bb3ff; text-shadow: -1px -1px 0 rgba(0,0,0,.8),1px -1px 0 rgba(0,0,0,.8),-1px 1px 0 rgba(0,0,0,.8),1px 1px 0 rgba(0,0,0,.8),0 0 10px rgba(90,160,255,.6); }
@keyframes uniFloat {
  0% { opacity: 1; transform: translateY(0) scale(1.15); }
  100% { opacity: 0; transform: translateY(-34px) scale(1); }
}
/* 商店 */
.uni-shop-section {
  text-align: left;
  margin: 12px 0;
}
.uni-shop-section__title {
  color: var(--gold);
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
  color: var(--gold);
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
  border-color: rgba(200, 162, 95, 0.5);
}
.uni-charsel__card--selected {
  border-color: var(--gold);
  background: rgba(200, 162, 95, 0.15);
  box-shadow: 0 0 10px rgba(200, 162, 95, 0.35);
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
  background: var(--gold);
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
  color: var(--text-dim);
}
/* 模态弹层 */
.uni-modal {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at 50% 30%, rgba(30, 12, 60, 0.55), rgba(0, 0, 0, 0.78));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(6px);
  animation: uniFadeIn 0.18s ease;
}
@keyframes uniFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.uni-modal__box {
  background: linear-gradient(160deg, rgba(42, 28, 92, 0.94), rgba(16, 9, 38, 0.96));
  border: 1px solid rgba(222, 200, 158, 0.4);
  border-radius: 18px;
  padding: 24px;
  min-width: 320px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.65),
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 0 0 1px rgba(255, 255, 255, 0.03);
  animation: uniPop 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
}
.uni-modal__box::before {
  content: "";
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(222, 200, 158, 0.7), transparent);
}
.uni-modal__title {
  margin: 0 0 6px;
  color: var(--gold);
  text-shadow: 0 0 14px rgba(200, 162, 95, 0.35);
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
  background: rgba(200, 162, 95, 0.25);
  border-color: var(--gold);
  color: var(--gold);
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
  background: rgba(200, 162, 95, 0.08);
}
.uni-bag-item--open {
  border-color: rgba(200, 162, 95, 0.4);
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
  color: var(--text-dim);
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
  color: var(--gold);
}
@media (max-width: 640px) {
  .uni-shell {
    padding: 8px;
  }
}
</style>


