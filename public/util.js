// 前端公共工具:HTML 转义、API、图标、格式化
export const G = { gd: {}, status: null, settings: null, aliases: {} };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}
export const send = (method, path, body) =>
  api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
export const post = (p, b) => send('POST', p, b);
export const put = (p, b) => send('PUT', p, b);
export const del = (p) => api(p, { method: 'DELETE' });

// ---------- toast ----------
export function toast(msg, type = 'info', ms = 3500) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- 格式化 ----------
export const fmtNum = (n) => (n == null ? '-' : Number(n).toLocaleString('en-US'));
export const fmtK = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : fmtNum(Math.round(n)));
export const pct = (v, d = 1) => (v == null || isNaN(v) ? '-' : (v * 100).toFixed(d) + '%');
export const fmtDur = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
export const fmtMs = (ms) => fmtDur(ms / 1000);
export const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtDay = (ms) => fmtDate(ms).slice(0, 10);
export const kdaStr = (g) => `${g.kills}/${g.deaths}/${g.assists}`;
export const kdaRatio = (k, d, a) => ((k + a) / Math.max(1, d)).toFixed(2);

// ---------- 静态数据查询 ----------
export const champ = (id) => G.gd.champions?.[id];
export const champName = (id) => champ(id)?.name || (id ? `英雄#${id}` : '?');
export const queueName = (id, mode) => G.gd.queues?.[id]?.name || (mode ? mode : `队列#${id}`);
const MAP_NAMES = { 1: '召唤师峡谷(旧)', 8: '水晶之痕', 10: '扭曲丛林', 11: '召唤师峡谷', 12: '嚎哭深渊', 14: '屠夫之桥', 16: '宇宙遗迹', 18: '瓦洛兰城市公园', 19: '失控战场', 20: '极地大乱斗(旧)', 21: '极限闪击', 22: '云顶之弈', 30: '斗魂竞技场' };
export const mapName = (id) => MAP_NAMES[id] || `地图#${id}`;
export const teamName = (id) => (id === 100 ? '蓝色方' : id === 200 ? '红色方' : `队伍 ${id}`);
export const teamCls = (id) => (id === 100 ? 'blue' : id === 200 ? 'red' : 'other');
export const dispName = (p) => G.aliases[p.key] || p.name;

const A = (p) => (p ? '/lcu-asset' + p : '');
const tip = (s) => esc(s || '');

export function champIcon(id, cls = '') {
  if (!id) return `<span class="ico empty ${cls}"></span>`;
  return `<img class="ico ${cls}" loading="lazy" src="/lcu-asset/lol-game-data/assets/v1/champion-icons/${id}.png" title="${tip(champName(id))}" alt="">`;
}
export function itemIcon(id, cls = '') {
  if (!id) return `<span class="ico sm empty ${cls}"></span>`;
  const it = G.gd.items?.[id];
  const t = it ? `${it.name}${it.price ? ` (${it.price}g)` : ''}\n${it.desc || ''}` : `装备#${id}`;
  return it?.icon
    ? `<img class="ico sm ${cls}" loading="lazy" src="${A(it.icon)}" title="${tip(t)}" alt="">`
    : `<span class="ico sm unknown ${cls}" title="${tip(t)}">?</span>`;
}
export function spellIcon(id) {
  const s = G.gd.spells?.[id];
  return s?.icon
    ? `<img class="ico xs" loading="lazy" src="${A(s.icon)}" title="${tip(s.name + '\n' + (s.desc || ''))}" alt="">`
    : `<span class="ico xs empty" title="${tip('技能#' + id)}"></span>`;
}
export function perkIcon(id) {
  const p = G.gd.perks?.[id];
  if (!id) return '';
  return p?.icon
    ? `<img class="ico xs round" loading="lazy" src="${A(p.icon)}" title="${tip(p.name + '\n' + (p.desc || ''))}" alt="">`
    : `<span class="ico xs unknown" title="${tip('符文#' + id)}">?</span>`;
}
export function styleIcon(id) {
  const s = G.gd.styles?.[id];
  if (!id) return '';
  return s?.icon ? `<img class="ico xs" loading="lazy" src="${A(s.icon)}" title="${tip(s.name)}" alt="">` : '';
}
export function augmentIcon(id) {
  const a = G.gd.augments?.[id];
  if (!a) return `<span class="chip" title="强化符文#${id}">#${id}</span>`;
  return a.icon
    ? `<img class="ico xs aug ${a.rarity || ''}" loading="lazy" src="${A(a.icon)}" title="${tip(a.name + ' (' + String(a.rarity || '').replace('k', '') + ')')}" alt="">`
    : `<span class="chip" title="${tip(a.name)}">${esc(a.name)}</span>`;
}
export const profileIcon = (id) =>
  id ? `<img class="ico sm round" loading="lazy" src="/lcu-asset/lol-game-data/assets/v1/profile-icons/${id}.jpg" alt="">` : '';

