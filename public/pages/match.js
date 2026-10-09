import {
  G, $, $$, esc, api, post, put, toast, fmtDate, fmtDur, fmtMs, fmtNum, fmtK, pct, queueName, mapName, teamName, teamCls, dispName,
  champIcon, champName, itemIcon, spellIcon, perkIcon, styleIcon, augmentIcon, profileIcon, pctBar, lineChart, jsonTreeHtml, bindJsonTrees,
  resultBadge, regionBadge, regionInfo,
} from '../util.js';
import { generateMatchPoster } from '../poster.js';
import { STAT_GROUPS, KNOWN_KEYS, isItemKey, isPerkKey, isAugKey, TEAM_FIELDS, TEAM_FIRSTS, GAME_FIELDS } from '../statdefs.js';

const TABS = [
  ['overview', '概览'],
  ['detail', '全部数据'],
  ['timeline', '时间线'],
  ['players', '玩家档案'],
  ['ai', 'AI 分析'],
  ['raw', '原始数据'],
];

const BLUE = ['#4fa3ff', '#2f80ed', '#7cc4ff', '#1f5fbf', '#a6d8ff', '#6c8cff', '#3b6fb5', '#90b8f8'];
const RED = ['#ff6b6b', '#e03e3e', '#ff9f9f', '#b32424', '#ffc2c2', '#ff8a5c', '#c95a3a', '#ffb199'];
export const playerColors = (d) => {
  const cnt = { 100: 0, 200: 0 };
  const out = {};
  for (const p of d.players) {
    const arr = p.teamId === 200 ? RED : BLUE;
    const k = p.teamId === 200 ? 200 : 100;
    out[p.participantId] = arr[cnt[k]++ % arr.length];
  }
  return out;
};

const sideTitle = (d, tid) => {
  if (tid !== 100 && tid !== 200) return teamName(tid);
  return teamName(tid);
};

// ---------------- 头部 ----------------
export function headerHtml(view) {
  const d = view.digest;
  const isSnap = !!view.isSnapshot;
  const winners = d.teams.filter((t) => t.win);
  const two = d.teams.length === 2 ? d.teams : null;
  const score = two
    ? `<div class="scoreline"><span class="${teamCls(two[0].teamId)}">${two[0].kills}</span><small>击杀</small><span class="${teamCls(two[1].teamId)}">${two[1].kills}</span></div>`
    : '';
  return `<div class="card match-head">
    ${
      isSnap
        ? `<div style="background:#132338;border:1px solid #284c7a;border-radius:6px;padding:8px 12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div>
              <span class="pulse-dot"></span> <b>📸 正在查看比赛快照 (${fmtDur(view.snapshotTime || d.gameDuration)})</b>
              <span class="muted small" style="margin-left:8px">进行中实时数据或中途归档快照 · 官方结算前均可提前浏览</span>
            </div>
            <span class="chip gold">快照预览模式</span>
          </div>`
        : ''
    }
    <div class="mh-top">
      <div>
        <h2>${regionBadge(d.platformId, d.gameId)} ${esc(queueName(d.queueId, d.gameMode))} <span class="muted">· ${esc(mapName(d.mapId))}</span> ${
          d.isCustom ? '<span class="chip custom">自定义</span>' : ''
        } ${isSnap ? '<span class="chip gold">📸 快照</span>' : ''}</h2>
        <div class="muted">${fmtDate(d.gameCreation)} · 时长 ${fmtDur(d.gameDuration)} · 版本 ${esc(d.gameVersion)} · 对局 #${d.gameId}
        ${d.endOfGameResult && d.endOfGameResult !== 'GameComplete' ? ` · <span class="warn-t">${esc(d.endOfGameResult)}</span>` : ''}</div>
      </div>
      <div class="mh-result">
        ${
          two
            ? two
                .map(
                  (t) =>
                    `<div class="mh-team ${teamCls(t.teamId)} ${t.win ? 'won' : ''}">${teamName(t.teamId)}<b>${
                      isSnap ? (t.win ? '领先' : '落后') : t.win ? '胜利' : '失败'
                    }</b></div>`
                )
                .join(score ? '' : '')
            : winners.map((t) => `<b>${teamName(t.teamId)} 胜</b>`).join(' ')
        }
        ${score}
      </div>
    </div>
    <div class="toolbar">
      <button class="btn sm" id="btnUploadCloud" style="background:#0284c7;border-color:#0369a1;color:#fff" title="一键同步至 SA1 云端服务器">☁️ 上传至云端</button>
      <a class="btn sm ghost" href="/api/match/${d.gameId}/export" download title="导出单场完整对局包(包含对局数据、时间线与 AI 复盘报告)">⬇ 导出完整包</a>
      <a class="btn sm ghost" href="/api/match/${d.gameId}/raw?part=bundle&download=1" download title="原始 LCU Bundle">LCU 数据</a>
      <a class="btn sm ghost" href="/api/match/${d.gameId}/raw?part=digest&download=1" download>分路摘要 JSON</a>
      <span class="spacer"></span>
      <button class="btn sm" id="btnShareMatchHeader" style="background:#1e6fd9;border-color:#2d7be5" title="一键生成微信分享战报长图">📸 微信分享长图</button>
      <button class="btn sm ghost" id="refreshMatch" title="重新从 LCU 拉取">↻ 重新拉取${isSnap ? '/转为官方战绩' : ''}</button>
      ${
        view.inInnerwar
          ? '<span class="chip ok">已加入内战记录</span> <button class="btn sm ghost" id="rmIw">移出</button>'
          : '<button class="btn sm" id="addIw">+ 加入内战记录</button>'
      }
    </div>
  </div>`;
}

