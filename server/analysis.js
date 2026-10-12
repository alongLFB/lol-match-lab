// 对局数据加工:把 LCU 原始对局 + 时间线 转为易展示/易分析的摘要(digest)
'use strict';

const ZERO_PUUID = '00000000-0000-0000-0000-000000000000';
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, d = 2) => (isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0);

function displayName(player = {}) {
  if (player.gameName) return player.tagLine ? `${player.gameName}#${player.tagLine}` : player.gameName;
  return player.summonerName || player.summonerId?.toString() || '未知玩家';
}

/** 玩家唯一 key:优先 puuid */
function playerKey(player = {}) {
  if (player.puuid && player.puuid !== ZERO_PUUID) return player.puuid;
  return 'name:' + displayName(player);
}

function winOf(team) {
  return team?.win === 'Win' || team?.win === true;
}

function isAram(g = {}) {
  const mode = String(g.gameMode || '').toUpperCase();
  const mapId = Number(g.mapId || 0);
  const queueId = Number(g.queueId || 0);
  return mode === 'ARAM' || mapId === 12 || queueId === 450 || queueId === 100;
}

function hasStandardLanes(g = {}) {
  if (isAram(g)) return false;
  const mode = String(g.gameMode || '').toUpperCase();
  const mapId = Number(g.mapId || 0);
  const queueId = Number(g.queueId || 0);
  if (mode === 'CHERRY' || mapId === 30 || queueId === 1700 || queueId === 1710) return false;
  // 只有召唤师峡谷 (Summoner's Rift: mapId 11 或 CLASSIC 模式) 才有标准 5 分路
  return mapId === 11 || mode === 'CLASSIC';
}

