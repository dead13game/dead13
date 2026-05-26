fpath = r'C:\Users\drtion\.openclaw\workspace\亡命十三街\src\components\GameBoard.vue'
with open(fpath, 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Attack card: remove Transition wrapper, add class directly
old_attack = '''            <Transition name="deck-fly">
              <Card v-if="pendingAttackCard" :key="'atk-' + pendingAttackCard.id" :card="pendingAttackCard" :alwaysFaceUp="true" />
            </Transition>'''
new_attack = '''            <Card v-if="pendingAttackCard" :key="'atk-' + pendingAttackCard.id" :card="pendingAttackCard" :alwaysFaceUp="true" class="card-deck-fly card-flip-in" />'''
c = c.replace(old_attack, new_attack)

# 2. Gamble cards: remove TransitionGroup wrapper, add class directly
old_gamble_start = '''          <TransitionGroup name="deck-fly" tag="div" class="gamble-cards">'''
new_gamble_start = '''          <div class="gamble-cards">'''
c = c.replace(old_gamble_start, new_gamble_start)

# 3. Close TransitionGroup -> close div
old_gamble_end = '''          </TransitionGroup>'''
new_gamble_end = '''          </div>'''
c = c.replace(old_gamble_end, new_gamble_end)

# 4. Add card-deck-fly class to gamble cards
c = c.replace(
    '<Card :card="card" :alwaysFaceUp="true" />\n              <div class="gamble-card__btns">',
    '<Card :card="card" :alwaysFaceUp="true" class="card-deck-fly card-flip-in" />\n              <div class="gamble-card__btns">'
)

with open(fpath, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
