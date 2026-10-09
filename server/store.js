// 本地 JSON 存储(data/ 目录)
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.LOLLAB_DATA || path.join(__dirname, '..', 'data');

function abs(rel) {
  return path.join(DATA_DIR, rel);
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function readJson(rel, def = null) {
  try {
    return JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
  } catch {
    return def;
  }
}
function writeJson(rel, obj) {
  const file = abs(rel);
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
function remove(rel) {
  try {
    fs.unlinkSync(abs(rel));
  } catch {}
}
function exists(rel) {
  return fs.existsSync(abs(rel));
}
function readBuf(rel) {
  try {
    return fs.readFileSync(abs(rel));
  } catch {
    return null;
  }
}
function list(rel = '') {
  try {
    return fs.readdirSync(abs(rel));
  } catch {
    return [];
  }
}

function writeBuf(rel, buf) {
  const file = abs(rel);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, buf);
}

// ---- 设置 ----
const DEFAULT_SETTINGS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.4,
    extraPrompt: '',
  },
  lcu: { installDir: '', port: '', token: '' },
  cloud: {
    url: 'https://match.alonglfb.com',
    token: 'along-lol-2026',
  },
  aliases: {}, // key(puuid 或 名称) -> 别名
};

function getSettings() {
  const s = readJson('settings.json', {});
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    openai: { ...DEFAULT_SETTINGS.openai, ...(s.openai || {}) },
    lcu: { ...DEFAULT_SETTINGS.lcu, ...(s.lcu || {}) },
    cloud: { ...DEFAULT_SETTINGS.cloud, ...(s.cloud || {}) },
    aliases: { ...(s.aliases || {}) },
  };
}
function saveSettings(s) {
  writeJson('settings.json', s);
}

module.exports = { DATA_DIR, abs, readJson, writeJson, remove, exists, readBuf, writeBuf, list, ensureDir, getSettings, saveSettings };
