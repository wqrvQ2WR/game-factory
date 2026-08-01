// 모든 장르가 공유하는 껍데기: 캔버스·입력·루프·점수·이펙트·타이틀/게임오버.
// 장르 파일은 GAME = { reset, update, draw, hud? } 만 정의하면 된다.
const P = CFG.params, C = CFG.palette;
const W = 960, H = 600;
const cvs = document.getElementById('c'), ctx = cvs.getContext('2d');
let scale = 1, ox = 0, oy = 0, dpr = 1;

function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  scale = Math.min(innerWidth / W, innerHeight / H);
  cvs.width = innerWidth * dpr; cvs.height = innerHeight * dpr;
  cvs.style.width = innerWidth + 'px'; cvs.style.height = innerHeight + 'px';
  ox = (innerWidth - W * scale) / 2; oy = (innerHeight - H * scale) / 2;
}
addEventListener('resize', resize); resize();

// ---- 입력 ----
const keys = new Set(), prevKeys = new Set();
let mx = W / 2, my = H / 2, down = false;
onkeydown = e => {
  keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (state !== 'play') start();
};
onkeyup = e => keys.delete(e.code);
const toWorld = e => { mx = (e.clientX - ox) / scale; my = (e.clientY - oy) / scale; };
cvs.onpointermove = toWorld;
cvs.onpointerdown = e => { toWorld(e); down = true; if (state !== 'play') start(); };
onpointerup = () => down = false;
const k = (...c) => c.some(x => keys.has(x));
const tapped = (...c) => c.some(x => keys.has(x) && !prevKeys.has(x)); // 이번 프레임에 새로 눌림

// ---- 상태 ----
const BEST_KEY = 'gf:' + CFG.id + ':best';
let state = 'title', score = 0, best = +localStorage.getItem(BEST_KEY) || 0;
let lives = 0, t = 0, combo = 1, shake = 0, flash = 0, parts = [], toasts = [], endMsg = '';

// ---- 온라인 대전 (CFG.mp 있을 때만) ----
// 서버는 점수만 중계한다. 물리 동기화·롤백 없음 — 양쪽이 같은 방 시드로 같은 맵을 돌고 점수로 겨룬다.
// 그래서 렉이 판정에 영향을 주지 않는다. 대신 상대를 방해하는 상호작용도 없다.
const MP = CFG.mp ? {
  url: CFG.mp.url.replace(/\/$/, ''),
  room: (new URLSearchParams(location.search).get('room') || Math.random().toString(36).slice(2, 7)).toUpperCase(),
  pid: null, seed: +CFG.id, startAt: 0, players: 1, opp: null, err: '', joined: false, sent: 0, done: false,

  post(path, body) {
    return fetch(this.url + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then((r) => (r.ok ? r.json() : r.text().then((x) => { throw new Error(x.slice(0, 60)); })));
  },
  join() {
    this.post('/join', { room: this.room }).then((j) => {
      this.pid = j.pid; this.seed = j.seed; this.players = j.players; this.joined = true; this.err = '';
      try { history.replaceState(null, '', '?room=' + this.room); } catch {}
    }).catch((e) => { this.err = '서버 접속 실패: ' + e.message; });
  },
  canStart() { return this.startAt > 0 && Date.now() >= this.startAt && !this.done; },
  waitSec() { return Math.max(0, (this.startAt - Date.now()) / 1000); },
  link() {
    const url = location.origin + location.pathname + '?room=' + this.room;
    try { return decodeURI(url); } catch { return url; } // 한글 파일명이 %EB%B0%… 로 보이지 않게
  },
  tick() {
    const now = Date.now();
    if (this.joined && now - this.sent > 200) {
      this.sent = now;
      this.post('/sync', { room: this.room, pid: this.pid, score: Math.round(score), done: this.done })
        .then((j) => { this.opp = j.opp; this.players = j.players; this.startAt = j.startAt || 0; this.err = ''; })
        .catch((e) => { this.err = e.message; });
    }
    if (state === 'title' && this.canStart()) start();
  },
  finish() { this.done = true; },
  status() {
    if (this.err) return this.err;
    if (!this.joined) return '서버 접속 중…';
    if (this.players < 2) return `방 코드 ${this.room} · 상대 대기 중`;
    if (!this.canStart()) return `${this.waitSec().toFixed(1)} 초 후 동시 시작`;
    return '진행 중';
  },
  result() {
    if (!this.opp) return '상대 없음';
    if (!this.opp.done) return '상대 완주 대기 중…';
    const me = Math.round(score);
    return me > this.opp.score ? '승리' : me < this.opp.score ? '패배' : '무승부';
  },
} : null;

function start() {
  if (MP && !MP.canStart()) return;
  state = 'play'; score = 0; t = 0; combo = 1; shake = 0; flash = 0;
  parts = []; toasts = []; endMsg = ''; lives = P.lives;
  seedRand(MP ? MP.seed : +CFG.id); // 멀티는 방 시드로 — 양쪽 맵이 같아야 한다
  GAME.reset();
  if (AC && AC.state === 'suspended') AC.resume();
}
function over(msg) {
  state = 'over'; endMsg = msg || 'GAME OVER';
  if (score > best) { best = Math.round(score); localStorage.setItem(BEST_KEY, best); }
  sfx(90, .7, 'sine', .25);
  if (MP) MP.finish();
}
function hit() {
  lives--; combo = 1; shake = 18; flash = 1;
  sfx(120, .35, 'sawtooth', .3);
  if (lives <= 0) over();
}
// 반올림은 표시할 때만. 여기서 반올림하면 프레임당 소수점 점수가 통째로 날아간다.
function addScore(n) { score += n * combo; }

// ---- 오디오 ----
let AC = null;
function sfx(freq, dur, type, vol) {
  try {
    AC = AC || new (AudioContext || webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, AC.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * P.sfxBend), AC.currentTime + dur);
    g.gain.setValueAtTime((vol ?? 0.18) * P.sfxVol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  } catch {}
}

// ---- 난수 ----
// rand()는 게임플레이용 시드 난수. 멀티에서 양쪽이 같은 맵을 봐야 하므로 반드시 이걸 쓴다.
// 파티클·화면흔들림 같은 연출은 Math.random 그대로 — 클라마다 달라도 상관없고, 섞이면 맵이 어긋난다.
let randState = 1;
const seedRand = (s) => { randState = (s >>> 0) || 1; };
function rand() {
  randState = (randState + 0x6d2b79f5) >>> 0;
  let x = randState;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + rand() * (b - a);
seedRand(+CFG.id);

// ---- 이펙트 ----
function burst(x, y, n, col, spd = 220) {
  const R = Math.random;
  for (let i = 0; i < n; i++) {
    const a = R() * 6.283, s = spd * (.2 + R() * .8);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .3 + R() * .5, max: .8, c: col, r: 1.5 + R() * 2.5 });
  }
}
const toast = (x, y, txt, c) => toasts.push({ x, y, txt, c, life: .9 });