// ---------------- 概览 ----------------
function cmpRow(label, a, b, fmt = fmtNum) {
  const t = a + b || 1;
  return `<div class="cmp"><span class="cv blue">${fmt(a)}</span><div class="cbar"><i class="blue" style="width:${(a / t) * 100}%"></i><i class="red" style="width:${(b / t) * 100}%"></i></div><span class="cv red">${fmt(b)}</span><span class="cl">${label}</span></div>`;
}

export function objectivesHtml(d) {
  if (d.teams.length !== 2) return '';
  const [a, b] = d.teams;
  const rows = [
    ['击杀', a.kills, b.kills],
    ['金币', a.gold, b.gold, fmtK],
    ['对英雄伤害', a.dmg, b.dmg, fmtK],
    ['承受伤害', a.dmgTaken, b.dmgTaken, fmtK],
    ['视野得分', a.vision, b.vision],
    ['补刀', a.cs, b.cs],
    ...Object.entries(TEAM_FIELDS).map(([k, l]) => [l, a.objectives[k] || 0, b.objectives[k] || 0]).filter((r) => r[1] + r[2] > 0),
  ];
  const firsts = (t) =>
    Object.entries(TEAM_FIRSTS).filter(([k]) => t.objectives[k.replace('firstDragon', 'firstDragon')]).map(([, l]) => `<span class="chip ok">${l}</span>`).join('');
  const bans = (t) => (t.bans?.length ? t.bans.map((x) => champIcon(x.championId, 'xs')).join('') : '<span class="muted">-</span>');
  return `<div class="card"><h3>队伍对比</h3>
    <div class="cmp-head"><b class="blue">${teamName(a.teamId)} ${a.win ? '🏆' : ''}</b><b class="red">${b.win ? '🏆' : ''} ${teamName(b.teamId)}</b></div>
    ${rows.map((r) => cmpRow(r[0], r[1], r[2], r[3])).join('')}
    <div class="cmp-foot"><div>${firsts(a)}</div><div>${firsts(b)}</div></div>
    <div class="cmp-foot"><div>禁用:${bans(a)}</div><div>禁用:${bans(b)}</div></div>
  </div>`;
}

function playerCell(p) {
  return `<div class="pcell">${champIcon(p.championId, 'md')}<span class="lvl">${p.level}</span>
    <div><div class="pname"><a class="plink" title="${esc(p.name)}">${esc(dispName(p))}</a>
    <button class="icon-btn alias" data-key="${esc(p.key)}" data-name="${esc(p.name)}" title="设置别名">✎</button>
    ${p.badge ? `<span class="chip ${p.badge === 'MVP' ? 'gold' : 'silver'}">${p.badge}</span>` : ''}</div>
    <div class="muted small">${esc(champName(p.championId))}${p.lane ? ' · <span class="chip lane">' + esc(p.laneCn || p.lane) + '</span>' : ''}</div></div></div>`;
}

export function scoreboardHtml(d) {
  const maxDmg = Math.max(1, ...d.players.map((p) => p.dmg));
  const maxTaken = Math.max(1, ...d.players.map((p) => p.dmgTaken));
  const hasAug = d.players.some((p) => p.augments.length);
  const hasRune = d.players.some((p) => p.perks[0]);
  const useSub = d.players.some((p) => p.subteamId > 0) && d.teams.length <= 2 && d.players.length > 10;
  const groups = useSub
    ? [...new Set(d.players.map((p) => p.subteamId))].sort((a, b) => {
        const pa = d.players.find((p) => p.subteamId === a).placement || 99;
        const pb = d.players.find((p) => p.subteamId === b).placement || 99;
        return pa - pb;
      }).map((sid) => ({ title: `第 ${d.players.find((p) => p.subteamId === sid).placement || '?'} 名 (小队 ${sid})`, cls: 'other', win: d.players.find((p) => p.subteamId === sid).win, list: d.players.filter((p) => p.subteamId === sid) }))
    : d.teams.map((t) => ({ title: `${sideTitle(d, t.teamId)} · ${t.win ? '胜利' : '失败'}`, cls: teamCls(t.teamId), win: t.win, list: d.players.filter((p) => p.teamId === t.teamId), team: t }));
  return groups
    .map(
      (g) => `<div class="card team ${g.cls} ${g.win ? 'won' : ''}">
    <div class="team-title"><h3>${g.title}</h3>${g.team ? `<span class="muted">${g.team.kills}/${g.team.deaths}/${g.team.assists} · ${fmtK(g.team.gold)} 金币 · ${fmtK(g.team.dmg)} 伤害</span>` : ''}</div>
    <div class="table-wrap"><table class="tbl score">
      <thead><tr><th>玩家</th><th>技能${hasRune ? '/符文' : ''}</th>${hasAug ? '<th>强化</th>' : ''}<th>KDA</th><th>参团</th><th>对英雄伤害</th><th>承伤</th><th>金币</th><th>补刀</th><th>视野</th><th>装备</th><th title="本地启发式参考分,非官方">评分</th></tr></thead>
      <tbody>${g.list
        .map(
          (p) => `<tr>
        <td>${playerCell(p)}</td>
        <td class="nowrap"><div class="stack">${p.spells.map((s) => spellIcon(s)).join('')}</div>${hasRune ? `<div class="stack">${styleIcon(p.perkPrimaryStyle)}${perkIcon(p.perks[0])}${styleIcon(p.perkSubStyle)}</div>` : ''}</td>
        ${hasAug ? `<td class="nowrap">${p.augments.map((a) => augmentIcon(a)).join('')}</td>` : ''}
        <td class="nowrap"><b>${p.kills}/${p.deaths}/${p.assists}</b><div class="muted small">${p.kda} KDA${p.largestMultiKill >= 2 ? ` · ${['', '', '双杀', '三杀', '四杀', '五杀'][Math.min(5, p.largestMultiKill)]}` : ''}</div></td>
        <td class="num">${pct(p.kp, 0)}</td>
        <td><div class="num">${fmtNum(p.dmg)}</div>${pctBar(p.dmg, maxDmg, 'dmg')}<div class="muted small">${pct(p.dmgShare, 0)} 队伍</div></td>
        <td><div class="num">${fmtNum(p.dmgTaken)}</div>${pctBar(p.dmgTaken, maxTaken, 'taken')}</td>
        <td class="num">${fmtNum(p.gold)}<div class="muted small">${fmtNum(p.goldPerMin)}/分</div></td>
        <td class="num">${p.cs}<div class="muted small">${p.csPerMin}/分</div></td>
        <td class="num">${p.vision}<div class="muted small">${p.wardsPlaced}放/${p.wardsKilled}拆/${p.controlWards}控</div></td>
        <td class="items">${p.items.slice(0, 6).map((i) => itemIcon(i)).join('')}${itemIcon(p.items[6], 'trinket')}</td>
        <td class="num"><b class="score-v s${Math.floor(p.score)}">${p.score}</b></td></tr>`
        )
        .join('')}</tbody>
    </table></div></div>`
    )
    .join('');
}

