#!/usr/bin/env node
// 게임 공장. 절차적 파라미터로 뼈대를 찍고, omniroute LLM이 컨셉/밸런스를 씌운다.
// 사용:  node factory.js [개수|--forever] [--no-ai] [--family arena] [--seed xxx]
//        [--model auto/fast] [--mp [url]] [--arcade] [--open]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { makeRng, newSeed, hashStr } from './src/rng.js';
import { makePalette } from './src/palette.js';
import { proceduralConcept, THEMES } from './src/naming.js';
import { FAMILIES, FAMILY_KEYS } from './src/families.js';
import { TAG_GROUPS, randomTags, conflictsIn } from './src/tags.js';
import { generateGame, verifyHeadless } from './src/aigen.js';
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

async function makeGame({ seed = newSeed(), useAi = true, model = DEFAULT_MODEL, family, mp = null, arcade = false } = {}) {
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
  FAMILIES[fam].derive?.(params);   // 제작기뿐 아니라 공장 생성물도 같은 보정을 거친다

  // 온라인 대전은 반드시 끝나야 승패가 갈린다 — 무제한이면 제한시간을 붙인다
  if (mp && !params.timeLimit) { params.timeLimit = 60; params.timeUpMsg = '종료'; }

  const palette = makePalette(rnd, { hue: concept.hue, scheme: concept.scheme, dark: concept.dark });
  const cfg = {
    id: String(hashStr(String(seed))), seed: String(seed), family: fam,
    title: concept.title, subtitle: concept.subtitle, tagline: concept.tagline,
    howto: F.howto(params), palette, params,
  };
  if (mp) cfg.mp = { url: mp };
  if (arcade) cfg.arcade = { target: Math.max(50, F.est(params)) };
  const file = `${slug(concept.title)}-${cfg.id.slice(0, 6)}.html`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), buildHtml(cfg));
  const mech = F.mech(params).concat(mp ? [`온라인 1:1 (같은 시드·같은 맵, ${params.timeLimit}초 점수 대결)`] : []).join(', ');
  return { file, cfg, source: concept.source, error: concept.error, mech, famKo: F.ko, tags: tagsOf(params, cfg), target: cfg.arcade?.target };
}

// 진행 방식 계열 장르(하드코어·끝없는·경쟁 …)는 새 엔진이 아니라 파라미터에서 읽어내는 꼬리표다.
function tagsOf(p, cfg) {
  const t = [];
  if (p.lives === 1) t.push('하드코어');
  t.push(p.timeLimit ? `${p.timeLimit}초` : '끝없는');
  if (p.combo) t.push('콤보');
  if (p.rival) t.push('경쟁');
  if (p.shrink) t.push('압박');
  if (p.darkness) t.push('시야제한');
  if (p.wrap) t.push('화면순환');
  if (cfg.mp) t.push('온라인 1:1');
  if (cfg.arcade) t.push('아케이드');
  return t;
}

// ---------- 갤러리 ----------
const dbPath = () => path.join(OUT, 'games.json');
const readDb = () => (fs.existsSync(dbPath()) ? JSON.parse(fs.readFileSync(dbPath(), 'utf8')) : []);