function buildDigest(bundle) {
  const g = bundle.game;
  if (!g) return null;
  const minutes = Math.max(1, num(g.gameDuration) / 60);
  const idMap = new Map((g.participantIdentities || []).map((i) => [i.participantId, i.player || {}]));
  const tlLane = {};
  const isAramMode = isAram(g);
  const hasLanes = hasStandardLanes(g);

  const players = (g.participants || []).map((p) => {
    const s = p.stats || {};
    const pl = idMap.get(p.participantId) || {};
    tlLane[p.participantId] = p.timeline || {};
    const items = [0, 1, 2, 3, 4, 5, 6].map((i) => s['item' + i] || 0);
    const perks = [0, 1, 2, 3, 4, 5].map((i) => s['perk' + i] || 0);
    const augments = [1, 2, 3, 4, 5, 6].map((i) => s['playerAugment' + i] || 0).filter(Boolean);
    return {
      participantId: p.participantId,
      key: playerKey(pl),
      puuid: pl.puuid || '',
      summonerId: pl.summonerId || 0,
      name: displayName(pl),
      gameName: pl.gameName || '',
      tagLine: pl.tagLine || '',
      profileIcon: pl.profileIcon || 0,
      championId: p.championId,
      teamId: p.teamId,
      win: !!s.win,
      spells: [p.spell1Id, p.spell2Id],
      items,
      perks,
      perkPrimaryStyle: s.perkPrimaryStyle || 0,
      perkSubStyle: s.perkSubStyle || 0,
      augments,
      lane: p.timeline?.lane || '',
      role: p.timeline?.role || '',
      level: num(s.champLevel),
      kills: num(s.kills),
      deaths: num(s.deaths),
      assists: num(s.assists),
      dmg: num(s.totalDamageDealtToChampions),
      physDmg: num(s.physicalDamageDealtToChampions),
      magicDmg: num(s.magicDamageDealtToChampions),
      trueDmg: num(s.trueDamageDealtToChampions),
      dmgTaken: num(s.totalDamageTaken),
      mitigated: num(s.damageSelfMitigated),
      heal: num(s.totalHeal),
      gold: num(s.goldEarned),
      goldSpent: num(s.goldSpent),
      cs: num(s.totalMinionsKilled) + num(s.neutralMinionsKilled),
      vision: num(s.visionScore),
      wardsPlaced: num(s.wardsPlaced),
      wardsKilled: num(s.wardsKilled),
      controlWards: num(s.visionWardsBoughtInGame),
      cc: num(s.timeCCingOthers),
      objDmg: num(s.damageDealtToObjectives),
      turretDmg: num(s.damageDealtToTurrets),
      turretKills: num(s.turretKills),
      inhibKills: num(s.inhibitorKills),
      largestMultiKill: num(s.largestMultiKill),
      doubleKills: num(s.doubleKills),
      tripleKills: num(s.tripleKills),
      quadraKills: num(s.quadraKills),
      pentaKills: num(s.pentaKills),
      largestKillingSpree: num(s.largestKillingSpree),
      firstBlood: !!(s.firstBloodKill || s.firstBloodAssist),
      firstBloodKill: !!s.firstBloodKill,
      firstTower: !!(s.firstTowerKill || s.firstTowerAssist),
      subteamId: s.playerSubteamId || 0,
      placement: s.subteamPlacement || 0,
    };
  });

  const teamIds = [...new Set(players.map((p) => p.teamId))];
  const teams = teamIds.map((tid) => {
    const mem = players.filter((p) => p.teamId === tid);
    const raw = (g.teams || []).find((t) => t.teamId === tid) || {};
    const sum = (k) => mem.reduce((a, p) => a + p[k], 0);
    const win = raw.win != null ? winOf(raw) : mem.some((p) => p.win);
    return {
      teamId: tid,
      win,
      kills: sum('kills'),
      deaths: sum('deaths'),
      assists: sum('assists'),
      gold: sum('gold'),
      dmg: sum('dmg'),
      dmgTaken: sum('dmgTaken'),
      vision: sum('vision'),
      cs: sum('cs'),
      objectives: {
        towerKills: num(raw.towerKills),
        inhibitorKills: num(raw.inhibitorKills),
        baronKills: num(raw.baronKills),
        dragonKills: num(raw.dragonKills),
        riftHeraldKills: num(raw.riftHeraldKills),
        hordeKills: num(raw.hordeKills),
        vilemawKills: num(raw.vilemawKills),
        firstBlood: !!raw.firstBlood,
        firstTower: !!raw.firstTower,
        firstInhibitor: !!raw.firstInhibitor,
        firstBaron: !!raw.firstBaron,
        firstDragon: !!raw.firstDargon,
        dominionVictoryScore: num(raw.dominionVictoryScore),
      },
      bans: raw.bans || [],
      playerIds: mem.map((p) => p.participantId),
    };
  });

  // 衍生指标
  for (const p of players) {
    const t = teams.find((x) => x.teamId === p.teamId);
    p.kda = round((p.kills + p.assists) / Math.max(1, p.deaths));
    p.kp = t && t.kills ? round((p.kills + p.assists) / t.kills, 3) : 0;
    p.dmgShare = t && t.dmg ? round(p.dmg / t.dmg, 3) : 0;
    p.takenShare = t && t.dmgTaken ? round(p.dmgTaken / t.dmgTaken, 3) : 0;
    p.goldShare = t && t.gold ? round(p.gold / t.gold, 3) : 0;
    p.deathShare = t && t.deaths ? round(p.deaths / t.deaths, 3) : 0;
    p.csPerMin = round(p.cs / minutes, 1);
    p.dmgPerMin = round(p.dmg / minutes, 0);
    p.goldPerMin = round(p.gold / minutes, 0);
    p.visionPerMin = round(p.vision / minutes, 2);
    // 本地参考分(0-10),仅用于相对比较,不是官方评分
    // 大乱斗等非视野模式不应因没有插眼视野而受到 -0.6 的惩罚扣分
    const visionFactor = isAramMode ? 0 : clamp((p.visionPerMin - 0.8) * 0.8, -0.6, 0.8);
    const raw =
      5 +
      clamp((p.kda - 3) * 0.35, -2, 2.2) +
      clamp((p.kp - 0.5) * 3, -1.5, 1.5) +
      clamp((p.dmgShare - 0.2) * 7, -1.5, 2) +
      clamp((p.deathShare - 0.2) * -4, -1, 0.6) +
      visionFactor +
      (p.win ? 0.6 : -0.2);
    p.score = round(clamp(raw, 0, 10), 1);
  }
  // MVP(胜方最高分)/ ACE(败方最高分)
  for (const t of teams) {
    const mem = players.filter((p) => p.teamId === t.teamId);
    const best = mem.reduce((a, b) => (b.score > a.score ? b : a), mem[0]);
    if (best) best.badge = t.win ? 'MVP' : 'ACE';
  }
  const timelineDigest = buildTimelineDigest(bundle.timeline, players);
  inferAndNormalizeLanes(players, timelineDigest, g);

  return {
    gameId: g.gameId,
    gameCreation: g.gameCreation,
    gameDuration: g.gameDuration,
    queueId: g.queueId,
    gameMode: g.gameMode,
    gameType: g.gameType,
    mapId: g.mapId,
    gameVersion: g.gameVersion,
    platformId: g.platformId || (g.gameId > 5000000000 ? 'EUW1' : (g.gameId > 10000000 && g.gameId < 50000000 ? 'ME1' : '')),
    endOfGameResult: g.endOfGameResult,
    isCustom: g.gameType === 'CUSTOM_GAME',
    isAram: isAramMode,
    hasLanes,
    teams,
    players,
    timeline: timelineDigest,
  };
}

