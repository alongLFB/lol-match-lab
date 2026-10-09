import { G, $, esc, api, put, post, toast } from '../util.js';

export async function render(app, _p, alive) {
  const s = await api('/api/settings');
  const st = await api('/api/status');
  G.settings = s;
  if (!alive()) return;
  const o = s.openai;
  const l = s.lcu;
  const c = s.cloud || { url: 'https://match.alonglfb.com', token: 'along-lol-2026' };
  app.innerHTML = `
  <section class="card"><h2>LCU 连接</h2>
    <p>状态:${st.connected ? `<span class="chip ok">已连接</span> ${esc(st.summoner.gameName)}#${esc(st.summoner.tagLine)} · 端口 ${st.creds.port} · 来源 ${esc(st.creds.source)}` : `<span class="chip bad">未连接</span> <span class="muted">${esc(st.error || '未找到 LeagueClientUx 进程')}</span>`}</p>
    <p class="muted small">默认通过进程命令行自动获取端口与令牌(与 LeagueAkari 相同的方式)。如果客户端以管理员权限运行而本程序读取不到,请以管理员身份启动本程序,或在下方手动填写。</p>
    <div class="form">
      <label>客户端安装目录(含 lockfile)<input id="l_dir" value="${esc(l.installDir)}" placeholder="C:\\Riot Games\\League of Legends"></label>
      <label>手动端口(可选)<input id="l_port" value="${esc(l.port)}"></label>
      <label>手动 Token(可选)<input id="l_token" value="${esc(l.token)}" type="password" placeholder="--remoting-auth-token 的值"></label>
    </div>
    <button class="btn" id="saveLcu">保存并重新连接</button></section>

  <section class="card"><h2>OpenAI 接口</h2>
    <div class="form">
      <label>Base URL <input id="o_base" value="${esc(o.baseUrl)}" placeholder="https://api.openai.com/v1"></label>
      <label>API Key ${o.hasKey ? `<span class="chip ok">已保存 ${esc(o.keyHint)}</span>` : o.envKey ? '<span class="chip ok">使用环境变量 OPENAI_API_KEY</span>' : '<span class="chip bad">未设置</span>'}
        <input id="o_key" type="password" placeholder="${o.hasKey ? '留空保持不变,输入新 key 以替换' : 'sk-...'}" autocomplete="off"></label>
      <label>模型 <input id="o_model" value="${esc(o.model)}" placeholder="gpt-4o-mini / gpt-4.1 / gpt-5 ..."></label>
      <label>Temperature <input id="o_temp" type="number" step="0.1" min="0" max="2" value="${esc(o.temperature)}"></label>
      <label class="wide">额外分析要求(附加到提示词,可选)<textarea id="o_extra" rows="3" placeholder="例如:我们是娱乐内战,请多一些幽默;重点评价打野的节奏">${esc(o.extraPrompt)}</textarea></label>
    </div>
    <div class="toolbar"><button class="btn" id="saveAi">保存</button><button class="btn ghost" id="testAi">测试连接</button>
      ${o.hasKey ? '<button class="btn ghost" id="clearKey">清除已保存的 Key</button>' : ''}<span id="aiMsg" class="muted"></span></div>
    <p class="muted small">API Key 仅保存在本机数据目录的 settings.json 中,只会发往你填写的 Base URL。兼容 OpenAI Chat Completions 协议的第三方/自建服务均可使用。</p></section>

  <section class="card"><h2>☁️ 云端同步设置 (SA1 服务器)</h2>
    <div class="form">
      <label>云端服务根地址 (Cloud URL)<input id="c_url" value="${esc(c.url)}" placeholder="https://match.alonglfb.com"></label>
      <label>上传认证密钥 (Upload Token)<input id="c_token" value="${esc(c.token)}" type="password" placeholder="along-lol-2026"></label>
    </div>
    <div class="toolbar"><button class="btn" id="saveCloud">保存云端设置</button><button class="btn ghost" id="testCloud">测试云端连接</button><span id="cloudMsg" class="muted"></span></div>
    <p class="muted small">配置 SA1 云端接收接口。在对局详情或战绩列表中点击「☁️ 上传云端」，即可将比赛数据与 AI 深度复盘一键同步至云端对局库，并在云端管理后台决定哪些对局在前台展示。</p></section>

  <section class="card"><h2>本地数据</h2>
    <p>数据目录:<code>${esc(s.dataDir)}</code></p>
    <p class="muted small">包含:对局缓存(matches/)、历史列表缓存(lists/)、内战记录(innerwar.json)、AI 结果(ai/)、静态数据与图标缓存。客户端关闭时仍可浏览已缓存的对局。</p></section>`;

  $('#saveLcu').onclick = async () => {
    await put('/api/settings', { lcu: { installDir: $('#l_dir').value.trim(), port: $('#l_port').value.trim(), token: $('#l_token').value.trim() } });
    toast('已保存', 'ok');
    location.reload();
  };
  $('#saveAi').onclick = async () => {
    await put('/api/settings', {
      openai: {
        baseUrl: $('#o_base').value.trim(),
        apiKey: $('#o_key').value,
        model: $('#o_model').value.trim(),
        temperature: Number($('#o_temp').value),
        extraPrompt: $('#o_extra').value,
      },
    });
    toast('已保存', 'ok');
    G.status = await api('/api/status');
    location.reload();
  };
  $('#clearKey')?.addEventListener('click', async () => {
    await put('/api/settings', { openai: { clearKey: true } });
    location.reload();
  };
  $('#testAi').onclick = async () => {
    $('#aiMsg').textContent = '测试中…(请先保存)';
    try {
      const r = await post('/api/ai/test', {});
      $('#aiMsg').innerHTML = `<span class="ok-t">✓ 连接成功,模型 ${esc(r.model)}</span>`;
    } catch (e) {
      $('#aiMsg').innerHTML = `<span class="error">${esc(e.message)}</span>`;
    }
  };

  $('#saveCloud').onclick = async () => {
    await put('/api/settings', {
      cloud: {
        url: $('#c_url').value.trim(),
        token: $('#c_token').value.trim(),
      },
    });
    toast('云端设置已保存', 'ok');
  };
  $('#testCloud').onclick = async () => {
    $('#cloudMsg').textContent = '正在测试连接…';
    try {
      const r = await post('/api/cloud/test', {
        url: $('#c_url').value.trim(),
        token: $('#c_token').value.trim(),
      });
      $('#cloudMsg').innerHTML = `<span class="ok-t">✓ 连接成功 (${esc(r.data?.name || '云端服务在线')})</span>`;
    } catch (e) {
      $('#cloudMsg').innerHTML = `<span class="error">${esc(e.message)}</span>`;
    }
  };
}