// 结果徽标
export const resultBadge = (win, remake) =>
  remake ? '<span class="badge remake">重开</span>' : win ? '<span class="badge win">胜利</span>' : '<span class="badge loss">失败</span>';

// 服务器与大区定义
export const REGION_MAP = {
  EUW1: { key: 'EUW', code: 'EUW1', name: '欧服', full: '西欧服 (EUW)', flag: '🇪🇺', color: '#38bdf8' },
  EUW: { key: 'EUW', code: 'EUW1', name: '欧服', full: '西欧服 (EUW)', flag: '🇪🇺', color: '#38bdf8' },
  ME1: { key: 'ME', code: 'ME1', name: '中东服', full: '中东服 (ME)', flag: '🇦🇪', color: '#34d399' },
  ME: { key: 'ME', code: 'ME1', name: '中东服', full: '中东服 (ME)', flag: '🇦🇪', color: '#34d399' },
  EUN1: { key: 'EUNE', code: 'EUN1', name: '东欧服', full: '北欧与东欧 (EUNE)', flag: '🇪🇺', color: '#60a5fa' },
  NA1: { key: 'NA', code: 'NA1', name: '美服', full: '北美服 (NA)', flag: '🇺🇸', color: '#f87171' },
  KR: { key: 'KR', code: 'KR', name: '韩服', full: '韩服 (KR)', flag: '🇰🇷', color: '#fb923c' },
  TW2: { key: 'TW', code: 'TW2', name: '台服', full: '中国台湾 (TW)', flag: '🇹🇼', color: '#f472b6' },
  SG2: { key: 'SG', code: 'SG2', name: '新马服', full: '新加坡 (SG)', flag: '🇸🇬', color: '#a78bfa' },
  JP1: { key: 'JP', code: 'JP1', name: '日服', full: '日本服 (JP)', flag: '🇯🇵', color: '#fb7185' },
};

export function regionInfo(platformId, gameId) {
  let pid = String(platformId || '').toUpperCase();
  if (!pid && gameId) {
    const gid = Number(gameId);
    if (gid > 5000000000) pid = 'EUW1';
    else if (gid > 10000000 && gid < 50000000) pid = 'ME1';
  }
  return REGION_MAP[pid] || (pid ? { key: pid, code: pid, name: pid, full: pid, flag: '🌐', color: '#94a3b8' } : null);
}

export function regionBadge(platformId, gameId) {
  const r = regionInfo(platformId, gameId);
  if (!r) return '';
  return `<span class="chip region ${r.key.toLowerCase()}" title="${esc(r.full)}">${r.flag} ${esc(r.name)}</span>`;
}

export const pctBar = (v, max = 1, cls = '') =>
  `<span class="bar ${cls}"><i style="width:${Math.min(100, Math.max(0, (v / (max || 1)) * 100)).toFixed(1)}%"></i></span>`;

