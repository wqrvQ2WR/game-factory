#!/usr/bin/env node
// 게임 공장. 절차적 파라미터로 뼈대를 찍고, omniroute LLM이 컨셉/밸런스를 씌운다.
// 사용:  node factory.js [개수|--forever] [--no-ai] [--family arena] [--seed xxx] [--model auto/fast] [--open]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { makeRng, newSeed, hashStr } from './src/rng.js';
import { makePalette } from './src/palette.js';
import { proceduralConcept, THEMES } from './src/naming.js';
import { FAMILIES, FAMILY_KEYS } from './src/families.js';
import { chat, extractJson, isUp, DEFAULT_MODEL } from './src/llm.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const rt = (n) => fs.readFileSync(path.join(ROOT, 'runtimes', n + '.js'), 'utf8');
const SHELL = rt('shell');
const RUNTIME = Object.fromEntries(FAMILY_KEYS.map((f) => [f, rt(f)]));

export const bundle = (family) => `${SHELL}\n${RUNTIME[family]}\nboot();`;
export function makeParams(rnd, family) { return FAMILIES[family].params(rnd); }

// ---------- LLM 컨셉 ----------
// 파생값을 깨뜨리는 노브(runSpeed·maxSpeed 등)는 일부러 뺐다. 여기 있는 것만 LLM이 만질 수 있다.
const TWEAK_RANGE = {
  lives: [1, 9], ramp: [0.005, 0.12],
  enemyRate: [0.2, 4], enemySpeed: [50, 420],
  density: [0.15, 0.9], bpm: [70, 200],
  opponents: [0, 20],
  gapWidth: [0.6, 2.4], ringRate: [0.3, 2],
};

const SYS = `너는 아케이드 게임 기획자다. 주어진 기계적 규칙에 딱 맞는 게임 컨셉을 짓는다.
JSON만 출력하고 다른 말은 하지 마라. 스키마:
{"title":"한국어 제목 2~8자, 흔하지 않게","subtitle":"영문 부제 2~4단어","tagline":"한국어 한 줄 카피, 20자 내외","hue":0-359 정수,"scheme":"analogous|complementary|triad|splitComp|monochrome","dark":true/false,"tweaks":{}}
tweaks는 컨셉에 맞게 난이도를 조정하는 선택 항목이다. 생략해도 된다.`;

async function llmConcept(p, family, rnd, model) {
  const knobs = Object.keys(TWEAK_RANGE).filter((k) => k in p);
  const msg = `장르: ${FAMILIES[family].ko}
규칙: ${FAMILIES[family].mech(p).join(', ')}, 목숨 ${p.lives}
조정 가능한 tweaks 키: ${knobs.map((k) => `${k}(현재 ${p[k]}, ${TWEAK_RANGE[k][0]}~${TWEAK_RANGE[k][1]})`).join(', ')}
분위기 힌트(참고만): ${rnd.pick(THEMES).ko}
이 장르와 규칙이 실제로 그렇게 느껴지는 제목과 색을 지어라.`;
  const { content, model: used } = await chat(
    [{ role: 'system', content: SYS }, { role: 'user', content: msg }],
    { model, maxTokens: 600, temperature: 1 }
  );
  const j = extractJson(content);
  if (!j?.title) throw new Error('LLM 응답 파싱 실패');
  return { ...j, source: 'llm:' + used };
}

export function applyTweaks(p, tw) {
  if (!tw || typeof tw !== 'object') return;
  for (const [key, [lo, hi]] of Object.entries(TWEAK_RANGE)) {
    if (!(key in p)) continue;                       // 이 장르에 없는 키는 무시
    const v = tw[key];
    if (typeof v !== 'number' || !isFinite(v)) continue;
    const clamped = Math.max(lo, Math.min(hi, v));
    p[key] = Number.isInteger(p[key]) ? Math.round(clamped) : clamped;
  }
}

// ---------- 빌드 ----------
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const slug = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 30) || 'game';

const buildHtml = (cfg) => `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>${esc(cfg.title)} — ${esc(cfg.subtitle)}</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:${cfg.palette.bg2};touch-action:none}
canvas{display:block;cursor:crosshair}
</style>
<canvas id="c"></canvas>
<script>const CFG=${JSON.stringify(cfg)};</script>
<script>${bundle(cfg.family)}</script>
`;

