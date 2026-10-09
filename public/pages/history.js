import {
  G, $, $$, esc, api, post, toast, fmtDate, fmtDur, fmtK, pct, kdaStr, kdaRatio,
  champIcon, champName, itemIcon, spellIcon, queueName, resultBadge, profileIcon, showImportModal,
} from '../util.js';

const state = {
  days: 7,
  customDays: '',
  onlyCustom: false,
  onlyImported: false,
  queue: '',
  puuid: '',
  targetPlayer: null,
  searchQuery: '',
  result: '',
  data: null,
  sel: new Set(),
};

function getRecentPlayers() {
  try {
    return JSON.parse(localStorage.getItem('recentPlayers') || '[]');
  } catch {
    return [];
  }
}

function saveRecentPlayer(p) {
  if (!p || !p.puuid) return;
  const list = getRecentPlayers().filter((x) => x.puuid !== p.puuid);
  list.unshift({ puuid: p.puuid, gameName: p.gameName, tagLine: p.tagLine, profileIconId: p.profileIconId, summonerLevel: p.summonerLevel });
  localStorage.setItem('recentPlayers', JSON.stringify(list.slice(0, 8)));
}

export function filtered() {
  const d = state.data;
  if (!d) return [];
  return d.games.filter(
    (g) =>
      (!state.onlyCustom || g.isCustom) &&
      (!state.onlyImported || g.isSpectated || g.isLocalImport) &&
      (!state.queue || String(g.queueId) === state.queue) &&
      (!state.result || (state.result === 'win' ? g.win : !g.win))
  );
}

export function rowHtml(g) {
  const customBadge = g.isCustom ? ' <span class="chip custom">自定义</span>' : '';
  const specBadge = (g.isSpectated || g.isLocalImport) ? ' <span class="chip gold" title="观战采集或本地导入">观战/导入</span>' : '';
  const resultDisplay = g.isSpectated ? '<span class="badge" style="background:#1e293b;color:#93c5fd">观战</span>' : resultBadge(g.win, g.remake);
  return `<tr data-id="${g.gameId}" class="${g.isSpectated ? '' : (g.win ? 'rw' : 'rl')}">
    <td><input type="checkbox" class="sel" data-id="${g.gameId}" ${state.sel.has(g.gameId) ? 'checked' : ''}></td>
    <td class="nowrap">${fmtDate(g.gameCreation)}</td>
    <td>${esc(queueName(g.queueId, g.gameMode))}${customBadge}${specBadge}</td>
    <td>${resultDisplay}</td>
    <td class="nowrap">${champIcon(g.championId, 'sm')} <span class="muted">${esc(champName(g.championId))}</span></td>
    <td class="nowrap">${g.spells.map((s) => spellIcon(s)).join('')}</td>
    <td class="nowrap"><b>${kdaStr(g)}</b> <span class="muted">${kdaRatio(g.kills, g.deaths, g.assists)}</span></td>
    <td class="num">${g.cs}</td>
    <td class="num">${fmtK(g.gold)}</td>
    <td class="num">${fmtK(g.dmg)}</td>
    <td class="items">${g.items.map((i) => itemIcon(i)).join('')}</td>
    <td class="num">${fmtDur(g.gameDuration)}</td>
    <td class="nowrap actions">
      <a class="btn sm" href="#/match/${g.gameId}">详情</a>
      <a class="btn sm ghost" href="/api/match/${g.gameId}/raw?part=bundle&download=1" download title="导出该场对局原始数据(对局+时间线)">导出</a>
      ${g.inInnerwar ? '<span class="chip ok">已入内战</span>' : `<button class="btn sm ghost add-iw" data-id="${g.gameId}">+内战</button>`}
    </td></tr>`;
}

