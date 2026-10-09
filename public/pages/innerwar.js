import {
  G, $, $$, esc, api, post, put, del, toast, fmtDate, fmtDay, fmtDur, fmtNum, fmtK, pct, dispName, champIcon, champName, teamName, teamCls, pctBar,
  showImportModal,
} from '../util.js';
import { generateInnerwarPoster } from '../poster.js';

const state = { since: 0, sinceDays: 0, sort: 'games', dir: -1, matrix: 'with', data: null };

const nameOf = (p) => G.aliases[p.key] || p.alias || p.name;
let curStats = null;
export const setStats = (st) => (curStats = st);
const keyName = (key) => {
  const p = (curStats || state.data?.stats)?.players.find((x) => x.key === key);
  return p ? nameOf(p) : key;
};
const wrCls = (v) => (v >= 0.6 ? 'hi' : v <= 0.4 ? 'lo' : '');

const findPlayerStats = (name) => {
  const st = curStats || state.data?.stats;
  if (!st || !st.players) return null;
  return st.players.find((x) => {
    const an = nameOf(x);
    return (
      an === name ||
      x.name === name ||
      x.key === name ||
      (name && an && (an.includes(name) || name.includes(an))) ||
      (name && x.name && (x.name.includes(name) || name.includes(x.name)))
    );
  });
};

export function summaryHtml(st) {
  const sideWr = (s) => (s.games ? pct(s.wins / s.games) : '-');
  return `<div class="stats">
    <div class="stat"><b>${st.totalGames}</b><span>内战场次</span></div>
    <div class="stat"><b>${st.players.length}</b><span>参与人数</span></div>
    <div class="stat blue"><b>${sideWr(st.sides.blue)}</b><span>蓝方胜率 (${st.sides.blue.wins}/${st.sides.blue.games})</span></div>
    <div class="stat red"><b>${sideWr(st.sides.red)}</b><span>红方胜率 (${st.sides.red.wins}/${st.sides.red.games})</span></div>
    <div class="stat"><b>${st.matches.length ? fmtDur(st.matches.reduce((a, m) => a + m.duration, 0) / st.matches.length) : '-'}</b><span>平均时长</span></div>
  </div>${st.missingCache ? `<div class="notice warn">有 ${st.missingCache} 场记录的本地缓存缺失,未计入统计(需客户端在线重新加入)。</div>` : ''}`;
}

const COLS = [
  ['name', '玩家', (p) => nameOf(p), 'str'],
  ['games', '场次', (p) => p.games],
  ['winRate', '胜率', (p) => p.winRate],
  ['kda', 'KDA', (p) => p.kda],
  ['avgKills', '场均 K/D/A', (p) => p.avgKills],
  ['avgDmg', '场均伤害', (p) => p.avgDmg],
  ['avgDmgShare', '伤害占比', (p) => p.avgDmgShare],
  ['avgTaken', '场均承伤', (p) => p.avgTaken],
  ['avgGold', '场均金币', (p) => p.avgGold],
  ['avgCs', '场均补刀', (p) => p.avgCs],
  ['avgVision', '场均视野', (p) => p.avgVision],
  ['avgKp', '参团率', (p) => p.avgKp],
  ['avgScore', '均分', (p) => p.avgScore],
  ['mvp', 'MVP/ACE', (p) => p.mvp * 100 + p.ace],
];

