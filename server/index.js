'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const lcu = require('./lcu');
const store = require('./store');
const gamedata = require('./gamedata');
const matches = require('./matches');
const innerwar = require('./innerwar');
const ai = require('./ai');
const watcher = require('./watcher');
const analysis = require('./analysis');

const PORT = Number(process.env.PORT || 5179);
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// ---------- helpers ----------
const send = (res, status, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
};
const sendDownload = (res, filename, obj) => {
  const data = JSON.stringify(obj, null, 2);
  send(res, 200, data, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const t = Buffer.concat(chunks).toString('utf8');
        resolve(t ? JSON.parse(t) : {});
      } catch (e) {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });

const manual = () => {
  const l = store.getSettings().lcu;
  return { installDir: l.installDir, port: l.port, token: l.token };
};
// lcu 模块使用 manual 作为 connect 参数;统一包装
lcu.setManualProvider(manual);
const LCU_OPTS = () => ({ manual: manual() });
const ts = (d = new Date()) => d.toISOString().replace(/[:T]/g, '-').slice(0, 19);

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/status', async () => {
  const out = { connected: false, version: null, summoner: null, creds: null, ai: null };
  const s = store.getSettings();
  out.ai = { configured: !!(s.openai.apiKey || process.env.OPENAI_API_KEY), model: s.openai.model };
  try {
    await lcu.connect(manual());
    const c = lcu.getCreds();
    if (c) {
      out.creds = { port: c.port, source: c.source, installDir: c.installDir };
      out.summoner = await matches.currentSummoner();
      out.connected = true;
      try {
        out.version = await lcu.get('/lol-patch/v1/game-version', LCU_OPTS());
      } catch {}
      try {
        out.region = await lcu.get('/riotclient/region-locale', LCU_OPTS());
      } catch {}
      store.writeJson('last-summoner.json', { puuid: out.summoner.puuid, gameName: out.summoner.gameName, tagLine: out.summoner.tagLine });
    }
  } catch (e) {
    out.error = e.message;
  }
  if (!out.connected) out.lastSummoner = store.readJson('last-summoner.json');
  return out;
});

route('GET', '/api/gamedata', async () => gamedata.all());

route('GET', '/api/history', async ({ q }) => {
  const days = Number(q.get('days') || 0);
  const r = await matches.getHistory({ puuid: q.get('puuid') || undefined, days, refresh: q.get('refresh') !== '0' });
  const inner = new Set(innerwar.list().map((x) => x.gameId));
  return {
    puuid: r.puuid,
    offline: r.offline,
    count: r.games.length,
    games: r.games.map((g) => ({ ...matches.summarizeListGame(g, r.puuid), inInnerwar: inner.has(g.gameId) })),
  };
});

route('GET', '/api/summoner/lookup', async ({ q }) => {
  const query = q.get('q') || q.get('name') || '';
  return matches.lookupSummoner(query);
});

route('POST', '/api/match/import', async ({ body }) => {
  const gameId = Number(body.gameId);
  if (!gameId || isNaN(gameId)) throw Object.assign(new Error('请输入有效的数字对局 ID'), { status: 400 });
  let bundle;
  let fromSnapshot = false;
  try {
    bundle = await matches.getMatch(gameId, { refresh: true });
  } catch (e) {
    // 若 LCU 尚未归档（例如观战自定义局未被官方索引），自动回退使用本地终局快照
    const snap = store.readJson(`spectate/live-${gameId}.json`) || watcher.getSnapshot(gameId);
    if (snap && (snap.allPlayers || snap.liveScores)) {
      bundle = analysis.snapshotToMatchBundle(snap);
      store.writeJson(`matches/${gameId}.json`, bundle);
      fromSnapshot = true;
    } else {
      if (e.status === 404 || (e.message && e.message.includes('404'))) {
        throw Object.assign(
          new Error(`对局 #${gameId} 在客户端中未找到或尚未结束（还在进行中）。如果是进行中的对局，请等待比赛结束打完后再导入。`),
          { status: 404 }
        );
      }
      throw e;
    }
  }
  let inInnerwar = false;
  if (body.addToInnerwar) {
    await innerwar.add(gameId, { note: body.note || (fromSnapshot ? '终局快照导入' : ''), fetch: false });
    inInnerwar = true;
  }
  return {
    ok: true,
    gameId,
    fromSnapshot,
    inInnerwar,
    digest: matches.digestOf(bundle),
  };
});

