class_name GamePlayer
## Player 工厂函数（从 src/game/player.js 移植）
## 纯逻辑层，零依赖

static func create_player(index: int, char_data: Dictionary, name: String = "", team_id: int = -1) -> Dictionary:
	var display_name: String = name if not name.is_empty() else "玩家 %d" % (index + 1)
	return {
		"index": index,
		"teamId": team_id,
		"name": display_name,
		"characterId": int(char_data.get("id", 0)),
		"hp": int(char_data.get("hp", 0)),
		"maxHp": int(char_data.get("hp", 0)),
		"alive": true,
		"defensePile": [],
		"trap": null,
		"bait": null,
		"skillUses": char_data.get("maxUses", 0),
		"fightingSpirit": 0,
		"moonPhase": 0,
		"loadUses": char_data.get("loadMaxUses", 0),
		"statusEffects": {
			"frozenBy": null,
			"stealTarget": null,
			"dotTarget": null,
			"damageBonus": {},
			"ignoreTrapThisTurn": false,
			"extraAction": false,
			"savepoint": null,
		},
		"relations": {
			"allyIndex": null,
			"allianceTurns": 0,
			"betrayalPenalty": 0,
			"allyKillBonus": false,
			"consecutiveGambles": 0,
			"gamblePenalty": false,
		},
		"artifactId": null,
		"breakCount": 0,
		"holyWordUses": 2,
		"artifactActive": false,
		"artifactRoundsLeft": 0,
		"isAI": false,
		"aiDifficulty": null,
	}
