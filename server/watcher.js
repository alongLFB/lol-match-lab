// 比赛全自动后台监控与保存服务 (Auto-Saver & Live Snapshot Service)
'use strict';
const store = require('./store');
const lcu = require('./lcu');
const matches = require('./matches');
const innerwar = require('./innerwar');

const SNAP_INDEX_FILE = 'spectate/snapshots_index.json';

let activeGame = null;
let autoArchiveTask = null;
let latestSnapshot = null;
let timer = null;

function loadSnapshotIndex() {
  return store.readJson(SNAP_INDEX_FILE, { list: [] });
}

function saveSnapshotIndex(idx) {
  store.writeJson(SNAP_INDEX_FILE, idx);
}

/** 手动/自动创建快照记录并持久化到索引 */
async function recordSnapshot({ gameId, note = '', isManual = false }) {
  let live = null;
  try {
    live = await matches.getLiveData();
  } catch (e) {}

  if (!live || !live.allPlayers) {
    if (latestSnapshot && Number(latestSnapshot.gameId) === Number(gameId) && (latestSnapshot.allPlayers || latestSnapshot.liveRaw?.allPlayers)) {
      live = latestSnapshot.liveRaw || latestSnapshot;
    }
  }
  if (!live || !live.allPlayers) {
    const diskLive = store.readJson(`spectate/live-${gameId}.json`);
    if (diskLive && diskLive.allPlayers) {
      live = diskLive;
    }
  }

  if (!live || !live.allPlayers) {
    throw new Error('未检测到进行中的比赛画面或 Live Client 接口未就绪');
  }

  const gameTime = Math.round(live.gameData?.gameTime || 0);
  const snapId = `${gameId}_${gameTime}s_${Date.now()}`;
  const data = {
    id: snapId,
    gameId: Number(gameId),
    savedAt: Date.now(),
    gameTime,
    isManual,
    note: note || (isManual ? `中途手动保存 (${Math.floor(gameTime / 60)}分${gameTime % 60}秒)` : `自动定时快照`),
    gameData: live.gameData,
    allPlayers: live.allPlayers,
    events: live.events || { Events: [] },
  };

  // 写入单份快照文件
  store.writeJson(`spectate/snapshots/${snapId}.json`, data);
  // 更新该对局最新 live 文件 (保证字段完整)
  store.writeJson(`spectate/live-${gameId}.json`, {
    gameId,
    savedAt: new Date().toISOString(),
    gameTime,
    liveScores: {
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
    },
    allPlayers: live.allPlayers,
    events: live.events,
    gameData: live.gameData,
  });

  // 更新快照索引并执行智能保留策略
  const idx = loadSnapshotIndex();
  let list = idx.list || [];

  const thisEntry = {
    id: snapId,
    gameId: Number(gameId),
    savedAt: data.savedAt,
    gameTime,
    isManual,
    note: data.note,
    playerCount: (live.allPlayers || []).length,
  };

  list = [thisEntry, ...list.filter((x) => x.id !== snapId)];

  // 对同一对局的自动快照进行智能归并/清理：
  // 1. 手动保存 (isManual: true) 永久保留
  // 2. 自动快照若超过 15 个，保留每 5 分钟里程碑与最近 3 个，修剪密集的早期自动快照
  const thisGameAutos = list.filter((x) => x.gameId === Number(gameId) && !x.isManual);
  if (thisGameAutos.length > 15) {
    const toPrune = [];
    thisGameAutos.slice(3).forEach((item) => {
      const isMilestone = item.gameTime % 300 < 60; // 5分钟里程碑
      if (!isMilestone) {
        toPrune.push(item.id);
      }
    });
    if (toPrune.length > 0) {
      toPrune.forEach((delId) => {
        try {
          store.remove(`spectate/snapshots/${delId}.json`);
        } catch {}
      });
      list = list.filter((x) => !toPrune.includes(x.id));
    }
  }

  // 全局最多保留 60 份
  idx.list = list.slice(0, 60);
  saveSnapshotIndex(idx);

  latestSnapshot = { ...data, liveRaw: live };
  return data;
}

/** 手动一键清理某对局的冗余中间快照，仅保留最新版和手动保存 */
function cleanSnapshots(gameId) {
  const targetId = Number(gameId);
  const idx = loadSnapshotIndex();
  const toDelete = [];
  const kept = [];

  let foundLatestAuto = false;
  for (const item of idx.list) {
    if (item.gameId !== targetId) {
      kept.push(item);
      continue;
    }
    if (item.isManual) {
      kept.push(item);
      continue;
    }
    if (!foundLatestAuto) {
      // 保留最新的一个自动快照
      foundLatestAuto = true;
      kept.push(item);
      continue;
    }
    toDelete.push(item.id);
  }

  for (const id of toDelete) {
    try {
      store.remove(`spectate/snapshots/${id}.json`);
    } catch {}
  }
  idx.list = kept;
  saveSnapshotIndex(idx);
  return { ok: true, prunedCount: toDelete.length, remainingCount: kept.filter((x) => x.gameId === targetId).length };
}