export function updateGallery() {
  const games = readDb();
  const byFam = {};
  for (const g of games) byFam[g.famKo] = (byFam[g.famKo] || 0) + 1;
  const cards = games.slice().reverse().map((g) => `<a class="card" href="./${encodeURIComponent(g.file)}" style="--bg:${g.bg};--fg:${g.fg};--ac:${g.ac}">
  <div class="top"><div class="sw"><i style="background:${g.player}"></i><i style="background:${g.enemy}"></i><i style="background:${g.pickup}"></i></div><span class="fam">${esc(g.famKo || '')}${g.mp ? ' · 온라인' : ''}</span></div>
  <h2>${esc(g.title)}</h2><p class="sub">${esc(g.subtitle)}</p><p class="tag">${esc(g.tagline)}</p>
  <p class="mech">${esc(g.mech)}</p>
  <p class="tags">${(g.tags || []).map((x) => `<i>${esc(x)}</i>`).join('')}</p></a>`).join('\n');
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
.tags{margin:10px 0 0;display:flex;flex-wrap:wrap;gap:4px}
.tags i{font-style:normal;font-size:10px;opacity:.75;border:1px solid currentColor;border-radius:99px;padding:0 7px}
.links{display:flex;gap:10px;margin:0 0 24px}
.links a{display:block;padding:10px 16px;border-radius:11px;background:#171922;border:1px solid #ffffff1a;color:#e8e8ef;text-decoration:none;font-size:13px}
.links a b{display:block;font-size:15px;margin-bottom:2px}
.links a:hover{border-color:#7c8cff}
</style><h1>게임 공장</h1><p class="count">${games.length}개 생산됨 · ${Object.entries(byFam).map(([f, n]) => `${f} ${n}`).join(' · ')}</p>
<div class="links">
${fs.existsSync(path.join(OUT, 'arcade.html')) ? '<a href="./arcade.html"><b>아케이드 ▶</b>매 스테이지 새 게임이 나오는 로그라이트 런</a>' : ''}
${fs.existsSync(path.join(OUT, 'showcase.html')) ? '<a href="./showcase.html"><b>무저갱 ▶</b>손으로 다듬은 단독 출시본</a>' : ''}
${fs.existsSync(path.join(OUT, 'maker.html')) ? '<a href="./maker.html"><b>제작기 ▶</b>직접 굴려서 내 게임 만들기</a>' : ''}
${fs.existsSync(path.join(OUT, 'aimaker.html')) ? '<a href="./aimaker.html"><b>AI 제작기 ▶</b>태그만 고르면 AI가 코드를 직접 씀</a>' : ''}
</div><div class="grid">${cards}</div>`);
}

function record(g) {
  const games = readDb(), c = g.cfg;
  games.push({
    file: g.file, seed: c.seed, family: c.family, famKo: g.famKo, mp: !!c.mp, tags: g.tags,
    title: c.title, subtitle: c.subtitle, tagline: c.tagline,
    mech: g.mech, at: new Date().toISOString(), source: g.source,
    bg: c.palette.bg, fg: c.palette.text, ac: c.palette.accent,
    player: c.palette.player, enemy: c.palette.enemy, pickup: c.palette.pickup,
  });
  fs.writeFileSync(dbPath(), JSON.stringify(games, null, 1));
  updateGallery();
}

// ---------- 쇼케이스: 뽑힌 것 중 하나를 손으로 다듬은 단독 출시본 ----------
// 랜덤이 아니라 고정 수치다. 공장 결과물이 어디까지 갈 수 있는지 보여주는 기준선.
export const SHOWCASE_PARAMS = {
  tunnelSpeed: 1150, focal: 520, zFar: 4200, tunnelR: 200,
  rotSpeed: 3.4, gapWidth: 1.45, ringRate: 0.75, roll: 0.45,
  shoot: true, shotSpeed: 3200, orbRate: 0.55,
  ringScore: 100, orbScore: 60, survivalScore: 4,
  lives: 3, timeLimit: 0, ramp: 0.012, combo: true,
  sfxVol: 0.85, sfxBend: 1.4,
  phaseTime: 22, rushTime: 10,   // 22초마다 구간 상승, 3구간마다 10초 게이트 러시
};

function buildShowcase() {
  const params = { ...SHOWCASE_PARAMS };
  const cfg = {
    id: '77777', seed: 'showcase', family: 'tunnel3d', showcase: true,
    title: '무저갱', subtitle: 'ABYSS RUNNER', tagline: '틈은 늘 마지막 순간에 열린다',
    howto: FAMILIES.tunnel3d.howto(params),
    palette: makePalette(makeRng('showcase-abyss'), { hue: 268, scheme: 'splitComp', dark: true }),
    params,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'showcase.html'), buildHtml(cfg));
  return 'out/showcase.html';
}

// ---------- 제작기 (브라우저에서 직접 만들기) ----------
// 공장 소스(rng·palette·naming·families)를 export만 떼고 그대로 넣는다.
// 그래야 제작기가 공장과 완전히 같은 규칙으로 굴러간다 — 브라우저용으로 다시 짜면 두 벌이 어긋난다.
const stripExports = (code) => code.replace(/^export\s+/gm, '');

function buildMaker() {
  const src = ['src/rng.js', 'src/palette.js', 'src/naming.js', 'src/families.js']
    .map((f) => `// ===== ${f} =====\n` + stripExports(fs.readFileSync(path.join(ROOT, f), 'utf8')))
    .join('\n\n');
  const runtimes = JSON.stringify(Object.fromEntries(FAMILY_KEYS.map((f) => [f, bundle(f)])))
    .replace(/<\//g, '<\\/');   // 문자열 안의 </script> 가 페이지를 끊지 않도록
  const tpl = fs.readFileSync(path.join(ROOT, 'templates', 'maker.html'), 'utf8');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'maker.html'), tpl.replace('__SRC__', src).replace('__RUNTIMES__', runtimes));
  return 'out/maker.html';
}

// ---------- AI 제작기 ----------
// 파라미터 공장과 다른 갈래. 엔진이 없고, 태그 조합을 프롬프트로 넘겨 AI가 게임 코드를 통째로 쓴다.
// 브라우저에서 omniroute를 직접 부르고, 만든 걸 iframe에 띄워 실제로 돌려본 뒤 안 되면 오류를 물려 고치게 한다.
function buildAiMaker(omniroute = 'http://127.0.0.1:20128/v1') {
  const src = stripExports(fs.readFileSync(path.join(ROOT, 'src', 'tags.js'), 'utf8'));
  const tpl = fs.readFileSync(path.join(ROOT, 'templates', 'aimaker.html'), 'utf8');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'aimaker.html'),
    tpl.replace('__TAGS__', src).replace('__OMNIROUTE__', omniroute.replace(/\/$/, '')));
  return 'out/aimaker.html';
}