const SUPPORT_ITEM_IDS = new Set([
  // S14+ 辅助装
  3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877,
  // 经典辅助装
  3850, 3851, 3853, 3854, 3855, 3857, 3858, 3859, 3860, 3862, 3863, 3864,
]);

const LANE_CN = {
  TOP: '上单',
  JUNGLE: '打野',
  MIDDLE: '中单',
  MID: '中单',
  BOTTOM: '下路',
  BOT: '下路',
  UTILITY: '辅助',
  SUPPORT: '辅助',
};

/** 智能推断与纠正每位玩家的分路与定位 (只在召唤师峡谷生效，大乱斗等模式不分配分路) */
function inferAndNormalizeLanes(players, timelineDigest, gameMeta = {}) {
  if (!hasStandardLanes(gameMeta)) {
    // 极地大乱斗 (ARAM)、斗魂竞技场等特殊对战模式，全员无分路
    for (const p of players) {
      p.lane = '';
      p.laneCn = '';
    }
    return;
  }

  const teamIds = [...new Set(players.map((p) => p.teamId))];
  for (const tid of teamIds) {
    const mem = players.filter((p) => p.teamId === tid);
    if (mem.length !== 5) {
      mem.forEach((p) => {
        p.lane = (p.lane || '').toUpperCase();
        p.laneCn = LANE_CN[p.lane] || p.lane || '';
      });
      continue;
    }

    // 检查是否已经是合法的 5 个独立分路 (如正规排位或观战实时数据已包含标准分路)
    const validSet = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
    const existing = mem.map((p) => (p.lane || '').toUpperCase());
    const isComplete = mem.every((p) => validSet.has(p.lane?.toUpperCase())) && new Set(existing).size === 5;

    if (isComplete) {
      mem.forEach((p) => {
        p.lane = p.lane.toUpperCase();
        p.laneCn = LANE_CN[p.lane] || p.lane;
      });
      continue;
    }

    // 自动推断并分配标准 5 个分路
    const assigned = new Map();
    const available = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

    // 1. 打野: 优先依据惩戒 (Smite, spellId 11)
    const jg = mem.find((p) => (p.spells || []).includes(11));
    if (jg) {
      assigned.set(jg.participantId, 'JUNGLE');
      available.delete('JUNGLE');
    }

    // 2. 辅助: 优先依据辅助装备 (Support Item)
    const remForSup = mem.filter((p) => !assigned.has(p.participantId));
    let sup = remForSup.find((p) => (p.items || []).some((id) => SUPPORT_ITEM_IDS.has(id)));
    if (!sup && available.has('UTILITY')) {
      // 其次依据插眼/补刀比
      sup = [...remForSup].sort((a, b) => (b.vision / Math.max(1, b.cs)) - (a.vision / Math.max(1, a.cs)))[0];
    }
    if (sup && available.has('UTILITY')) {
      assigned.set(sup.participantId, 'UTILITY');
      available.delete('UTILITY');
    }

    // 3. 基于早中期时间线对线坐标推断 (第 2~7 分钟)
    const un = mem.filter((p) => !assigned.has(p.participantId));
    const coords = new Map();
    if (timelineDigest && Array.isArray(timelineDigest.frames) && timelineDigest.frames.length >= 3) {
      const sample = timelineDigest.frames.slice(2, 7);
      for (const p of un) {
        let sx = 0, sy = 0, c = 0;
        for (const fr of sample) {
          const pf = fr.players?.[p.participantId];
          if (pf && pf.x != null && pf.y != null) {
            // 排除泉水驻留
            if (!(pf.x < 2000 && pf.y < 2000) && !(pf.x > 13000 && pf.y > 13000)) {
              sx += pf.x;
              sy += pf.y;
              c++;
            }
          }
        }
        if (c > 0) coords.set(p.participantId, { x: sx / c, y: sy / c });
      }
    }

    if (coords.size === un.length) {
      // Top: 偏左上 (y - x 较大)
      // Bot: 偏右下 (x - y 较大)
      // Mid: 居中
      const sortedByTop = [...un].sort((a, b) => {
        const ca = coords.get(a.participantId);
        const cb = coords.get(b.participantId);
        return (cb.y - cb.x) - (ca.y - ca.x);
      });
      const topCand = sortedByTop[0];
      const botCand = sortedByTop[sortedByTop.length - 1];
      const midCand = sortedByTop.find((p) => p !== topCand && p !== botCand);

      if (topCand && available.has('TOP')) {
        assigned.set(topCand.participantId, 'TOP');
        available.delete('TOP');
      }
      if (botCand && available.has('BOTTOM')) {
        assigned.set(botCand.participantId, 'BOTTOM');
        available.delete('BOTTOM');
      }
      if (midCand && available.has('MIDDLE')) {
        assigned.set(midCand.participantId, 'MIDDLE');
        available.delete('MIDDLE');
      }
    }

    // 4. 剩余未分配者补位
    for (const p of mem) {
      if (!assigned.has(p.participantId)) {
        const upper = (p.lane || '').toUpperCase();
        if (available.has(upper)) {
          assigned.set(p.participantId, upper);
          available.delete(upper);
        } else {
          const next = available.values().next().value || 'MIDDLE';
          assigned.set(p.participantId, next);
          available.delete(next);
        }
      }
    }

    mem.forEach((p) => {
      const l = assigned.get(p.participantId) || p.lane || 'MIDDLE';
      p.lane = l;
      p.laneCn = LANE_CN[l] || l;
    });
  }
}

