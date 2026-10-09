// LCU (League Client Update) 连接层:自动发现凭证 + 请求封装
// 凭证发现顺序:手动配置 > 进程命令行 > lockfile
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 8 });

let cached = null; // { port, token, installDir, source }

function psCommandLine() {
  return new Promise((resolve) => {
    const script =
      "Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | " +
      'Select-Object -First 1 ExecutablePath,CommandLine | ConvertTo-Json -Compress';
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve(null);
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

function parseLockfile(file) {
  try {
    const [, , port, token, protocol] = fs.readFileSync(file, 'utf8').trim().split(':');
    if (port && token) return { port: Number(port), token, protocol: protocol || 'https' };
  } catch {}
  return null;
}

/** 发现 LCU 凭证。manual: { installDir?, port?, token? } */
async function discover(manual = {}) {
  if (manual.port && manual.token) {
    return { port: Number(manual.port), token: manual.token, source: 'manual' };
  }
  const info = await psCommandLine();
  if (info && info.CommandLine) {
    const cl = info.CommandLine;
    const port = /--app-port=(\d+)/.exec(cl)?.[1];
    const token = /--remoting-auth-token=([\w-]+)/.exec(cl)?.[1];
    const dir = /--install-directory=("?)([^"]+?)\1(?:\s+--|\s*"|\s*$)/.exec(cl)?.[2];
    if (port && token) {
      return { port: Number(port), token, installDir: dir, source: 'process' };
    }
    if (info.ExecutablePath) {
      const lf = parseLockfile(path.join(path.dirname(info.ExecutablePath), 'lockfile'));
      if (lf) return { ...lf, installDir: path.dirname(info.ExecutablePath), source: 'lockfile' };
    }
  }
  if (manual.installDir) {
    const lf = parseLockfile(path.join(manual.installDir, 'lockfile'));
    if (lf) return { ...lf, installDir: manual.installDir, source: 'lockfile(manual)' };
  }
  return null;
}

let manualProvider = () => ({});
/** 注入"手动配置"提供者(设置页里填写的安装目录/端口/token) */
function setManualProvider(fn) {
  manualProvider = fn;
}

async function connect(manual) {
  cached = await discover(manual || manualProvider());
  return cached;
}

function rawRequest(creds, method, urlPath, body, wantBuffer) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request(
      {
        host: '127.0.0.1',
        port: creds.port,
        path: urlPath,
        method,
        agent,
        timeout: 20000,
        headers: {
          Authorization: 'Basic ' + Buffer.from('riot:' + creds.token).toString('base64'),
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (wantBuffer) return resolve({ status: res.statusCode, headers: res.headers, body: buf });
          const text = buf.toString('utf8');
          let data = text;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('LCU request timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

class LcuError extends Error {
  constructor(status, urlPath, body) {
    super(`LCU ${status} ${urlPath}: ${typeof body === 'string' ? body : body?.message || JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

/** 请求 LCU;凭证失效(客户端重启)时自动重新发现并重试一次 */
async function request(method, urlPath, { body, manual, buffer } = {}) {
  if (!cached) await connect(manual);
  if (!cached) throw new LcuError(503, urlPath, '未找到运行中的 League 客户端');
  let res;
  try {
    res = await rawRequest(cached, method, urlPath, body, buffer);
    if (res.status === 401) throw new Error('401');
  } catch (e) {
    await connect(manual);
    if (!cached) throw new LcuError(503, urlPath, '未找到运行中的 League 客户端');
    res = await rawRequest(cached, method, urlPath, body, buffer);
  }
  if (res.status >= 400) throw new LcuError(res.status, urlPath, res.body);
  return res;
}

const get = async (p, opts) => (await request('GET', p, opts)).body;
const getBuffer = (p, opts) => request('GET', p, { ...opts, buffer: true });

module.exports = { connect, request, get, getBuffer, LcuError, setManualProvider, getCreds: () => cached };
