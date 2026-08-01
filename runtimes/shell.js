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

function start() {
  state = 'play'; score = 0; t = 0; combo = 1; shake = 0; flash = 0;
  parts = []; toasts = []; endMsg = ''; lives = P.lives;
  GAME.reset();
  if (AC && AC.state === 'suspended') AC.resume();
}
function over(msg) {
  state = 'over'; endMsg = msg || 'GAME OVER';
  if (score > best) { best = Math.round(score); localStorage.setItem(BEST_KEY, best); }
  sfx(90, .7, 'sine', .25);
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

// ---- 이펙트 ----
const rr = (a, b) => a + Math.random() * (b - a);
function burst(x, y, n, col, spd = 220) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = rr(spd * .2, spd);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rr(.3, .8), max: .8, c: col, r: rr(1.5, 4) });
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
    ctx.fillText('아무 키나 누르면 시작', W / 2, H / 2 + 112);
  } else if (state === 'over') {
    ctx.fillStyle = C.dark ? 'rgba(0,0,0,.62)' : 'rgba(255,255,255,.62)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.text; ctx.font = 'bold 44px system-ui,sans-serif';
    ctx.fillText(endMsg, W / 2, H / 2 - 28);
    ctx.font = 'bold 30px system-ui,sans-serif'; ctx.fillStyle = C.accent;
    ctx.fillText(Math.round(score).toLocaleString(), W / 2, H / 2 + 16);
    ctx.font = '15px system-ui,sans-serif'; ctx.fillStyle = C.dim;
    ctx.fillText('BEST ' + best.toLocaleString() + ' · 아무 키나 눌러 재시작', W / 2, H / 2 + 50);
  }
}

function boot() {
  GAME.reset(); // 타이틀 화면도 draw()를 타므로 상태를 미리 채워둔다
  let last = performance.now();
  (function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (state === 'play') { t += dt; GAME.update(dt); stepFx(dt); }
    prevKeys.clear(); for (const c of keys) prevKeys.add(c);

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