export function summaryHtml(list) {
  const n = list.length;
  const w = list.filter((g) => g.win).length;
  const k = list.reduce((a, g) => a + g.kills, 0);
  const d = list.reduce((a, g) => a + g.deaths, 0);
  const as = list.reduce((a, g) => a + g.assists, 0);
  return `<div class="stats">
    <div class="stat"><b>${n}</b><span>对局数</span></div>
    <div class="stat"><b>${w}-${n - w}</b><span>胜-负</span></div>
    <div class="stat"><b>${n ? pct(w / n) : '-'}</b><span>胜率</span></div>
    <div class="stat"><b>${n ? (k / n).toFixed(1) : 0}/${n ? (d / n).toFixed(1) : 0}/${n ? (as / n).toFixed(1) : 0}</b><span>场均 KDA</span></div>
    <div class="stat"><b>${kdaRatio(k, d, as)}</b><span>总 KDA 比</span></div>
    <div class="stat"><b>${list.filter((g) => g.isCustom).length}</b><span>自定义对局</span></div>
  </div>`;
}

function queryDays() {
  return state.days === 'custom' ? Math.max(0, Number(state.customDays) || 0) : Number(state.days);
}
function qs(extra = '') {
  const p = new URLSearchParams();
  p.set('days', queryDays());
  if (state.puuid) p.set('puuid', state.puuid);
  return p.toString() + extra;
}