// ---------------- 全部数据 ----------------
const isNum = (v) => typeof v === 'number';
function fmtCell(v, type) {
  if (v === undefined || v === null) return '<span class="muted">—</span>';
  if (typeof v === 'boolean') return v ? '<span class="ok-t">✓</span>' : '<span class="muted">–</span>';
  if (type === 's' && isNum(v)) return `${fmtNum(v)}<small class="muted"> (${fmtDur(v)})</small>`;
  if (isNum(v)) return fmtNum(v);
  if (typeof v === 'object') return `<code class="small">${esc(JSON.stringify(v))}</code>`;
  return esc(v);
}
function detailRow(label, key, vals, type) {
  const nums = vals.filter(isNum);
  const max = nums.length ? Math.max(...nums) : 0;
  const min = nums.length ? Math.min(...nums) : 0;
  const allZero = vals.every((v) => v === 0 || v === false || v == null || v === '' || (typeof v === 'object' && !Object.keys(v || {}).length));
  return `<tr class="${allZero ? 'zero-row' : ''}"><th>${esc(label)}${key ? `<small>${esc(key)}</small>` : ''}</th>${vals
    .map((v) => `<td class="${isNum(v) && max > min && v === max ? 'best' : ''}">${fmtCell(v, type)}</td>`)
    .join('')}</tr>`;
}
const sectionRow = (t, n) => `<tr class="sec"><td colspan="${n + 1}">${esc(t)}</td></tr>`;