route('GET', '/api/match/probe', async ({ q }) => {
  const gameId = Number(q.get('gameId'));
  if (!gameId || isNaN(gameId)) throw Object.assign(new Error('请输入有效的数字对局 ID'), { status: 400 });
  return matches.probeMatch(gameId);
});

route('GET', '/api/spectate/status', async () => matches.getSpectateStatus());
route('GET', '/api/spectate/live', async () => matches.getLiveData());
route('GET', '/api/spectate/snapshot', async ({ q }) => {
  const gameId = q.get('gameId');
  const snap = gameId ? store.readJson(`spectate/live-${gameId}.json`) : null;
  return snap || { none: true };
});

// 自动监控与手动/自动快照接口
route('GET', '/api/watcher/status', async () => watcher.getStatus());
route('POST', '/api/spectate/snapshot/save', async ({ body }) => {
  const gameId = body.gameId || (await matches.getSpectateStatus()).gameId;
  if (!gameId) throw Object.assign(new Error('当前未检测到进行中的比赛 ID'), { status: 400 });
  return watcher.recordSnapshot({ gameId, note: body.note || '', isManual: true });
});
route('GET', '/api/spectate/snapshots', async () => watcher.listSnapshots());
route('GET', '/api/spectate/snapshots/:id', async ({ params }) => {
  const s = watcher.getSnapshot(params.id);
  if (!s) throw Object.assign(new Error('快照未找到'), { status: 404 });
  return s;
});
route('POST', '/api/spectate/snapshots/cleanup', async ({ body }) => {
  if (!body.gameId) throw Object.assign(new Error('缺少有效 gameId'), { status: 400 });
  return watcher.cleanSnapshots(body.gameId);
});
route('DELETE', '/api/spectate/snapshots/:id', async ({ params }) => {
  return watcher.deleteSnapshot(params.id);
});
route('POST', '/api/spectate/auto-archive/start', async ({ body }) => {
  const gameId = Number(body.gameId);
  if (!gameId) throw Object.assign(new Error('缺少有效 gameId'), { status: 400 });
  watcher.startAutoArchive({ gameId, queueName: body.queueName || '手动触发归档', isCustom: true });
  return { ok: true, task: watcher.getStatus().autoArchiveTask };
});
route('POST', '/api/spectate/auto-archive/finalize-now', async ({ body }) => {
  const gameId = Number(body.gameId);
  if (!gameId) throw Object.assign(new Error('缺少有效 gameId'), { status: 400 });
  const bundle = await watcher.finalizeFromSnapshot(gameId, body.queueName || '');
  return { ok: true, bundle, task: watcher.getStatus().autoArchiveTask };
});

// 通过快照 ID 直接以对局详情方式打开预览
route('GET', '/api/match/snapshot/:snapId', async ({ params }) => {
  const s = watcher.getSnapshot(params.snapId);
  if (!s) throw Object.assign(new Error('快照未找到'), { status: 404 });
  const b = analysis.snapshotToMatchBundle(s);
  return {
    gameId: b.gameId,
    isSnapshot: true,
    snapshotId: params.snapId,
    snapshotTime: s.gameTime,
    snapshotNote: s.note || '',
    fetchedAt: s.savedAt,
    digest: matches.digestOf(b),
    game: b.game,
    hasTimeline: !!(b.timeline?.events?.length),
    hasEog: false,
    extras: null,
    inInnerwar: innerwar.list().some((r) => r.gameId === Number(s.gameId)),
    ai: null,
  };
});

route('GET', '/api/history/raw', async ({ q, res }) => {
  const days = Number(q.get('days') || 0);
  const r = await matches.getHistory({ puuid: q.get('puuid') || undefined, days, refresh: q.get('refresh') !== '0' });
  sendDownload(res, `lol-history-raw_${days || 'all'}d_${ts()}.json`, {
    exportedAt: new Date().toISOString(),
    puuid: r.puuid,
    days,
    count: r.games.length,
    games: r.games,
  });
  return null;
});

route('GET', '/api/history/export', async ({ q, res }) => {
  const days = Number(q.get('days') || 0);
  const r = await matches.getHistory({ puuid: q.get('puuid') || undefined, days, refresh: q.get('refresh') !== '0' });
  const bundles = await matches.mapLimit(r.games, 4, (g) => matches.getMatch(g.gameId));
  sendDownload(res, `lol-history-full_${days || 'all'}d_${ts()}.json`, {
    exportedAt: new Date().toISOString(),
    puuid: r.puuid,
    days,
    count: bundles.length,
    matches: bundles,
  });
  return null;
});

