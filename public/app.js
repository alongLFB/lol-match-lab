import { G, $, $$, esc, api, post, toast, showImportModal, showLiveModal, showSnapshotsModal, fmtDur } from './util.js';
import * as history from './pages/history.js';
import * as match from './pages/match.js';
import * as innerwar from './pages/innerwar.js';
import * as settings from './pages/settings.js';
import * as lcuPage from './pages/lcu.js';

const routes = [
  { re: /^#\/history\/?$/, mod: history, nav: 'history' },
  { re: /^#\/match\/(\d+)(?:\/(\w+))?$/, mod: match, nav: 'history' },
  { re: /^#\/innerwar\/?$/, mod: innerwar, nav: 'innerwar' },
  { re: /^#\/lcu\/?$/, mod: lcuPage, nav: 'lcu' },
  { re: /^#\/settings\/?$/, mod: settings, nav: 'settings' },
];

let token = 0;
async function navigate() {
  const hash = location.hash || '#/history';
  const my = ++token;
  for (const r of routes) {
    const m = r.re.exec(hash);
    if (!m) continue;
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === r.nav));
    const app = $('#app');
    app.onclick = null;
    app.onchange = null;
    app.innerHTML = '<div class="loading">加载中…</div>';
    window.scrollTo(0, 0);
    try {
      await r.mod.render(app, m.slice(1), () => my === token);
    } catch (e) {
      if (my === token) app.innerHTML = `<div class="card error">页面出错:${esc(e.message)}</div>`;
      console.error(e);
    }
    return;
  }
  location.hash = '#/history';
}

export async function refreshStatus() {
  const el = $('#conn');
  try {
    const st = await api('/api/status');
    G.status = st;
    if (st.connected) {
      const s = st.summoner;
      el.className = 'conn on';
      el.textContent = `● ${s.gameName}#${s.tagLine}  Lv.${s.summonerLevel}`;
      el.title = `LCU 已连接 (端口 ${st.creds?.port}, 来源 ${st.creds?.source})\n版本 ${st.version || ''}`;
    } else {
      el.className = 'conn off';
      el.textContent = '○ 未连接客户端(点击重试)';
      el.title = st.error || '未找到运行中的 League 客户端,仍可浏览本地缓存的对局';
    }
  } catch (e) {
    el.className = 'conn off';
    el.textContent = '○ 服务异常';
  }
  return G.status;
}

// ---------- 观战状态检测、中途快照与赛后全自动归档 ----------
let lastKnownSpectate = null;
let probeState = { gameId: null, ready: false, tries: 0, probing: false };

export async function checkSpectate() {
  let banner = document.getElementById('spectateBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'spectateBanner';
    document.body.insertBefore(banner, document.getElementById('app'));
  }

  try {
    const [spec, watcherStatus] = await Promise.all([
      api('/api/spectate/status').catch(() => ({})),
      api('/api/watcher/status').catch(() => ({})),
    ]);
    lastKnownSpectate = spec;
    G.spectate = spec;
    G.watcher = watcherStatus;

    if (spec.inGame && spec.isSpectating) {
      // 正在游戏中/观战中
      localStorage.setItem('lastSpectatedGameId', String(spec.gameId));
      if (spec.queueName) localStorage.setItem('lastSpectatedQueue', spec.queueName);
      probeState = { gameId: String(spec.gameId), ready: false, tries: 0, probing: false };
      banner.style.display = '';
      banner.innerHTML = `
        <div class="spec-banner live">
          <div class="spec-info">
            <span class="pulse-dot"></span>
            <b>正在观战自定义对局</b>
            <span>#${spec.gameId}</span>
            <span class="muted">(${esc(spec.queueName || '自定义')}${spec.gameTime ? ' · ' + fmtDur(spec.gameTime) : ''})</span>
            <span class="badge ok" style="margin-left:4px">后台自动保存: 运行中</span>
          </div>
          <div class="spec-actions">
            ${spec.liveApiAvailable ? '<button class="btn sm" id="btnLiveDash">📊 实时数据看板</button>' : ''}
            <button class="btn sm" id="btnSaveMidSnap" style="background:#166534;border-color:#22c55e" title="随时手动将当前 10 人状态保存到快照库">💾 保存当前快照</button>
            <button class="btn sm ghost" id="btnSnapHistory">📸 快照库</button>
          </div>
        </div>`;

      const btnLive = banner.querySelector('#btnLiveDash');
      if (btnLive) btnLive.onclick = () => showLiveModal();
      const btnSnap = banner.querySelector('#btnSaveMidSnap');
      if (btnSnap) {
        btnSnap.onclick = async () => {
          btnSnap.disabled = true;
          btnSnap.textContent = '保存中…';
          try {
            const res = await post('/api/spectate/snapshot/save', { gameId: spec.gameId, note: '横幅手动快照' });
            toast(`✅ 已保存对局 #${spec.gameId} 快照 (进度 ${fmtDur(res.gameTime)})！数据已安全存盘。`, 'ok');
            btnSnap.textContent = '✅ 已保存';
            setTimeout(() => {
              btnSnap.disabled = false;
              btnSnap.textContent = '💾 保存当前快照';
            }, 3000);
          } catch (e) {
            toast('快照保存失败: ' + e.message, 'error');
            btnSnap.disabled = false;
            btnSnap.textContent = '💾 保存当前快照';
          }
        };
      }
      const btnHistory = banner.querySelector('#btnSnapHistory');
      if (btnHistory) btnHistory.onclick = () => showSnapshotsModal();
      return;
    }

    // 检查是否有刚结束的观战对局
    const endedGameId = localStorage.getItem('lastSpectatedGameId');
    if (endedGameId && !spec.inGame) {
      const qDesc = localStorage.getItem('lastSpectatedQueue') || '';
      const task = watcherStatus?.autoArchiveTask;

      // 1. 如果后台全自动归档已经成功 (saved)
      if (task && String(task.gameId) === String(endedGameId) && task.status === 'saved') {
        banner.style.display = '';
        banner.innerHTML = `
          <div class="spec-banner ended ready">
            <div class="spec-info">
              <span class="pulse-dot"></span>
              <b>🎉 对局 #${endedGameId} 战绩已全自动保存到本地数据库！</b>
              <span class="muted small">${esc(task.message || (task.isCustom ? '已自动加入内战统计' : ''))}</span>
            </div>
            <div class="spec-actions">
              <a class="btn sm success" href="#/match/${endedGameId}">📥 查看对局明细</a>
              <a class="btn sm ghost" href="#/innerwar">⚔️ 查看内战记录</a>
              <button class="btn sm ghost" id="btnSnapHistory">📸 快照库</button>
              <button class="btn sm ghost" id="btnDismissEnded">✕ 关闭提示</button>
            </div>
          </div>`;
        banner.querySelector('#btnSnapHistory').onclick = () => showSnapshotsModal();
        banner.querySelector('#btnDismissEnded').onclick = () => {
          localStorage.removeItem('lastSpectatedGameId');
          banner.style.display = 'none';
        };
        return;
      }

      // 2. 如果官方未生成战绩，但后台已将退场前实时快照归档 (snapshot_archived)
      if (task && String(task.gameId) === String(endedGameId) && task.status === 'snapshot_archived') {
        banner.style.display = '';
        banner.innerHTML = `
          <div class="spec-banner ended ready">
            <div class="spec-info">
              <span class="pulse-dot warn"></span>
              <b>💾 官方未生成战绩（中途退局/解散），已自动将退场前实时快照永久归档！</b>
            </div>
            <div class="spec-actions">
              <button class="btn sm" id="btnViewArchivedSnap">📸 查看退场快照数据</button>
              <button class="btn sm ghost" id="btnSnapHistory">📸 快照库</button>
              <button class="btn sm ghost" id="btnDismissEnded">✕ 关闭提示</button>
            </div>
          </div>`;
        banner.querySelector('#btnViewArchivedSnap').onclick = async () => {
          try {
            const snap = await api(`/api/spectate/snapshot?gameId=${endedGameId}`);
            showLiveModal(snap);
          } catch (e) {
            toast(e.message, 'error');
          }
        };
        banner.querySelector('#btnSnapHistory').onclick = () => showSnapshotsModal();
        banner.querySelector('#btnDismissEnded').onclick = () => {
          localStorage.removeItem('lastSpectatedGameId');
          banner.style.display = 'none';
        };
        return;
      }

      // 3. 正在后台自动探测与轮询保存中 (polling)
      if (task && String(task.gameId) === String(endedGameId) && task.status === 'polling') {
        banner.style.display = '';
        banner.innerHTML = `
          <div class="spec-banner ended pending">
            <div class="spec-info">
              <span class="pulse-dot warn"></span>
              <b>比赛已结束</b>
              <span>系统后台正在全自动探测并保存对局 <b>#${endedGameId}</b> (第 ${task.attempts} 次尝试)...</span>
              <span class="muted small" style="margin-left:4px">（无需任何手动操作，观战局数秒内自动基于终局快照归档）</span>
            </div>
            <div class="spec-actions">
              <button class="btn sm" id="btnFinalizeNow" style="background:#0284c7;border-color:#38bdf8" title="不等官方，直接使用退场前终局快照入库">⚡ 立即基于终局快照归档</button>
              <button class="btn sm ghost" id="btnViewArchivedSnap">📸 查看退场前快照</button>
              <button class="btn sm ghost" id="btnImportEnded">手动导入/诊断</button>
              <button class="btn sm ghost" id="btnDismissEnded">✕ 忽略</button>
            </div>
          </div>`;
        const btnFin = banner.querySelector('#btnFinalizeNow');
        if (btnFin) {
          btnFin.onclick = async () => {
            btnFin.disabled = true;
            btnFin.textContent = '归档中…';
            try {
              await post('/api/spectate/auto-archive/finalize-now', { gameId: endedGameId });
              toast(`✅ 对局 #${endedGameId} 已基于终局快照完成归档！`, 'ok');
              await checkSpectate();
              location.hash = `#/match/${endedGameId}`;
            } catch (e) {
              toast('归档失败: ' + e.message, 'error');
              btnFin.disabled = false;
              btnFin.textContent = '⚡ 立即基于终局快照归档';
            }
          };
        }
        const btnSnap = banner.querySelector('#btnViewArchivedSnap');
        if (btnSnap) {
          btnSnap.onclick = async () => {
            try {
              const snap = await api(`/api/spectate/snapshot?gameId=${endedGameId}`);
              showLiveModal(snap);
            } catch (e) {
              toast(e.message, 'error');
            }
          };
        }
        banner.querySelector('#btnImportEnded').onclick = () => {
          showImportModal(endedGameId, () => {
            localStorage.removeItem('lastSpectatedGameId');
            banner.style.display = 'none';
          });
        };
        banner.querySelector('#btnDismissEnded').onclick = () => {
          localStorage.removeItem('lastSpectatedGameId');
          banner.style.display = 'none';
        };
        return;
      }

      // 4. 其他常规结束情况：显示通用探测横幅
      banner.style.display = '';
      banner.innerHTML = `
        <div class="spec-banner ended pending">
          <div class="spec-info">
            <span class="pulse-dot warn"></span>
            <b>对局 #${endedGameId} 离开画面</b>
            <span>正在探测官方战绩生成状态...</span>
          </div>
          <div class="spec-actions">
            <button class="btn sm" id="btnImportEnded">📥 手动导入</button>
            <button class="btn sm ghost" id="btnSnapHistory">📸 查看快照</button>
            <button class="btn sm ghost" id="btnDismissEnded">✕ 忽略</button>
          </div>
        </div>`;
      banner.querySelector('#btnImportEnded').onclick = () => {
        showImportModal(endedGameId, () => {
          localStorage.removeItem('lastSpectatedGameId');
          banner.style.display = 'none';
        });
      };
      banner.querySelector('#btnSnapHistory').onclick = () => showSnapshotsModal();
      banner.querySelector('#btnDismissEnded').onclick = () => {
        localStorage.removeItem('lastSpectatedGameId');
        banner.style.display = 'none';
      };
      return;
    }

    banner.style.display = 'none';
  } catch (e) {
    // 忽略检测报错
  }
}

async function boot() {
  $('#conn').addEventListener('click', async () => {
    await refreshStatus();
    toast(G.status?.connected ? '已连接客户端' : '仍未连接客户端', G.status?.connected ? 'ok' : 'warn');
  });

  const btnSnaps = document.getElementById('btnQuickSnaps');
  if (btnSnaps) {
    btnSnaps.onclick = () => showSnapshotsModal();
  }

  const [gd, st, set] = await Promise.all([
    api('/api/gamedata').catch(() => ({})),
    refreshStatus(),
    api('/api/settings').catch(() => null),
  ]);
  G.gd = gd;
  G.settings = set;
  G.aliases = set?.aliases || {};
  window.addEventListener('hashchange', navigate);
  navigate();

  // 轮询观战与自动归档状态 (每 4 秒)
  checkSpectate();
  setInterval(checkSpectate, 4000);
}
boot();