export function detailHtml(view) {
  const g = view.game;
  const parts = g.participants || [];
  const idm = Object.fromEntries((g.participantIdentities || []).map((i) => [i.participantId, i.player || {}]));
  const dg = Object.fromEntries(view.digest.players.map((p) => [p.participantId, p]));
  const n = parts.length;
  const stats = parts.map((p) => p.stats || {});
  let body = '';

  // 身份与基础
  body += sectionRow('身份与基础信息', n);
  body += detailRow('队伍', 'teamId', parts.map((p) => teamName(p.teamId)));
  body += detailRow('英雄', 'championId', parts.map((p) => `${champName(p.championId)} (${p.championId})`));
  body += detailRow('召唤师技能', 'spell1Id/spell2Id', parts.map((p) => `${G.gd.spells?.[p.spell1Id]?.name || p.spell1Id} / ${G.gd.spells?.[p.spell2Id]?.name || p.spell2Id}`));
  body += detailRow('历史最高段位', 'highestAchievedSeasonTier', parts.map((p) => p.highestAchievedSeasonTier || ''));
  body += detailRow('分路(推测)', 'timeline.lane', parts.map((p) => p.timeline?.lane || ''));
  body += detailRow('定位(推测)', 'timeline.role', parts.map((p) => p.timeline?.role || ''));
  const pkeys = new Set(parts.flatMap((p) => Object.keys(idm[p.participantId] || {})));
  for (const k of pkeys) body += detailRow('玩家.' + k, 'player.' + k, parts.map((p) => idm[p.participantId]?.[k]));

  // 装备 / 符文 / 强化
  body += sectionRow('装备', n);
  for (let i = 0; i < 7; i++) {
    body += `<tr><th>${i === 6 ? '饰品' : '装备' + (i + 1)}<small>item${i}</small></th>${stats.map((s) => `<td>${itemIcon(s['item' + i])}<small class="muted"> ${s['item' + i] || ''}</small></td>`).join('')}</tr>`;
  }
  const hasPerk = stats.some((s) => s.perk0);
  if (hasPerk) {
    body += sectionRow('符文', n);
    body += `<tr><th>主系 / 副系<small>perkPrimaryStyle / perkSubStyle</small></th>${stats.map((s) => `<td>${styleIcon(s.perkPrimaryStyle)} ${styleIcon(s.perkSubStyle)}</td>`).join('')}</tr>`;
    for (let i = 0; i < 6; i++) {
      body += `<tr><th>符文${i + 1}<small>perk${i} (Var1-3)</small></th>${stats
        .map((s) => `<td>${perkIcon(s['perk' + i])}<small class="muted"> ${[1, 2, 3].map((v) => s[`perk${i}Var${v}`] || 0).join(' / ')}</small></td>`)
        .join('')}</tr>`;
    }
  }
  if (stats.some((s) => s.playerAugment1)) {
    body += sectionRow('强化符文(Augments)', n);
    for (let i = 1; i <= 6; i++) {
      if (!stats.some((s) => s['playerAugment' + i])) continue;
      body += `<tr><th>强化${i}<small>playerAugment${i}</small></th>${stats
        .map((s) => `<td>${s['playerAugment' + i] ? augmentIcon(s['playerAugment' + i]) + `<small class="muted"> ${esc(G.gd.augments?.[s['playerAugment' + i]]?.name || s['playerAugment' + i])}</small>` : ''}</td>`)
        .join('')}</tr>`;
    }
  }

  // 衍生指标
  body += sectionRow('衍生指标(本工具计算)', n);
  const dv = (label, key, fn, type) => (body += detailRow(label, key, parts.map((p) => fn(dg[p.participantId])), type));
  dv('KDA 比', 'kda', (p) => p.kda);
  dv('参团率', 'kp', (p) => +(p.kp * 100).toFixed(1));
  dv('伤害占比 %', 'dmgShare', (p) => +(p.dmgShare * 100).toFixed(1));
  dv('承伤占比 %', 'takenShare', (p) => +(p.takenShare * 100).toFixed(1));
  dv('经济占比 %', 'goldShare', (p) => +(p.goldShare * 100).toFixed(1));
  dv('死亡占比 %', 'deathShare', (p) => +(p.deathShare * 100).toFixed(1));
  dv('每分钟伤害', 'dmgPerMin', (p) => p.dmgPerMin);
  dv('每分钟金币', 'goldPerMin', (p) => p.goldPerMin);
  dv('每分钟补刀', 'csPerMin', (p) => p.csPerMin);
  dv('每分钟视野', 'visionPerMin', (p) => p.visionPerMin);
  dv('参考评分', 'score', (p) => p.score);

  // 已知统计分组
  const used = new Set();
  for (const grp of STAT_GROUPS) {
    const rows = grp.rows.filter(([k]) => stats.some((s) => k in s));
    if (!rows.length) continue;
    body += sectionRow(grp.title, n);
    for (const [k, label, type] of rows) {
      used.add(k);
      body += detailRow(label, k, stats.map((s) => s[k]), type);
    }
  }
  // 其他字段(未知 / 新版本新增)
  const others = [...new Set(stats.flatMap((s) => Object.keys(s)))].filter((k) => !KNOWN_KEYS.has(k) && !isItemKey(k) && !isPerkKey(k) && !isAugKey(k));
  if (others.length) {
    body += sectionRow('其他字段(LCU 返回但未归类)', n);
    for (const k of others) body += detailRow(k, '', stats.map((s) => s[k]));
  }
  // 时间线增量(每分钟差值)
  const tlKeys = [...new Set(parts.flatMap((p) => Object.keys(p.timeline || {})))].filter((k) => /Deltas$/.test(k));
  const tlNames = { creepsPerMinDeltas: '每分钟补刀', csDiffPerMinDeltas: '补刀差/分', damageTakenDiffPerMinDeltas: '承伤差/分', damageTakenPerMinDeltas: '承伤/分', goldPerMinDeltas: '金币/分', xpDiffPerMinDeltas: '经验差/分', xpPerMinDeltas: '经验/分' };
  const withData = tlKeys.filter((k) => parts.some((p) => Object.keys(p.timeline?.[k] || {}).length));
  if (withData.length) {
    body += sectionRow('阶段性每分钟数据(participant.timeline)', n);
    for (const k of withData) {
      const ivs = [...new Set(parts.flatMap((p) => Object.keys(p.timeline?.[k] || {})))];
      for (const iv of ivs) body += detailRow(`${tlNames[k] || k} [${iv}]`, k, parts.map((p) => p.timeline?.[k]?.[iv]));
    }
  }

  const head = parts
    .map((p) => `<th class="ph ${teamCls(p.teamId)}">${champIcon(p.championId, 'sm')}<div class="small">${esc(dispName(dg[p.participantId]))}</div></th>`)
    .join('');

  // 对局 / 队伍字段
  const gameKv = Object.entries(g)
    .filter(([k, v]) => !['participants', 'participantIdentities', 'teams'].includes(k))
    .map(([k, v]) => `<tr><th>${esc(GAME_FIELDS[k] || k)}<small>${esc(k)}</small></th><td>${fmtCell(v)}</td></tr>`)
    .join('');
  const teamRows = (g.teams || [])
    .map(
      (t) => `<tr><th>${teamName(t.teamId)}</th><td>${Object.entries(t)
        .filter(([k]) => k !== 'bans' && k !== 'teamId')
        .map(([k, v]) => `<span class="chip ${v === true || v === 'Win' ? 'ok' : ''}">${esc(TEAM_FIELDS[k] || TEAM_FIRSTS[k] || k)}: ${esc(v)}</span>`)
        .join(' ')}<div>禁用:${(t.bans || []).map((b) => champIcon(b.championId, 'xs') + `<small class="muted">${b.pickTurn}</small>`).join(' ') || '-'}</div></td></tr>`
    )
    .join('');

  return `<div class="card"><h3>对局基础字段</h3><table class="kv">${gameKv}</table><h3>队伍字段</h3><table class="kv">${teamRows}</table></div>
  <div class="card"><div class="toolbar"><h3 style="margin:0">全部玩家数据</h3><span class="spacer"></span>
    <label class="chk"><input type="checkbox" id="hideZero" checked> 隐藏全为 0 / 空的行</label></div>
    <div class="table-wrap tall"><table class="tbl detail hide-zero" id="detailTbl"><thead><tr><th class="corner">字段</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted small">绿色高亮 = 该行最大值。字段名为 LCU 原始 key,未归类字段自动出现在「其他字段」中。</p></div>`;
}