export function playersTableHtml(st) {
  const col = COLS.find((c) => c[0] === state.sort) || COLS[1];
  const list = [...st.players].sort((a, b) => {
    const x = col[2](a);
    const y = col[2](b);
    return (col[3] === 'str' ? String(x).localeCompare(String(y)) : x - y) * state.dir || b.games - a.games;
  });
  const rate = (s) => (s.games ? `${pct(s.wins / s.games, 0)}<small class="muted"> ${s.wins}/${s.games}</small>` : '-');
  return `<div class="table-wrap"><table class="tbl iw">
    <thead><tr>${COLS.map(([k, l]) => `<th class="sortable ${state.sort === k ? 'sorted' : ''}" data-sort="${k}">${l}${state.sort === k ? (state.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th>蓝/红胜率</th><th>近期</th><th>常用英雄</th></tr></thead>
    <tbody>${list.map((p) => `<tr>
      <td class="nowrap"><b>${esc(nameOf(p))}</b>${p.streak && p.streak.count >= 2 ? ` <span class="chip ${p.streak.type === 'W' ? 'ok' : 'bad'}">${p.streak.count}${p.streak.type === 'W' ? '连胜' : '连败'}</span>` : ''}
        <button class="icon-btn alias" data-key="${esc(p.key)}" data-name="${esc(p.name)}" title="设置别名">✎</button>${G.aliases[p.key] ? `<div class="muted small">${esc(p.name)}</div>` : ''}</td>
      <td class="num">${p.games}</td>
      <td class="num"><b class="wr ${wrCls(p.winRate)}">${pct(p.winRate)}</b><div class="muted small">${p.wins}胜 ${p.losses}负</div>${pctBar(p.winRate, 1, 'win')}</td>
      <td class="num"><b>${p.kda}</b></td>
      <td class="num nowrap">${p.avgKills}/${p.avgDeaths}/${p.avgAssists}</td>
      <td class="num">${fmtNum(p.avgDmg)}</td><td class="num">${pct(p.avgDmgShare, 0)}</td><td class="num">${fmtK(p.avgTaken)}</td>
      <td class="num">${fmtK(p.avgGold)}</td><td class="num">${p.avgCs}</td><td class="num">${p.avgVision}</td><td class="num">${pct(p.avgKp, 0)}</td>
      <td class="num"><b>${p.avgScore}</b></td><td class="num">${p.mvp}/${p.ace}</td>
      <td class="num nowrap"><span class="blue">${rate(p.blue)}</span> · <span class="red">${rate(p.red)}</span></td>
      <td class="nowrap">${p.recent.map((r) => `<i class="rc ${r}">${r}</i>`).join('')}</td>
      <td class="nowrap">${p.champs.slice(0, 4).map((c) => `<span class="cc">${champIcon(c.championId, 'xs')}<small>${c.wins}/${c.games}</small></span>`).join('')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

export function matrixHtml(st, kind) {
  const keys = st.players.filter((p) => p.games > 0).map((p) => p.key);
  if (keys.length < 2) return '<div class="muted">至少需要 2 名玩家</div>';
  const map = new Map();
  if (kind === 'with') for (const e of st.with) map.set(e.a + '|' + e.b, { g: e.games, w: e.wins });
  else for (const e of st.against) map.set(e.a + '|' + e.b, { g: e.games, w: e.aWins });
  const cell = (r, c) => {
    if (r === c) return '<td class="diag">—</td>';
    const flip = r > c;
    const e = map.get(flip ? c + '|' + r : r + '|' + c);
    if (!e || !e.g) return '<td class="muted">·</td>';
    let wr;
    if (kind === 'with') wr = e.w / e.g;
    else wr = flip ? 1 - e.w / e.g : e.w / e.g;
    const hue = Math.round(wr * 120);
    return `<td class="hm" style="background:hsla(${hue},65%,38%,${0.25 + Math.min(0.5, e.g / 12)})" title="${esc(keyName(r))} ${kind === 'with' ? '与' : '对阵'} ${esc(keyName(c))}: ${e.g} 场">${pct(wr, 0)}<small>${e.g}</small></td>`;
  };
  return `<div class="table-wrap"><table class="tbl matrix"><thead><tr><th></th>${keys.map((k) => `<th class="rot"><span>${esc(keyName(k))}</span></th>`).join('')}</tr></thead>
    <tbody>${keys.map((r) => `<tr><th class="nowrap">${esc(keyName(r))}</th>${keys.map((c) => cell(r, c)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted small">${kind === 'with' ? '行玩家与列玩家「同队」时的胜率(右下角小字 = 同队场次)。' : '行玩家对阵列玩家「不同队」时,行玩家的胜率。'}</p>`;
}

export function championsHtml(st) {
  return `<div class="table-wrap short"><table class="tbl"><thead><tr><th>英雄</th><th>场次</th><th>胜率</th><th>场均 KDA</th></tr></thead><tbody>
  ${st.champions.slice(0, 30).map((c) => `<tr><td class="nowrap">${champIcon(c.championId, 'sm')} ${esc(champName(c.championId))}</td><td class="num">${c.games}</td>
    <td class="num"><b class="wr ${wrCls(c.wins / c.games)}">${pct(c.wins / c.games, 0)}</b> <small class="muted">${c.wins}/${c.games}</small></td>
    <td class="num">${(c.kills / c.games).toFixed(1)}/${(c.deaths / c.games).toFixed(1)}/${(c.assists / c.games).toFixed(1)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

export function recordsHtml(st) {
  return st.matches.map((m) => `<div class="rec" data-id="${m.gameId}">
    <div class="rec-head"><a href="#/match/${m.gameId}"><b>${fmtDate(m.date)}</b></a><span class="muted">${fmtDur(m.duration)} · #${m.gameId}</span>
      <input class="note" data-id="${m.gameId}" placeholder="备注(如:第3场/赌注/BO3)" value="${esc(m.note)}">
      <span class="spacer"></span><a class="btn sm ghost" href="#/match/${m.gameId}">详情</a><button class="btn sm ghost rm" data-id="${m.gameId}">移出</button></div>
    <div class="rec-teams">${m.teams.map((t) => `<div class="rt ${teamCls(t.teamId)} ${t.win ? 'won' : ''}"><div class="rt-title">${teamName(t.teamId)} ${t.win ? '🏆 胜' : '败'} <small class="muted">${m.kills[t.teamId]} 杀</small></div>
      ${t.players.map((p) => `<div class="rp">${champIcon(p.championId, 'xs')}<span>${esc(keyName(p.key))}</span><small class="muted">${p.kda}</small>${p.badge ? `<span class="chip ${p.badge === 'MVP' ? 'gold' : 'silver'}">${p.badge}</span>` : ''}</div>`).join('')}</div>`).join('')}</div></div>`).join('') || '<div class="muted">暂无记录</div>';
}

export function aiHtml(r) {
  if (!r) return '';
  const a = r.analysis;
  const meta = `<div class="muted small">模型 ${esc(r.model)} · 生成于 ${fmtDate(r.createdAt)} · 基于 ${r.totalGames} 场${r.usage ? ` · tokens ${r.usage.total_tokens}` : ''}</div>`;
  if (!a) return `<div class="card">${meta}<pre class="pre">${esc(r.raw)}</pre></div>`;
  const li = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join('');
  return `<div class="card">${meta}
    <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0">
      <h3 style="margin:0">总评</h3>
      <button class="btn sm" id="btnShareInnerwarPoster" style="background:#1e6fd9;border-color:#2d7be5">📸 一键生成微信分享长图</button>
    </div>
    <p>${esc(a.summary)}</p>
    ${a.awards?.length ? `<h4>🏅 称号</h4><div class="awards">${a.awards.map((x) => {
      const sp = findPlayerStats(x.name);
      const topC = sp?.champs?.[0];
      return `<div class="award">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          ${topC ? champIcon(topC.championId, 'sm') : ''}
          <div><b>${esc(x.title)}</b><span style="margin-left:6px">${esc(x.name)}</span></div>
        </div>
        <small class="muted">${esc(x.reason)}</small>
      </div>`;
    }).join('')}</div>` : ''}
    ${a.balanceAdvice ? `<h4>⚖ 分队建议</h4><p>${esc(a.balanceAdvice)}</p>` : ''}</div>
    <div class="ai-grid">${(a.players || []).map((p) => {
      const sp = findPlayerStats(p.name);
      const topC = sp?.champs?.[0];
      const poolHtml = sp?.champs?.length ? `<div style="display:flex;gap:4px;margin-top:4px">${sp.champs.slice(0, 3).map(c => `<span class="cc" title="${esc(champName(c.championId))}: ${c.wins}胜/${c.games}场">${champIcon(c.championId, 'xs')}<small>${c.wins}/${c.games}</small></span>`).join('')}</div>` : '';
      return `<div class="card aip">
        <div class="aip-head">
          ${topC ? champIcon(topC.championId, 'md') : '<div class="ico md empty"></div>'}
          <div>
            <b>${esc(p.name)}</b>
            <div class="muted small">${esc(p.profile || (topC ? `招牌英雄: ${champName(topC.championId)}` : ''))}</div>
            ${poolHtml}
          </div>
          <div class="grade g-${esc(String(p.grade || '').toUpperCase())}">${esc(p.grade || '')}<small>${esc(p.rating ?? '')}</small></div>
        </div>
        <h5>👍 优点</h5><ul>${li(p.strengths)}</ul>
        <h5>👎 不足</h5><ul>${li(p.weaknesses)}</ul>
        <h5>💡 建议</h5><ul>${li(p.advice)}</ul>
      </div>`;
    }).join('')}</div>`;
}

export async function render(app, _p, alive) {
  const load = async () => {
    state.since = state.sinceDays ? Date.now() - state.sinceDays * 86400000 : 0;
    state.data = await api('/api/innerwar?since=' + state.since);
    G.aliases = state.data.aliases || G.aliases;
    setStats(state.data.stats);
  };
  await load();
  if (!alive()) return;

  const paint = () => {
    const { stats: st } = state.data;
    app.innerHTML = `
    <section class="card"><div class="toolbar">
      <h2 style="margin:0">内战统计</h2>
      <label>统计范围 <select id="since">${[[0, '全部'], [7, '最近 7 天'], [30, '最近 30 天'], [90, '最近 90 天']].map(([v, l]) => `<option value="${v}" ${state.since === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="spacer"></span>
      <button class="btn sm" id="btnShareInnerwarTop" style="background:#1e6fd9;border-color:#2d7be5" title="一键生成朋友圈内战风云长图">📸 微信分享风云榜</button>
      <a class="btn ghost" href="/api/innerwar/export" download>⬇ 导出统计 JSON</a>
      <button class="btn" id="btnImportGame">📥 导入对局 (Game ID)</button>
      <a class="btn ghost" href="#/history">+ 从对局历史添加</a></div>
      ${st.totalGames ? summaryHtml(st) : `<div class="empty"><p>还没有内战记录。</p><p class="muted">到「对局历史」页勾选「仅自定义(内战)」→「选中全部自定义对局」→「加入内战记录」,或在单场详情页点击「加入内战记录」。</p><a class="btn" href="#/history">去对局历史</a></div>`}
    </section>
    ${st.totalGames ? `
    <section class="card"><h3>成员数据 <small class="muted">(点击表头排序;胜率与表现以「全部玩家」计)</small></h3><div id="ptable">${playersTableHtml(st)}</div></section>
    <div class="cols2">
      <section class="card"><div class="toolbar"><h3 style="margin:0">搭档 / 对位胜率</h3><span class="spacer"></span>
        <select id="mtx"><option value="with" ${state.matrix === 'with' ? 'selected' : ''}>同队胜率</option><option value="against" ${state.matrix === 'against' ? 'selected' : ''}>对位胜率</option></select></div><div id="matrix">${matrixHtml(st, state.matrix)}</div></section>
      <section class="card"><h3>英雄胜率</h3>${championsHtml(st)}</section>
    </div>
    <section class="card"><div class="toolbar"><h3 style="margin:0">✨ AI 成员表现分析</h3><span class="spacer"></span>
      <button class="btn" id="runAi" ${G.status?.ai?.configured ? '' : 'disabled'}>${state.data.ai ? '↻ 重新分析' : '生成整体分析'}</button></div>
      ${G.status?.ai?.configured ? '<p class="muted small">基于所有内战场次的累计数据,由 OpenAI 评价每位成员并给出分队建议。单场分析请在对局详情页「AI 分析」。</p>' : '<p class="muted">请先在「设置」页配置 OpenAI API Key。</p>'}
      <div id="aiOut">${aiHtml(state.data.ai)}</div></section>
    <section class="card"><h3>对局记录 <small class="muted">${st.matches.length} 场</small></h3><div id="records">${recordsHtml(st)}</div></section>` : ''}`;
  };

  // 统计范围:下拉保存"天数"(state.sinceDays),请求时换算为时间戳(state.since)
  const origPaint = paint;
  const paint2 = () => {
    origPaint();
    const sel = $('#since');
    if (sel) {
      sel.value = String(state.sinceDays);
      sel.onchange = async (e) => {
        state.sinceDays = Number(e.target.value);
        state.since = state.sinceDays ? Date.now() - state.sinceDays * 86400000 : 0;
        await load();
        paint2();
      };
    }
    $('#btnImportGame')?.addEventListener('click', () => {
      showImportModal('', async () => {
        await load();
        paint2();
      });
    });
    $('#ptable')?.addEventListener('click', (e) => {
      const th = e.target.closest('[data-sort]');
      if (!th) return;
      if (state.sort === th.dataset.sort) state.dir *= -1;
      else ((state.sort = th.dataset.sort), (state.dir = th.dataset.sort === 'name' ? 1 : -1));
      $('#ptable').innerHTML = playersTableHtml(state.data.stats);
    });
    $('#mtx')?.addEventListener('change', (e) => {
      state.matrix = e.target.value;
      $('#matrix').innerHTML = matrixHtml(state.data.stats, state.matrix);
    });
    $('#runAi')?.addEventListener('click', async (e) => {
      const b = e.target;
      b.disabled = true;
      b.textContent = '分析中…(可能需要 30~90 秒)';
      try {
        state.data.ai = await post('/api/innerwar-ai', { force: true, since: state.since });
        toast('分析完成', 'ok');
      } catch (err) {
        toast(err.message, 'error', 8000);
      }
      paint2();
    });
    const doShareInnerwar = () => {
      if (!state.data?.stats) return toast('暂无内战数据', 'warn');
      generateInnerwarPoster(state.data.stats, state.data.ai);
    };
    $('#btnShareInnerwarTop')?.addEventListener('click', doShareInnerwar);
    $('#btnShareInnerwarPoster')?.addEventListener('click', doShareInnerwar);
  };
  app.onclick = async (e) => {
    const a = e.target.closest('.alias');
    if (a) {
      const v = prompt(`为 ${a.dataset.name} 设置别名(留空清除)`, G.aliases[a.dataset.key] || '');
      if (v === null) return;
      const r = await put('/api/aliases', { key: a.dataset.key, alias: v.trim() });
      G.aliases = r.aliases;
      state.data.aliases = r.aliases;
      await load();
      return paint2();
    }
    const rm = e.target.closest('.rm');
    if (rm && confirm('将这场对局移出内战记录?')) {
      await del('/api/innerwar/' + rm.dataset.id);
      await load();
      paint2();
    }
  };
  app.onchange = async (e) => {
    const n = e.target.closest('.note');
    if (n) await put('/api/innerwar/' + n.dataset.id, { note: n.value });
  };
  paint2();
}