// ---------- 아케이드 (메타게임) ----------
function writeArcade(games) {
  const tpl = fs.readFileSync(path.join(ROOT, 'templates', 'arcade.html'), 'utf8');
  const list = games.map((g) => ({ file: g.file, title: g.cfg.title, famKo: g.famKo, target: g.target }));
  fs.writeFileSync(path.join(OUT, 'arcade.html'), tpl.replace('__GAMES__', JSON.stringify(list, null, 1)));
  return list.length;
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
  idleBalanceTest();
  makerTest();
  aiMakerTest();
  showcaseTest();
  determinismTest();
  console.log('셀프테스트 통과 ✓ (' + FAMILY_KEYS.join(', ') + ', 결정론)');
}

// 가짜 캔버스 위에서 런타임을 실제로 돌린다.
function runSim(family, params, { frames = 60 * 60, script, id = 'sim', showcase = false, extra = '' } = {}) {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop),
    set: (t, k, v) => ((t[k] = v), true),
  });
  const cvs = { getContext: () => ctx, style: {} };
  const store = {};
  const localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) };
  let now = 0, pending = null;
  const cfg = { id, family, title: 't', subtitle: 's', tagline: 'x', howto: 'x', palette: makePalette(makeRng(id), {}), params, showcase };

  const g = globalThis;
  new Function('CFG', 'document', 'addEventListener', 'devicePixelRatio', 'innerWidth', 'innerHeight',
    'performance', 'requestAnimationFrame', 'localStorage', 'AudioContext', 'webkitAudioContext',
    bundle(family) + `\nglobalThis.__probe = () => ({ state, score, t, lives${extra ? ', ' + extra : ''} });`)(
    cfg, { getElementById: () => cvs }, noop, 1, 960, 600,
    { now: () => now }, (cb) => (pending = cb), localStorage, undefined, undefined
  );
  assert(typeof g.onkeydown === 'function', `${family}: 입력 핸들러가 안 걸림`);

  g.onkeydown({ code: 'KeyD', preventDefault: noop });
  for (let i = 0; i < frames; i++) {
    now += 16.7;
    script(i, g, noop);
    const cb = pending; pending = null;
    if (!cb) break;
    cb(now);
    const p = g.__probe();
    if (!isFinite(p.score)) assert(false, `${family}: ${(i / 60).toFixed(1)}초에 점수가 NaN`);
    if (p.state === 'over') break;
  }
  return { ...g.__probe(), store };
}

const POOL = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Space'];
const mashKeys = (i, g, noop) => {
  if (i % 7) return;
  const c = POOL[(i / 7) % POOL.length | 0];
  g.onkeyup({ code: c }); g.onkeydown({ code: c, preventDefault: noop });
};

