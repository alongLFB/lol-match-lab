// 微信分享长图海报生成器 (Mobile Poster Generator for WeChat)
import { esc, fmtDur, fmtDate, fmtNum, fmtK, pct, champName, teamName, toast, openModal, dispName, G } from './util.js';

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r = 8) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 换行文本拆分与测量，返回每行字符串数组 */
function splitWrappedText(ctx, text, maxWidth) {
  if (!text) return [];
  const chars = Array.from(String(text));
  const lines = [];
  let line = '';
  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line.length > 0) {
      lines.push(line);
      line = chars[i];
    } else {
      line = testLine;
    }
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines;
}

/** 连续绘制多行文本并返回结束后的 Y 坐标 */
function drawTextLines(ctx, lines, x, startY, lineHeight) {
  let y = startY;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y);
    y += lineHeight;
  }
  return y;
}

const GRADE_COLORS = {
  S: { bg: '#4a3b10', text: '#f5d27a', border: '#8a6d1f' },
  A: { bg: '#0f2a20', text: '#3ecf8e', border: '#1f6b4c' },
  B: { bg: '#14283f', text: '#4fa3ff', border: '#2a5b95' },
  C: { bg: '#3a2f12', text: '#e6b422', border: '#7a6015' },
  D: { bg: '#331719', text: '#ff5a5f', border: '#7a2b30' },
};

/** 绘制装备格 (24x24 px) */
function drawItemSlot(ctx, img, id, x, y, size = 24, isTrinket = false) {
  roundRect(ctx, x, y, size, size, 4);
  ctx.fillStyle = '#0f1722';
  ctx.fill();
  ctx.strokeStyle = isTrinket ? '#3b82f6' : '#223144';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (id && img) {
    ctx.save();
    roundRect(ctx, x + 1, y + 1, size - 2, size - 2, 3);
    ctx.clip();
    ctx.drawImage(img, x + 1, y + 1, size - 2, size - 2);
    ctx.restore();
  }
}

/** 弹窗展示长图，支持一键下载 PNG & 复制到剪贴板 */
export function showPosterModal(canvas, defaultFilename = 'match-report.png') {
  canvas.toBlob((blob) => {
    if (!blob) return toast('长图生成失败', 'error');
    const url = URL.createObjectURL(blob);
    openModal({
      title: '📸 微信分享战报长图',
      wide: true,
      className: 'poster-modal',
      bodyHtml: `
        <div class="muted small" style="margin-bottom:10px">
          💡 已生成适配手机微信的高清战报长图，已完整携带 <b>局势总评、胜负手转折点、队伍资源对抗、10人全出装与数据</b>！<br>
          直接点击「复制图片」，即可在微信电脑端 <b>Ctrl + V</b> 直接粘贴发送到群聊！
        </div>
        <div class="poster-preview-box">
          <img class="poster-img" src="${url}" alt="战报长图预览">
        </div>
        <div class="poster-actions">
          <button class="btn" id="btnCopyPoster" style="background:#16a34a;border-color:#22c55e">📋 复制图片到剪贴板 (直接发微信)</button>
          <a class="btn ghost" id="btnDlPoster" href="${url}" download="${esc(defaultFilename)}">⬇ 下载高清 PNG</a>
        </div>`,
      onRender: ({ modal }) => {
        const btnCopy = modal.querySelector('#btnCopyPoster');
        if (btnCopy) {
          btnCopy.onclick = async () => {
            try {
              if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                toast('✅ 图片已复制到剪贴板！现在可直接在微信聊天框按 Ctrl+V 粘贴发送！', 'ok', 5000);
              } else {
                toast('当前浏览器不支持直接写入剪贴板，请点击右侧「下载高清 PNG」', 'warn');
              }
            } catch (err) {
              toast('写入剪贴板失败，请使用「下载高清 PNG」发送: ' + err.message, 'warn');
            }
          };
        }
      },
    });
  }, 'image/png');
}

