// LCU 对局 participant.stats 字段的中文释义与分组。未列出的字段会自动进入"其他字段",保证不遗漏。
// type: n=数字 b=布尔 s=秒(时长) 
export const STAT_GROUPS = [
  {
    title: '战斗',
    rows: [
      ['kills', '击杀'], ['deaths', '死亡'], ['assists', '助攻'], ['champLevel', '英雄等级'],
      ['largestKillingSpree', '最大连杀'], ['killingSprees', '连杀次数'], ['largestMultiKill', '最大多杀'],
      ['doubleKills', '双杀'], ['tripleKills', '三杀'], ['quadraKills', '四杀'], ['pentaKills', '五杀'], ['unrealKills', '超神击杀'],
      ['firstBloodKill', '拿到一血', 'b'], ['firstBloodAssist', '助攻一血', 'b'],
      ['longestTimeSpentLiving', '最长存活时间', 's'],
    ],
  },
  {
    title: '输出伤害',
    rows: [
      ['totalDamageDealtToChampions', '对英雄总伤害'], ['physicalDamageDealtToChampions', '对英雄物理伤害'],
      ['magicDamageDealtToChampions', '对英雄魔法伤害'], ['trueDamageDealtToChampions', '对英雄真实伤害'],
      ['totalDamageDealt', '总伤害(含小兵/野怪)'], ['physicalDamageDealt', '物理伤害(总)'],
      ['magicDamageDealt', '魔法伤害(总)'], ['trueDamageDealt', '真实伤害(总)'], ['largestCriticalStrike', '最大暴击'],
    ],
  },
  {
    title: '承伤 / 治疗 / 控制',
    rows: [
      ['totalDamageTaken', '承受总伤害'], ['physicalDamageTaken', '承受物理伤害'], ['magicalDamageTaken', '承受魔法伤害'],
      ['trueDamageTaken', '承受真实伤害'], ['damageSelfMitigated', '自身减免伤害'], ['totalHeal', '治疗量'],
      ['totalUnitsHealed', '治疗目标数'], ['timeCCingOthers', '控制时间(有效)', 's'], ['totalTimeCrowdControlDealt', '控制时间(总)', 's'],
    ],
  },
  {
    title: '经济 / 补刀',
    rows: [
      ['goldEarned', '获得金币'], ['goldSpent', '花费金币'], ['totalMinionsKilled', '小兵击杀'],
      ['neutralMinionsKilled', '野怪击杀'], ['neutralMinionsKilledTeamJungle', '己方野区野怪'],
      ['neutralMinionsKilledEnemyJungle', '敌方野区野怪'],
    ],
  },
  {
    title: '视野',
    rows: [
      ['visionScore', '视野得分'], ['wardsPlaced', '放置守卫'], ['wardsKilled', '摧毁守卫'],
      ['visionWardsBoughtInGame', '购买控制守卫'], ['sightWardsBoughtInGame', '购买侦查守卫'],
    ],
  },
  {
    title: '建筑 / 目标',
    rows: [
      ['turretKills', '摧毁防御塔'], ['inhibitorKills', '摧毁水晶'], ['damageDealtToTurrets', '对防御塔伤害'],
      ['damageDealtToObjectives', '对目标伤害'], ['firstTowerKill', '摧毁一塔', 'b'], ['firstTowerAssist', '助攻一塔', 'b'],
      ['firstInhibitorKill', '摧毁首个水晶', 'b'], ['firstInhibitorAssist', '助攻首个水晶', 'b'], ['objectivePlayerScore', '目标得分'],
    ],
  },
  {
    title: '得分 / 排名',
    rows: [
      ['totalPlayerScore', '总得分'], ['combatPlayerScore', '战斗得分'], ['totalScoreRank', '得分排名'],
      ['playerScore0', 'playerScore0'], ['playerScore1', 'playerScore1'], ['playerScore2', 'playerScore2'], ['playerScore3', 'playerScore3'],
      ['playerScore4', 'playerScore4'], ['playerScore5', 'playerScore5'], ['playerScore6', 'playerScore6'], ['playerScore7', 'playerScore7'],
      ['playerScore8', 'playerScore8'], ['playerScore9', 'playerScore9'],
      ['playerSubteamId', '小队 ID'], ['subteamPlacement', '小队名次'],
    ],
  },
  {
    title: '结果 / 投降',
    rows: [
      ['win', '获胜', 'b'], ['gameEndedInSurrender', '以投降结束', 'b'], ['gameEndedInEarlySurrender', '以提前投降结束', 'b'],
      ['gameEndedInIGNBSurrender', 'IGNB 投降结束', 'b'], ['causedEarlySurrender', '发起提前投降', 'b'],
      ['earlySurrenderAccomplice', '附议提前投降', 'b'], ['teamEarlySurrendered', '队伍提前投降', 'b'],
      ['causedGameEndFromIGNBSurrender', '发起 IGNB 投降', 'b'], ['wasSevereTransgressor', '严重违规', 'b'], ['roleBoundItem', '职责装备'],
    ],
  },
];

export const KNOWN_KEYS = new Set(STAT_GROUPS.flatMap((g) => g.rows.map((r) => r[0])));
export const isItemKey = (k) => /^item\d$/.test(k);
export const isPerkKey = (k) => /^perk\d(Var\d)?$/.test(k) || k === 'perkPrimaryStyle' || k === 'perkSubStyle';
export const isAugKey = (k) => /^playerAugment\d$/.test(k);

export const TEAM_FIELDS = {
  towerKills: '防御塔', inhibitorKills: '水晶', baronKills: '纳什男爵', dragonKills: '巨龙', riftHeraldKills: '峡谷先锋',
  hordeKills: '虚空幼虫', vilemawKills: '维莱默', dominionVictoryScore: '占领得分',
};
export const TEAM_FIRSTS = { firstBlood: '一血', firstTower: '一塔', firstInhibitor: '首水晶', firstBaron: '首男爵', firstDragon: '首龙' };

export const GAME_FIELDS = {
  gameId: '对局 ID', gameCreation: '创建时间(ms)', gameCreationDate: '创建时间(UTC)', gameDuration: '时长(秒)', gameMode: '游戏模式',
  gameType: '游戏类型', gameVersion: '游戏版本', mapId: '地图 ID', queueId: '队列 ID', platformId: '服务器', seasonId: '赛季 ID',
  endOfGameResult: '结束结果', gameModeMutators: '模式变体',
};