// 봇이 아무 키나 두드려도 터지지 않아야 한다.
function simTest(family) {
  const rnd = makeRng('sim-' + family);
  const params = FAMILIES[family].params(rnd);
  if (family === 'arena') Object.assign(params, { enemyMode: 'chase', enemySpeed: 400, enemyRate: 6, enemyMax: 40, lives: 1, survivalScore: 10, timeLimit: 0, gravity: 0, shoot: false, edge: 'wall' });
  const p = runSim(family, params, { script: mashKeys });
  assert(p.t > 1, `${family}: 시뮬이 진행되지 않음`);
  assert(isFinite(p.score) && p.score >= 0, `${family}: 점수 비정상 (${p.score})`);
  if (family === 'arena') assert(p.state === 'over' && +p.store['gf:sim:best'] > 0, 'arena: 사망→점수기록 경로가 끊김');
}

// AI 제작기는 태그 체계를 페이지에 인라인한다. 치환과 충돌 규칙이 살아 있는지 본다.
function aiMakerTest() {
  buildAiMaker('http://127.0.0.1:20128/v1');
  const h = fs.readFileSync(path.join(ROOT, 'out', 'aimaker.html'), 'utf8');
  assert(!h.includes('__TAGS__') && !h.includes('__OMNIROUTE__'), 'AI 제작기: 템플릿 치환이 안 됨');
  for (const sym of ['TAG_GROUPS', 'SYSTEM_PROMPT', 'conflictsIn', 'randomTags'])
    assert(h.includes('const ' + sym) || h.includes('function ' + sym), `AI 제작기: ${sym} 누락`);
  assert(!/^export /m.test(h), 'AI 제작기: export 구문이 남아 브라우저에서 터진다');
  for (let i = 0; i < 200; i++) {
    const t = randomTags();
    assert(t.length >= 2, '랜덤 태그가 너무 적음');
    assert(conflictsIn(t).length === 0, '랜덤 태그가 충돌 조합을 냄: ' + t.join(','));
    for (const g of TAG_GROUPS) {
      const n = g.tags.filter((x) => t.includes(x)).length;
      assert(n <= g.pick, `${g.name} 태그가 최대 ${g.pick}개를 넘음`);
      if (g.req) assert(n >= 1, `${g.name} 은 필수인데 비었음`);
    }
  }
}

// 방치형은 복리라 가격 곡선이 조금만 어긋나도 점수가 10^18까지 터진다(실제로 그랬다).
// 사람이 할 만한 속도로 한 판 끝까지 돌려 점수가 상식적인 범위인지 본다.
function idleBalanceTest() {
  const bot = (i, g, noop) => {
    if (i % 15 === 0) g.onkeydown({ code: 'Space', preventDefault: noop });
    if (i % 15 === 7) g.onkeyup({ code: 'Space' });
    if (i % 120 === 0) for (const d of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) g.onkeydown({ code: d, preventDefault: noop });
    if (i % 120 === 6) for (const d of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) g.onkeyup({ code: d });
  };
  for (const seed of ['bal1', 'bal2', 'bal3']) {
    const p = FAMILIES.idle.params(makeRng(seed));
    FAMILIES.idle.derive(p);
    const r = runSim('idle', p, { script: bot, frames: 60 * (p.timeLimit + 3), id: '4242' });
    assert(r.score > 500, `방치형 ${seed}: ${p.timeLimit}초를 돌려도 ${Math.round(r.score)}점 — 경제가 굴러가지 않는다`);
    assert(r.score < 5e7, `방치형 ${seed}: ${r.score.toExponential(1)}점 — 가격 곡선이 생산량을 못 따라가 복리가 터졌다`);
  }
}

// 제작기는 공장 소스를 통째로 인라인한다 — export 떼고도 문법이 맞고 필요한 심볼이 다 있는지 본다.
function makerTest() {
  const out = buildMaker();
  const html = fs.readFileSync(path.join(ROOT, 'out', 'maker.html'), 'utf8');
  assert(!html.includes('__SRC__') && !html.includes('__RUNTIMES__'), '제작기: 템플릿 치환이 안 됨');
  for (const sym of ['makeRng', 'makePalette', 'proceduralConcept', 'FAMILIES', 'FAMILY_KEYS', 'hashStr'])
    assert(html.includes('function ' + sym) || html.includes('const ' + sym), `제작기: ${sym} 가 인라인되지 않음`);
  assert(!/^export /m.test(html.split('const RUNTIMES')[0]), '제작기: export 구문이 남아 브라우저에서 터진다');
  for (const f of FAMILY_KEYS) assert(html.includes(`"${f}":`), `제작기: ${f} 런타임 누락`);
  assert(out === 'out/maker.html');
}