const matchView = async (id, refresh) => {
  let b = null;
  let isSnapshot = false;
  try {
    b = await matches.getMatch(id, { refresh });
  } catch (e) {
    // 若 LCU 尚未生成战绩（对局进行中或中途解散），自动回退使用实时快照
    const snap = store.readJson(`spectate/live-${id}.json`) || watcher.getSnapshot(id);
    if (snap && (snap.allPlayers || snap.liveScores)) {
      b = analysis.snapshotToMatchBundle(snap);
      isSnapshot = true;
    } else {
      throw e;
    }
  }
  return {
    gameId: b.gameId,
    isSnapshot,
    snapshotTime: isSnapshot ? (b.game?.snapshotTime || b.game?.gameDuration || 0) : 0,
    fetchedAt: b.fetchedAt || Date.now(),
    digest: matches.digestOf(b),
    game: b.game,
    hasTimeline: !!(b.timeline?.events?.length || b.timeline?.frames?.length),
    hasEog: !!b.eog,
    extras: b.extras || null,
    inInnerwar: innerwar.list().some((r) => r.gameId === Number(id)),
    ai: ai.cachedMatchAnalysis(id),
  };
};
route('GET', '/api/match/:id', async ({ params, q }) => matchView(params.id, q.get('refresh') === '1'));

route('GET', '/api/match/:id/extras', async ({ params, q }) => matches.getExtras(params.id, { refresh: q.get('refresh') === '1' }));

route('GET', '/api/match/:id/raw', async ({ params, q, res }) => {
  const part = q.get('part') || 'bundle';
  let b;
  try {
    b = await matches.getMatch(params.id);
  } catch (e) {
    const snap = store.readJson(`spectate/live-${params.id}.json`) || watcher.getSnapshot(params.id);
    if (snap) b = analysis.snapshotToMatchBundle(snap);
    else throw e;
  }
  let data;
  if (part === 'game') data = b.game;
  else if (part === 'timeline') data = b.timeline;
  else if (part === 'eog') data = b.eog;
  else if (part === 'extras') data = b.extras || (await matches.getExtras(params.id).catch(() => null));
  else if (part === 'digest') data = matches.digestOf(b);
  else data = b;
  if (q.get('download') === '1') {
    sendDownload(res, `lol-match-${params.id}-${part}.json`, data);
    return null;
  }
  return data ?? null;
});

route('POST', '/api/match/:id/ai', async ({ params, body }) => ai.analyzeMatch(params.id, { force: !!body.force }));

// 内战
route('GET', '/api/innerwar', async ({ q }) => {
  const since = Number(q.get('since') || 0);
  return { records: innerwar.list(), stats: innerwar.stats({ since }), ai: ai.cachedInnerwarAnalysis(), aliases: store.getSettings().aliases };
});
route('POST', '/api/innerwar', async ({ body }) => {
  const ids = Array.isArray(body.gameIds) ? body.gameIds : [body.gameId];
  const failed = [];
  for (const id of ids.filter(Boolean)) {
    try {
      await innerwar.add(id, { note: body.note || '' });
    } catch (e) {
      failed.push({ gameId: id, error: e.message });
    }
  }
  return { records: innerwar.list(), failed };
});
route('DELETE', '/api/innerwar/:id', async ({ params }) => ({ records: innerwar.remove(params.id) }));
route('PUT', '/api/innerwar/:id', async ({ params, body }) => {
  innerwar.setNote(params.id, body.note || '');
  return { ok: true };
});
route('PUT', '/api/aliases', async ({ body }) => {
  const s = store.getSettings();
  if (body.alias) s.aliases[body.key] = body.alias;
  else delete s.aliases[body.key];
  store.saveSettings(s);
  return { aliases: s.aliases };
});
route('POST', '/api/innerwar-ai', async ({ body }) => ai.analyzeInnerwar({ force: !!body.force, since: Number(body.since || 0) }));
route('GET', '/api/innerwar/export', async ({ res }) => {
  sendDownload(res, `innerwar-export_${ts()}.json`, { records: innerwar.list(), stats: innerwar.stats() });
  return null;
});

