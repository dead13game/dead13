<template>
  <div class="game-over">
    <div class="game-over__banner">
      <div class="game-over__icon"></div>
      <div class="game-over__text">
        <div class="game-over__title">游戏结束！</div>
        <div class="game-over__winner">{{ winner.name }} 获胜！</div>
      </div>
    </div>
    <button class="ab ab--restart" @click="$emit('restart')"> 再来一局</button>
  </div>
</template>

<script setup>
defineProps({
  winner: { type: Object, default: null }
})
defineEmits(['restart'])
</script>

<style scoped>
.game-over {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 24px; background: linear-gradient(135deg, #fff8e1, #fff3e0);
  border-radius: 16px; border: 2px solid #ffb300;
}
.game-over__banner { display: flex; align-items: center; gap: 12px; }
.game-over__icon { font-size: 40px; }
.game-over__title { font-size: 22px; font-weight: bold; color: #333; }
.game-over__winner { font-size: 16px; color: #e65100; font-weight: bold; }
.ab--restart { background: #1565C0; color: #fff; font-size: 15px; padding: 10px 28px; margin-top: 8px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.15s; }
.ab--restart:hover { transform: translateY(-2px); box-shadow: 0 3px 8px rgba(0,0,0,0.2); }
</style>