/** 删除指定快照 */
function deleteSnapshot(snapId) {
  try {
    store.remove(`spectate/snapshots/${snapId}.json`);
  } catch {}
  const idx = loadSnapshotIndex();
  idx.list = (idx.list || []).filter((x) => x.id !== snapId);
  saveSnapshotIndex(idx);
  return { ok: true };
}

/** 立即基于本地终局快照归档该对局 */
async function finalizeFromSnapshot(gameId, queueName = '') {
  const targetId = Number(gameId);
  const snap = store.readJson(`spectate/live-${targetId}.json`) || (latestSnapshot?.gameId === targetId ? latestSnapshot : null);
  if (!snap || (!snap.allPlayers && !snap.liveScores)) {
    throw new Error(`未找到对局 #${targetId} 的有效快照数据`);
  }
  const analysis = require('./analysis');
  const bundle = analysis.snapshotToMatchBundle(snap);
  store.writeJson(`matches/${targetId}.json`, bundle);
  const settings = store.getSettings();
  if (settings.autoSave?.autoInnerwar !== false) {
    await innerwar.add(targetId, { note: queueName || '赛后终局快照归档', fetch: false }).catch(() => {});
  }
  if (autoArchiveTask && autoArchiveTask.gameId === targetId) {
    autoArchiveTask.status = 'saved';
    autoArchiveTask.savedAt = Date.now();
    autoArchiveTask.savedMatch = matches.digestOf(bundle);
    autoArchiveTask.message = `对局 #${targetId} 已成功基于终局快照（${Math.floor(
      (snap.gameTime || 0) / 60
    )}分${(snap.gameTime || 0) % 60}秒）完成存盘与内战归档！`;
  }
  return bundle;
}

/** 触发对局结束后的自动归档 */
function startAutoArchive(gameInfo) {
  const gameId = Number(gameInfo.gameId);
  if (!gameId) return;

  // 如果已经有正在跑的相同任务且处于 polling 状态，直接复用
  if (autoArchiveTask && autoArchiveTask.gameId === gameId && autoArchiveTask.status === 'polling') {
    return;
  }

  autoArchiveTask = {
    gameId,
    status: 'polling',
    attempts: 0,
    startedAt: Date.now(),
    lastCheckedAt: Date.now(),
    queueName: gameInfo.queueName || '',
    isCustom: !!gameInfo.isCustom,
    savedMatch: null,
    message: '正在后台轮询等待官方生成战绩...',
  };

  const MAX_ATTEMPTS = 40; // 40 次 * 4 秒 ≈ 2.5 ~ 3 分钟
  const poll = async () => {
    if (!autoArchiveTask || autoArchiveTask.gameId !== gameId || autoArchiveTask.status !== 'polling') {
      return;
    }

    autoArchiveTask.attempts++;
    autoArchiveTask.lastCheckedAt = Date.now();

    try {
      const probe = await matches.probeMatch(gameId);
      if (probe && probe.ready && probe.official) {
        // 官方战绩已就绪！拉取并写入本地文件
        const bundle = await matches.getMatch(gameId, { refresh: true });
        const settings = store.getSettings();
        const autoInner = settings.autoSave?.autoInnerwar !== false;

        // 如果设置开启或者为自定义对局，自动加入内战记录
        if (autoInner) {
          try {
            await innerwar.add(gameId, { note: gameInfo.queueName || '赛后自动归档', fetch: false });
          } catch {}
        }

        autoArchiveTask.status = 'saved';
        autoArchiveTask.savedAt = Date.now();
        autoArchiveTask.savedMatch = matches.digestOf(bundle);
        autoArchiveTask.message = `对局 #${gameId} 官方战绩已全自动保存并写入本地数据库！`;
        console.log(`[AutoSaver] 对局 #${gameId} 官方战绩已全自动保存！`);
        return;
      }
    } catch (e) {
      // 探测错误忽略，继续重试
    }

    // 智能快速归档策略：
    // 观战或自定义对局因拳头官方不向观战者下发战绩索引，通常 3 次探测（约 12 秒）即可确定官方未建立索引。
    // 此时直接基于本地终局快照完成自动保存，无需让用户空等 40 次！
    const maxWaitForOfficial = (gameInfo.isSpectating || gameInfo.isCustom) ? 3 : 15;
    if (autoArchiveTask.attempts >= maxWaitForOfficial) {
      try {
        const bundle = await finalizeFromSnapshot(gameId, gameInfo.queueName);
        console.log(`[AutoSaver] 对局 #${gameId} (探测 ${autoArchiveTask.attempts} 次) 官方未公开索引，已自动基于终局快照归档入库！`);
        return;
      } catch (err) {}
    }

    if (autoArchiveTask.attempts >= MAX_ATTEMPTS) {
      autoArchiveTask.status = 'failed';
      autoArchiveTask.message = `对局 #${gameId} 战绩探测超时（未生成官方战绩且未找到有效快照）`;
      return;
    }

    // 4 秒后下一次探测
    setTimeout(poll, 4000);
  };

  // 延迟 2 秒开始首次探测
  setTimeout(poll, 2000);
}

