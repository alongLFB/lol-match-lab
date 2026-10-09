// 游戏静态数据(英雄/装备/符文/召唤师技能/强化符文/队列/地图),来自 LCU,并落盘缓存以便离线浏览
'use strict';
const lcu = require('./lcu');
const store = require('./store');

const strip = (s) => (s ? String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : '');

const SOURCES = {
  champions: {
    path: '/lol-game-data/assets/v1/champion-summary.json',
    map: (arr) =>
      Object.fromEntries(
        arr.filter((c) => c.id > 0).map((c) => [c.id, { name: c.name, alias: c.alias, title: c.description, roles: c.roles, icon: c.squarePortraitPath }])
      ),
  },
  items: {
    path: '/lol-game-data/assets/v1/items.json',
    map: (arr) =>
      Object.fromEntries(arr.map((i) => [i.id, { name: i.name, icon: i.iconPath, desc: strip(i.description).slice(0, 600), price: i.priceTotal }])),
  },
  spells: {
    path: '/lol-game-data/assets/v1/summoner-spells.json',
    map: (arr) => Object.fromEntries(arr.map((s) => [s.id, { name: s.name, icon: s.iconPath, desc: strip(s.description) }])),
  },
  perks: {
    path: '/lol-game-data/assets/v1/perks.json',
    map: (arr) => Object.fromEntries(arr.map((p) => [p.id, { name: p.name, icon: p.iconPath, desc: strip(p.shortDesc) }])),
  },
  styles: {
    path: '/lol-game-data/assets/v1/perkstyles.json',
    map: (d) => Object.fromEntries((d.styles || []).map((s) => [s.id, { name: s.name, icon: s.iconPath }])),
  },
  augments: {
    path: '/lol-game-data/assets/v1/cherry-augments.json',
    map: (arr) =>
      Object.fromEntries(
        arr.map((a) => [a.id, { name: a.nameTRA || a.augmentNameId, key: a.augmentNameId, icon: a.augmentSmallIconPath, rarity: a.rarity }])
      ),
  },
  queues: {
    path: '/lol-game-queues/v1/queues',
    map: (arr) =>
      Object.fromEntries(arr.map((q) => [q.id, { name: q.description || q.name, shortName: q.shortName, mode: q.gameMode, category: q.category, map: q.mapId }])),
  },
  maps: {
    path: '/lol-maps/v2/maps',
    map: (arr) => Object.fromEntries(arr.map((m) => [m.id, { name: m.name, mode: m.gameMode }])),
  },
};

const mem = {};

async function load(name) {
  if (mem[name]) return mem[name];
  const src = SOURCES[name];
  const file = `static/${name}.json`;
  try {
    const raw = await lcu.get(src.path);
    const data = src.map(raw);
    store.writeJson(file, data);
    mem[name] = data;
  } catch (e) {
    const disk = store.readJson(file);
    if (!disk) throw e;
    mem[name] = disk;
  }
  return mem[name];
}

/** 汇总全部静态数据(尽量容错) */
async function all() {
  const out = {};
  await Promise.all(
    Object.keys(SOURCES).map(async (n) => {
      try {
        out[n] = await load(n);
      } catch {
        out[n] = {};
      }
    })
  );
  return out;
}

async function championName(id) {
  try {
    return (await load('champions'))[id]?.name || `英雄#${id}`;
  } catch {
    return `英雄#${id}`;
  }
}

async function itemName(id) {
  try {
    return (await load('items'))[id]?.name || `装备#${id}`;
  } catch {
    return `装备#${id}`;
  }
}

function resetMemory() {
  for (const k of Object.keys(mem)) delete mem[k];
}

module.exports = { all, load, championName, itemName, resetMemory };
