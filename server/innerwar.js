// 内战记录与胜率统计
'use strict';
const store = require('./store');
const matches = require('./matches');
const { round } = require('./analysis');

const FILE = 'innerwar.json';

function load() {
  return store.readJson(FILE, { records: [] });
}
function save(d) {
  store.writeJson(FILE, d);
}

function list() {
  return load().records;
}

async function add(gameId, { note = '', fetch = true } = {}) {
  gameId = Number(gameId);
  const d = load();
  if (fetch) {
    try {
      await matches.getMatch(gameId); // 确保明细已缓存到本地
    } catch (e) {
      const snap = store.readJson(`spectate/live-${gameId}.json`);
      if (snap && (snap.allPlayers || snap.liveScores)) {
        const { snapshotToMatchBundle } = require('./analysis');
        const bundle = snapshotToMatchBundle(snap);
        store.writeJson(`matches/${gameId}.json`, bundle);
      } else {
        throw e;
      }
    }
  }
  const ex = d.records.find((r) => r.gameId === gameId);
  if (ex) {
    if (note) ex.note = note;
  } else {
    d.records.push({ gameId, addedAt: Date.now(), note });
  }
  save(d);
  return d.records;
}

function remove(gameId) {
  const d = load();
  d.records = d.records.filter((r) => r.gameId !== Number(gameId));
  save(d);
  return d.records;
}

function setNote(gameId, note) {
  const d = load();
  const r = d.records.find((x) => x.gameId === Number(gameId));
  if (r) r.note = note;
  save(d);
}