// 쇼케이스는 구간 상승·게이트 러시·아슬아슬 판정이 더 붙는다 — 그 경로도 실제로 돌려본다.
function showcaseTest() {
  // 아무 키나 두드리는 봇으론 링 틈을 맞출 수 없다. 틈을 조준하는 봇으로 실제 난이도를 잰다.
  const aimGap = (i, g, noop) => {
    const p = g.__probe();
    g.onkeyup({ code: 'KeyA' }); g.onkeyup({ code: 'KeyD' });
    if (!p.rings) return;
    let near = null, bz = 1e9;
    for (const r of p.rings) if (!r.done && r.z < bz) { bz = r.z; near = r; }
    if (!near) return;
    let d = near.gap - p.ang;
    while (d > Math.PI) d -= 6.283;
    while (d < -Math.PI) d += 6.283;
    if (Math.abs(d) > 0.06) g.onkeydown({ code: d > 0 ? 'KeyD' : 'KeyA', preventDefault: noop });
  };
  const p = runSim('tunnel3d', { ...SHOWCASE_PARAMS }, { script: aimGap, frames: 60 * 130, id: '77777', showcase: true, extra: 'ang, rings' });
  assert(p.t > 70, `쇼케이스: 조준하는 봇도 70초를 못 버팀 (t=${p.t.toFixed(1)}) — 구간 상승이 너무 가파르다`);
  assert(p.score > 3000, `쇼케이스: 70초 넘게 버텼는데 점수가 ${Math.round(p.score)} — 채점이 안 붙는다`);
}

// 온라인 대전이 공정하려면: 같은 시드 + 같은 입력 = 완전히 같은 결과.
// 시드 난수(rand)와 고정 타임스텝이 깨지면 여기서 걸린다.
function determinismTest() {
  for (const family of FAMILY_KEYS) {
    const params = FAMILIES[family].params(makeRng('det-' + family));
    const a = runSim(family, params, { script: mashKeys, frames: 60 * 25, id: '777' });
    const b = runSim(family, params, { script: mashKeys, frames: 60 * 25, id: '777' });
    assert(a.score === b.score && a.t === b.t && a.lives === b.lives,
      `${family}: 같은 시드·같은 입력인데 결과가 다름 (${a.score} vs ${b.score}) — 게임플레이에서 Math.random을 쓰고 있지 않은지 확인`);
    // 점수는 장르마다 0일 수 있다(리듬은 막 두드리면 다 놓친다). 대신 시뮬이 실제로 돌았는지는 확인.
    assert(a.t > 1 && a.state === b.state, `${family}: 결정론 테스트가 제대로 안 돌았음`);
  }
}

