#!/usr/bin/env node
// 게임 공장. 절차적 파라미터로 뼈대를 찍고, omniroute LLM이 컨셉/밸런스를 씌운다.
// 사용:  node factory.js [개수|--forever] [--no-ai] [--seed xxx] [--model auto/fast] [--open]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { makeRng, newSeed, hashStr } from './src/rng.js';
import { makePalette } from './src/palette.js';
import { proceduralConcept, THEMES } from './src/naming.js';
import { chat, extractJson, isUp, DEFAULT_MODEL } from './src/llm.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const RUNTIME = fs.readFileSync(path.join(ROOT, 'runtime.js'), 'utf8');

// ---------- 절차적 파라미터: 여기가 게임의 뼈대 ----------
export function makeParams(rnd) {
  const enemyMode = rnd.pick(['chase', 'drift', 'rain', 'orbit']);
  const gravity = (enemyMode === 'rain' || enemyMode === 'drift') && rnd.chance(0.4) ? rnd.range(1100, 1900) : 0;
  const shoot = rnd.chance(0.55);
  // orbit은 장애물이 중앙만 돌아서 구석에 붙어 있으면 영원히 안전하다 → 수집품으로 밖으로 끌어낸다
  const hasPickup = enemyMode === 'orbit' || rnd.chance(0.7) || !shoot;

  const p = {
    speed: rnd.range(230, 430),
    accel: rnd.float(6, 15),
    friction: rnd.float(0.86, 0.95),
    jump: rnd.range(560, 800),
    gravity,
    playerSize: rnd.range(11, 18),
    playerSides: rnd.range(3, 6),
    edge: gravity ? 'wall' : rnd.pick(['wrap', 'bounce', 'wall', 'wall']),

    enemyMode,
    enemySpeed: rnd.range(80, 260),
    enemySize: rnd.range(12, 27),
    enemySides: rnd.range(3, 8),
    enemyRate: +rnd.float(0.45, 2.1).toFixed(2),
    enemyMax: rnd.range(10, 45),
    enemyHp: shoot ? rnd.range(1, 3) : 1,

    shoot,
    fireRate: +rnd.float(0.11, 0.3).toFixed(3),
    bulletSpeed: rnd.range(520, 820),
    bulletLife: +rnd.float(0.6, 1.4).toFixed(2),

    pickupRate: hasPickup ? +rnd.float(0.3, 1.0).toFixed(2) : 0,
    pickupScore: hasPickup ? rnd.range(10, 60) : 0,
    pickupSides: rnd.range(3, 8),
    magnet: hasPickup && rnd.chance(0.35) ? rnd.range(80, 150) : 0,

    killScore: shoot ? rnd.range(15, 80) : 0,
    survivalScore: shoot || hasPickup ? (rnd.chance(0.5) ? rnd.range(2, 12) : 0) : rnd.range(6, 16),

    lives: rnd.range(1, 5),
    timeLimit: rnd.chance(0.25) ? rnd.pick([45, 60, 90]) : 0,
    ramp: +rnd.float(0.01, 0.06).toFixed(3),
    shrink: rnd.chance(0.2) ? rnd.range(4, 14) : 0,
    darkness: rnd.chance(0.18) ? rnd.range(150, 330) : 0,
    combo: rnd.chance(0.6),

    sfxVol: +rnd.float(0.5, 1).toFixed(2),
    sfxBend: +rnd.float(0.35, 2.2).toFixed(2),
  };
  // 점수 얻을 방법이 하나도 없는 게임이 나오지 않게
  if (!p.pickupScore && !p.killScore && !p.survivalScore) p.survivalScore = 10;
  return p;
}

const MODE_KO = { chase: '추격형 적', drift: '직선으로 튕겨다니는 적', rain: '위에서 쏟아지는 적', orbit: '중앙을 도는 회전 장애물' };

function howto(p) {
  const parts = ['이동: WASD / 방향키 / 마우스 드래그'];
  if (p.gravity) parts.push('점프: Space / W');
  if (p.shoot) parts.push('발사: Space / 클릭');
  return parts.join('   ·   ');
}