function buildTimelineDigest(tl, players) {
  if (!tl || !Array.isArray(tl.frames) || !tl.frames.length) return null;
  const ids = players.map((p) => p.participantId);
  const teamOf = Object.fromEntries(players.map((p) => [p.participantId, p.teamId]));
  const teamIds = [...new Set(players.map((p) => p.teamId))];
  const frames = tl.frames.map((f, idx) => {
    const pf = f.participantFrames || {};
    const per = {};
    for (const id of ids) {
      const x = pf[id] || pf[String(id)];
      if (x)
        per[id] = {
          gold: num(x.totalGold),
          xp: num(x.xp),
          level: num(x.level),
          cs: num(x.minionsKilled),
          jungle: num(x.jungleMinionsKilled),
          x: x.position?.x,
          y: x.position?.y,
        };
    }
    const teamGold = {};
    const teamXp = {};
    for (const t of teamIds) {
      teamGold[t] = ids.filter((i) => teamOf[i] === t && per[i]).reduce((a, i) => a + per[i].gold, 0);
      teamXp[t] = ids.filter((i) => teamOf[i] === t && per[i]).reduce((a, i) => a + per[i].xp, 0);
    }
    return { t: num(f.timestamp) || idx * 60000, players: per, teamGold, teamXp };
  });
  const events = tl.frames
    .flatMap((f) => f.events || [])
    .map((e) => ({ ...e }))
    .sort((a, b) => a.timestamp - b.timestamp);
  return { frames, events };
}