// 简易 SVG 折线图。series: [{name,color,data:[y...]}], xs: 横坐标标签数组
export function lineChart({ series, xs, height = 240, width = 1100, zero = false, fmtY = (v) => fmtK(v), fill = false }) {
  const padL = 52,
    padR = 12,
    padT = 10,
    padB = 24;
  const all = series.flatMap((s) => s.data).filter((v) => v != null);
  if (!all.length) return '<div class="muted">无数据</div>';
  let min = Math.min(...all, zero ? 0 : Infinity);
  let max = Math.max(...all, zero ? 0 : -Infinity);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const W = width - padL - padR;
  const H = height - padT - padB;
  const n = xs.length;
  const x = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * H;
  const ticks = 4;
  let g = '';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    g += `<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${fmtY(v)}</text>`;
  }
  const step = Math.max(1, Math.ceil(n / 12));
  xs.forEach((l, i) => {
    if (i % step === 0) g += `<text x="${x(i)}" y="${height - 6}" text-anchor="middle" class="axis">${l}</text>`;
  });
  if (zero && min < 0 && max > 0) g += `<line x1="${padL}" x2="${width - padR}" y1="${y(0)}" y2="${y(0)}" class="zero"/>`;
  const paths = series
    .map((s) => {
      const pts = s.data.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
      if (!pts.length) return '';
      let out = `<polyline fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" points="${pts.join(' ')}" ${s.dash ? 'stroke-dasharray="4 3"' : ''}><title>${esc(s.name)}</title></polyline>`;
      if (fill) out = `<polygon points="${x(0)},${y(0)} ${pts.join(' ')} ${x(n - 1)},${y(0)}" fill="${s.color}" opacity=".18"/>` + out;
      return out;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="xMidYMid meet">${g}${paths}</svg>`;
}

// 折叠式 JSON 树(惰性渲染)
export function jsonTreeHtml(value, key = '', open = false, depth = 0) {
  const k = key !== '' ? `<span class="jk">${esc(key)}</span>: ` : '';
  if (value === null) return `<div class="jl">${k}<span class="jnull">null</span></div>`;
  if (typeof value !== 'object') {
    const cls = typeof value === 'string' ? 'jstr' : typeof value === 'number' ? 'jnum' : 'jbool';
    const shown = typeof value === 'string' ? `"${esc(value.length > 400 ? value.slice(0, 400) + '…' : value)}"` : esc(value);
    return `<div class="jl">${k}<span class="${cls}">${shown}</span></div>`;
  }
  const isArr = Array.isArray(value);
  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  const label = isArr ? `[${entries.length}]` : `{${entries.length}}`;
  const id = 'jt' + Math.random().toString(36).slice(2, 9);
  jtStore.set(id, entries);
  return `<details class="jd" data-jt="${id}" data-depth="${depth}" ${open ? 'open' : ''}><summary>${k}<span class="jmeta">${label}</span></summary><div class="jc"></div></details>`;
}
const jtStore = new Map();
export function bindJsonTrees(root) {
  const fill = (d) => {
    const c = d.querySelector(':scope > .jc');
    if (c.dataset.filled) return;
    c.dataset.filled = '1';
    const entries = jtStore.get(d.dataset.jt) || [];
    const depth = Number(d.dataset.depth) + 1;
    const MAX = 300;
    c.innerHTML =
      entries.slice(0, MAX).map(([k, v]) => jsonTreeHtml(v, String(k), false, depth)).join('') +
      (entries.length > MAX ? `<div class="muted">… 还有 ${entries.length - MAX} 项(请下载 JSON 查看)</div>` : '');
    bindJsonTrees(c);
  };
  $$('details.jd', root).forEach((d) => {
    if (d.dataset.bound) return;
    d.dataset.bound = '1';
    if (d.open) fill(d);
    d.addEventListener('toggle', () => d.open && fill(d));
  });
}

// 下载一个 URL(用于 <a download>)
export const dl = (href, label, cls = 'btn') => `<a class="${cls}" href="${href}" download>${label}</a>`;

// ---------- 通用模态框 Modal ----------
export function openModal({ title, bodyHtml, onRender, wide = false, className = '' }) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''} ${className}">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="modal-close" title="关闭">&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(el);

  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  el.querySelector('.modal-close').onclick = close;
  el.onclick = (e) => {
    if (e.target === el) close();
  };

  if (onRender) onRender({ modal: el.querySelector('.modal'), close });
  return { close, el };
}

// 快捷弹窗: 导入对局 (Game ID)
export function showImportModal(defaultGameId = '', onDone) {
  openModal({
    title: '📥 导入对局 (Game ID)',
    bodyHtml: `
      <p class="muted small" style="margin-top:0">输入任意已结束的比赛 ID，可直接从客户端拉取全场 10 人的完整战绩与时间线数据。</p>
      <div class="form" style="display:flex;flex-direction:column;gap:12px;margin:12px 0">
        <label>对局 ID (gameId)
          <input id="modalImportGameId" type="number" placeholder="例如: 8006902957" value="${esc(defaultGameId)}" style="width:100%">
        </label>
        <label class="chk" style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="modalImportToInnerwar" checked> 同时加入内战统计
        </label>
        <label>内战备注 (可选)
          <input id="modalImportNote" placeholder="例如: 友谊赛第1场" style="width:100%">
        </label>
      </div>
      <div id="modalImportErr" style="display:none;background:#241515;border:1px solid #5a2727;border-radius:8px;padding:12px;margin-top:12px;font-size:12px;line-height:1.6;color:#fca5a5"></div>
      <div class="modal-actions">
        <button class="btn ghost" id="modalCancel">取消</button>
        <button class="btn" id="modalSubmit">开始导入</button>
      </div>`,
    onRender: ({ modal, close }) => {
      const idInput = modal.querySelector('#modalImportGameId');
      const submitBtn = modal.querySelector('#modalSubmit');
      const errBox = modal.querySelector('#modalImportErr');
      idInput.focus();
      modal.querySelector('#modalCancel').onclick = close;

      const doSubmit = async () => {
        const gameId = Number(idInput.value.trim());
        if (!gameId) return toast('请输入有效的数字对局 ID', 'warn');
        submitBtn.disabled = true;
        submitBtn.textContent = '导入中…';
        if (errBox) errBox.style.display = 'none';

        try {
          const res = await post('/api/match/import', {
            gameId,
            addToInnerwar: modal.querySelector('#modalImportToInnerwar').checked,
            note: modal.querySelector('#modalImportNote').value.trim(),
          });
          toast(`对局 #${gameId} 导入成功！`, 'ok');
          close();
          if (onDone) onDone(res);
          else location.hash = `#/match/${gameId}`;
        } catch (e) {
          submitBtn.disabled = false;
          submitBtn.textContent = '🔄 重试导入';
          const is404 = e.message && (e.message.includes('404') || e.message.includes('未找到') || e.message.includes('尚未结束'));
          if (errBox) {
            errBox.style.display = 'block';
            errBox.innerHTML = `
              <div style="font-weight:600;margin-bottom:6px">❌ 导入提示：${esc(e.message)}</div>
              ${is404 ? `
              <div style="color:#fecaca;margin-top:8px;border-top:1px dashed #7f1d1d;padding-top:8px">
                <b>💡 为什么会报此错误？</b>
                <ol style="margin:4px 0 6px 18px;padding:0">
                  <li><b>比赛尚未打完</b>：若您提前退出观战，但召唤师峡谷内 10 位选手还在对局中，必须等待推平水晶或投降后，官方服务器才会生成比赛记录。</li>
                  <li><b>刚打完云端正在归档</b>：水晶爆炸结算后，拳头服务器通常需 <b>30 秒 ~ 2 分钟</b> 生成战绩索引，请稍候片刻点击上方「重试导入」。</li>
                  <li><b>中途退出 / 废局解散</b>：如果是测试对局中途 Esc 退出解散，官方不会生成赛后战绩。</li>
                </ol>
                <div id="modalSnapArea" style="margin-top:8px"></div>
              </div>` : ''}
            `;

            // 检查是否有本地实时观战快照
            api(`/api/spectate/snapshot?gameId=${gameId}`).then((snap) => {
              if (snap && snap.gameId) {
                const snapArea = errBox.querySelector('#modalSnapArea');
                if (snapArea) {
                  snapArea.innerHTML = `
                    <div style="background:#131d2a;border:1px solid #28446b;border-radius:6px;padding:8px;color:#93c5fd;display:flex;align-items:center;justify-content:space-between">
                      <span>📸 检测到本地曾保存该对局的实时观战快照 (进行至 ${Math.floor((snap.gameTime||0)/60)}分${(snap.gameTime||0)%60}秒)</span>
                      <button class="btn sm" id="btnViewSnap" style="background:#2563eb;color:#fff">查看快照</button>
                    </div>`;
                  snapArea.querySelector('#btnViewSnap').onclick = () => {
                    close();
                    showLiveModal();
                  };
                }
              }
            }).catch(() => {});
          } else {
            toast(e.message, 'error', 6000);
          }
        }
      };

      submitBtn.onclick = doSubmit;
      idInput.onkeydown = (e) => e.key === 'Enter' && doSubmit();
    },
  });
}