async function makeGame({ seed = newSeed(), useAi = true, model = DEFAULT_MODEL, family } = {}) {
  const rnd = makeRng(seed);
  const fam = family || rnd.pick(FAMILY_KEYS);
  const F = FAMILIES[fam];
  const params = F.params(rnd);
  let concept = proceduralConcept(rnd, fam, []);
  if (useAi) {
    try {
      const c = await llmConcept(params, fam, rnd, model);
      applyTweaks(params, c.tweaks);
      concept = { ...concept, ...c };
    } catch (e) {
      concept.error = e.message;
    }
  }
  const palette = makePalette(rnd, { hue: concept.hue, scheme: concept.scheme, dark: concept.dark });
  const cfg = {
    id: String(hashStr(String(seed))), seed: String(seed), family: fam,
    title: concept.title, subtitle: concept.subtitle, tagline: concept.tagline,
    howto: F.howto(params), palette, params,
  };
  const file = `${slug(concept.title)}-${cfg.id.slice(0, 6)}.html`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), buildHtml(cfg));
  return { file, cfg, source: concept.source, error: concept.error, mech: F.mech(params).join(', '), famKo: F.ko };
}

// ---------- 갤러리 ----------
const dbPath = () => path.join(OUT, 'games.json');
const readDb = () => (fs.existsSync(dbPath()) ? JSON.parse(fs.readFileSync(dbPath(), 'utf8')) : []);

function updateGallery() {
  const games = readDb();
  const byFam = {};
  for (const g of games) byFam[g.famKo] = (byFam[g.famKo] || 0) + 1;
  const cards = games.slice().reverse().map((g) => `<a class="card" href="./${encodeURIComponent(g.file)}" style="--bg:${g.bg};--fg:${g.fg};--ac:${g.ac}">
  <div class="top"><div class="sw"><i style="background:${g.player}"></i><i style="background:${g.enemy}"></i><i style="background:${g.pickup}"></i></div><span class="fam">${esc(g.famKo || '')}</span></div>
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
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.sw{display:flex;gap:5px}.sw i{width:16px;height:16px;border-radius:5px}
.fam{font-size:11px;opacity:.6;border:1px solid currentColor;border-radius:99px;padding:1px 8px}
h2{font-size:19px;margin:0}.sub{margin:2px 0 0;font-size:12px;color:var(--ac);letter-spacing:.04em}
.tag{margin:8px 0 0;font-size:13px;opacity:.8}.mech{margin:8px 0 0;font-size:11px;opacity:.5;line-height:1.4}
</style><h1>게임 공장</h1><p class="count">${games.length}개 생산됨 · ${Object.entries(byFam).map(([f, n]) => `${f} ${n}`).join(' · ')}</p><div class="grid">${cards}</div>`);
}

function record(g) {
  const games = readDb(), c = g.cfg;
  games.push({
    file: g.file, seed: c.seed, family: c.family, famKo: g.famKo,
    title: c.title, subtitle: c.subtitle, tagline: c.tagline,
    mech: g.mech, at: new Date().toISOString(), source: g.source,
    bg: c.palette.bg, fg: c.palette.text, ac: c.palette.accent,
    player: c.palette.player, enemy: c.palette.enemy, pickup: c.palette.pickup,
  });
  fs.writeFileSync(dbPath(), JSON.stringify(games, null, 1));
  updateGallery();
}

// ---------- 자체 점검 ----------
const assert = (c, m) => { if (!c) { console.error('✗ ' + m); process.exit(1); } };

function selftest() {
  for (const fam of FAMILY_KEYS) {
    const a = FAMILIES[fam].params(makeRng('t')), b = FAMILIES[fam].params(makeRng('t'));
    assert(JSON.stringify(a) === JSON.stringify(b), `${fam}: 같은 시드 = 같은 파라미터여야 함`);
    assert(JSON.stringify(a) !== JSON.stringify(FAMILIES[fam].params(makeRng('u'))), `${fam}: 다른 시드 = 다른 파라미터여야 함`);
    assert(a.lives >= 1 && FAMILIES[fam].howto(a) && FAMILIES[fam].mech(a).length, `${fam}: 필수 필드 누락`);
  }

  for (let i = 0; i < 200; i++) {
    const A = FAMILIES.arena.params(makeRng('a' + i));
    assert(A.pickupScore || A.killScore || A.survivalScore, `arena a${i}: 점수 얻을 방법이 없음`);
    assert(!(A.gravity && A.edge === 'wrap'), `arena a${i}: 중력+화면순환은 바닥이 사라짐`);
    assert(!(A.enemyMode === 'orbit' && !A.pickupRate), `arena a${i}: orbit인데 수집품이 없으면 구석에서 무한 생존`);
    assert(!(A.rival && !A.pickupRate), `arena a${i}: 라이벌은 있는데 뺏을 수집품이 없음`);

    const K = FAMILIES.parkour.params(makeRng('k' + i));
    const reach = K.runSpeed * (2 * K.jump / K.gravity), rise = K.jump * K.jump / (2 * K.gravity);
    assert(K.gapMax < reach * 0.8, `parkour k${i}: 구멍(${K.gapMax})이 점프 도달거리(${reach | 0})보다 넓음`);
    assert(K.stepY <= rise * 0.75, `parkour k${i}: 단차(${K.stepY})가 점프 높이(${rise | 0})보다 높음`);

    const R = FAMILIES.rhythm.params(makeRng('r' + i));
    assert(R.goodWindow > R.perfectWindow, `rhythm r${i}: GOOD 판정이 PERFECT보다 좁음`);
  }

  // LLM tweaks는 범위 밖 값도, 다른 장르 키도 통과시키면 안 된다
  const rp = FAMILIES.rhythm.params(makeRng('x'));
  const before = rp.bpm;
  applyTweaks(rp, { lives: 999, bpm: -5, enemyRate: 3, nope: 1 });
  assert(rp.lives === 9 && rp.bpm === 70 && !('enemyRate' in rp), 'tweaks 클램프/필터 실패');
  assert(before !== undefined, 'bpm 파라미터 사라짐');

  for (const fam of FAMILY_KEYS) simTest(fam);
  console.log('셀프테스트 통과 ✓ (' + FAMILY_KEYS.join(', ') + ')');
}