// ---------- CLI ----------
// 직접 실행할 때만 CLI가 돈다. import 하면(테스트·스윕·node -e) 아무것도 만들지 않는다.
const RAN_DIRECTLY = (() => {
  try { return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (RAN_DIRECTLY) {
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

if (has('--selftest')) { selftest(); process.exit(0); }
if (has('--aimaker')) {
  const url = val('--omniroute', process.env.OMNIROUTE_BASE_URL || 'http://127.0.0.1:20128/v1');
  console.log('AI 제작기: ' + buildAiMaker(url) + `  (omniroute ${url})`);
  console.log('  태그를 고르면 AI가 게임 코드를 직접 쓰고, 자동으로 돌려본 뒤 실패하면 고칩니다.');
  process.exit(0);
}
if (has('--maker')) { console.log('제작기: ' + buildMaker() + ' — 브라우저에서 직접 굴려 만들고 내려받기'); process.exit(0); }
if (has('--showcase')) { console.log('쇼케이스: ' + buildShowcase() + ' — 무저갱 / ABYSS RUNNER (난이도 3종, 구간 진행, 게이트 러시)'); process.exit(0); }

const forever = has('--forever');
const count = forever ? Infinity : parseInt(argv.find((a) => /^\d+$/.test(a)) || (argv.includes('--arcade') ? '12' : '1'), 10);
const useAi = !has('--no-ai');
const model = val('--model', DEFAULT_MODEL);
const fixedSeed = val('--seed', null);
const family = val('--family', null);
const mpIdx = argv.indexOf('--mp');
const mpNext = mpIdx >= 0 ? argv[mpIdx + 1] : null;
const mp = mpIdx < 0 ? null : (mpNext && /^https?:\/\//.test(mpNext) ? mpNext : 'http://localhost:24566');
const arcade = has('--arcade');
const aiMode = has('--ai');
const aiTags = (val('--tags', '') || '').split(',').map((x) => x.trim()).filter(Boolean);
const aiExtra = val('--extra', '');
const delay = parseFloat(val('--delay', '0')) * 1000;
if (family && !FAMILIES[family]) { console.error(`--family 는 ${FAMILY_KEYS.join('|')} 중 하나`); process.exit(1); }

const aiUp = useAi ? await isUp() : false;
if (useAi && !aiUp) console.log('· omniroute 응답 없음 → 절차적 생성으로만 진행');
else if (useAi) console.log(`· omniroute ${model}`);
if (arcade) console.log('· 아케이드 모드 — 다 만들면 out/arcade.html 로 묶는다');
if (mp) console.log(`· 온라인 대전 모드 — 중계 서버 ${mp} (node server/relay.js 로 띄울 것)`);

let n = 0;
const made = [];
const stop = () => {
  if (arcade && made.length) console.log(`\n아케이드: out/arcade.html (${writeArcade(made)}종 수록)`);
  console.log(`\n총 ${n}개 생산. out/index.html 에서 확인.`);
  process.exit(0);
};
process.on('SIGINT', stop);

// AI 모드: 엔진 없이 AI가 게임 코드를 통째로 쓴다. 만든 뒤 실제로 돌려보고 안 되면 오류를 물려 고치게 한다.
while (aiMode && n < count) {
  const tags = aiTags.length ? aiTags : randomTags();
  console.log(`\n[${n + 1}] ${tags.join(' · ')}`);
  const r = await generateGame({ tags, extra: aiExtra, model, log: (m) => console.log('   ' + m) });
  n++;
  if (!r.html) { console.log(`   ✗ ${r.attempts}번 시도 실패 — ${r.trail[r.trail.length - 1]}`); continue; }
  const title = (r.html.match(/<title>([^<]*)<\/title>/i)?.[1] || 'AI 게임').trim();
  const file = `ai-${slug(title)}-${Date.now().toString(36).slice(-5)}.html`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), r.html);
  const games = readDb();
  games.push({
    file, seed: 'ai', family: 'ai', famKo: 'AI 생성', title,
    subtitle: r.model, tagline: '태그만 주고 AI가 코드를 직접 씀',
    mech: tags.join(', '), tags: [`시도 ${r.attempts}회`, ...tags.slice(0, 4)],
    at: new Date().toISOString(), source: 'ai:' + r.model,
    bg: '#12131a', fg: '#e9e9f2', ac: '#7c8cff', player: '#7c8cff', enemy: '#ff7a86', pickup: '#6ee7a5',
  });
  fs.writeFileSync(dbPath(), JSON.stringify(games, null, 1));
  updateGallery();
  console.log(`   ✓ ${title} → out/${file} (시도 ${r.attempts}회)`);
  if (has('--open') && n === 1) execFile('open', [path.join(OUT, file)]);
}
if (aiMode) stop();

while (n < count) {
  const seed = fixedSeed && n === 0 ? fixedSeed : newSeed();
  const g = await makeGame({ seed, useAi: aiUp, model, family, mp, arcade });
  record(g);
  made.push(g);
  n++;
  console.log(`${String(n).padStart(4)} ${g.famKo.padEnd(7)} ${g.cfg.title.padEnd(14)} ${g.file}${g.error ? '  (AI 실패: ' + g.error.slice(0, 40) + ')' : ''}`);
  if (has('--open') && n === 1) execFile('open', [path.join(OUT, g.file)]);
  if (delay) await new Promise((r) => setTimeout(r, delay));
}
stop();
}
