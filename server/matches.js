// 对局历史 / 对局明细 / 附加数据 的获取与缓存
'use strict';
const lcu = require('./lcu');
const store = require('./store');
const { buildDigest, ZERO_PUUID } = require('./analysis');

const DAY = 86400000;

async function currentSummoner() {
  return lcu.get('/lol-summoner/v1/current-summoner');
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx], idx);
        } catch (e) {
          out[idx] = { __error: e.message };
        }
      }
    })
  );
  return out;
}

/** 拉取某玩家的全部历史(分页,去重)。返回 LCU 原始 game 列表(按时间倒序) */
async function fetchAllHistory(puuid, { maxGames = 3000 } = {}) {
  const PAGE = 50;
  const seen = new Map();
  for (let beg = 0; beg < maxGames; beg += PAGE) {
    const r = await lcu.get(`/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${beg}&endIndex=${beg + PAGE - 1}`);
    const games = r?.games?.games || [];
    let added = 0;
    for (const g of games) {
      if (!seen.has(g.gameId)) {
        seen.set(g.gameId, g);
        added++;
      }
    }
    if (!added || games.length < PAGE) break;
  }
  return [...seen.values()].sort((a, b) => b.gameCreation - a.gameCreation);
}

function listCacheFile(puuid) {
  return `lists/${puuid}.json`;
}

/** 获取历史列表(带缓存兜底)。days=0 表示不限 */
async function getHistory({ puuid, days = 0, refresh = true }) {
  let me = null;
  let offline = false;
  let games = null;
  try {
    me = await currentSummoner();
    puuid = puuid || me.puuid;
    if (refresh) {
      const fresh = await fetchAllHistory(puuid);
      // 与缓存合并(LCU 只保留有限条数,本地累积保存更久)
      const cache = store.readJson(listCacheFile(puuid), { games: {} });
      for (const g of fresh) cache.games[g.gameId] = g;
      cache.updatedAt = Date.now();
      store.writeJson(listCacheFile(puuid), cache);
      games = Object.values(cache.games);
    }
  } catch (e) {
    offline = true;
    if (!puuid) puuid = store.readJson('last-summoner.json', {}).puuid;
  }
  if (me) store.writeJson('last-summoner.json', { puuid: me.puuid, gameName: me.gameName, tagLine: me.tagLine });
  if (!games) {
    const cache = store.readJson(listCacheFile(puuid), { games: {} });
    games = Object.values(cache.games);
  }

  // 合并本地保存的独立对局 (例如通过观战快照导入或手动导入的对局)
  const localMatchFiles = store.list('matches') || [];
  const existingGameIds = new Set(games.map((g) => g.gameId));
  for (const f of localMatchFiles) {
    if (!f.endsWith('.json')) continue;
    const gid = Number(f.replace('.json', ''));
    if (gid && !existingGameIds.has(gid)) {
      try {
        const bundle = store.readJson(`matches/${f}`);
        if (bundle && bundle.game) {
          const gCopy = { ...bundle.game, _isLocalImport: true };
          games.push(gCopy);
          existingGameIds.add(gid);
        }
      } catch {}
    }
  }

  games.sort((a, b) => b.gameCreation - a.gameCreation);
  if (days > 0) {
    const cutoff = Date.now() - days * DAY;
    games = games.filter((g) => g.gameCreation >= cutoff);
  }
  return { puuid, offline, games };
}

/** 列表条目 -> 行摘要 */
function summarizeListGame(g, puuid) {
  const idn = (g.participantIdentities || []).find((i) => i.player?.puuid === puuid) || g.participantIdentities?.[0];
  const p = (g.participants || []).find((x) => x.participantId === idn?.participantId) || g.participants?.[0] || {};
  const s = p.stats || {};
  const cached = store.exists(`matches/${g.gameId}.json`);
  const isSpectated = !((g.participantIdentities || []).some((i) => i.player?.puuid && i.player.puuid === puuid));
  return {
    gameId: g.gameId,
    gameCreation: g.gameCreation,
    gameDuration: g.gameDuration,
    queueId: g.queueId,
    gameMode: g.gameMode,
    gameType: g.gameType,
    mapId: g.mapId,
    isCustom: g.gameType === 'CUSTOM_GAME',
    championId: p.championId,
    teamId: p.teamId,
    win: !!s.win,
    remake: g.endOfGameResult && g.endOfGameResult !== 'GameComplete',
    kills: s.kills || 0,
    deaths: s.deaths || 0,
    assists: s.assists || 0,
    cs: (s.totalMinionsKilled || 0) + (s.neutralMinionsKilled || 0),
    gold: s.goldEarned || 0,
    dmg: s.totalDamageDealtToChampions || 0,
    items: [0, 1, 2, 3, 4, 5, 6].map((i) => s['item' + i] || 0),
    spells: [p.spell1Id, p.spell2Id],
    cached,
    isSpectated,
    isLocalImport: !!g._isLocalImport,
    platformId: g.platformId || (cached ? (store.readJson(`matches/${g.gameId}.json`)?.game?.platformId || '') : '') || (g.gameId > 5000000000 ? 'EUW1' : (g.gameId > 10000000 && g.gameId < 50000000 ? 'ME1' : '')),
  };
}