// 快捷弹窗: 实时观战数据看板 (支持实时抓取 & 历史快照回顾)
export function showLiveModal(staticSnapshot = null) {
  let timer = null;
  const isStatic = !!staticSnapshot;
  const { close } = openModal({
    title: isStatic
      ? `📸 比赛快照回顾 #${staticSnapshot.gameId} (${fmtDur(staticSnapshot.gameTime || 0)})`
      : '📊 实时观战数据看板 (Live Client Data)',
    wide: true,
    className: 'live-modal',
    bodyHtml: `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div class="muted small">
          ${
            isStatic
              ? `快照保存于: ${new Date(staticSnapshot.savedAt || Date.now()).toLocaleString()} · 备注: ${esc(
                  staticSnapshot.note || '中途快照'
                )}`
              : '⚡ 正在从本地 2999 端口采集 10 人实时出装与战况'
          }
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${
            !isStatic
              ? `<button class="btn sm" id="btnLiveSaveSnap" style="background:#166534;border-color:#22c55e">💾 立即保存当前快照</button>
                 <button class="btn sm ghost" id="btnLiveSnapList">📸 快照历史库</button>`
              : `<button class="btn sm ghost" id="btnLiveSnapList">📸 返回快照历史</button>
                 <button class="btn sm" id="btnExportSnapJson">📥 导出快照 JSON</button>`
          }
        </div>
      </div>
      <div id="liveModalContent"><div class="loading">正在加载数据…</div></div>`,
    onRender: ({ modal }) => {
      const container = modal.querySelector('#liveModalContent');
      let active = true;

      const btnSaveSnap = modal.querySelector('#btnLiveSaveSnap');
      if (btnSaveSnap) {
        btnSaveSnap.onclick = async () => {
          btnSaveSnap.disabled = true;
          btnSaveSnap.textContent = '保存中…';
          try {
            const res = await post('/api/spectate/snapshot/save', { note: '看板手动保存' });
            toast(`已安全存盘！快照 #${res.gameId} (${fmtDur(res.gameTime)}) 已存入本地快照库。`, 'ok');
            btnSaveSnap.textContent = '✅ 已保存';
            setTimeout(() => {
              btnSaveSnap.disabled = false;
              btnSaveSnap.textContent = '💾 立即保存当前快照';
            }, 3000);
          } catch (e) {
            toast('保存失败: ' + e.message, 'error');
            btnSaveSnap.disabled = false;
            btnSaveSnap.textContent = '💾 立即保存当前快照';
          }
        };
      }

      const btnSnapList = modal.querySelector('#btnLiveSnapList');
      if (btnSnapList) {
        btnSnapList.onclick = () => {
          close();
          showSnapshotsModal();
        };
      }

      const btnExportSnap = modal.querySelector('#btnExportSnapJson');
      if (btnExportSnap && isStatic) {
        btnExportSnap.onclick = () => {
          const blob = new Blob([JSON.stringify(staticSnapshot, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `snapshot_${staticSnapshot.gameId}_${staticSnapshot.gameTime}s.json`;
          a.click();
        };
      }

      const renderView = (data) => {
        const gameTime = data.gameData?.gameTime || data.gameTime || 0;
        const players = data.allPlayers || [];

        // 分队: 蓝方 5 人(Team 100 / ORDER) vs 红方 5 人(Team 200 / CHAOS)
        const blue = players.filter((p) => p.team === 'ORDER' || p.team === '100');
        const red = players.filter((p) => p.team === 'CHAOS' || p.team === '200');
        const bTeam = blue.length === 5 ? blue : players.slice(0, 5);
        const rTeam = red.length === 5 ? red : players.slice(5, 10);

        const sumKills = (arr) => arr.reduce((a, p) => a + (p.scores?.kills || 0), 0);
        const tableRows = (list) =>
          list
            .map((p) => {
              const s = p.scores || {};
              const kda = `${s.kills || 0}/${s.deaths || 0}/${s.assists || 0}`;
              const itemsHtml = (p.items || [])
                .map((i) => (i.itemID || i.id ? itemIcon(i.itemID || i.id, 'xs') : ''))
                .join('');
              const rawName = p.summonerName || p.riotId || '未知';
              return `
              <tr class="${p.isDead ? 'dead' : ''}">
                <td class="nowrap">
                  <span class="live-pname" title="${esc(rawName)}"><b>${esc(rawName)}</b></span>
                  ${p.isDead ? `<span class="dead-tag">阵亡 (${Math.ceil(p.respawnTimer || 0)}s)</span>` : ''}
                </td>
                <td class="nowrap">${esc(p.championName)} <span class="muted small">Lv.${p.level}</span></td>
                <td class="nowrap"><b>${kda}</b></td>
                <td class="num">${s.creepScore || 0}</td>
                <td class="num">${(s.wardScore || 0).toFixed(1)}</td>
                <td class="items">${itemsHtml || '<span class="muted">-</span>'}</td>
              </tr>`;
            })
            .join('');

        container.innerHTML = `
          <div class="live-board-head">
            <div>
              <span class="pulse-dot ${isStatic ? 'warn' : ''}"></span>
              <b>${isStatic ? '快照数据存档' : '正在观战'}</b>
              <span class="muted" style="margin-left:8px">模式: ${esc(data.gameData?.gameMode || 'CUSTOM')}</span>
            </div>
            <div class="live-scoreline">
              <span class="blue">${sumKills(bTeam)}</span>
              <span class="muted" style="font-size:13px">${fmtDur(gameTime)}</span>
              <span class="red">${sumKills(rTeam)}</span>
            </div>
            <div class="muted small">${isStatic ? '静态存盘数据' : '自动每 3 秒刷新一次'}</div>
          </div>
          <div class="live-cols">
            <div class="card team blue" style="padding:10px;margin-bottom:0">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <h4 style="margin:0" class="blue">蓝色方</h4>
                <span class="muted small">击杀: ${sumKills(bTeam)}</span>
              </div>
              <div class="table-wrap">
                <table class="live-tbl">
                  <thead><tr><th>玩家</th><th>英雄</th><th>KDA</th><th>补刀</th><th>视野</th><th>装备</th></tr></thead>
                  <tbody>${tableRows(bTeam)}</tbody>
                </table>
              </div>
            </div>
            <div class="card team red" style="padding:10px;margin-bottom:0">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <h4 style="margin:0" class="red">红色方</h4>
                <span class="muted small">击杀: ${sumKills(rTeam)}</span>
              </div>
              <div class="table-wrap">
                <table class="live-tbl">
                  <thead><tr><th>玩家</th><th>英雄</th><th>KDA</th><th>补刀</th><th>视野</th><th>装备</th></tr></thead>
                  <tbody>${tableRows(rTeam)}</tbody>
                </table>
              </div>
            </div>
          </div>`;
      };

      if (isStatic) {
        renderView(staticSnapshot);
      } else {
        const renderLive = async () => {
          if (!active) return;
          try {
            const data = await api('/api/spectate/live');
            if (!active) return;
            renderView(data);
          } catch (e) {
            container.innerHTML = `<div class="error" style="padding:20px;text-align:center">获取实时数据失败: ${esc(
              e.message
            )}<br><small class="muted">请确认游戏进程 League of Legends.exe 已在观战中运行</small></div>`;
          }
        };
        renderLive();
        timer = setInterval(renderLive, 3000);
      }

      // 弹窗关闭时清除定时器
      const origClose = close;
      modal.querySelector('.modal-close').onclick = () => {
        active = false;
        if (timer) clearInterval(timer);
        origClose();
      };
    },
  });
}

// 快捷弹窗: 观战快照历史库
export async function showSnapshotsModal() {
  const { close } = openModal({
    title: '📸 观战与实时对局快照库 (Live Snapshots)',
    wide: true,
    bodyHtml: `
      <div id="snapsModalContent"><div class="loading">正在加载快照列表…</div></div>`,
    onRender: async ({ modal }) => {
      const container = modal.querySelector('#snapsModalContent');

      const loadAndRender = async () => {
        try {
          const list = await api('/api/spectate/snapshots');
          if (!list || list.length === 0) {
            container.innerHTML = `
              <div class="card empty" style="text-align:center;padding:32px">
                <div style="font-size:32px;margin-bottom:8px">📸</div>
                <p>暂无已保存的快照记录</p>
                <div class="muted small">在观战或进行对局时，每 1 分钟系统会自动定格快照，您也可随时点击「💾 保存当前快照」！</div>
              </div>`;
            return;
          }

          container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
              <p class="muted small" style="margin:0">
                每 1 分钟自动记录快照，或随时手动保存。即使对局中途解散退出，数据也已永久保存在本地，可随时作为比赛详情提前预览。
              </p>
              <button class="btn sm ghost" id="btnCleanupSnaps" title="保留每局最新版和全部手动存档，清理中间密集自动切片">🧹 智能清理中间切片</button>
            </div>
            <table class="live-tbl" style="margin-top:6px">
              <thead>
                <tr>
                  <th>对局 ID</th>
                  <th>保存时间</th>
                  <th>对局进度</th>
                  <th>类型/备注</th>
                  <th>选手人数</th>
                  <th style="text-align:right">操作</th>
                </tr>
              </thead>
              <tbody>
                ${list
                  .map(
                    (s) => `
                  <tr>
                    <td><b>#${s.gameId}</b></td>
                    <td class="muted small">${new Date(s.savedAt).toLocaleString()}</td>
                    <td><span class="badge ok">${fmtDur(s.gameTime)}</span></td>
                    <td>${s.isManual ? '<span class="badge">手动保存</span>' : '<span class="badge ghost">自动快照</span>'} <span class="small">${esc(
                      s.note || ''
                    )}</span></td>
                    <td>${s.playerCount || 10} 人</td>
                    <td style="text-align:right" class="nowrap">
                      <button class="btn sm" data-match-view="${esc(s.gameId)}" title="在比赛详情页提前查看 10 人数据与图表">📊 对局详情</button>
                      <button class="btn sm ghost" data-view-snap="${esc(s.id)}">👀 看板</button>
                      <a class="btn sm ghost" href="/api/spectate/snapshots/${esc(s.id)}" download="snap_${s.gameId}_${s.gameTime}s.json" title="下载原始 JSON">📥</a>
                      <button class="btn sm ghost" data-del-snap="${esc(s.id)}" style="color:var(--bad)" title="删除此快照">&times;</button>
                    </td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`;

          const btnCleanup = container.querySelector('#btnCleanupSnaps');
          if (btnCleanup) {
            btnCleanup.onclick = async () => {
              btnCleanup.disabled = true;
              btnCleanup.textContent = '清理中…';
              try {
                const uniqueGames = [...new Set(list.map((x) => x.gameId))];
                let prunedTotal = 0;
                for (const gid of uniqueGames) {
                  const res = await post('/api/spectate/snapshots/cleanup', { gameId: gid });
                  prunedTotal += res.prunedCount || 0;
                }
                toast(`智能清理完成！已清理 ${prunedTotal} 份中间自动快照，最新版与手动存档均已保留。`, 'ok');
                loadAndRender();
              } catch (e) {
                toast('清理失败: ' + e.message, 'error');
                btnCleanup.disabled = false;
                btnCleanup.textContent = '🧹 智能清理中间切片';
              }
            };
          }

          container.querySelectorAll('button[data-match-view]').forEach((btn) => {
            btn.onclick = () => {
              const gid = btn.getAttribute('data-match-view');
              close();
              location.hash = `#/match/${gid}`;
            };
          });

          container.querySelectorAll('button[data-view-snap]').forEach((btn) => {
            btn.onclick = async () => {
              const snapId = btn.getAttribute('data-view-snap');
              try {
                const snapData = await api(`/api/spectate/snapshots/${snapId}`);
                close();
                showLiveModal(snapData);
              } catch (e) {
                toast('读取快照失败: ' + e.message, 'error');
              }
            };
          });

          container.querySelectorAll('button[data-del-snap]').forEach((btn) => {
            btn.onclick = async () => {
              const snapId = btn.getAttribute('data-del-snap');
              try {
                await api(`/api/spectate/snapshots/${snapId}`, { method: 'DELETE' });
                toast('快照已删除', 'ok');
                loadAndRender();
              } catch (e) {
                toast('删除失败: ' + e.message, 'error');
              }
            };
          });
        } catch (e) {
          container.innerHTML = `<div class="error">读取快照失败: ${esc(e.message)}</div>`;
        }
      };

      loadAndRender();
    },
  });
}