/** 生成单场对局战报长图 (Canvas) */
export async function generateMatchPoster(view, aiResult) {
  toast('正在绘制全景战报长图…', 'info');
  const d = view.digest || {};
  const game = view.game || {};
  const ai = aiResult?.analysis || null;
  const players = d.players || [];

  // 1. 预加载英雄头像
  const champImgs = {};
  await Promise.all(
    players.map(async (p) => {
      if (p.championId) {
        champImgs[p.championId] = await loadImage(`/lcu-asset/lol-game-data/assets/v1/champion-icons/${p.championId}.png`);
      }
    })
  );

  // 2. 预加载玩家装备图标
  const itemImgs = {};
  const itemIds = new Set();
  players.forEach((p) => {
    (p.items || []).forEach((id) => {
      if (id) itemIds.add(id);
    });
  });
  await Promise.all(
    [...itemIds].map(async (id) => {
      const it = G.gd?.items?.[id];
      if (it?.icon) {
        itemImgs[id] = await loadImage('/lcu-asset' + it.icon);
      }
    })
  );

  const W = 750;
  const scratchCanvas = document.createElement('canvas');
  const mCtx = scratchCanvas.getContext('2d');

  // ==================== 高度精确测量 ====================
  let estimatedH = 36 + 32 + 24 + 26; // 头部标题与元数据
  estimatedH += 96 + 16; // VS 比分卡片
  estimatedH += 78 + 18; // 团队资源对抗栏 (经济/塔/龙/大龙)

  let mvpBlock = null;
  let summaryBlock = null;
  let turningBlock = null;

  if (ai) {
    if (ai.mvp) {
      mCtx.font = '12px -apple-system, sans-serif';
      const lines = splitWrappedText(mCtx, ai.mvpReason || '本场发挥出色，带领队伍赢下胜利。', W - 110);
      const h = 42 + lines.length * 19 + 14;
      mvpBlock = { lines, h };
      estimatedH += h + 14;
    }

    if (ai.summary) {
      mCtx.font = '12px -apple-system, "Microsoft YaHei", sans-serif';
      const lines = splitWrappedText(mCtx, ai.summary, W - 110);
      const h = 42 + lines.length * 19 + 14;
      summaryBlock = { lines, h };
      estimatedH += h + 14;
    }

    if (ai.turningPoints?.length) {
      mCtx.font = '12px -apple-system, sans-serif';
      const items = ai.turningPoints.map((tp) => {
        const lines = splitWrappedText(mCtx, tp, W - 130);
        return { text: tp, lines };
      });
      let h = 40;
      items.forEach((it) => {
        h += it.lines.length * 19 + 6;
      });
      h += 10;
      turningBlock = { items, h };
      estimatedH += h + 14;
    }
  }

  // 10 选手卡片高度测量
  estimatedH += 36; // 列表标题
  const playerBlocks = [];
  const playerList = ai?.players?.length ? ai.players : players;

  for (let idx = 0; idx < playerList.length; idx++) {
    const item = playerList[idx];
    const ap = ai?.players ? item : null;
    const dp =
      (ap
        ? players.find(
            (p) =>
              p.name === ap.name ||
              (p.name && ap.name && (p.name.includes(ap.name) || ap.name.includes(p.name)))
          )
        : item) || {};

    let cardH = 104; // 基础高度: 英雄头像+名字+KDA+战力数据条+装备栏
    let aiSub = null;

    if (ap) {
      mCtx.font = 'italic 12px -apple-system, sans-serif';
      const verdictLines = ap.verdict ? splitWrappedText(mCtx, `“ ${ap.verdict} ”`, W - 100) : [];
      mCtx.font = '11px -apple-system, sans-serif';
      const sLines = ap.strengths?.length ? splitWrappedText(mCtx, `👍 优势: ${ap.strengths.join('；')}`, W - 100) : [];
      const wLines = ap.weaknesses?.length ? splitWrappedText(mCtx, `👎 不足: ${ap.weaknesses.join('；')}`, W - 100) : [];
      const aLines = ap.advice?.length ? splitWrappedText(mCtx, `💡 建议: ${ap.advice.join('；')}`, W - 100) : [];

      let reviewH = 10;
      if (verdictLines.length) reviewH += verdictLines.length * 18 + 4;
      if (sLines.length) reviewH += sLines.length * 17 + 3;
      if (wLines.length) reviewH += wLines.length * 17 + 3;
      if (aLines.length) reviewH += aLines.length * 17 + 3;

      cardH += reviewH + 6;
      aiSub = { verdictLines, sLines, wLines, aLines };
    }

    playerBlocks.push({ ap, dp, cardH, aiSub });
    estimatedH += cardH + 12;
  }

  estimatedH += 80; // 底部签名
  const H = Math.round(estimatedH);

  // ==================== 开始绘制 ====================
  const canvas = document.createElement('canvas');
  const scale = 2; // 2x 超清抗锯齿
  canvas.width = W * scale;
  canvas.height = H * scale;

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // 背景渐变
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#090e15');
  bgGrad.addColorStop(0.2, '#0d1522');
  bgGrad.addColorStop(0.8, '#0b111a');
  bgGrad.addColorStop(1, '#070b10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 顶部装饰条
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, '#1e6fd9');
  topGrad.addColorStop(0.5, '#c8aa6e');
  topGrad.addColorStop(1, '#ff6b6b');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 6);

  let curY = 36;

  // 头部标题
  ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.fillStyle = '#c8aa6e';
  ctx.fillText('⚡ LOL MATCH LAB · 赛后全景复盘战报', 32, curY);

  curY += 32;
  ctx.font = 'bold 26px -apple-system, "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#f0e6d2';
  const gameTitle = `${view.isSnapshot ? '📸 比赛实时快照' : '对局结算战报'} #${d.gameId || view.gameId}`;
  ctx.fillText(gameTitle, 32, curY);

  curY += 24;
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = '#7f90a3';
  const durStr = fmtDur(d.gameDuration || game.gameDuration || 0);
  const dateStr = fmtDate(d.gameCreation || game.gameCreation || Date.now());
  ctx.fillText(`比赛时长: ${durStr}   |   时间: ${dateStr}   |   模式: ${game.gameMode || 'CLASSIC'}`, 32, curY);

  curY += 26;

  // 比分卡片
  roundRect(ctx, 32, curY, W - 64, 96, 10);
  ctx.fillStyle = '#121b27';
  ctx.fill();
  ctx.strokeStyle = '#263446';
  ctx.lineWidth = 1;
  ctx.stroke();

  const blueTeam = d.teams?.[0] || { kills: 0, win: false, gold: 0 };
  const redTeam = d.teams?.[1] || { kills: 0, win: false, gold: 0 };

  // 蓝方
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.fillStyle = '#4fa3ff';
  ctx.fillText('蓝色方 ' + (blueTeam.win ? '🏆 胜' : ''), 52, curY + 34);
  ctx.font = 'bold 36px -apple-system, sans-serif';
  ctx.fillText(String(blueTeam.kills || 0), 52, curY + 74);

  // VS / 时长
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#7f90a3';
  ctx.textAlign = 'center';
  ctx.fillText('VS', W / 2, curY + 45);
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillText(durStr, W / 2, curY + 68);
  ctx.textAlign = 'left';

  // 红方
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.fillStyle = '#ff6b6b';
  ctx.fillText((redTeam.win ? '🏆 胜 ' : '') + '红色方', W - 52, curY + 34);
  ctx.font = 'bold 36px -apple-system, sans-serif';
  ctx.fillText(String(redTeam.kills || 0), W - 52, curY + 74);
  ctx.textAlign = 'left';

  curY += 96 + 14;

  // ==================== 队伍核心资源对抗栏 ====================
  roundRect(ctx, 32, curY, W - 64, 76, 8);
  ctx.fillStyle = '#0f1722';
  ctx.fill();
  ctx.strokeStyle = '#223144';
  ctx.lineWidth = 1;
  ctx.stroke();

  const bGold = blueTeam.gold || 0;
  const rGold = redTeam.gold || 0;
  const diff = rGold - bGold;
  const leadStr = diff === 0 ? '双方经济持平' : diff > 0 ? `红色方经济领先 +${fmtK(diff)}` : `蓝色方经济领先 +${fmtK(-diff)}`;

  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#4fa3ff';
  ctx.fillText(`总金币 ${fmtK(bGold)}`, 50, curY + 28);

  ctx.textAlign = 'center';
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.fillStyle = diff === 0 ? '#94a3b8' : '#f5d27a';
  ctx.fillText(leadStr, W / 2, curY + 28);
  ctx.textAlign = 'left';

  ctx.textAlign = 'right';
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#ff6b6b';
  ctx.fillText(`总金币 ${fmtK(rGold)}`, W - 50, curY + 28);
  ctx.textAlign = 'left';

  // 分割线
  ctx.strokeStyle = '#1b2636';
  ctx.beginPath();
  ctx.moveTo(50, curY + 40);
  ctx.lineTo(W - 50, curY + 40);
  ctx.stroke();

  // 资源对比
  const bObj = blueTeam.objectives || {};
  const rObj = redTeam.objectives || {};
  const bDmg = blueTeam.dmg || 0;
  const rDmg = redTeam.dmg || 0;
  const dmgPart = bDmg > 0 || rDmg > 0 ? `伤害 ${fmtK(bDmg)} : ${fmtK(rDmg)}   |   ` : '';
  const objText = `${dmgPart}推塔 ${bObj.towerKills ?? 0} : ${rObj.towerKills ?? 0}   |   小龙 ${bObj.dragonKills ?? 0} : ${rObj.dragonKills ?? 0}   |   大龙 ${bObj.baronKills ?? 0} : ${rObj.baronKills ?? 0}   |   补刀 ${blueTeam.cs ?? 0} : ${redTeam.cs ?? 0}`;

  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText(objText, W / 2, curY + 59);
  ctx.textAlign = 'left';

  curY += 76 + 16;

  // ==================== AI 复盘板块 ====================
  if (ai) {
    // 1. MVP 卡片
    if (mvpBlock) {
      roundRect(ctx, 32, curY, W - 64, mvpBlock.h, 8);
      ctx.fillStyle = '#1e1c12';
      ctx.fill();
      ctx.strokeStyle = '#8a6d1f';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.fillStyle = '#f5d27a';
      ctx.fillText(`👑 AI 评选 MVP: ${ai.mvp}`, 50, curY + 26);

      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      drawTextLines(ctx, mvpBlock.lines, 50, curY + 48, 19);

      curY += mvpBlock.h + 14;
    }

    // 2. 局势走势与复盘总评 (自适应完整高度)
    if (summaryBlock) {
      roundRect(ctx, 32, curY, W - 64, summaryBlock.h, 8);
      ctx.fillStyle = '#101722';
      ctx.fill();
      ctx.strokeStyle = '#263446';
      ctx.stroke();

      ctx.font = 'bold 13px -apple-system, sans-serif';
      ctx.fillStyle = '#c8aa6e';
      ctx.fillText('🎯 对局走势与复盘总评', 50, curY + 26);

      ctx.font = '12px -apple-system, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#e2e8f0';
      drawTextLines(ctx, summaryBlock.lines, 50, curY + 48, 19);

      curY += summaryBlock.h + 14;
    }

    // 3. 关键胜负手与转折点 (Turning Points)
    if (turningBlock) {
      roundRect(ctx, 32, curY, W - 64, turningBlock.h, 8);
      ctx.fillStyle = '#191410';
      ctx.fill();
      ctx.strokeStyle = '#5a3e1b';
      ctx.stroke();

      ctx.font = 'bold 13px -apple-system, sans-serif';
      ctx.fillStyle = '#f5a742';
      ctx.fillText('⚡ 关键胜负手与局势转折', 50, curY + 26);

      let tpY = curY + 48;
      ctx.font = '12px -apple-system, sans-serif';
      for (const item of turningBlock.items) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('•', 50, tpY);
        ctx.fillStyle = '#e2e8f0';
        tpY = drawTextLines(ctx, item.lines, 64, tpY, 19) + 4;
      }

      curY += turningBlock.h + 14;
    }
  }

  // ==================== 10 选手详细卡片 ====================
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.fillStyle = '#f0e6d2';
  ctx.fillText(ai ? '👥 成员本场表现复盘 (10人详评)' : '👥 双方参赛选手详细战报 (10人赛果)', 32, curY);
  curY += 20;

  for (const block of playerBlocks) {
    const { ap, dp, cardH, aiSub } = block;
    const isBlue = dp.teamId === 100 || (ap?.team && ap.team.includes('蓝'));

    roundRect(ctx, 32, curY, W - 64, cardH, 8);
    ctx.fillStyle = '#121a24';
    ctx.fill();
    ctx.strokeStyle = isBlue ? '#234165' : '#57272a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 阵营左侧彩条
    roundRect(ctx, 32, curY, 4, cardH, 2);
    ctx.fillStyle = isBlue ? '#4fa3ff' : '#ff6b6b';
    ctx.fill();

    // 英雄头像
    const champImg = champImgs[dp.championId];
    if (champImg) {
      ctx.save();
      roundRect(ctx, 48, curY + 14, 46, 46, 6);
      ctx.clip();
      ctx.drawImage(champImg, 48, curY + 14, 46, 46);
      ctx.restore();
    } else {
      roundRect(ctx, 48, curY + 14, 46, 46, 6);
      ctx.fillStyle = '#1c2837';
      ctx.fill();
    }

    // 玩家名 & 英雄
    const playerName = dispName(dp) || ap?.name || dp.name || '未知玩家';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillStyle = '#f0e6d2';
    ctx.fillText(playerName, 104, curY + 30);

    // 徽章 (MVP / SVP / 多杀)
    let badgeX = 104 + ctx.measureText(playerName).width + 8;
    if (dp.badge === 'MVP' || ap?.grade === 'S') {
      roundRect(ctx, badgeX, curY + 18, 40, 16, 4);
      ctx.fillStyle = '#4a3b10';
      ctx.fill();
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.fillStyle = '#f5d27a';
      ctx.fillText('MVP', badgeX + 8, curY + 30);
      badgeX += 46;
    } else if (dp.badge === 'SVP') {
      roundRect(ctx, badgeX, curY + 18, 38, 16, 4);
      ctx.fillStyle = '#263446';
      ctx.fill();
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('SVP', badgeX + 7, curY + 30);
      badgeX += 44;
    }
    if (dp.largestMultiKill >= 3) {
      const mkName = ['', '', '', '三杀', '四杀', '五杀'][Math.min(5, dp.largestMultiKill)];
      roundRect(ctx, badgeX, curY + 18, 36, 16, 4);
      ctx.fillStyle = '#57181c';
      ctx.fill();
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.fillStyle = '#f87171';
      ctx.fillText(mkName, badgeX + 6, curY + 30);
    }

    // 英雄名 & 分路 & KDA
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = '#7f90a3';
    const cName = ap?.champion || champName(dp.championId);
    const laneTag = ap?.lane || dp.laneCn || dp.lane || '';
    const lanePrefix = laneTag ? `【${laneTag}】` : '';
    const kdaStr = dp.kills != null ? `KDA ${dp.kills}/${dp.deaths}/${dp.assists} (${dp.kda || 0})` : '';
    ctx.fillText(`${lanePrefix}${cName}   |   ${kdaStr}`, 104, curY + 48);

    // 右侧评分 Grade / Score
    if (ap) {
      const gColor = GRADE_COLORS[String(ap.grade || '').toUpperCase()] || GRADE_COLORS.B;
      roundRect(ctx, W - 96, curY + 14, 46, 42, 6);
      ctx.fillStyle = gColor.bg;
      ctx.fill();
      ctx.strokeStyle = gColor.border;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = 'bold 17px -apple-system, sans-serif';
      ctx.fillStyle = gColor.text;
      ctx.fillText(String(ap.grade || 'B').toUpperCase(), W - 73, curY + 34);

      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillText(String(ap.rating ?? ''), W - 73, curY + 48);
      ctx.textAlign = 'left';
    } else if (dp.score != null) {
      roundRect(ctx, W - 96, curY + 14, 46, 42, 6);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(String(dp.score), W - 73, curY + 34);
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('综合评分', W - 73, curY + 47);
      ctx.textAlign = 'left';
    }

    // 核心战力指标行
    const kpPart = dp.kp != null ? `参团 ${pct(dp.kp, 0)}` : '';
    const dmgPart2 = dp.dmg != null && dp.dmg > 0 ? `伤害 ${fmtNum(dp.dmg)}${dp.dmgShare ? ` (${pct(dp.dmgShare, 0)})` : ''}` : '';
    const goldPart = dp.gold != null ? `经济 ${fmtNum(dp.gold)}` : '';
    const csPart = dp.cs != null ? `补刀 ${dp.cs}` : '';
    const statLine = [kpPart, dmgPart2, goldPart, csPart].filter(Boolean).join('   ·   ');

    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(statLine, 104, curY + 68);

    // 六神装 + 饰品出装槽
    const items = dp.items || [];
    let itemX = 104;
    const itemY = curY + 76;
    for (let i = 0; i < 6; i++) {
      const itId = items[i];
      drawItemSlot(ctx, itemImgs[itId], itId, itemX, itemY, 22, false);
      itemX += 26;
    }
    // 饰品
    const trinketId = items[6];
    drawItemSlot(ctx, itemImgs[trinketId], trinketId, itemX + 2, itemY, 22, true);

    // AI 点评扩展区
    if (aiSub) {
      let subY = curY + 108;

      if (aiSub.verdictLines.length) {
        ctx.font = 'italic 12px -apple-system, sans-serif';
        ctx.fillStyle = '#f5d27a';
        subY = drawTextLines(ctx, aiSub.verdictLines, 48, subY, 18) + 3;
      }

      ctx.font = '11px -apple-system, sans-serif';
      if (aiSub.sLines.length) {
        ctx.fillStyle = '#86efac';
        subY = drawTextLines(ctx, aiSub.sLines, 48, subY, 17) + 2;
      }
      if (aiSub.wLines.length) {
        ctx.fillStyle = '#fca5a5';
        subY = drawTextLines(ctx, aiSub.wLines, 48, subY, 17) + 2;
      }
      if (aiSub.aLines.length) {
        ctx.fillStyle = '#93c5fd';
        subY = drawTextLines(ctx, aiSub.aLines, 48, subY, 17) + 2;
      }
    }

    curY += cardH + 12;
  }

  // 底部签名
  curY += 16;
  ctx.strokeStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(32, curY);
  ctx.lineTo(W - 32, curY);
  ctx.stroke();

  curY += 24;
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#7f90a3';
  ctx.textAlign = 'center';
  ctx.fillText('LOL Match Lab · 赛后全景数据与 AI 深度复盘 · 微信分享专供', W / 2, curY);

  showPosterModal(canvas, `match-report-${d.gameId || view.gameId}.png`);
}

