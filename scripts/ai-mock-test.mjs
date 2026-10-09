// 用本地 mock 的 OpenAI 服务验证 AI 分析链路(不消耗真实额度)
import http from 'node:http';
const B = 'http://127.0.0.1:5179';
const j = async (p, o) => {
  const r = await fetch(B + p, o);
  return { status: r.status, body: await r.json() };
};
const put = (p, b) => j(p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const post = (p, b) => j(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

let captured = null;
const srv = http.createServer((req, res) => {
  const ch = [];
  req.on('data', (c) => ch.push(c));
  req.on('end', () => {
    captured = { url: req.url, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(ch).toString()) };
    const users = captured.body.messages[1].content;
    const isIw = users.includes('内战');
    const content = JSON.stringify(
      isIw
        ? { summary: 'mock iw', players: [{ name: 'A', rating: 7, grade: 'A', profile: 'p', strengths: ['s'], weaknesses: ['w'], advice: ['a'] }], awards: [{ title: 't', name: 'A', reason: 'r' }], balanceAdvice: 'b' }
        : { summary: 'mock summary', turningPoints: ['t1'], mvp: 'X', mvpReason: 'r', players: [{ name: 'X', champion: 'c', team: '蓝方', rating: 8.1, grade: 'A', verdict: 'v', strengths: ['s'], weaknesses: ['w'], advice: ['a'] }] }
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'mock-model', usage: { total_tokens: 123 }, choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => srv.listen(5199, '127.0.0.1', r));

const before = (await j('/api/settings')).body.openai;
await put('/api/settings', { openai: { baseUrl: 'http://127.0.0.1:5199/v1', apiKey: 'sk-test-1234', model: 'mock' } });
const gid = (await j('/api/innerwar')).body.records[0].gameId;
const m = await post(`/api/match/${gid}/ai`, { force: true });
console.log('match ai:', m.status, m.body.analysis?.summary, '| auth ok:', captured.auth === 'Bearer sk-test-1234', '| url', captured.url);
const payload = JSON.parse(captured.body.messages[1].content.split('对局数据:\n')[1]);
console.log('payload players:', payload.players.length, 'bytes:', JSON.stringify(payload).length);
console.log('sample player:', JSON.stringify(payload.players[0]).slice(0, 700));
const iw = await post('/api/innerwar-ai', { force: true });
console.log('innerwar ai:', iw.status, iw.body.analysis?.summary);
const st = (await j('/api/status')).body;
console.log('status.ai', JSON.stringify(st.ai));
// 还原设置(清除测试 key)
await put('/api/settings', { openai: { clearKey: true, baseUrl: before.baseUrl, model: before.model } });
srv.close();