function poly(x, y, r, sides, rot, fill, glow) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i / sides * 6.283;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.shadowBlur = glow || 0; ctx.shadowColor = fill;
  ctx.fillStyle = fill; ctx.fill(); ctx.shadowBlur = 0;
}
function grid(step = 48) {
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
}

function stepFx(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  for (const s of toasts) { s.y -= 34 * dt; s.life -= dt; }
  toasts = toasts.filter(s => s.life > 0);
  shake *= Math.pow(.001, dt); flash *= Math.pow(.002, dt);
  if (P.timeLimit && t >= P.timeLimit) over(P.timeUpMsg || '시간 종료');
}

function drawFx() {
  for (const p of parts) { ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.c; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 17px system-ui,sans-serif'; ctx.textAlign = 'center';
  for (const s of toasts) { ctx.globalAlpha = s.life; ctx.fillStyle = s.c; ctx.fillText(s.txt, s.x, s.y); }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = 'bold 26px system-ui,sans-serif';
  ctx.fillText(Math.round(score).toLocaleString(), 20, 40);
  ctx.font = '13px system-ui,sans-serif'; ctx.fillStyle = C.dim;
  ctx.fillText('BEST ' + best.toLocaleString(), 20, 60);
  ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.font = 'bold 20px system-ui,sans-serif';
  ctx.fillText('♥'.repeat(Math.max(0, lives)), W - 20, 38);
  let y = 58;
  ctx.font = '14px system-ui,sans-serif'; ctx.fillStyle = C.dim;
  if (P.timeLimit) { ctx.fillText(Math.max(0, P.timeLimit - t).toFixed(1) + 's', W - 20, y); y += 20; }
  if (MP) {
    const os = MP.opp ? MP.opp.score : 0, d = Math.round(score) - os;
    ctx.fillStyle = d >= 0 ? C.pickup : C.danger;
    ctx.fillText(`상대 ${os.toLocaleString()} (${d >= 0 ? '+' : ''}${d.toLocaleString()})`, W - 20, y);
    y += 20; ctx.fillStyle = C.dim;
  }
  for (const line of (GAME.hud ? GAME.hud() : [])) { ctx.fillText(line, W - 20, y); y += 20; }
  if (P.combo && combo > 1) { ctx.fillStyle = C.accent; ctx.font = 'bold 22px system-ui,sans-serif'; ctx.fillText('x' + combo, W - 20, y + 6); }
}

function drawScreens() {
  ctx.textAlign = 'center';
  if (state === 'title') {
    ctx.fillStyle = C.dark ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.5)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.text; ctx.font = 'bold 54px system-ui,sans-serif';
    ctx.fillText(CFG.title, W / 2, H / 2 - 46);
    ctx.fillStyle = C.accent; ctx.font = '18px system-ui,sans-serif';
    ctx.fillText(CFG.subtitle, W / 2, H / 2 - 14);
    ctx.fillStyle = C.dim; ctx.font = '15px system-ui,sans-serif';
    ctx.fillText(CFG.tagline, W / 2, H / 2 + 22);
    ctx.fillStyle = C.text; ctx.font = '14px system-ui,sans-serif';
    ctx.fillText(CFG.howto, W / 2, H / 2 + 70);
    ctx.fillStyle = C.player; ctx.font = 'bold 17px system-ui,sans-serif';
    ctx.fillText(MP ? MP.status() : '아무 키나 누르면 시작', W / 2, H / 2 + 112);
    if (MP && MP.joined && MP.players < 2) {
      ctx.fillStyle = C.dim; ctx.font = '13px system-ui,sans-serif';
      ctx.fillText('이 주소를 상대에게 보내세요', W / 2, H / 2 + 142);
      ctx.fillStyle = C.accent; ctx.font = '13px system-ui,sans-serif';
      ctx.fillText(MP.link(), W / 2, H / 2 + 162, W - 60); // 길면 캔버스가 알아서 좁혀 그린다
    }
  } else if (state === 'over') {
    ctx.fillStyle = C.dark ? 'rgba(0,0,0,.62)' : 'rgba(255,255,255,.62)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.text; ctx.font = 'bold 44px system-ui,sans-serif';
    ctx.fillText(endMsg, W / 2, H / 2 - 28);
    ctx.font = 'bold 30px system-ui,sans-serif'; ctx.fillStyle = C.accent;
    ctx.fillText(Math.round(score).toLocaleString(), W / 2, H / 2 + 16);
    ctx.font = '15px system-ui,sans-serif'; ctx.fillStyle = C.dim;
    if (MP) {
      const r = MP.result();
      ctx.fillStyle = r === '승리' ? C.pickup : r === '패배' ? C.danger : C.dim;
      ctx.font = 'bold 26px system-ui,sans-serif';
      ctx.fillText(r, W / 2, H / 2 + 54);
      ctx.fillStyle = C.dim; ctx.font = '14px system-ui,sans-serif';
      ctx.fillText(`나 ${Math.round(score).toLocaleString()} · 상대 ${MP.opp ? MP.opp.score.toLocaleString() : '-'} · 새로고침하면 재대결`, W / 2, H / 2 + 84);
    } else {
      ctx.fillText('BEST ' + best.toLocaleString() + ' · 아무 키나 눌러 재시작', W / 2, H / 2 + 50);
    }
  }
}

const STEP = 1 / 60; // 고정 타임스텝: 이게 없으면 프레임레이트에 따라 맵이 갈린다

function boot() {
  GAME.reset(); // 타이틀 화면도 draw()를 타므로 상태를 미리 채워둔다
  if (MP) MP.join();
  let last = performance.now(), acc = 0;
  (function frame(now) {
    acc += Math.min(.25, (now - last) / 1000); last = now;
    if (MP) MP.tick();
    while (acc >= STEP) {
      acc -= STEP;
      if (state === 'play') { t += STEP; GAME.update(STEP); stepFx(STEP); }
      prevKeys.clear(); for (const c of keys) prevKeys.add(c);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg2; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    ctx.translate(ox + (Math.random() - .5) * shake, oy + (Math.random() - .5) * shake);
    ctx.scale(scale, scale);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    GAME.draw();
    drawFx();
    if (flash > .01) { ctx.fillStyle = C.danger; ctx.globalAlpha = flash * .35; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (state !== 'title') drawHud();
    drawScreens();
    ctx.restore();
    requestAnimationFrame(frame);
  })(last);
}