/** 给 AI 的精简数据:只带关键信息 */
function buildAiPayload(digest, names = {}) {
  const dur = digest.gameDuration;
  const cp = (minute) => {
    if (!digest.timeline) return null;
    const f = digest.timeline.frames.reduce((best, fr) =>
      Math.abs(fr.t - minute * 60000) < Math.abs(best.t - minute * 60000) ? fr : best
    );
    if (Math.abs(f.t - minute * 60000) > 45000) return null;
    return f;
  };
  const evs = digest.timeline?.events || [];
  const kills = evs.filter((e) => e.type === 'CHAMPION_KILL');
  const pById = Object.fromEntries(digest.players.map((p) => [p.participantId, p]));
  const earlyDeaths = {};
  const lateDeaths = {};
  kills.forEach((e) => {
    const tgt = e.timestamp < 600000 ? earlyDeaths : lateDeaths;
    tgt[e.victimId] = (tgt[e.victimId] || 0) + 1;
  });
  const cps = [5, 10, 15, 20].map((m) => [m, cp(m)]).filter(([m, f]) => f && m * 60 < dur);
  const isAramMode = digest.isAram ?? isAram(digest);
  const hasLanes = digest.hasLanes ?? hasStandardLanes(digest);

  return {
    game: {
      id: digest.gameId,
      mode: names.queue || digest.gameMode,
      isCustom: digest.isCustom,
      isAram: isAramMode,
      hasLanes,
      durationMin: round(dur / 60, 1),
      version: digest.gameVersion,
      winner: digest.teams.filter((t) => t.win).map((t) => (t.teamId === 100 ? '蓝方' : t.teamId === 200 ? '红方' : 'team' + t.teamId)),
    },
    teams: digest.teams.map((t) => {
      const obj = {
        side: t.teamId === 100 ? '蓝方' : t.teamId === 200 ? '红方' : 'team' + t.teamId,
        win: t.win,
        kills: t.kills,
        deaths: t.deaths,
        gold: t.gold,
        damage: t.dmg,
        towers: t.objectives.towerKills,
        inhibitors: t.objectives.inhibitorKills,
      };
      if (!isAramMode) {
        obj.dragons = t.objectives.dragonKills;
        obj.barons = t.objectives.baronKills;
        obj.heralds = t.objectives.riftHeraldKills;
      }
      return obj;
    }),
    goldDiffByMinute: digest.timeline
      ? digest.timeline.frames
          .filter((_, i) => i % 5 === 0)
          .map((f) => ({ min: Math.round(f.t / 60000), blueMinusRed: (f.teamGold[100] || 0) - (f.teamGold[200] || 0) }))
      : undefined,
    players: digest.players.map((p) => {
      const pData = {
        name: names.alias?.[p.key] || p.name,
        side: p.teamId === 100 ? '蓝方' : p.teamId === 200 ? '红方' : 'team' + p.teamId,
        champion: names.champions?.[p.championId] || p.championId,
        win: p.win,
        level: p.level,
        kda: `${p.kills}/${p.deaths}/${p.assists}`,
        kdaRatio: p.kda,
        killParticipation: p.kp,
        damageToChamps: p.dmg,
        damageShareOfTeam: p.dmgShare,
        damageTakenShareOfTeam: p.takenShare,
        deathShareOfTeam: p.deathShare,
        dmgPerMin: p.dmgPerMin,
        gold: p.gold,
        goldPerMin: p.goldPerMin,
        cs: p.cs,
        csPerMin: p.csPerMin,
        ccSeconds: p.cc,
        healing: p.heal,
        damageMitigated: p.mitigated,
        objectiveDamage: p.objDmg,
        turretKills: p.turretKills,
        multiKill: p.largestMultiKill,
        firstBlood: p.firstBlood,
        items: p.items.filter(Boolean).map((i) => names.items?.[i] || i),
        augments: p.augments.map((a) => names.augments?.[a] || a),
        localScore: p.score,
        earlyDeathsBefore10min: earlyDeaths[p.participantId] || 0,
        lateDeathsAfter10min: lateDeaths[p.participantId] || 0,
        checkpoints: cps.map(([m, f]) => {
          const x = f.players[p.participantId];
          return x ? { min: m, gold: x.gold, level: x.level, cs: x.cs + x.jungle } : { min: m };
        }),
      };
      if (hasLanes) {
        pData.lane = p.laneCn || p.lane || '未知分路';
        pData.laneKey = p.lane || undefined;
        pData.vision = p.vision;
        pData.wardsPlaced = p.wardsPlaced;
        pData.wardsKilled = p.wardsKilled;
        pData.controlWards = p.controlWards;
      }
      return pData;
    }),
    notableEvents: (() => {
      const out = [];
      const fb = kills[0];
      if (fb) out.push(`首杀 ${Math.round(fb.timestamp / 1000)}s: ${pById[fb.killerId]?.name || '处决'} 击杀 ${pById[fb.victimId]?.name}`);
      const bld = evs.filter((e) => e.type === 'BUILDING_KILL').slice(0, 3);
      bld.forEach((e) => out.push(`${Math.round(e.timestamp / 1000)}s 摧毁建筑 ${e.buildingType || ''} ${e.towerType || ''} ${e.laneType || ''} by ${pById[e.killerId]?.name || '?'}`));
      return out;
    })(),
  };
}