// 가짜 캔버스 위에서 런타임을 실제로 돌린다. 봇이 아무 키나 두드려도 터지지 않아야 한다.
function simTest(family) {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop),
    set: (t, k, v) => ((t[k] = v), true),
  });
  const cvs = { getContext: () => ctx, style: {} };
  const store = {};
  const localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) };
  let now = 0, pending = null;

  const rnd = makeRng('sim-' + family);
  const params = FAMILIES[family].params(rnd);
  if (family === 'arena') Object.assign(params, { enemyMode: 'chase', enemySpeed: 400, enemyRate: 6, enemyMax: 40, lives: 1, survivalScore: 10, timeLimit: 0, gravity: 0, shoot: false, edge: 'wall' });
  const cfg = { id: 'sim', family, title: 't', subtitle: 's', tagline: 'x', howto: 'x', palette: makePalette(rnd, {}), params };

  const g = globalThis;
  new Function('CFG', 'document', 'addEventListener', 'devicePixelRatio', 'innerWidth', 'innerHeight',
    'performance', 'requestAnimationFrame', 'localStorage', 'AudioContext', 'webkitAudioContext',
    bundle(family) + '\nglobalThis.__probe = () => ({ state, score, t, lives });')(
    cfg, { getElementById: () => cvs }, noop, 1, 960, 600,
    { now: () => now }, (cb) => (pending = cb), localStorage, undefined, undefined
  );

  assert(typeof g.onkeydown === 'function', `${family}: 입력 핸들러가 안 걸림`);
  const POOL = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Space'];
  g.onkeydown({ code: 'KeyD', preventDefault: noop });
  for (let i = 0; i < 60 * 60; i++) {
    now += 16.7;
    if (i % 7 === 0) {
      const c = POOL[(i / 7) % POOL.length | 0];
      g.onkeyup({ code: c }); g.onkeydown({ code: c, preventDefault: noop });
    }
    const cb = pending; pending = null;
    if (!cb) break;
    cb(now);
    const p = g.__probe();
    if (!isFinite(p.score)) assert(false, `${family}: ${(i / 60).toFixed(1)}초에 점수가 NaN`);
    if (p.state === 'over') break;
  }
  const p = g.__probe();
  assert(p.t > 1, `${family}: 시뮬이 진행되지 않음`);
  assert(isFinite(p.score) && p.score >= 0, `${family}: 점수 비정상 (${p.score})`);
  if (family === 'arena') assert(p.state === 'over' && +store['gf:sim:best'] > 0, 'arena: 사망→점수기록 경로가 끊김');
}

// ---------- CLI ----------
if (process.argv[1] && fs.realpathSync(process.argv[1]) !== fileURLToPath(import.meta.url)) {
  // 모듈로 로드됨 — CLI 건너뜀
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
const family = val('--family', null);
const delay = parseFloat(val('--delay', '0')) * 1000;
if (family && !FAMILIES[family]) { console.error(`--family 는 ${FAMILY_KEYS.join('|')} 중 하나`); process.exit(1); }

const aiUp = useAi ? await isUp() : false;
if (useAi && !aiUp) console.log('· omniroute 응답 없음 → 절차적 생성으로만 진행');
else if (useAi) console.log(`· omniroute ${model}`);

let n = 0;
const stop = () => { console.log(`\n총 ${n}개 생산. out/index.html 에서 확인.`); process.exit(0); };
process.on('SIGINT', stop);

while (n < count) {
  const seed = fixedSeed && n === 0 ? fixedSeed : newSeed();
  const g = await makeGame({ seed, useAi: aiUp, model, family });
  record(g);
  n++;
  console.log(`${String(n).padStart(4)} ${g.famKo.padEnd(7)} ${g.cfg.title.padEnd(14)} ${g.file}${g.error ? '  (AI 실패: ' + g.error.slice(0, 40) + ')' : ''}`);
  if (has('--open') && n === 1) execFile('open', [path.join(OUT, g.file)]);
  if (delay) await new Promise((r) => setTimeout(r, delay));
}
stop();
}