/** 监控主循环 */
async function tick() {
  try {
    const spec = await matches.getSpectateStatus();
    if (spec.inGame && spec.gameId > 0) {
      // 游戏中
      if (!activeGame || activeGame.gameId !== spec.gameId) {
        activeGame = {
          gameId: spec.gameId,
          isSpectating: spec.isSpectating,
          isCustom: spec.isCustom,
          queueName: spec.queueName,
          startedAt: Date.now(),
          lastAutoSnapMin: 0,
        };
      }
      activeGame.gameTime = spec.gameTime;

      // 游戏中自动保存快照 (每 15 秒更新一次磁盘 live 快照)
      if (spec.liveApiAvailable) {
        try {
          const live = await matches.getLiveData();
          if (live && live.allPlayers) {
            latestSnapshot = {
              gameId: spec.gameId,
              savedAt: Date.now(),
              gameTime: Math.round(live.gameData?.gameTime || 0),
              allPlayers: live.allPlayers,
              events: live.events,
              gameData: live.gameData,
            };
            store.writeJson(`spectate/live-${spec.gameId}.json`, {
              gameId: spec.gameId,
              savedAt: new Date().toISOString(),
              gameTime: latestSnapshot.gameTime,
              liveScores: spec.liveScores,
              allPlayers: live.allPlayers,
              events: live.events,
              gameData: live.gameData,
            });

            // 每 1 分钟 (60 秒) 自动存储一次快照切片 (防止中途对局流失)
            const curMin = Math.floor(latestSnapshot.gameTime / 60);
            if (curMin > 0 && curMin > (activeGame.lastAutoSnapMin || 0)) {
              activeGame.lastAutoSnapMin = curMin;
              await recordSnapshot({
                gameId: spec.gameId,
                note: `第 ${curMin} 分钟自动存档`,
                isManual: false,
              });
              console.log(`[AutoSaver] 已自动保存对局 #${spec.gameId} 第 ${curMin} 分钟快照`);
            }
          }
        } catch {}
      }
    } else {
      // 非游戏中
      if (activeGame && activeGame.gameId > 0) {
        const ended = activeGame;
        activeGame = null;
        console.log(`[AutoSaver] 检测到对局 #${ended.gameId} 退出，启动赛后自动保存与归档...`);

        // 关键：若退出前有最新抓取到的快照帧，立即将其精确到最后一秒定格为终局快照
        if (latestSnapshot && latestSnapshot.gameId === ended.gameId) {
          const finalSec = latestSnapshot.gameTime || 0;
          const min = Math.floor(finalSec / 60);
          const sec = finalSec % 60;
          recordSnapshot({
            gameId: ended.gameId,
            note: `比赛终局定格 (${min}分${sec < 10 ? '0' : ''}${sec}秒 结束)`,
            isManual: false,
          }).catch(() => {});
        }

        startAutoArchive(ended);
      }
    }
  } catch (e) {
    // 忽略异常
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, 4000);
  tick();
}

function getStatus() {
  return {
    activeGame,
    autoArchiveTask,
    hasLatestSnapshot: !!latestSnapshot,
    latestSnapshotMeta: latestSnapshot
      ? {
          gameId: latestSnapshot.gameId,
          gameTime: latestSnapshot.gameTime,
          savedAt: latestSnapshot.savedAt,
          playerCount: (latestSnapshot.allPlayers || []).length,
        }
      : null,
  };
}

function listSnapshots() {
  return loadSnapshotIndex().list;
}

function getSnapshot(id) {
  return store.readJson(`spectate/snapshots/${id}.json`);
}

module.exports = {
  start,
  getStatus,
  recordSnapshot,
  startAutoArchive,
  finalizeFromSnapshot,
  listSnapshots,
  getSnapshot,
  cleanSnapshots,
  deleteSnapshot,
};