export async function render(app, _p, alive) {
  const recent = getRecentPlayers();
  const spectatingPlayers = G.spectate?.isSpectating ? G.spectate.players || [] : [];

  app.innerHTML = `
  <section class="card">
    <div class="toolbar" style="margin-bottom:12px">
      <!-- 选手查找栏 -->
      <div class="player-search-bar">
        ${
          state.targetPlayer
            ? `<div class="player-chip">
                ${profileIcon(state.targetPlayer.profileIconId)}
                <b>${esc(state.targetPlayer.gameName)}#${esc(state.targetPlayer.tagLine)}</b>
                <span class="muted small">(Lv.${state.targetPlayer.summonerLevel})</span>
                <button class="btn-reset" id="resetPlayer" title="切回当前登录账号">&times; 切回自己</button>
              </div>`
            : ''
        }
        <input id="playerSearch" placeholder="搜索选手 (例如: 昵称#TAG 或 PUUID)" style="width:250px" value="${esc(state.searchQuery)}">
        <button class="btn sm" id="doSearchPlayer">查询战绩</button>
      </div>

      <span class="spacer"></span>
      <button class="btn" id="btnImportGame">📥 导入对局 (Game ID)</button>
    </div>

    <!-- 快捷选手切换 chips -->
    ${
      recent.length || spectatingPlayers.length
        ? `<div class="recent-chips">
            ${
              spectatingPlayers.length
                ? `<span class="muted">观战中选手:</span>` +
                  spectatingPlayers
                    .map((p) => `<button class="quick-chip spec-chip" data-puuid="${esc(p.puuid)}">${champIcon(p.championId, 'xs')} ${esc(champName(p.championId))}</button>`)
                    .join(' ')
                : ''
            }
            ${
              recent.length
                ? `<span class="muted" style="margin-left:6px">最近搜索:</span>` +
                  recent
                    .map((p) => `<button class="quick-chip rec-chip" data-puuid="${esc(p.puuid)}" data-name="${esc(p.gameName)}#${esc(p.tagLine)}">${esc(p.gameName)}#${esc(p.tagLine)}</button>`)
                    .join(' ')
                : ''
            }
          </div>`
        : ''
    }

    <hr style="border:0;border-top:1px solid var(--line);margin:12px 0">

    <div class="toolbar">
      <label>时间范围
        <select id="days">
          ${[[1, '最近 1 天'], [3, '最近 3 天'], [7, '最近 7 天'], [14, '最近 14 天'], [30, '最近 30 天'], [90, '最近 90 天'], [0, '全部'], ['custom', '自定义天数…']]
            .map(([v, l]) => `<option value="${v}" ${String(state.days) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <input id="customDays" type="number" min="1" placeholder="天数" style="width:80px;${state.days === 'custom' ? '' : 'display:none'}" value="${esc(state.customDays)}">
      <label>模式 <select id="queue"><option value="">全部</option></select></label>
      <label>结果 <select id="result"><option value="">全部</option><option value="win">胜利</option><option value="loss">失败</option></select></label>
      <label class="chk"><input type="checkbox" id="onlyCustom" ${state.onlyCustom ? 'checked' : ''}> 仅自定义(内战)</label>
      <label class="chk"><input type="checkbox" id="onlyImported" ${state.onlyImported ? 'checked' : ''}> 仅观战/已导入</label>
      <button class="btn ghost sm" id="reload">↻ 刷新</button>
      <span class="spacer"></span>
      <a class="btn ghost sm" id="dlRaw" href="#" download title="LCU 返回的原始对局列表 JSON">⬇ 原始列表 JSON</a>
      <a class="btn ghost sm" id="dlFull" href="#" download title="包含每场对局明细与时间线,场次多时会比较慢">⬇ 全部明细 JSON</a>
    </div>
    <div id="offline" class="notice warn" style="display:none">未连接到客户端,当前显示的是本地缓存的数据。</div>
    <div id="sum"></div>
  </section>

  <section class="card">
    <div class="toolbar">
      <label class="chk"><input type="checkbox" id="selAll"> 全选</label>
      <button class="btn" id="addSel">加入内战记录(<span id="selN">0</span>)</button>
      <button class="btn ghost" id="selCustom">选中全部自定义对局</button>
      <span class="muted" id="hint"></span>
    </div>
    <div class="table-wrap"><table class="tbl" id="tbl">
      <thead><tr><th></th><th>时间</th><th>模式</th><th>结果</th><th>英雄</th><th>技能</th><th>KDA</th><th>补刀</th><th>金币</th><th>伤害</th><th>装备</th><th>时长</th><th></th></tr></thead>
      <tbody id="rows"><tr><td colspan="13" class="loading">正在从 LCU 拉取对局历史…</td></tr></tbody>
    </table></div>
  </section>`;

  const refreshLinks = () => {
    $('#dlRaw').href = '/api/history/raw?' + qs('&refresh=0');
    $('#dlFull').href = '/api/history/export?' + qs('&refresh=0');
  };
  const paint = () => {
    const list = filtered();
    $('#sum').innerHTML = summaryHtml(list);
    $('#rows').innerHTML = list.length ? list.map(rowHtml).join('') : '<tr><td colspan="13" class="muted center">没有符合条件的对局</td></tr>';
    $('#selN').textContent = state.sel.size;
    $('#hint').textContent = `显示 ${list.length} / ${state.data.count} 场`;
  };

  const load = async (refresh = true) => {
    $('#rows').innerHTML = '<tr><td colspan="13" class="loading">正在从 LCU 拉取对局历史…</td></tr>';
    try {
      state.data = await api('/api/history?' + qs(refresh ? '' : '&refresh=0'));
    } catch (e) {
      $('#rows').innerHTML = `<tr><td colspan="13" class="error">${esc(e.message)}</td></tr>`;
      return;
    }
    if (!alive()) return;
    $('#offline').style.display = state.data.offline ? '' : 'none';
    const qsel = $('#queue');
    const qids = [...new Set(state.data.games.map((g) => g.queueId))];
    qsel.innerHTML =
      '<option value="">全部</option>' +
      qids.map((q) => `<option value="${q}" ${String(q) === state.queue ? 'selected' : ''}>${esc(queueName(q, state.data.games.find((g) => g.queueId === q)?.gameMode))}</option>`).join('');
    $('#result').value = state.result;
    refreshLinks();
    paint();
  };

  // 搜索选手
  const searchPlayer = async (query) => {
    query = (query || '').trim();
    if (!query) return toast('请输入要查询的选手 Riot ID (例如: 昵称#TAG) 或 PUUID', 'warn');
    const btn = $('#doSearchPlayer');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '查找中…';
    }
    try {
      const res = await api('/api/summoner/lookup?q=' + encodeURIComponent(query));
      state.targetPlayer = res;
      state.puuid = res.puuid;
      state.searchQuery = `${res.gameName}#${res.tagLine}`;
      saveRecentPlayer(res);
      toast(`已找到选手：${res.gameName}#${res.tagLine}`, 'ok');
      await render(app, _p, alive);
    } catch (e) {
      toast(e.message, 'error', 5000);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '查询战绩';
      }
    }
  };

  $('#doSearchPlayer')?.addEventListener('click', () => searchPlayer($('#playerSearch').value));
  $('#playerSearch')?.addEventListener('keydown', (e) => e.key === 'Enter' && searchPlayer($('#playerSearch').value));

  $('#resetPlayer')?.addEventListener('click', () => {
    state.targetPlayer = null;
    state.puuid = '';
    state.searchQuery = '';
    render(app, _p, alive);
  });

  // 导入对局弹窗
  $('#btnImportGame')?.addEventListener('click', () => {
    showImportModal('', (res) => {
      load(false);
    });
  });

  // 快捷选手切换
  $$('.rec-chip, .spec-chip').forEach((chip) => {
    chip.onclick = async () => {
      const puuid = chip.dataset.puuid;
      try {
        const res = await api('/api/summoner/lookup?q=' + encodeURIComponent(puuid));
        state.targetPlayer = res;
        state.puuid = res.puuid;
        state.searchQuery = `${res.gameName}#${res.tagLine}`;
        saveRecentPlayer(res);
        await render(app, _p, alive);
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });

  $('#days').onchange = (e) => {
    state.days = e.target.value;
    $('#customDays').style.display = state.days === 'custom' ? '' : 'none';
    if (state.days !== 'custom') load();
  };
  $('#customDays').onchange = (e) => {
    state.customDays = e.target.value;
    load();
  };
  $('#queue').onchange = (e) => ((state.queue = e.target.value), paint());
  $('#result').onchange = (e) => ((state.result = e.target.value), paint());
  $('#onlyCustom').onchange = (e) => ((state.onlyCustom = e.target.checked), paint());
  $('#onlyImported').onchange = (e) => ((state.onlyImported = e.target.checked), paint());
  $('#reload').onclick = () => load(true);
  $('#selAll').onchange = (e) => {
    filtered().forEach((g) => (e.target.checked ? state.sel.add(g.gameId) : state.sel.delete(g.gameId)));
    paint();
  };
  $('#selCustom').onclick = () => {
    state.sel.clear();
    filtered().filter((g) => g.isCustom && !g.inInnerwar).forEach((g) => state.sel.add(g.gameId));
    paint();
    toast(`已选中 ${state.sel.size} 场自定义对局`);
  };
  const addIds = async (ids) => {
    if (!ids.length) return toast('请先选择对局', 'warn');
    toast(`正在缓存并加入 ${ids.length} 场对局…`);
    const r = await post('/api/innerwar', { gameIds: ids });
    if (r.failed.length) toast(`${r.failed.length} 场失败:${r.failed[0].error}`, 'error', 6000);
    else toast('已加入内战记录', 'ok');
    ids.forEach((id) => {
      const g = state.data.games.find((x) => x.gameId === id);
      if (g && !r.failed.find((f) => f.gameId === id)) g.inInnerwar = true;
      state.sel.delete(id);
    });
    paint();
  };
  $('#addSel').onclick = () => addIds([...state.sel]);
  $('#rows').onclick = (e) => {
    const b = e.target.closest('.add-iw');
    if (b) return addIds([Number(b.dataset.id)]);
    const cb = e.target.closest('.sel');
    if (cb) {
      const id = Number(cb.dataset.id);
      cb.checked ? state.sel.add(id) : state.sel.delete(id);
      $('#selN').textContent = state.sel.size;
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a,button,input')) location.hash = '#/match/' + tr.dataset.id;
  };
  refreshLinks();
  await load();
}
