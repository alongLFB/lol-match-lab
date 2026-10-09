// OpenAI(兼容)接口调用:单场对局成员表现分析 / 内战整体分析
'use strict';
const store = require('./store');
const matches = require('./matches');
const gamedata = require('./gamedata');
const innerwar = require('./innerwar');
const { buildAiPayload } = require('./analysis');

const SYSTEM = `你是一名资深的《英雄联盟》数据分析师和教练。用户会提供一场(或多场)对局由 LCU 导出的结构化数据。
请严格基于数据给出客观、具体、有数据支撑的分析,不要编造数据中不存在的信息(例如没有的技能细节、团战过程)。
重要分析原则:
- 每位玩家的 "lane" 字段已明确标注其实际对局分路（上单/打野/中单/下路/辅助）。
  你必须严格结合该选手所选英雄在该分路的职责与定位进行专业深度点评，切忌把不同位置混为一谈：
    * 上单：考核对线换血抗压、承伤前排、单带线权与进场时机；
    * 打野：考核刷野发育效率、抓人节奏、以及对中立史诗资源（先锋/巢虫/小龙/大龙）的控制；
    * 中单：考核推线游走、核心法术/物理团战爆发伤害、主C压制力；
    * 下路：考核对线补刀发育、团战走位与持续物理/法术输出、后期接管对局能力；
    * 辅助：考核控图视野得分、关键控制、保护后排与先手开团贡献。
- 绝不要在点评中输出“推测担任某某分路”等字眼，分路已明确确认，请直接以该分路开展分析。如果选手选出了非常规英雄打该分路（如上单薇恩、中单艾翁、下路亚索、辅助莫德凯撒），请结合其非常规选择的战术利弊与实际兑现效果进行深入复盘。
- "localScore" 是本地启发式参考分,仅供参考,你需要给出自己的综合评分。
- 评价要考虑模式差异(大乱斗/斗魂竞技场等没有常规分路与视野价值判断)。
- 语气专业客观,允许适度锐评或幽默,但对内战朋友保持善意;缺点要指出并给出可执行建议。
- 使用简体中文。
只输出一个 JSON 对象,不要输出 markdown 代码块或额外文字。`;

const MATCH_SCHEMA = `JSON 格式:
{
  "summary": "对局整体走势与胜负关键(3-5句)",
  "turningPoints": ["关键转折点/决定胜负的因素,2-4条"],
  "mvp": "MVP 玩家名",
  "mvpReason": "原因",
  "players": [
    {
      "name": "玩家名(与输入一致)",
      "champion": "英雄名",
      "lane": "上单/打野/中单/下路/辅助 之一",
      "team": "蓝方/红方",
      "rating": 0到10的数字(可带一位小数),
      "grade": "S/A/B/C/D 之一",
      "verdict": "一句话点评",
      "strengths": ["优点,引用具体数据"],
      "weaknesses": ["不足,引用具体数据"],
      "advice": ["可执行的改进建议"]
    }
  ]
}
players 必须包含输入里的全部玩家,顺序与输入一致。`;

const INNERWAR_SCHEMA = `JSON 格式:
{
  "summary": "内战整体情况总结(胜负分布、阵营偏差、强弱态势,3-6句)",
  "players": [
    {
      "name": "玩家名(优先使用别名)",
      "rating": 0到10的数字,
      "grade": "S/A/B/C/D 之一",
      "profile": "该玩家风格画像(一句话)",
      "strengths": ["优点,引用具体数据"],
      "weaknesses": ["不足,引用具体数据"],
      "advice": ["改进建议"]
    }
  ],
  "awards": [ { "title": "称号(可以有趣)", "name": "玩家名", "reason": "依据" } ],
  "balanceAdvice": "对下次内战分队的建议(如何让双方更均衡)"
}
players 包含所有出场玩家。`;

async function callOpenAI(messages, { jsonMode = true } = {}) {
  const cfg = store.getSettings().openai;
  const apiKey = cfg.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('未配置 OpenAI API Key,请到「设置」页填写');
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const attempts = [
    { response_format: jsonMode ? { type: 'json_object' } : undefined, temperature: cfg.temperature },
    { response_format: jsonMode ? { type: 'json_object' } : undefined },
    {},
  ];
  let lastErr;
  for (const extra of attempts) {
    const body = { model: cfg.model, messages, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) };
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240000),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (res.ok && data?.choices?.[0]?.message) {
      return { content: data.choices[0].message.content || '', usage: data.usage, model: data.model || cfg.model };
    }
    lastErr = new Error(`OpenAI 接口错误 ${res.status}: ${data?.error?.message || text.slice(0, 300)}`);
    if (res.status !== 400) break; // 仅参数不兼容时才降级重试
  }
  throw lastErr;
}

function parseJsonLoose(text) {
  const t = String(text || '').trim();
  try {
    return JSON.parse(t);
  } catch {}
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {}
  }
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try {
      return JSON.parse(t.slice(i, j + 1));
    } catch {}
  }
  return null;
}