function mechSummary(p) {
  const s = [MODE_KO[p.enemyMode]];
  if (p.gravity) s.push('중력 있음(점프)');
  if (p.shoot) s.push('플레이어가 발사 가능');
  if (p.pickupRate) s.push('수집 아이템 있음');
  if (p.shrink) s.push('시간이 갈수록 무대가 좁아짐');
  if (p.darkness) s.push('시야가 어두움');
  if (p.timeLimit) s.push(`${p.timeLimit}초 제한`);
  if (p.edge === 'wrap') s.push('화면 순환');
  s.push(`목숨 ${p.lives}`);
  return s.join(', ');
}

// ---------- LLM 컨셉 ----------
const SYS = `너는 아케이드 게임 기획자다. 주어진 기계적 규칙에 딱 맞는 게임 컨셉을 짓는다.
JSON만 출력하고 다른 말은 하지 마라. 스키마:
{"title":"한국어 제목 2~8자, 흔하지 않게","subtitle":"영문 부제 2~4단어","tagline":"한국어 한 줄 카피, 20자 내외","hue":0-359 정수,"scheme":"analogous|complementary|triad|splitComp|monochrome","dark":true/false,"tweaks":{"enemyRate":수,"enemySpeed":수,"lives":1-5,"ramp":수}}
tweaks는 컨셉에 맞게 난이도를 조정하는 선택 항목이다. 생략해도 된다.`;

async function llmConcept(p, rnd, model) {
  const seedWords = rnd.pick(THEMES);
  const msg = `규칙: ${mechSummary(p)}
현재 수치: 적 스폰 ${p.enemyRate}/s, 적 속도 ${p.enemySpeed}, 난이도 상승 ${p.ramp}, 목숨 ${p.lives}
분위기 힌트(참고만): ${seedWords.ko}
이 규칙이 실제로 그렇게 느껴지는 제목과 색을 지어라.`;
  const { content, model: used } = await chat(
    [{ role: 'system', content: SYS }, { role: 'user', content: msg }],
    { model, maxTokens: 600, temperature: 1 }
  );
  const j = extractJson(content);
  if (!j?.title) throw new Error('LLM 응답 파싱 실패');
  return { ...j, source: 'llm:' + used };
}

const clamp = (v, a, b, dflt) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : dflt);

function applyTweaks(p, tw) {
  if (!tw) return;
  p.enemyRate = clamp(tw.enemyRate, 0.2, 4, p.enemyRate);
  p.enemySpeed = clamp(tw.enemySpeed, 50, 420, p.enemySpeed);
  p.lives = Math.round(clamp(tw.lives, 1, 5, p.lives));
  p.ramp = clamp(tw.ramp, 0.005, 0.12, p.ramp);
}

// ---------- 빌드 ----------
function buildHtml(cfg) {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>${esc(cfg.title)} — ${esc(cfg.subtitle)}</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:${cfg.palette.bg2};touch-action:none}
canvas{display:block;cursor:crosshair}
</style>
<canvas id="c"></canvas>
<script>const CFG=${JSON.stringify(cfg)};</script>
<script>${RUNTIME}</script>
`;
}

const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const slug = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 30) || 'game';

async function makeGame({ seed = newSeed(), useAi = true, model = DEFAULT_MODEL } = {}) {
  const rnd = makeRng(seed);
  const params = makeParams(rnd);
  let concept = proceduralConcept(rnd, params.enemyMode, []);
  if (useAi) {
    try {
      const c = await llmConcept(params, rnd, model);
      applyTweaks(params, c.tweaks);
      concept = { ...concept, ...c };
    } catch (e) {
      concept.error = e.message;
    }
  }
  const palette = makePalette(rnd, { hue: concept.hue, scheme: concept.scheme, dark: concept.dark });
  const cfg = {
    id: String(hashStr(String(seed))),
    seed: String(seed),
    title: concept.title,
    subtitle: concept.subtitle,
    tagline: concept.tagline,
    howto: howto(params),
    palette,
    params,
  };
  const file = `${slug(concept.title)}-${cfg.id.slice(0, 6)}.html`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), buildHtml(cfg));
  return { file, cfg, source: concept.source, error: concept.error, mech: mechSummary(params) };
}

// ---------- 갤러리 ----------
function updateGallery() {
  const dbPath = path.join(OUT, 'games.json');
  const games = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : [];
  const cards = games.slice().reverse().map((g) => `<a class="card" href="./${encodeURIComponent(g.file)}" style="--bg:${g.bg};--fg:${g.fg};--ac:${g.ac}">
  <div class="sw"><i style="background:${g.player}"></i><i style="background:${g.enemy}"></i><i style="background:${g.pickup}"></i></div>
  <h2>${esc(g.title)}</h2><p class="sub">${esc(g.subtitle)}</p><p class="tag">${esc(g.tagline)}</p>
  <p class="mech">${esc(g.mech)}</p></a>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>게임 공장 — ${games.length}개</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#0b0c10;color:#e8e8ef;font:15px/1.5 system-ui,sans-serif;padding:32px}