// ---- 对局明细 ----
const matchFile = (id) => `matches/${id}.json`;

async function getMatch(gameId, { refresh = false } = {}) {
  let b = refresh ? null : store.readJson(matchFile(gameId));
  if (b && b.game) return b;
  b = b || {};
  const game = await lcu.get(`/lol-match-history/v1/games/${gameId}`);
  let timeline = null;
  try {
    timeline = await lcu.get(`/lol-match-history/v1/game-timelines/${gameId}`);
  } catch {}
  let eog = null;
  try {
    const e = await lcu.get('/lol-end-of-game/v1/eog-stats-block');
    if (e && Number(e.gameId) === Number(gameId)) eog = e;
  } catch {}
  b = { ...b, gameId: Number(gameId), fetchedAt: Date.now(), game, timeline, eog: eog || b.eog || null };
  store.writeJson(matchFile(gameId), b);
  return b;
}

function getCachedMatch(gameId) {
  return store.readJson(matchFile(gameId));
}

/** 附加数据:每位玩家的召唤师信息 / 排位 / 熟练度;回放元数据;(仅在 LCU 在线时可用) */
async function getExtras(gameId, { refresh = false } = {}) {
  const b = await getMatch(gameId);
  if (b.extras && !refresh) return b.extras;
  const players = (b.game.participantIdentities || [])
    .map((i) => i.player)
    .filter((p) => p && p.puuid && p.puuid !== ZERO_PUUID);
  const tryGet = async (path) => {
    try {
      return await lcu.get(path);
    } catch (e) {
      return { __error: e.message.slice(0, 160) };
    }
  };
  const results = await mapLimit(players, 4, async (p) => {
    const [summoner, ranked, mastery] = await Promise.all([
      tryGet(`/lol-summoner/v2/summoners/puuid/${p.puuid}`),
      tryGet(`/lol-ranked/v1/ranked-stats/${p.puuid}`),
      tryGet(`/lol-champion-mastery/v1/${p.puuid}/champion-mastery`),
    ]);
    return { puuid: p.puuid, summoner, ranked, mastery };
  });
  const replay = await tryGet(`/lol-replays/v1/metadata/${gameId}`);
  const extras = {
    fetchedAt: Date.now(),
    replay,
    players: Object.fromEntries(results.filter((r) => r.puuid).map((r) => [r.puuid, r])),
  };
  b.extras = extras;
  store.writeJson(matchFile(gameId), b);
  return extras;
}

function digestOf(bundle) {
  return buildDigest(bundle);
}

/** 通过 游戏名#TAG 或 PUUID 查找召唤师 */
async function lookupSummoner(query) {
  query = String(query || '').trim();
  if (!query) throw new Error('请输入玩家昵称或 PUUID');

  // 1. 如果是 PUUID (UUID 格式)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
    const s = await lcu.get(`/lol-summoner/v2/summoners/puuid/${query}`);
    return {
      puuid: s.puuid,
      gameName: s.gameName || '',
      tagLine: s.tagLine || '',
      summonerLevel: s.summonerLevel || 0,
      profileIconId: s.profileIconId || 0,
      summonerId: s.summonerId || 0,
    };
  }

  // 2. 如果包含 #，拆分 gameName 与 tagLine
  let gameName = query;
  let tagLine = '';
  if (query.includes('#')) {
    const parts = query.split('#');
    gameName = parts[0].trim();
    tagLine = parts.slice(1).join('#').trim();
  } else {
    try {
      const me = await currentSummoner();
      if (me?.tagLine) tagLine = me.tagLine;
    } catch {}
  }

  if (gameName) {
    // 优先用 alias/lookup 接口
    if (tagLine) {
      try {
        const res = await lcu.get(
          `/lol-summoner/v1/alias/lookup?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`
        );
        if (res && res.puuid) {
          let detail = null;
          try {
            detail = await lcu.get(`/lol-summoner/v2/summoners/puuid/${res.puuid}`);
          } catch {}
          return {
            puuid: res.puuid,
            gameName: res.alias?.gameName || detail?.gameName || gameName,
            tagLine: res.alias?.tagLine || detail?.tagLine || tagLine,
            summonerLevel: detail?.summonerLevel || 0,
            profileIconId: detail?.profileIconId || 0,
            summonerId: detail?.summonerId || 0,
          };
        }
      } catch (e) {}
    }

    // 备选: 好友列表匹配
    try {
      const friends = await lcu.get('/lol-chat/v1/friends');
      if (Array.isArray(friends)) {
        const hit = friends.find(
          (f) =>
            (f.gameName && f.gameName.toLowerCase() === gameName.toLowerCase() && (!tagLine || f.gameTag.toLowerCase() === tagLine.toLowerCase())) ||
            (f.name && f.name.toLowerCase() === query.toLowerCase())
        );
        if (hit && hit.puuid) {
          let detail = null;
          try {
            detail = await lcu.get(`/lol-summoner/v2/summoners/puuid/${hit.puuid}`);
          } catch {}
          return {
            puuid: hit.puuid,
            gameName: hit.gameName || hit.name,
            tagLine: hit.gameTag || '',
            summonerLevel: detail?.summonerLevel || hit.level || 0,
            profileIconId: detail?.profileIconId || hit.iconId || 0,
            summonerId: detail?.summonerId || 0,
          };
        }
      }
    } catch {}
  }

  throw new Error(`未找到玩家 "${query}"，请检查名称是否正确（推荐输入完整的 游戏名#TAG）`);
}

