#!/usr/bin/env node
// 갤러리 서버. out/ 을 서빙하고, AI 제작기가 만든 게임을 POST /save 로 받아 갤러리에 넣는다.
// 의존성 0. 브라우저는 파일을 못 쓰니 저장은 여기를 거쳐야 한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateGallery } from '../factory.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const PORT = +(process.env.PORT || 8791);
const MAX_BODY = 4 << 20;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const send = (res, code, obj) => { res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const slug = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'game';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0, buf = '';
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) { reject(new Error('본문이 너무 큼')); req.destroy(); return; }
      buf += c;
    });
    req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch { reject(new Error('JSON 아님')); } });
    req.on('error', reject);
  });
}

function saveGame(b) {
  const html = String(b.html || '');
  if (!/<canvas/i.test(html) || html.length < 200) throw new Error('게임 HTML이 아님');
  const title = String(b.title || 'AI 게임').trim().slice(0, 60);
  const tags = Array.isArray(b.tags) ? b.tags.map(String).slice(0, 12) : [];

  const file = `ai-${slug(title)}-${Date.now().toString(36).slice(-5)}.html`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), html);

  const dbPath = path.join(OUT, 'games.json');
  const games = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : [];
  games.push({
    file, seed: 'ai', family: 'ai', famKo: 'AI 생성', title,
    subtitle: String(b.model || 'ai'), tagline: '태그만 주고 AI가 코드를 직접 씀',
    mech: tags.join(', '),
    tags: [b.attempts ? `시도 ${b.attempts}회` : 'AI', ...tags.slice(0, 4)],
    at: new Date().toISOString(), source: 'ai:' + (b.model || ''),
    bg: '#12131a', fg: '#e9e9f2', ac: '#7c8cff', player: '#7c8cff', enemy: '#ff7a86', pickup: '#6ee7a5',
  });
  fs.writeFileSync(dbPath, JSON.stringify(games, null, 1));
  updateGallery();
  console.log(`저장: ${title} → out/${file} (총 ${games.length}개)`);
  return { ok: true, file, url: '/' + encodeURIComponent(file), total: games.length };
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  if (req.method === 'POST' && req.url === '/save') {
    try { return send(res, 200, saveGame(await readBody(req))); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }

  // 정적 서빙 — out/ 밖으로는 절대 못 나간다
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, { error: 'bad url' }); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(OUT, rel);
  if (!file.startsWith(OUT + path.sep)) return send(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('없는 파일: ' + rel);
  }
  res.writeHead(200, { ...CORS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`갤러리 서버 http://localhost:${PORT}`);
  console.log(`  갤러리   http://localhost:${PORT}/index.html`);
  console.log(`  AI 제작기 http://localhost:${PORT}/aimaker.html  (만든 게임은 자동으로 갤러리에 저장됩니다)`);
});