/** 将实时观战快照对象转换为标准的比赛数据包 (供对局详情页与内战系统提前预览) */
function snapshotToMatchBundle(snapshot) {
  const store = require('./store');
  const gamedataChamps = store.readJson('static/champions.json', {});
  const champEntries = Object.entries(gamedataChamps).map(([id, c]) => ({ id: Number(id), name: c.name, alias: c.alias }));
  const findChampId = (raw, name) => {
    if (raw) {
      const clean = raw.replace(/^game_character_displayname_/i, '').toLowerCase();
      const hit = champEntries.find((c) => c.alias?.toLowerCase() === clean);
      if (hit) return hit.id;
    }
    if (name) {
      const hit = champEntries.find((c) => c.name === name || c.alias?.toLowerCase() === name.toLowerCase());
      if (hit) return hit.id;
    }
    return 0;
  };

  const gameId = Number(snapshot.gameId || 0);
  const gameDuration = Math.round(snapshot.gameTime || snapshot.gameData?.gameTime || 0);
  let rawPlayers = snapshot.allPlayers;
  if (!rawPlayers && snapshot.liveScores?.players) {
    rawPlayers = snapshot.liveScores.players.map((p) => ({
      summonerName: p.summonerName,
      championName: p.championName,
      level: p.level,
      isDead: p.isDead,
      scores: p.scores,
      items: (p.items || []).map((it) => ({ itemID: it.id, price: 0 })),
    }));
  }
  rawPlayers = rawPlayers || [];

  const blue = rawPlayers.filter((p) => p.team === 'ORDER' || p.team === '100');
  const red = rawPlayers.filter((p) => p.team === 'CHAOS' || p.team === '200');
  const bList = blue.length === 5 ? blue : rawPlayers.slice(0, 5);
  const rList = red.length === 5 ? red : rawPlayers.slice(5, 10);

  const participantIdentities = [];
  const participants = [];
  let partId = 1;

  for (const list of [bList, rList]) {
    const teamId = list === bList ? 100 : 200;
    for (const p of list) {
      const currentId = partId++;
      const [gName, tag] = (p.riotId || p.summonerName || '').split('#');
      participantIdentities.push({
        participantId: currentId,
        player: {
          summonerName: p.summonerName || p.riotId || '玩家' + currentId,
          gameName: p.riotIdGameName || gName || p.summonerName || '玩家' + currentId,
          tagLine: p.riotIdTagLine || tag || '',
          puuid: p.puuid || '',
          profileIcon: 1,
        },
      });

      const stats = {
        champLevel: p.level || 1,
        kills: p.scores?.kills || 0,
        deaths: p.scores?.deaths || 0,
        assists: p.scores?.assists || 0,
        totalMinionsKilled: p.scores?.creepScore || 0,
        neutralMinionsKilled: 0,
        visionScore: Math.round(p.scores?.wardScore || 0),
        goldEarned: (p.items || []).reduce((s, i) => s + (i.price || 0) * (i.count || 1), 0),
        totalDamageDealtToChampions: 0,
        win: false,
      };
      for (let i = 0; i < 7; i++) {
        const itemObj = (p.items || []).find((it) => it.slot === i) || (p.items || [])[i];
        stats['item' + i] = itemObj?.itemID || 0;
      }

      participants.push({
        participantId: currentId,
        teamId,
        championId: findChampId(p.rawChampionName, p.championName),
        spell1Id: 4,
        spell2Id: 12,
        stats,
        timeline: { lane: p.position || '', role: '' },
      });
    }
  }

  const bKills = bList.reduce((s, p) => s + (p.scores?.kills || 0), 0);
  const rKills = rList.reduce((s, p) => s + (p.scores?.kills || 0), 0);

  const game = {
    gameId,
    gameCreation: snapshot.savedAt ? Number(new Date(snapshot.savedAt)) : Date.now(),
    gameDuration,
    gameMode: snapshot.gameData?.gameMode || 'CLASSIC',
    gameType: 'CUSTOM_GAME',
    mapId: 11,
    platformId: 'EUW1',
    gameVersion: '16.20 (进行中快照)',
    endOfGameResult: 'InProgress_Snapshot',
    isSnapshot: true,
    snapshotTime: gameDuration,
    participantIdentities,
    participants,
    teams: [
      {
        teamId: 100,
        win: bKills >= rKills ? 'Win' : 'Fail',
        kills: bKills,
        gold: bList.reduce((s, p) => s + (p.items || []).reduce((g, i) => g + (i.price || 0), 0), 0),
        dmg: 0,
        dmgTaken: 0,
        cs: bList.reduce((s, p) => s + (p.scores?.creepScore || 0), 0),
        vision: Math.round(bList.reduce((s, p) => s + (p.scores?.wardScore || 0), 0)),
        objectives: {},
        bans: [],
      },
      {
        teamId: 200,
        win: rKills > bKills ? 'Win' : 'Fail',
        kills: rKills,
        gold: rList.reduce((s, p) => s + (p.items || []).reduce((g, i) => g + (i.price || 0), 0), 0),
        dmg: 0,
        dmgTaken: 0,
        cs: rList.reduce((s, p) => s + (p.scores?.creepScore || 0), 0),
        vision: Math.round(rList.reduce((s, p) => s + (p.scores?.wardScore || 0), 0)),
        objectives: {},
        bans: [],
      },
    ],
  };

  const timelineEvents = (snapshot.events?.Events || []).map((ev) => ({
    type: ev.EventName,
    timestamp: Math.round((ev.EventTime || 0) * 1000),
    killerName: ev.KillerName,
    victimName: ev.VictimName,
    assisters: ev.Assisters,
  }));

  return {
    gameId,
    fetchedAt: snapshot.savedAt || Date.now(),
    game,
    timeline: { frames: [], events: timelineEvents },
    isSnapshot: true,
  };
}

module.exports = {
  buildDigest,
  buildAiPayload,
  displayName,
  playerKey,
  ZERO_PUUID,
  round,
  snapshotToMatchBundle,
  isAram,
  hasStandardLanes,
};
