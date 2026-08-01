#!/usr/bin/env node
// 온라인 대전 중계 서버. 의존성 0.
// 게임 상태는 중계하지 않는다 — 방 시드와 점수만 오간다. 양쪽이 같은 시드로 같은 맵을 돌고 점수로 겨룬다.
// 그래서 렉이 판정에 영향을 주지 않고, 200ms 폴링이면 충분하다.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = +(process.env.PORT || 24566);
const ROOM_TTL = 15 * 60 * 1000;   // 이 시간 동안 아무 요청 없으면 방 삭제
const PLAYER_TTL = 15 * 1000;      // 이만큼 조용하면 나간 걸로 보고 자리를 비운다
const START_DELAY = 3000;          // 두 번째 사람이 들어온 뒤 동시 시작까지

const rooms = new Map();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const send = (res, code, obj) => { res.writeHead(code, CORS); res.end(JSON.stringify(obj)); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0, chunks = '';
    req.on('data', (c) => {
      n += c.length;
      if (n > 4096) { reject(new Error('본문이 너무 큼')); req.destroy(); return; }
      chunks += c;
    });
    req.on('end', () => { try { resolve(JSON.parse(chunks || '{}')); } catch { reject(new Error('JSON 아님')); } });
    req.on('error', reject);
  });
}

const roomCode = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function prune(room, now) {
  for (const [pid, p] of room.players) if (now - p.seen > PLAYER_TTL) room.players.delete(pid);
  if (room.players.size < 2) room.startAt = 0;
}

function view(room, pid) {
  let opp = null;
  for (const [id, p] of room.players) if (id !== pid) opp = { score: p.score, done: p.done };
  return { seed: room.seed, players: room.players.size, startAt: room.startAt, opp };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method === 'GET') return send(res, 200, { ok: true, rooms: rooms.size });

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }

  const now = Date.now();
  const code = roomCode(body.room);
  if (!code) return send(res, 400, { error: '방 코드가 필요합니다' });

  if (req.url === '/join') {
    let room = rooms.get(code);
    if (!room) {
      room = { seed: crypto.randomInt(1, 2 ** 31), players: new Map(), startAt: 0, touched: now };
      rooms.set(code, room);
    }
    prune(room, now);
    if (room.players.size >= 2) return send(res, 409, { error: '방이 가득 찼습니다' });

    const pid = crypto.randomBytes(8).toString('hex');
    room.players.set(pid, { score: 0, done: false, seen: now });
    room.touched = now;
    if (room.players.size === 2) room.startAt = now + START_DELAY;
    console.log(`[${code}] 입장 (${room.players.size}/2)${room.startAt ? ' → 시작 예약' : ''}`);
    return send(res, 200, { pid, ...view(room, pid) });
  }

  if (req.url === '/sync') {
    const room = rooms.get(code);
    if (!room) return send(res, 404, { error: '방이 사라졌습니다' });
    const me = room.players.get(body.pid);
    if (!me) return send(res, 404, { error: '방에서 나갔습니다' });
    me.score = Number.isFinite(body.score) ? Math.max(0, Math.round(body.score)) : me.score;
    me.done = !!body.done || me.done;
    me.seen = now;
    room.touched = now;
    prune(room, now);
    return send(res, 200, view(room, body.pid));
  }

  return send(res, 404, { error: 'not found' });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.touched > ROOM_TTL) { rooms.delete(code); console.log(`[${code}] 정리됨`); }
}, 60000).unref();

server.listen(PORT, () => {
  console.log(`중계 서버 http://localhost:${PORT}`);
  console.log(`게임 생성: node factory.js 5 --mp http://localhost:${PORT}`);
});