h1{font-size:22px;margin:0 0 4px}.count{color:#7c7f93;margin:0 0 28px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{display:block;padding:16px;border-radius:14px;text-decoration:none;background:var(--bg);color:var(--fg);border:1px solid #ffffff14;transition:transform .12s}
.card:hover{transform:translateY(-3px)}
.sw{display:flex;gap:5px;margin-bottom:10px}.sw i{width:16px;height:16px;border-radius:5px}
h2{font-size:19px;margin:0}.sub{margin:2px 0 0;font-size:12px;color:var(--ac);letter-spacing:.04em}
.tag{margin:8px 0 0;font-size:13px;opacity:.8}.mech{margin:8px 0 0;font-size:11px;opacity:.5;line-height:1.4}
</style><h1>게임 공장</h1><p class="count">${games.length}개 생산됨</p><div class="grid">${cards}</div>`);
}

function record(g) {
  const dbPath = path.join(OUT, 'games.json');
  const games = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : [];
  const c = g.cfg;
  games.push({
    file: g.file, seed: c.seed, title: c.title, subtitle: c.subtitle, tagline: c.tagline,
    mech: g.mech, at: new Date().toISOString(), source: g.source,
    bg: c.palette.bg, fg: c.palette.text, ac: c.palette.accent,
    player: c.palette.player, enemy: c.palette.enemy, pickup: c.palette.pickup,
  });
  fs.writeFileSync(dbPath, JSON.stringify(games, null, 1));
  updateGallery();
}

// ---------- 자체 점검 ----------
function selftest() {
  const a = makeParams(makeRng('test-seed'));
  const b = makeParams(makeRng('test-seed'));
  assert(JSON.stringify(a) === JSON.stringify(b), '같은 시드 = 같은 파라미터여야 함');
  assert(JSON.stringify(a) !== JSON.stringify(makeParams(makeRng('other'))), '다른 시드 = 다른 파라미터여야 함');
  for (let i = 0; i < 300; i++) {
    const p = makeParams(makeRng('s' + i));
    assert(p.pickupScore || p.killScore || p.survivalScore, `시드 s${i}: 점수 얻을 방법이 없음`);
    assert(!(p.gravity && p.edge === 'wrap'), `시드 s${i}: 중력+화면순환 조합은 바닥이 사라짐`);
    assert(!(p.enemyMode === 'orbit' && !p.pickupRate), `시드 s${i}: orbit인데 수집품이 없으면 구석에서 무한 생존 가능`);
    assert(p.enemyMax > 0 && p.enemyRate > 0 && p.lives >= 1, `시드 s${i}: 값 범위 오류`);
  }
  const pal = makePalette(makeRng('p'), { hue: 200, scheme: 'triad', dark: true });
  assert(/^#[0-9a-f]{6}$/.test(pal.player), '팔레트는 hex여야 함');
  const tw = { enemyRate: 999, lives: 88, ramp: -5 };
  const p = makeParams(makeRng('x')); applyTweaks(p, tw);
  assert(p.enemyRate <= 4 && p.lives <= 5 && p.ramp >= 0.005, 'LLM tweaks 클램프 실패');
  simTest();
  console.log('셀프테스트 통과 ✓');
}

// 런타임을 가짜 캔버스 위에서 실제로 돌려본다: 스폰 → 충돌 → 사망 → 점수 기록까지.
function simTest() {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop),
    set: (t, k, v) => ((t[k] = v), true),
  });
  const cvs = { getContext: () => ctx, style: {}, width: 0, height: 0 };
  const store = {};
  const localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) };
  let now = 0, pending = null;

  const cfg = {
    id: 'sim', title: 't', subtitle: 's', tagline: 'x', howto: 'x',
    palette: makePalette(makeRng('sim'), {}),
    params: { ...makeParams(makeRng('sim')), enemyMode: 'chase', enemySpeed: 400, enemyRate: 6, enemyMax: 40, lives: 1, survivalScore: 10, timeLimit: 0, gravity: 0, shoot: false, edge: 'wall' },
  };

  const g = globalThis;
  new Function('CFG', 'document', 'addEventListener', 'devicePixelRatio', 'innerWidth', 'innerHeight',
    'performance', 'requestAnimationFrame', 'localStorage', 'AudioContext', 'webkitAudioContext', RUNTIME)(
    cfg, { getElementById: () => cvs }, noop, 1, 960, 600,
    { now: () => now }, (cb) => (pending = cb), localStorage, undefined, undefined
  );

  assert(typeof g.onkeydown === 'function', '런타임이 입력 핸들러를 걸지 않음');
  g.onkeydown({ code: 'KeyD', preventDefault: noop });
  for (let i = 0; i < 60 * 40 && !store['gf:sim:best']; i++) {
    now += 16.7;
    const cb = pending; pending = null;
    if (!cb) break;
    cb(now);
  }
  assert(store['gf:sim:best'], '40초를 돌려도 게임이 끝나지 않음 (적 스폰/충돌/사망 경로 문제)');
  assert(+store['gf:sim:best'] > 0, '점수가 기록되지 않음');
}
const assert = (c, m) => { if (!c) { console.error('✗ ' + m); process.exit(1); } };

// ---------- CLI ----------
// import 로 불러 쓸 때는 CLI가 돌지 않게
if (process.argv[1] && fs.realpathSync(process.argv[1]) !== fileURLToPath(import.meta.url)) {
  // 모듈로 로드됨 — 아래 CLI 블록 건너뜀
} else {
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

if (has('--selftest')) { selftest(); process.exit(0); }

const forever = has('--forever');
const count = forever ? Infinity : parseInt(argv.find((a) => /^\d+$/.test(a)) || '1', 10);
const useAi = !has('--no-ai');
const model = val('--model', DEFAULT_MODEL);
const fixedSeed = val('--seed', null);
const delay = parseFloat(val('--delay', '0')) * 1000;

const aiUp = useAi ? await isUp() : false;
if (useAi && !aiUp) console.log('· omniroute 응답 없음 → 절차적 생성으로만 진행');
else if (useAi) console.log(`· omniroute ${model}`);

let n = 0;
const stop = () => { console.log(`\n총 ${n}개 생산. out/index.html 에서 확인.`); process.exit(0); };
process.on('SIGINT', stop);

while (n < count) {
  const seed = fixedSeed && n === 0 ? fixedSeed : newSeed();
  const g = await makeGame({ seed, useAi: aiUp, model });
  record(g);
  n++;
  console.log(`${String(n).padStart(4)} ${g.cfg.title.padEnd(14)} ${g.file}${g.error ? '  (AI 실패: ' + g.error.slice(0, 40) + ')' : ''}`);
  if (has('--open') && n === 1) execFile('open', [path.join(OUT, g.file)]);
  if (delay) await new Promise((r) => setTimeout(r, delay));
}
stop();
}