/** 生成内战全局综合分析战报长图 (Canvas) */
export async function generateInnerwarPoster(stats, aiResult) {
  toast('正在绘制内战风云长图…', 'info');
  const ai = aiResult?.analysis || null;
  const players = stats?.players || [];

  // 预加载每位玩家招牌英雄头像
  const champImgs = {};
  await Promise.all(
    players.map(async (p) => {
      const topId = p.champs?.[0]?.championId;
      if (topId && !champImgs[topId]) {
        champImgs[topId] = await loadImage(`/lcu-asset/lol-game-data/assets/v1/champion-icons/${topId}.png`);
      }
    })
  );

  const W = 750;
  const scratchCanvas = document.createElement('canvas');
  const mCtx = scratchCanvas.getContext('2d');

  // ==================== 高度精确测量 ====================
  let estimatedH = 36 + 32 + 24 + 24; // 头部
  estimatedH += 68 + 18; // 胜率面板
  estimatedH += 140 + 18; // 内战战力风云榜 (Top 排行榜)

  let summaryBlock = null;
  let balanceBlock = null;

  if (ai?.summary) {
    mCtx.font = '12px -apple-system, "Microsoft YaHei", sans-serif';
    const lines = splitWrappedText(mCtx, ai.summary, W - 110);
    const h = 42 + lines.length * 19 + 14;
    summaryBlock = { lines, h };
    estimatedH += h + 14;
  }

  if (ai?.awards?.length) {
    const rows = Math.ceil(ai.awards.length / 2);
    estimatedH += 36 + rows * 76 + 10;
  }

  if (ai?.balanceAdvice) {
    mCtx.font = '12px -apple-system, sans-serif';
    const lines = splitWrappedText(mCtx, ai.balanceAdvice, W - 110);
    const h = 42 + lines.length * 19 + 14;
    balanceBlock = { lines, h };
    estimatedH += h + 14;
  }

  // 成员画像列表
  estimatedH += 36;
  const playerBlocks = [];
  const aPlayers = ai?.players || players;

  for (const ap of aPlayers) {
    const sp =
      players.find(
        (p) =>
          p.name === ap.name ||
          p.key === ap.name ||
          (p.name && ap.name && (p.name.includes(ap.name) || ap.name.includes(p.name)))
      ) || {};

    let cardH = 84;
    mCtx.font = '11px -apple-system, sans-serif';
    const strength = (ap.strengths || [])[0] || (sp.games ? `出场 ${sp.games} 场, 胜率 ${Math.round(sp.winRate * 100)}%` : '');
    const advice = (ap.advice || [])[0] || '';

    const sLines = strength ? splitWrappedText(mCtx, `👍 优势: ${strength}`, W - 100) : [];
    const aLines = advice ? splitWrappedText(mCtx, `💡 建议: ${advice}`, W - 100) : [];

    cardH += sLines.length * 17 + aLines.length * 17 + 8;
    playerBlocks.push({ ap, sp, cardH, sLines, aLines });
    estimatedH += cardH + 12;
  }

  estimatedH += 80;
  const H = Math.round(estimatedH);

  // ==================== 开始绘制 ====================
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // 背景
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#090e15');
  bgGrad.addColorStop(0.2, '#101925');
  bgGrad.addColorStop(0.8, '#0b111a');
  bgGrad.addColorStop(1, '#070b10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 顶条
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, '#e6c84e');
  topGrad.addColorStop(0.5, '#4fa3ff');
  topGrad.addColorStop(1, '#a855f7');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 6);

  let curY = 36;
  ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.fillStyle = '#e6c84e';
  ctx.fillText('🏆 LOL MATCH LAB · 朋友圈内战风云榜', 32, curY);

  curY += 32;
  ctx.font = 'bold 26px -apple-system, "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#f0e6d2';
  ctx.fillText('内战战力总评与全局复盘', 32, curY);

  curY += 24;
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = '#7f90a3';
  ctx.fillText(
    `累计收录 ${stats.totalGames} 场内战   |   参与人数: ${stats.players.length} 人   |   生成于: ${new Date().toLocaleDateString()}`,
    32,
    curY
  );

  curY += 24;

  // 胜率面板
  roundRect(ctx, 32, curY, W - 64, 68, 8);
  ctx.fillStyle = '#121a24';
  ctx.fill();
  ctx.strokeStyle = '#263446';
  ctx.stroke();

  const blueGames = stats.sides?.blue?.games || 1;
  const blueWr = Math.round(((stats.sides?.blue?.wins || 0) / blueGames) * 100);
  const redGames = stats.sides?.red?.games || 1;
  const redWr = Math.round(((stats.sides?.red?.wins || 0) / redGames) * 100);

  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = '#4fa3ff';
  ctx.fillText(`蓝色方胜率: ${blueWr}% (${stats.sides?.blue?.wins || 0}/${blueGames})`, 50, curY + 38);

  ctx.fillStyle = '#ff6b6b';
  ctx.fillText(`红色方胜率: ${redWr}% (${stats.sides?.red?.wins || 0}/${redGames})`, W / 2 + 30, curY + 38);

  curY += 68 + 18;

  // ==================== 内战战力风云榜 (Top Leaderboard) ====================
  const topPlayers = [...players]
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, 5);

  roundRect(ctx, 32, curY, W - 64, 136, 8);
  ctx.fillStyle = '#0f1722';
  ctx.fill();
  ctx.strokeStyle = '#253549';
  ctx.stroke();

  ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.fillStyle = '#e6c84e';
  ctx.fillText('📊 内战风云榜 Top 5 (胜率与战绩排行)', 48, curY + 24);

  // 表头
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('排名 / 玩家', 50, curY + 44);
  ctx.fillText('出场', 240, curY + 44);
  ctx.fillText('胜率', 330, curY + 44);
  ctx.fillText('场均 KDA', 440, curY + 44);
  ctx.fillText('MVP 次数', 580, curY + 44);

  ctx.strokeStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(48, curY + 50);
  ctx.lineTo(W - 48, curY + 50);
  ctx.stroke();

  let rankY = curY + 68;
  topPlayers.forEach((p, rIdx) => {
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.fillStyle = rIdx === 0 ? '#f59e0b' : rIdx === 1 ? '#cbd5e1' : rIdx === 2 ? '#b45309' : '#94a3b8';
    ctx.fillText(`#${rIdx + 1}`, 50, rankY);

    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.fillStyle = '#f0e6d2';
    ctx.fillText(p.name, 76, rankY);

    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`${p.games} 场`, 240, rankY);

    const wrPct = Math.round((p.winRate || 0) * 100);
    ctx.fillStyle = wrPct >= 60 ? '#86efac' : wrPct <= 40 ? '#fca5a5' : '#cbd5e1';
    ctx.fillText(`${wrPct}% (${p.wins}胜)`, 330, rankY);

    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(p.kda || '-', 440, rankY);

    ctx.fillStyle = p.mvpCount > 0 ? '#f5d27a' : '#64748b';
    ctx.fillText(p.mvpCount ? `👑 ${p.mvpCount} 次` : '0 次', 580, rankY);

    rankY += 16;
  });

  curY += 136 + 18;

  // AI 态势总评 (自适应完整高度)
  if (summaryBlock) {
    roundRect(ctx, 32, curY, W - 64, summaryBlock.h, 8);
    ctx.fillStyle = '#111722';
    ctx.fill();
    ctx.strokeStyle = '#2b3f5c';
    ctx.stroke();

    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillStyle = '#c8aa6e';
    ctx.fillText('🎯 内战整体态势总评', 50, curY + 26);

    ctx.font = '12px -apple-system, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#e2e8f0';
    drawTextLines(ctx, summaryBlock.lines, 50, curY + 48, 19);

    curY += summaryBlock.h + 14;
  }

  // 称号 Awards
  if (ai?.awards?.length) {
    ctx.font = 'bold 15px -apple-system, sans-serif';
    ctx.fillStyle = '#f0e6d2';
    ctx.fillText('🏅 内战专属荣誉称号', 32, curY);
    curY += 16;

    const cardW = (W - 64 - 12) / 2;
    for (let i = 0; i < ai.awards.length; i += 2) {
      for (let j = 0; j < 2; j++) {
        const aw = ai.awards[i + j];
        if (!aw) continue;
        const ax = 32 + j * (cardW + 12);
        roundRect(ctx, ax, curY, cardW, 64, 8);
        ctx.fillStyle = '#171e28';
        ctx.fill();
        ctx.strokeStyle = '#54481f';
        ctx.stroke();

        ctx.font = 'bold 13px -apple-system, sans-serif';
        ctx.fillStyle = '#f5d27a';
        ctx.fillText(`🏅 ${aw.title}`, ax + 14, curY + 26);

        ctx.font = '12px -apple-system, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(aw.name, ax + 14, curY + 44);

        ctx.font = '10px -apple-system, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(aw.reason ? aw.reason.slice(0, 24) : '', ax + 14, curY + 58);
      }
      curY += 74;
    }
    curY += 10;
  }

  // 分队建议 (自适应完整高度)
  if (balanceBlock) {
    roundRect(ctx, 32, curY, W - 64, balanceBlock.h, 8);
    ctx.fillStyle = '#161d28';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.stroke();

    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('⚖ 下次内战分队建议', 50, curY + 26);

    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    drawTextLines(ctx, balanceBlock.lines, 50, curY + 48, 19);

    curY += balanceBlock.h + 14;
  }

  // 成员表现
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.fillStyle = '#f0e6d2';
  ctx.fillText('👤 成员战力画像与建议', 32, curY);
  curY += 18;

  for (const block of playerBlocks) {
    const { ap, sp, cardH, sLines, aLines } = block;
    const topC = sp.champs?.[0];

    roundRect(ctx, 32, curY, W - 64, cardH, 8);
    ctx.fillStyle = '#121a24';
    ctx.fill();
    ctx.strokeStyle = '#263446';
    ctx.stroke();

    // 招牌英雄头像
    const img = topC ? champImgs[topC.championId] : null;
    if (img) {
      ctx.save();
      roundRect(ctx, 48, curY + 16, 46, 46, 6);
      ctx.clip();
      ctx.drawImage(img, 48, curY + 16, 46, 46);
      ctx.restore();
    } else {
      roundRect(ctx, 48, curY + 16, 46, 46, 6);
      ctx.fillStyle = '#1c2837';
      ctx.fill();
    }

    // 名字与画像
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillStyle = '#f0e6d2';
    ctx.fillText(ap.name || sp.name || '玩家', 104, curY + 34);

    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = '#7f90a3';
    ctx.fillText(ap.profile || (topC ? `招牌英雄: ${champName(topC.championId)}` : '内战选手'), 104, curY + 54);

    // 评级
    const gColor = GRADE_COLORS[String(ap.grade || '').toUpperCase()] || GRADE_COLORS.B;
    roundRect(ctx, W - 100, curY + 16, 48, 44, 6);
    ctx.fillStyle = gColor.bg;
    ctx.fill();
    ctx.strokeStyle = gColor.border;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 18px -apple-system, sans-serif';
    ctx.fillStyle = gColor.text;
    ctx.fillText(String(ap.grade || 'B').toUpperCase(), W - 76, curY + 38);

    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText(String(ap.rating ?? (sp.winRate ? Math.round(sp.winRate * 100) + '%' : '')), W - 76, curY + 52);
    ctx.textAlign = 'left';

    // 优势与建议
    let subY = curY + 76;
    ctx.font = '11px -apple-system, sans-serif';
    if (sLines.length) {
      ctx.fillStyle = '#86efac';
      subY = drawTextLines(ctx, sLines, 48, subY, 17) + 2;
    }
    if (aLines.length) {
      ctx.fillStyle = '#93c5fd';
      subY = drawTextLines(ctx, aLines, 48, subY, 17) + 2;
    }

    curY += cardH + 12;
  }

  // 底部签名
  curY += 16;
  ctx.strokeStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(32, curY);
  ctx.lineTo(W - 32, curY);
  ctx.stroke();

  curY += 24;
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#7f90a3';
  ctx.textAlign = 'center';
  ctx.fillText('LOL Match Lab · 朋友圈内战战绩风云榜 · 微信分享专供', W / 2, curY);

  showPosterModal(canvas, 'innerwar-summary.png');
}