// 设置
const maskSettings = (s) => ({
  ...s,
  openai: { ...s.openai, apiKey: '', hasKey: !!s.openai.apiKey, keyHint: s.openai.apiKey ? '••••' + s.openai.apiKey.slice(-4) : '', envKey: !!process.env.OPENAI_API_KEY },
  lcu: { ...s.lcu, token: s.lcu.token ? '••••' : '' },
});
route('GET', '/api/settings', async () => ({ ...maskSettings(store.getSettings()), dataDir: store.DATA_DIR }));
route('PUT', '/api/settings', async ({ body }) => {
  const s = store.getSettings();
  if (body.openai) {
    const { apiKey, ...rest } = body.openai;
    s.openai = { ...s.openai, ...rest };
    if (typeof apiKey === 'string' && apiKey.trim()) s.openai.apiKey = apiKey.trim();
    if (body.openai.clearKey) s.openai.apiKey = '';
    delete s.openai.clearKey;
    delete s.openai.hasKey;
    delete s.openai.keyHint;
    delete s.openai.envKey;
  }
  if (body.lcu) {
    const { token, ...rest } = body.lcu;
    s.lcu = { ...s.lcu, ...rest };
    if (typeof token === 'string' && token && !token.startsWith('••')) s.lcu.token = token;
    if (token === '') s.lcu.token = '';
  }
  store.saveSettings(s);
  gamedata.resetMemory();
  return maskSettings(s);
});
route('POST', '/api/ai/test', async () => {
  const r = await ai.callOpenAI([{ role: 'user', content: '回复 {"ok":true}' }], { jsonMode: true });
  return { ok: true, model: r.model, reply: r.content.slice(0, 200) };
});

// LCU 原始接口浏览器(只读 GET)
route('GET', '/api/lcu', async ({ q, res }) => {
  const p = q.get('path') || '';
  if (!p.startsWith('/')) throw Object.assign(new Error('path 必须以 / 开头'), { status: 400 });
  const r = await lcu.request('GET', p, LCU_OPTS());
  if (q.get('download') === '1') {
    sendDownload(res, 'lcu-' + p.replace(/[^\w]+/g, '_').slice(0, 60) + '.json', r.body);
    return null;
  }
  return r.body ?? null;
});

// 资源代理(英雄头像/装备图标等),本地缓存
async function proxyAsset(req, res, u) {
  const p = decodeURIComponent(u.pathname.replace(/^\/lcu-asset/, '')) + (u.search || '');
  if (!/^\/lol-game-data\/assets\//i.test(p) && !/^\/lol-champions\//i.test(p) && !/^\/lol-summoner\/v1\/profile-icons\//i.test(p))
    return send(res, 403, 'forbidden');
  const hash = crypto.createHash('sha1').update(p).digest('hex');
  const ext = path.extname(p.split('?')[0]).slice(0, 5) || '.bin';
  const rel = `assets/${hash}${ext}`;
  const hit = store.readBuf(rel);
  const type = MIME[ext] || 'application/octet-stream';
  if (hit) return send(res, 200, hit, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
  try {
    const r = await lcu.getBuffer(p, LCU_OPTS());
    store.writeBuf(rel, r.body);
    send(res, 200, r.body, { 'Content-Type': r.headers['content-type'] || type, 'Cache-Control': 'public, max-age=86400' });
  } catch (e) {
    send(res, e.status || 502, 'asset unavailable');
  }
}

function serveStatic(req, res, u) {
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // 防 DNS rebinding / 跨站:仅允许本机 Host
    const host = (req.headers.host || '').split(':')[0];
    if (host !== '127.0.0.1' && host !== 'localhost') return send(res, 403, 'forbidden host');
    const origin = req.headers.origin;
    if (origin && req.method !== 'GET' && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return send(res, 403, 'forbidden origin');

    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname.startsWith('/lcu-asset/')) return proxyAsset(req, res, u);
    if (!u.pathname.startsWith('/api/')) return serveStatic(req, res, u);

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(u.pathname);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
      const out = await r.handler({ req, res, params, q: u.searchParams, body });
      if (res.writableEnded || res.headersSent) return;
      return send(res, 200, out === undefined ? { ok: true } : out);
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    if (res.headersSent) return res.end();
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    send(res, status === 401 ? 502 : status, { error: e.message });
  }
});

function start(port = PORT) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      watcher.start();
      resolve(port);
    });
  });
}

if (require.main === module) {
  start().then((p) => {
    const url = `http://127.0.0.1:${p}`;
    console.log(`LoL Match Lab 已启动: ${url}`);
    console.log(`数据目录: ${store.DATA_DIR}`);
    console.log(`[AutoSaver] 比赛全自动监控与快照服务已启动`);
    if (process.argv.includes('--open')) {
      require('child_process').exec(`start "" "${url}"`);
    }
  });
}

module.exports = { start, server };
