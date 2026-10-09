import { $, $$, esc, api, jsonTreeHtml, bindJsonTrees, toast } from '../util.js';

const PRESETS = [
  ['当前召唤师', '/lol-summoner/v1/current-summoner'],
  ['游戏流程阶段', '/lol-gameflow/v1/gameflow-phase'],
  ['游戏流程会话', '/lol-gameflow/v1/session'],
  ['选人会话', '/lol-champ-select/v1/session'],
  ['大厅', '/lol-lobby/v2/lobby'],
  ['结算数据(最近一场)', '/lol-end-of-game/v1/eog-stats-block'],
  ['最近对局(前 20)', '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19'],
  ['当前排位', '/lol-ranked/v1/current-ranked-stats'],
  ['生涯统计', '/lol-career-stats/v1/summoner-games/current-summoner'],
  ['已拥有英雄', '/lol-champions/v1/owned-champions-minimal'],
  ['英雄熟练度', '/lol-champion-mastery/v1/local-player/champion-mastery'],
  ['好友列表', '/lol-chat/v1/friends'],
  ['游戏版本', '/lol-patch/v1/game-version'],
  ['队列列表', '/lol-game-queues/v1/queues'],
  ['区域/语言', '/riotclient/region-locale'],
  ['进行中的回放', '/lol-replays/v1/configuration'],
];

export async function render(app) {
  app.innerHTML = `<section class="card"><h2>LCU 浏览器</h2>
    <p class="muted">只读地直接请求 LCU 的任意 GET 接口,查看或下载原始 JSON。LCU 暴露的接口列表可在客户端开启时访问 <code>https://127.0.0.1:端口/swagger/v3/openapi.json</code> 获得。</p>
    <div class="toolbar"><input id="path" style="flex:1;min-width:320px" placeholder="/lol-summoner/v1/current-summoner" value="/lol-summoner/v1/current-summoner">
      <button class="btn" id="go">请求</button><a class="btn ghost" id="dl" href="#" download>⬇ 下载</a></div>
    <div class="presets">${PRESETS.map(([l, p]) => `<button class="chip btnchip" data-p="${esc(p)}">${esc(l)}</button>`).join('')}</div></section>
    <section class="card"><div id="out" class="muted">选择或输入一个接口后点击「请求」。</div></section>`;
  const run = async () => {
    const p = $('#path').value.trim();
    $('#dl').href = '/api/lcu?download=1&path=' + encodeURIComponent(p);
    $('#out').innerHTML = '<span class="loading">请求中…</span>';
    try {
      const data = await api('/api/lcu?path=' + encodeURIComponent(p));
      $('#out').innerHTML = jsonTreeHtml(data, '', true);
      bindJsonTrees($('#out'));
    } catch (e) {
      $('#out').innerHTML = `<div class="error">${esc(e.message)}</div>`;
    }
  };
  $('#go').onclick = run;
  $('#path').onkeydown = (e) => e.key === 'Enter' && run();
  $$('.btnchip').forEach((b) => (b.onclick = () => ((b.closest('section').querySelector('#path').value = b.dataset.p), run())));
}