// ---------------- 时间线 ----------------
const METRICS = {
  gold: ['总金币', (f, id) => f.players[id]?.gold],
  xp: ['经验', (f, id) => f.players[id]?.xp],
  level: ['等级', (f, id) => f.players[id]?.level],
  cs: ['补刀(含野怪)', (f, id) => (f.players[id] ? f.players[id].cs + f.players[id].jungle : undefined)],
};

export function timelineCharts(d, metric = 'gold', hidden = new Set()) {
  const tl = d.timeline;
  const colors = playerColors(d);
  const xs = tl.frames.map((f) => Math.round(f.t / 60000));
  const [a, b] = [d.teams[0]?.teamId, d.teams[1]?.teamId];
  const diff = tl.frames.map((f) => (f.teamGold[a] || 0) - (f.teamGold[b] || 0));
  const xpDiff = tl.frames.map((f) => (f.teamXp[a] || 0) - (f.teamXp[b] || 0));
  const [, fn] = METRICS[metric];
  const series = d.players
    .filter((p) => !hidden.has(p.participantId))
    .map((p) => ({ name: `${dispName(p)} (${champName(p.championId)})`, color: colors[p.participantId], data: tl.frames.map((f) => fn(f, p.participantId)), dash: p.teamId === 200 && false }));
  const twoTeams = d.teams.length === 2;
  return `
  ${twoTeams ? `<div class="card"><h3>团队经济差 <small class="muted">(${teamName(a)} − ${teamName(b)},正值=${teamName(a)}领先)</small></h3>${lineChart({ series: [{ name: '经济差', color: '#e6c84e', data: diff }], xs, zero: true, fill: true })}
  <h3>团队经验差</h3>${lineChart({ series: [{ name: '经验差', color: '#9b8cff', data: xpDiff }], xs, zero: true, fill: true, height: 160 })}</div>` : ''}
  <div class="card"><div class="toolbar"><h3 style="margin:0">个人曲线</h3>
    <select id="metric">${Object.entries(METRICS).map(([k, [l]]) => `<option value="${k}" ${k === metric ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="legend">${d.players.map((p) => `<label class="lg"><input type="checkbox" class="lgp" data-pid="${p.participantId}" ${hidden.has(p.participantId) ? '' : 'checked'}><i style="background:${colors[p.participantId]}"></i>${champIcon(p.championId, 'xs')} ${esc(dispName(p))}</label>`).join('')}</div>
    ${lineChart({ series, xs })}</div>`;
}

function evText(e, d) {
  const P = Object.fromEntries(d.players.map((p) => [p.participantId, p]));
  const who = (id) => (P[id] ? `${champIcon(P[id].championId, 'xs')} <b class="${teamCls(P[id].teamId)}">${esc(dispName(P[id]))}</b>` : '<span class="muted">处决/小兵/防御塔</span>');
  switch (e.type) {
    case 'CHAMPION_KILL':
      return `${who(e.killerId)} 击杀 ${who(e.victimId)}${e.assistingParticipantIds?.length ? ` <span class="muted">助攻:</span> ${e.assistingParticipantIds.map((i) => champIcon(P[i]?.championId, 'xs')).join('')}` : ''}`;
    case 'BUILDING_KILL':
      return `${who(e.killerId)} 摧毁 <b class="${teamCls(e.teamId)}">${teamName(e.teamId)}</b> ${esc([e.laneType, e.towerType, e.buildingType].filter(Boolean).join(' / '))}`;
    case 'ELITE_MONSTER_KILL':
      return `${who(e.killerId)} 击杀 ${esc([e.monsterType, e.monsterSubType].filter(Boolean).join(' / '))}`;
    default: {
      const { type, timestamp, position, ...rest } = e;
      return `<span class="chip">${esc(type)}</span> <code class="small">${esc(JSON.stringify(rest))}</code>`;
    }
  }
}

export function eventsHtml(d, filter = 'all') {
  const evs = d.timeline.events;
  const types = [...new Set(evs.map((e) => e.type))];
  const list = evs.filter((e) => filter === 'all' || e.type === filter);
  return `<div class="card"><div class="toolbar"><h3 style="margin:0">事件流 <small class="muted">${list.length} 条</small></h3>
    <select id="evFilter"><option value="all">全部事件</option>${types.map((t) => `<option value="${t}" ${t === filter ? 'selected' : ''}>${esc(t)} (${evs.filter((e) => e.type === t).length})</option>`).join('')}</select></div>
    <div class="events">${list.slice(0, 400).map((e) => `<div class="ev ${e.type === 'BUILDING_KILL' ? 'bld' : ''}"><span class="t">${fmtMs(e.timestamp)}</span><span>${evText(e, d)}</span></div>`).join('')}${list.length > 400 ? `<div class="muted">… 仅显示前 400 条</div>` : ''}</div></div>`;
}

export function killMapHtml(d) {
  const kills = d.timeline.events.filter((e) => e.type === 'CHAMPION_KILL' && e.position);
  if (!kills.length) return '';
  const P = Object.fromEntries(d.players.map((p) => [p.participantId, p]));
  const allPos = [
    ...kills.map((e) => e.position),
    ...d.timeline.frames.flatMap((f) => Object.values(f.players).map((p) => ({ x: p.x, y: p.y }))),
  ].filter((p) => p && p.x != null);
  const maxX = Math.max(...allPos.map((p) => p.x)) * 1.05 || 15000;
  const maxY = Math.max(...allPos.map((p) => p.y)) * 1.05 || 15000;
  const S = 420;
  const dots = kills
    .map((e) => {
      const kt = P[e.killerId]?.teamId ?? (P[e.victimId] ? (P[e.victimId].teamId === 100 ? 200 : 100) : 0);
      return `<circle cx="${(e.position.x / maxX) * S}" cy="${S - (e.position.y / maxY) * S}" r="5" class="kd ${teamCls(kt)}"><title>${fmtMs(e.timestamp)} ${esc(P[e.killerId] ? dispName(P[e.killerId]) : '处决')} → ${esc(P[e.victimId] ? dispName(P[e.victimId]) : '')}</title></circle>`;
    })
    .join('');
  return `<div class="card"><h3>击杀位置 <small class="muted">(颜色 = 击杀方,以坐标范围自适应缩放)</small></h3>
    <svg viewBox="0 0 ${S} ${S}" class="killmap"><rect width="${S}" height="${S}" class="kmbg"/><line x1="0" y1="${S}" x2="${S}" y2="0" class="kmdiag"/>${dots}</svg></div>`;
}

// ---------------- 玩家档案 ----------------
const QTYPE = { RANKED_SOLO_5x5: '单双排', RANKED_FLEX_SR: '灵活组排', RANKED_TFT: '云顶之弈', JADE_RANKED_SOLO_5x5: '单双排(JADE)', RANKED_TFT_DOUBLE_UP: '云顶双人', RANKED_PREMADE_5x5: '预组队 5v5' };
const rankText = (e) => (!e || !e.tier || e.tier === 'NA' || e.tier === '' ? '未定级' : `${e.tier} ${e.division && e.division !== 'NA' ? e.division : ''} ${e.leaguePoints ?? 0}LP`);

export function playersHtml(d, extras) {
  if (!extras)
    return `<div class="card center"><p class="muted">玩家档案(召唤师信息 / 排位 / 英雄熟练度)需要客户端在线时向 LCU 查询。</p><button class="btn" id="loadExtras">加载玩家档案</button></div>`;
  const rows = d.players
    .map((p) => {
      const x = extras.players?.[p.puuid] || {};
      const s = x.summoner && !x.summoner.__error ? x.summoner : null;
      const rk = x.ranked && !x.ranked.__error ? x.ranked : null;
      const queues = (rk?.queues || []).filter((q) => q.tier && q.tier !== 'NA' && !/TFT/.test(q.queueType));
      const mast = Array.isArray(x.mastery) ? x.mastery.find((m) => m.championId === p.championId) : null;
      return `<div class="pcard ${teamCls(p.teamId)}">
      <div class="pc-head">${champIcon(p.championId, 'md')}<div><b>${esc(dispName(p))}</b><div class="muted small">${esc(champName(p.championId))} · ${teamName(p.teamId)}</div></div></div>
      <div class="kvs">
        ${s ? `<div>${profileIcon(s.profileIconId)} 等级 <b>${s.summonerLevel}</b> · 隐私 ${esc(s.privacy)}</div>` : `<div class="muted">召唤师信息不可用${x.summoner?.__error ? '(' + esc(x.summoner.__error.slice(0, 50)) + ')' : ''}</div>`}
        ${queues.length ? queues.map((q) => `<div><span class="chip">${esc(QTYPE[q.queueType] || q.queueType)}</span> ${esc(rankText(q))} <span class="muted">${q.wins ?? 0}胜 ${q.losses ?? 0}负</span></div>`).join('') : `<div class="muted">${rk ? '无排位数据' : '排位信息不可用'}</div>`}
        ${rk?.highestRankedEntry?.tier ? `<div class="muted small">最高:${esc(rk.highestRankedEntry.highestTier || '')} ${esc(rk.highestRankedEntry.highestDivision || '')}</div>` : ''}
        ${mast ? `<div>熟练度 <b>Lv.${mast.championLevel}</b> · ${fmtNum(mast.championPoints)} 分</div>` : ''}
      </div></div>`;
    })
    .join('');
  const rp = extras.replay && !extras.replay.__error ? extras.replay : null;
  return `<div class="card"><div class="toolbar"><h3 style="margin:0">玩家档案</h3><span class="spacer"></span><button class="btn ghost" id="loadExtras">↻ 刷新</button></div>
    <div class="pgrid">${rows}</div></div>
    <div class="card"><h3>回放元数据</h3>${rp ? `<code>${esc(JSON.stringify(rp))}</code>` : '<span class="muted">无(该对局回放未下载或不可用)</span>'}</div>`;
}

// ---------------- AI ----------------
const gradeCls = (g) => 'g-' + String(g || '').toUpperCase().replace(/[^SABCD]/g, '');
export function aiResultHtml(r, d) {
  if (!r) return '';
  const a = r.analysis;
  const meta = `<div class="muted small">模型 ${esc(r.model)} · 生成于 ${fmtDate(r.createdAt)}${r.usage ? ` · tokens ${r.usage.total_tokens}` : ''}</div>`;
  if (!a) return `<div class="card">${meta}<h3>模型原始输出(未能解析为 JSON)</h3><pre class="pre">${esc(r.raw)}</pre></div>`;
  const byName = Object.fromEntries(d.players.map((p) => [dispName(p), p]));
  const li = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join('');
  return `<div class="card">${meta}
    <h3>总评</h3><p>${esc(a.summary)}</p>
    ${a.turningPoints?.length ? `<h4>关键转折</h4><ul>${li(a.turningPoints)}</ul>` : ''}
    ${a.mvp ? `<p><span class="chip gold">AI MVP</span> <b>${esc(a.mvp)}</b> — ${esc(a.mvpReason || '')}</p>` : ''}</div>
  <div class="ai-grid">${(a.players || [])
    .map((p) => {
      const dp = byName[p.name] || d.players.find((x) => p.name && (x.name.startsWith(p.name) || p.name.startsWith(x.name)));
      const laneTag = p.lane || dp?.laneCn || dp?.lane || '';
      return `<div class="card aip ${dp ? teamCls(dp.teamId) : ''}">
      <div class="aip-head">${dp ? champIcon(dp.championId, 'md') : ''}<div><b>${esc(p.name)}</b><div class="muted small">${esc(p.champion || '')}${laneTag ? ' · <span class="chip lane">' + esc(laneTag) + '</span>' : ''} · ${esc(p.team || '')}${dp ? ` · ${dp.kills}/${dp.deaths}/${dp.assists}` : ''}</div></div>
        <div class="grade ${gradeCls(p.grade)}">${esc(p.grade || '')}<small>${esc(p.rating ?? '')}</small></div></div>
      <p class="verdict">${esc(p.verdict)}</p>
      <h5>👍 优点</h5><ul>${li(p.strengths)}</ul><h5>👎 不足</h5><ul>${li(p.weaknesses)}</ul><h5>💡 建议</h5><ul>${li(p.advice)}</ul></div>`;
    })
    .join('')}</div>`;
}

export function aiTabHtml(view) {
  const configured = G.status?.ai?.configured;
  return `<div class="card"><div class="toolbar">
    <button class="btn" id="runAi" ${configured ? '' : 'disabled'}>${view.ai ? '↻ 重新分析' : '✨ 用 OpenAI 分析这场对局'}</button>
    ${view.ai ? '<button class="btn" id="btnShareMatchPoster" style="background:#1e6fd9;border-color:#2d7be5">📸 一键生成微信分享长图</button>' : ''}
    <span class="muted">${configured ? `模型: ${esc(G.status.ai.model)}` : '尚未配置 API Key,请先到「设置」页填写。'}</span></div>
    <p class="muted small">发送给 OpenAI 的内容:本场 10 名玩家的战绩/伤害/经济/视野/装备、关键时间点数据与团队经济走势(不含 API Key 等敏感信息)。</p></div>
    <div id="aiOut">${aiResultHtml(view.ai, view.digest)}</div>`;
}

// ---------------- 原始数据 ----------------
export function rawTabHtml(view) {
  const id = view.gameId;
  const sec = (title, key, hasData = true) => `<div class="card"><div class="toolbar"><h3 style="margin:0">${title}</h3><span class="spacer"></span>
    ${hasData ? `<a class="btn ghost sm" href="/api/match/${id}/raw?part=${key}&download=1" download>⬇ 下载</a>` : '<span class="muted">无数据</span>'}</div>
    <div class="jroot" data-part="${key}">${hasData ? (key === 'game' ? jsonTreeHtml(view.game, '', false) : key === 'digest' ? jsonTreeHtml(view.digest, '', false) : '<button class="btn ghost sm loadraw" data-part="' + key + '">点击加载</button>') : ''}</div></div>`;
  return sec('对局明细 (LCU /lol-match-history/v1/games/{id})', 'game') + sec('加工摘要 (本工具计算)', 'digest') + sec('时间线 (/lol-match-history/v1/game-timelines/{id})', 'timeline', view.hasTimeline) + sec('结算数据 EOG (仅最近一场可用)', 'eog', view.hasEog) + sec('附加数据(玩家档案/回放)', 'extras', true);
}

// ---------------- 页面入口 ----------------
export async function render(app, [id, tabArg], alive) {
  let view = await api(`/api/match/${id}`);
  if (!alive()) return;
  const ctx = { tab: TABS.some((t) => t[0] === tabArg) ? tabArg : 'overview', metric: 'gold', hidden: new Set(), evFilter: 'all' };

  const paintTab = () => {
    const el = $('#tabBody');
    const d = view.digest;
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === ctx.tab));
    history.replaceState(null, '', `#/match/${id}/${ctx.tab}`);
    if (ctx.tab === 'overview') {
      el.innerHTML = objectivesHtml(d) + scoreboardHtml(d);
    } else if (ctx.tab === 'detail') {
      el.innerHTML = detailHtml(view);
      $('#hideZero').onchange = (e) => $('#detailTbl').classList.toggle('hide-zero', e.target.checked);
    } else if (ctx.tab === 'timeline') {
      if (!d.timeline) return (el.innerHTML = '<div class="card muted">该对局没有时间线数据(LCU 未返回或对局过旧)。</div>');
      const draw = () => {
        el.innerHTML = timelineCharts(d, ctx.metric, ctx.hidden) + killMapHtml(d) + eventsHtml(d, ctx.evFilter);
        $('#metric').onchange = (e) => ((ctx.metric = e.target.value), draw());
        $('#evFilter').onchange = (e) => ((ctx.evFilter = e.target.value), draw());
        $$('.lgp').forEach((c) => (c.onchange = () => {
          const pid = Number(c.dataset.pid);
          c.checked ? ctx.hidden.delete(pid) : ctx.hidden.add(pid);
          draw();
        }));
      };
      draw();
    } else if (ctx.tab === 'players') {
      el.innerHTML = playersHtml(d, view.extras);
      const b = $('#loadExtras');
      if (b)
        b.onclick = async () => {
          b.disabled = true;
          b.textContent = '加载中…(每位玩家需请求 LCU)';
          try {
            view.extras = await api(`/api/match/${id}/extras?refresh=1`);
          } catch (e) {
            toast(e.message, 'error');
          }
          paintTab();
        };
    } else if (ctx.tab === 'ai') {
      el.innerHTML = aiTabHtml(view);
      const b = $('#runAi');
      if (b)
        b.onclick = async () => {
          b.disabled = true;
          b.textContent = '分析中…(通常需要 10~60 秒)';
          try {
            view.ai = await post(`/api/match/${id}/ai`, { force: true });
            toast('分析完成', 'ok');
          } catch (e) {
            toast(e.message, 'error', 8000);
          }
          paintTab();
        };
      $('#btnShareMatchPoster')?.addEventListener('click', () => {
        generateMatchPoster(view, view.ai);
      });
    } else if (ctx.tab === 'raw') {
      el.innerHTML = rawTabHtml(view);
      bindJsonTrees(el);
      $$('.loadraw', el).forEach((b) => (b.onclick = async () => {
        b.textContent = '加载中…';
        try {
          const data = await api(`/api/match/${id}/raw?part=${b.dataset.part}`);
          b.parentElement.innerHTML = jsonTreeHtml(data, '', false);
          bindJsonTrees(el);
        } catch (e) {
          b.textContent = e.message;
        }
      }));
    }
  };

  const paintAll = () => {
    app.innerHTML = headerHtml(view) + `<div class="tabs">${TABS.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div><div id="tabBody"></div>`;
    $$('.tabs button').forEach((b) => (b.onclick = () => ((ctx.tab = b.dataset.t), paintTab())));
    const add = $('#addIw');
    if (add)
      add.onclick = async () => {
        await post('/api/innerwar', { gameId: Number(id) });
        view.inInnerwar = true;
        toast('已加入内战记录', 'ok');
        paintAll();
      };
    const rm = $('#rmIw');
    if (rm)
      rm.onclick = async () => {
        await fetch(`/api/innerwar/${id}`, { method: 'DELETE' });
        view.inInnerwar = false;
        paintAll();
      };
    const shareHeader = $('#btnShareMatchHeader');
    if (shareHeader) {
      shareHeader.onclick = () => generateMatchPoster(view, view.ai);
    }
    const uploadCloud = $('#btnUploadCloud');
    if (uploadCloud) {
      uploadCloud.onclick = async () => {
        uploadCloud.disabled = true;
        uploadCloud.textContent = '☁️ 正在上传…';
        try {
          const res = await post(`/api/match/${id}/cloud-upload`, {});
          toast('✓ 上传云端成功！', 'ok');
          alert(`🎉 对局 #${id} 已成功上传至 SA1 云端！\n\n云端访问链接：\n${res.cloudUrl}\n\n您可以在 SA1 云端管理后台决定是否在前台展示该对局。`);
        } catch (e) {
          toast('上传失败: ' + e.message, 'bad');
          alert('上传云端失败: ' + e.message + '\n\n提示：请确认已在「设置」中配置正确的 SA1 云端地址与密钥，且云端服务正在运行。');
        } finally {
          uploadCloud.disabled = false;
          uploadCloud.textContent = '☁️ 上传至云端';
        }
      };
    }
    $('#refreshMatch').onclick = async () => {
      toast('正在重新拉取…');
      view = await api(`/api/match/${id}?refresh=1`);
      paintAll();
    };
    paintTab();
  };

  // 别名编辑(事件委托)
  app.onclick = async (e) => {
    const b = e.target.closest('.alias');
    if (!b) return;
    const cur = G.aliases[b.dataset.key] || '';
    const v = prompt(`为 ${b.dataset.name} 设置别名(留空清除)`, cur);
    if (v === null) return;
    const r = await put('/api/aliases', { key: b.dataset.key, alias: v.trim() });
    G.aliases = r.aliases;
    paintTab();
  };
  paintAll();
}