async function nameMaps() {
  const [champs, items, augments, queues] = await Promise.all(
    ['champions', 'items', 'augments', 'queues'].map((n) => gamedata.load(n).catch(() => ({})))
  );
  const pick = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.name]));
  return { champions: pick(champs), items: pick(items), augments: pick(augments), queues: pick(queues) };
}

async function analyzeMatch(gameId, { force = false } = {}) {
  const file = `ai/match_${gameId}.json`;
  if (!force) {
    const c = store.readJson(file);
    if (c) return c;
  }
  const bundle = await matches.getMatch(gameId);
  const digest = matches.digestOf(bundle);
  const maps = await nameMaps();
  const aliases = store.getSettings().aliases;
  const payload = buildAiPayload(digest, {
    alias: aliases,
    champions: maps.champions,
    items: maps.items,
    augments: maps.augments,
    queue: maps.queues[digest.queueId],
  });
  const extra = store.getSettings().openai.extraPrompt;
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${extra ? '额外要求:' + extra + '\n\n' : ''}请分析这场对局中每位成员的表现。\n\n${MATCH_SCHEMA}\n\n对局数据:\n${JSON.stringify(payload)}`,
    },
  ];
  const r = await callOpenAI(messages);
  const result = {
    gameId: Number(gameId),
    createdAt: Date.now(),
    model: r.model,
    usage: r.usage,
    analysis: parseJsonLoose(r.content),
    raw: r.content,
  };
  store.writeJson(file, result);
  return result;
}

async function analyzeInnerwar({ force = false, since = 0 } = {}) {
  const file = 'ai/innerwar.json';
  const st = innerwar.stats({ since });
  if (!st.totalGames) throw new Error('还没有内战记录');
  if (!force) {
    const c = store.readJson(file);
    if (c && c.totalGames === st.totalGames && c.since === since) return c;
  }
  const maps = await nameMaps();
  const aliases = store.getSettings().aliases;
  const nm = (k, fallback) => aliases[k] || fallback;
  const pct = (v) => Math.round(v * 1000) / 10 + '%';
  const payload = {
    totalGames: st.totalGames,
    sideWinRate: {
      blue: `${st.sides.blue.wins}/${st.sides.blue.games}`,
      red: `${st.sides.red.wins}/${st.sides.red.games}`,
    },
    players: st.players.map((p) => ({
      name: nm(p.key, p.name),
      games: p.games,
      winRate: pct(p.winRate),
      kda: p.kda,
      avgKDA: `${p.avgKills}/${p.avgDeaths}/${p.avgAssists}`,
      avgDamage: p.avgDmg,
      avgDamageShare: pct(p.avgDmgShare),
      avgDamageTaken: p.avgTaken,
      avgGold: p.avgGold,
      avgCs: p.avgCs,
      avgVision: p.avgVision,
      avgKillParticipation: pct(p.avgKp),
      avgLocalScore: p.avgScore,
      mvpCount: p.mvp,
      aceCount: p.ace,
      blueRecord: `${p.blue.wins}/${p.blue.games}`,
      redRecord: `${p.red.wins}/${p.red.games}`,
      topChampions: p.champs.slice(0, 4).map((c) => `${maps.champions[c.championId] || c.championId} ${c.wins}/${c.games}`),
      recent: p.recent.join(''),
    })),
    recentMatches: st.matches.slice(0, 15).map((m) => ({
      date: new Date(m.date).toISOString().slice(0, 10),
      min: Math.round(m.duration / 60),
      winner: m.winners.map((w) => (w === 100 ? '蓝方' : '红方')).join(','),
      teams: m.teams.map((t) => ({
        side: t.teamId === 100 ? '蓝方' : '红方',
        win: t.win,
        players: t.players.map((p) => `${nm(p.key, p.name)}(${maps.champions[p.championId] || p.championId} ${p.kda})`),
      })),
    })),
  };
  const extra = store.getSettings().openai.extraPrompt;
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${extra ? '额外要求:' + extra + '\n\n' : ''}以下是一个朋友圈内战(自定义对局)的累计统计,请分析每位成员的整体表现,并给出分队均衡建议。\n\n${INNERWAR_SCHEMA}\n\n统计数据:\n${JSON.stringify(payload)}`,
    },
  ];
  const r = await callOpenAI(messages);
  const result = {
    createdAt: Date.now(),
    totalGames: st.totalGames,
    since,
    model: r.model,
    usage: r.usage,
    analysis: parseJsonLoose(r.content),
    raw: r.content,
  };
  store.writeJson(file, result);
  return result;
}

const cachedMatchAnalysis = (gameId) => store.readJson(`ai/match_${gameId}.json`);
const cachedInnerwarAnalysis = () => store.readJson('ai/innerwar.json');

module.exports = { analyzeMatch, analyzeInnerwar, cachedMatchAnalysis, cachedInnerwarAnalysis, callOpenAI };