const https = require('https');
const liveAgent = new https.Agent({ rejectUnauthorized: false });

/** 从本地 2999 端口获取游戏内 Live Client Data */
function getLiveData() {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port: 2999,
        path: '/liveclientdata/allgamedata',
        method: 'GET',
        agent: liveAgent,
        timeout: 2500,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Live API timeout')));
    req.on('error', reject);
    req.end();
  });
}

/** 获取当前游戏会话与观战状态 */
async function getSpectateStatus() {
  let me = null;
  try {
    me = await currentSummoner();
  } catch {}

  let phase = 'None';
  try {
    phase = await lcu.get('/lol-gameflow/v1/gameflow-phase');
  } catch {}

  let session = null;
  try {
    session = await lcu.get('/lol-gameflow/v1/session');
  } catch {}

  const inGame = phase === 'InProgress';
  const gameData = session?.gameData || {};
  const gameId = gameData.gameId ? Number(gameData.gameId) : 0;
  const isCustom = !!(gameData.isCustomGame || gameData.queue?.isCustom);

  // 检查是否观战
  let isSpectating = false;
  const p1 = (gameData.teamOne || []).map((p) => p.puuid);
  const p2 = (gameData.teamTwo || []).map((p) => p.puuid);
  const participants = [...p1, ...p2];
  if (inGame && me && me.puuid) {
    if (participants.length > 0 && !participants.includes(me.puuid)) {
      isSpectating = true;
    }
  }

  let liveApiAvailable = false;
  let gameTime = 0;
  let liveScores = null;
  if (inGame) {
    try {
      const live = await getLiveData();
      if (live && live.allPlayers) {
        liveApiAvailable = true;
        gameTime = Math.round(live.gameData?.gameTime || 0);
        liveScores = {
          gameTime,
          players: (live.allPlayers || []).map((p) => ({
            summonerName: p.summonerName,
            championName: p.championName,
            isDead: p.isDead,
            respawnTimer: p.respawnTimer,
            level: p.level,
            scores: p.scores,
            items: (p.items || []).map((i) => ({ id: i.itemID, name: i.displayName, count: i.count })),
          })),
        };
      }
    } catch {}
  }

  // 提取场上参赛者简要信息供前端快速选择
  const playersSummary = [];
  if (gameData.playerChampionSelections) {
    for (const sel of gameData.playerChampionSelections) {
      playersSummary.push({
        puuid: sel.puuid,
        championId: sel.championId,
      });
    }
  }

  // 若处于游戏中且成功获取了实时数据，写入最新快照备用 (合并现有数据，避免冲掉 allPlayers / events)
  if (inGame && liveScores && gameId) {
    try {
      const existing = store.readJson(`spectate/live-${gameId}.json`, {});
      store.writeJson(`spectate/live-${gameId}.json`, {
        ...existing,
        gameId,
        savedAt: new Date().toISOString(),
        gameTime: gameTime || existing.gameTime || 0,
        liveScores,
      });
    } catch {}
  }

  return {
    phase,
    inGame,
    isSpectating,
    isCustom,
    gameId,
    gameTime,
    gameMode: gameData.gameMode || '',
    queueName: gameData.queue?.description || gameData.queue?.name || '',
    mapId: gameData.mapId || 0,
    players: playersSummary,
    liveApiAvailable,
    liveScores,
  };
}

/** 探测某局比赛在 LCU 是否已生成就绪 (轻量探测，不抛错，支持本地快照兜底) */
async function probeMatch(gameId) {
  try {
    const res = await lcu.get(`/lol-match-history/v1/games/${gameId}`);
    if (res && res.gameId) {
      return { ready: true, official: true, gameId: Number(res.gameId), gameDuration: res.gameDuration, gameMode: res.gameMode };
    }
  } catch (e) {}

  // 检查本地是否有实时快照
  try {
    const snap = store.readJson(`spectate/live-${gameId}.json`);
    if (snap && (snap.allPlayers || snap.liveScores)) {
      return {
        ready: true,
        official: false,
        fromSnapshot: true,
        gameId: Number(gameId),
        gameDuration: snap.gameTime || 0,
        gameMode: snap.gameData?.gameMode || 'CUSTOM',
      };
    }
  } catch {}

  return { ready: false, gameId: Number(gameId), status: 404 };
}

module.exports = {
  currentSummoner,
  lookupSummoner,
  getSpectateStatus,
  getLiveData,
  probeMatch,
  getHistory,
  summarizeListGame,
  getMatch,
  getCachedMatch,
  getExtras,
  digestOf,
  mapLimit,
};