function stats({ since = 0 } = {}) {
  const { records } = load();
  const aliases = store.getSettings().aliases;
  const players = new Map();
  const champs = new Map();
  const withMap = new Map(); // 同队
  const againstMap = new Map(); // 对手
  const sides = { 100: { games: 0, wins: 0 }, 200: { games: 0, wins: 0 } };
  const matchRows = [];
  let missing = 0;

  const getP = (p) => {
    if (!players.has(p.key))
      players.set(p.key, {
        key: p.key,
        name: p.name,
        alias: aliases[p.key] || '',
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        dmg: 0,
        dmgShare: 0,
        taken: 0,
        gold: 0,
        cs: 0,
        vision: 0,
        kp: 0,
        score: 0,
        mvp: 0,
        ace: 0,
        blue: { games: 0, wins: 0 },
        red: { games: 0, wins: 0 },
        champs: {},
        recent: [],
      });
    return players.get(p.key);
  };

  const sorted = [...records].sort((a, b) => a.gameId - b.gameId);
  const rows = [];
  for (const r of sorted) {
    const b = matches.getCachedMatch(r.gameId);
    if (!b) {
      missing++;
      continue;
    }
    const dg = matches.digestOf(b);
    if (!dg) continue;
    if (since && dg.gameCreation < since) continue;
    rows.push({ r, dg });
  }
  rows.sort((a, b) => a.dg.gameCreation - b.dg.gameCreation);

  for (const { r, dg } of rows) {
    const winners = dg.teams.filter((t) => t.win).map((t) => t.teamId);
    for (const t of dg.teams) {
      if (sides[t.teamId]) {
        sides[t.teamId].games++;
        if (t.win) sides[t.teamId].wins++;
      }
    }
    for (const p of dg.players) {
      const a = getP(p);
      a.name = p.name; // 最新昵称
      a.games++;
      if (p.win) a.wins++;
      a.kills += p.kills;
      a.deaths += p.deaths;
      a.assists += p.assists;
      a.dmg += p.dmg;
      a.dmgShare += p.dmgShare;
      a.taken += p.dmgTaken;
      a.gold += p.gold;
      a.cs += p.cs;
      a.vision += p.vision;
      a.kp += p.kp;
      a.score += p.score;
      if (p.badge === 'MVP') a.mvp++;
      if (p.badge === 'ACE') a.ace++;
      const side = p.teamId === 100 ? a.blue : p.teamId === 200 ? a.red : null;
      if (side) {
        side.games++;
        if (p.win) side.wins++;
      }
      const c = (a.champs[p.championId] ||= { championId: p.championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
      c.games++;
      if (p.win) c.wins++;
      c.kills += p.kills;
      c.deaths += p.deaths;
      c.assists += p.assists;
      a.recent.push(p.win ? 'W' : 'L');

      const g = (champs.get(p.championId) || { championId: p.championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
      g.games++;
      if (p.win) g.wins++;
      g.kills += p.kills;
      g.deaths += p.deaths;
      g.assists += p.assists;
      champs.set(p.championId, g);
    }
    for (let i = 0; i < dg.players.length; i++) {
      for (let j = i + 1; j < dg.players.length; j++) {
        const x = dg.players[i];
        const y = dg.players[j];
        const [a, b] = x.key < y.key ? [x, y] : [y, x];
        const k = a.key + '|' + b.key;
        if (x.teamId === y.teamId) {
          const e = withMap.get(k) || { a: a.key, b: b.key, games: 0, wins: 0 };
          e.games++;
          if (x.win) e.wins++;
          withMap.set(k, e);
        } else {
          const e = againstMap.get(k) || { a: a.key, b: b.key, games: 0, aWins: 0 };
          e.games++;
          if (a.win) e.aWins++;
          againstMap.set(k, e);
        }
      }
    }
    const best = dg.players.reduce((m, p) => (p.score > m.score ? p : m), dg.players[0]);
    matchRows.push({
      gameId: dg.gameId,
      date: dg.gameCreation,
      duration: dg.gameDuration,
      note: r.note || '',
      winners,
      kills: Object.fromEntries(dg.teams.map((t) => [t.teamId, t.kills])),
      teams: dg.teams.map((t) => ({
        teamId: t.teamId,
        win: t.win,
        players: dg.players
          .filter((p) => p.teamId === t.teamId)
          .map((p) => ({ key: p.key, name: p.name, championId: p.championId, kda: `${p.kills}/${p.deaths}/${p.assists}`, badge: p.badge })),
      })),
      best: best ? { key: best.key, name: best.name, score: best.score, championId: best.championId } : null,
    });
  }

  const playerList = [...players.values()].map((a) => {
    const n = a.games;
    // 连胜/连败
    let streak = 0;
    let type = '';
    for (let i = a.recent.length - 1; i >= 0; i--) {
      if (!type) type = a.recent[i];
      if (a.recent[i] === type) streak++;
      else break;
    }
    return {
      key: a.key,
      name: a.name,
      alias: a.alias,
      games: n,
      wins: a.wins,
      losses: n - a.wins,
      winRate: round(a.wins / n, 4),
      avgKills: round(a.kills / n),
      avgDeaths: round(a.deaths / n),
      avgAssists: round(a.assists / n),
      kda: round((a.kills + a.assists) / Math.max(1, a.deaths)),
      avgDmg: Math.round(a.dmg / n),
      avgDmgShare: round(a.dmgShare / n, 3),
      avgTaken: Math.round(a.taken / n),
      avgGold: Math.round(a.gold / n),
      avgCs: round(a.cs / n, 1),
      avgVision: round(a.vision / n, 1),
      avgKp: round(a.kp / n, 3),
      avgScore: round(a.score / n, 2),
      mvp: a.mvp,
      ace: a.ace,
      blue: a.blue,
      red: a.red,
      streak: type ? { type, count: streak } : null,
      recent: a.recent.slice(-10),
      champs: Object.values(a.champs).sort((x, y) => y.games - x.games),
    };
  });
  playerList.sort((a, b) => b.games - a.games || b.winRate - a.winRate);

  return {
    totalGames: rows.length,
    missingCache: missing,
    sides: { blue: sides[100], red: sides[200] },
    players: playerList,
    champions: [...champs.values()].sort((a, b) => b.games - a.games),
    with: [...withMap.values()],
    against: [...againstMap.values()],
    matches: matchRows.reverse(),
  };
}

module.exports = { list, add, remove, setNote, stats };
