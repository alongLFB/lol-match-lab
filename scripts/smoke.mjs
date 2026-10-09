// 冒烟测试:用真实 API 数据在 Node 中渲染各页面的 HTML 构建函数,检查异常 / undefined / NaN
import { G } from '../public/util.js';
import * as match from '../public/pages/match.js';
import * as iw from '../public/pages/innerwar.js';
import * as hist from '../public/pages/history.js';

const B = 'http://127.0.0.1:' + (process.env.PORT || 5179);
const j = async (p, o) => (await fetch(B + p, o)).json();
const bad = (name, html) => {
  const m = /undefined|NaN|\[object Object\]/.exec(html);
  console.log(`${m ? 'WARN' : 'ok  '} ${name} (${html.length} chars)${m ? ' contains ' + m[0] + ' near: ' + html.slice(Math.max(0, m.index - 80), m.index + 40).replace(/\s+/g, ' ') : ''}`);
};

G.gd = await j('/api/gamedata');
const ids = process.argv.slice(2).map(Number);
const hist1 = await j('/api/history?days=0');
const gid = ids[0] || hist1.games.find((g) => g.isCustom)?.gameId || hist1.games[0].gameId;
const view = await j('/api/match/' + gid);
const d = view.digest;
bad('header', match.headerHtml(view));
bad('objectives', match.objectivesHtml(d));
bad('scoreboard', match.scoreboardHtml(d));
bad('detail', match.detailHtml(view));
if (d.timeline) {
  bad('timeline', match.timelineCharts(d));
  bad('events', match.eventsHtml(d));
  bad('killmap', match.killMapHtml(d));
}
bad('players(no extras)', match.playersHtml(d, null));
const extras = await j('/api/match/' + gid + '/extras');
console.log('extras players:', Object.keys(extras.players).length, 'replay:', JSON.stringify(extras.replay).slice(0, 80));
const p0 = Object.values(extras.players)[0];
console.log(' sample summoner err?', p0.summoner.__error, '| ranked err?', p0.ranked.__error, '| mastery err?', Array.isArray(p0.mastery) ? 'array' : p0.mastery.__error);
bad('players(extras)', match.playersHtml(d, extras));
bad('raw', match.rawTabHtml(view));
bad('history rows', hist1.games.map(hist.rowHtml).join(''));
bad('history summary', hist.summaryHtml(hist1.games));
// 内战
await j('/api/innerwar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: gid }) });
const iwd = await j('/api/innerwar');
G.aliases = iwd.aliases;
const st = iwd.stats;
console.log('innerwar games', st.totalGames, 'players', st.players.length);
bad('iw summary', iw.summaryHtml(st));
bad('iw players', iw.playersTableHtml(st));
iw.setStats(st);
bad('iw matrix with', iw.matrixHtml(st, 'with'));
bad('iw matrix against', iw.matrixHtml(st, 'against'));
bad('iw champions', iw.championsHtml(st));
bad('iw records', iw.recordsHtml(st));
