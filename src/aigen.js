// AI가 쓴 게임을 Node에서 실제로 돌려보는 검증기 + 생성/수정 루프.
// 브라우저 툴(out/aimaker.html)과 같은 프롬프트를 쓰되, 여기선 가짜 DOM 위에서 돌린다.
import readline from 'node:readline/promises';
import { SYSTEM_PROMPT, TAG_GROUPS, conflictsIn, randomTags, fillRandom } from './tags.js';
import { chat } from './llm.js';

const C = { dim: '\x1b[2m', b: '\x1b[1m', hi: '\x1b[38;5;111m', ok: '\x1b[38;5;114m', no: '\x1b[38;5;210m', r: '\x1b[0m' };

// 터미널에서 태그를 골라가며 만들기. 브라우저 툴과 같은 태그 체계를 쓴다.
export async function pickTags({ input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, output });
  const picked = [];
  // 입력이 끊기면(EOF·Ctrl+D·파이프 종료) question 이 영영 안 끝난다. 그땐 랜덤으로 넘어간다.
  const ac = new AbortController();
  let ended = false;
  rl.on('close', () => { ended = true; ac.abort(); });
  const ask = async (q) => {
    if (ended) return null;
    try { return await rl.question(q, { signal: ac.signal }); }
    catch { return null; }
  };
  console.log(`\n${C.b}태그 고르기${C.r} ${C.dim}— 번호를 쉼표로 (엔터=건너뛰기, r=이 항목 랜덤, q=전부 랜덤)${C.r}`);
  try {
    for (const g of TAG_GROUPS) {
      const head = `${C.hi}${g.name}${C.r} ${C.dim}${g.req ? '필수' : '선택'} · 최대 ${g.pick}${C.r}`;
      const list = g.tags.map((t, i) => `${C.dim}${String(i + 1).padStart(2)})${C.r} ${t}`);
      console.log(`\n${head}`);
      for (let i = 0; i < list.length; i += 3) console.log('  ' + list.slice(i, i + 3).map((x) => x.padEnd(34)).join(''));

      for (;;) {
        const raw = await ask('> ');
        if (raw === null) {                        // 입력이 끊겼다
          console.log(`${C.dim}입력이 끊겨 나머지는 랜덤으로 채웁니다${C.r}`);
          rl.close();
          return fillRandom(picked);           // 고른 건 두고 빈 그룹만 채운다
        }
        const ans = raw.trim().toLowerCase();
        if (ans === 'q') { rl.close(); return randomTags(); }
        if (ans === 'r') { picked.push(...shuffle(g.tags).slice(0, 1)); break; }
        if (!ans) {
          if (!g.req) break;
          console.log(`${C.no}필수 항목입니다. 하나는 골라주세요.${C.r}`);
          continue;
        }
        const idx = ans.split(/[,\s]+/).map((x) => parseInt(x, 10) - 1).filter((i) => i >= 0 && i < g.tags.length);
        if (!idx.length) { console.log(`${C.no}번호를 다시 입력하세요.${C.r}`); continue; }
        if (idx.length > g.pick) { console.log(`${C.no}최대 ${g.pick}개까지입니다.${C.r}`); continue; }
        const chosen = [...new Set(idx)].map((i) => g.tags[i]);
        const bad = conflictsIn([...picked, ...chosen]);
        if (bad.length) { console.log(`${C.no}서로 안 맞는 조합: ${bad.join(', ')}${C.r}`); continue; }
        picked.push(...chosen);
        break;
      }
    }
  } finally { rl.close(); }
  return picked;
}

const shuffle = (a) => a.slice().sort(() => Math.random() - 0.5);

export function buildMessages(tags, extra = '') {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `태그: ${tags.join(', ')}${extra ? `\n추가 주문: ${extra}` : ''}

위 태그를 전부 반영한 게임을 만들어라. 태그끼리 어울리게 하나의 컨셉으로 엮을 것.`,
    },
  ];
}

export function extractHtml(text) {
  if (!text) return null;
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : text).trim();
  return /<canvas|<!doctype|<html/i.test(body) ? body : null;
}

const scriptsOf = (html) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/\bsrc\s*=/i.test(m[1]))
    .map((m) => m[2]);

// 그려진 것들을 대충 요약해 둔다. 값이 바뀌면 화면이 바뀐 것으로 본다.
function makeCtx(calls) {
  const rec = (name) => (...a) => {
    calls.push(name + ':' + a.map((v) => (typeof v === 'number' ? Math.round(v) : String(v).slice(0, 12))).join(','));
  };
  const base = {
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), arc: rec('arc'),
    fillText: rec('fillText'), strokeText: rec('strokeText'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), drawImage: rec('drawImage'),
    rect: rec('rect'), ellipse: rec('ellipse'), quadraticCurveTo: rec('quadraticCurveTo'),
    bezierCurveTo: rec('bezierCurveTo'), roundRect: rec('roundRect'),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    measureText: () => ({ width: 10 }),
    canvas: null,
  };
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
}

// 소리는 검증 대상이 아니다. 게임이 부르는 API만 조용히 받아준다.
function AudioStub() {
  const node = () => new Proxy({ connect: (x) => x, disconnect() {}, start() {}, stop() {},
    frequency: param(), gain: param(), detune: param(), playbackRate: param(), type: 'sine', buffer: null },
    { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  return new Proxy({
    currentTime: 0, sampleRate: 44100, state: 'running',
    destination: node(), listener: {},
    resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
    createBuffer: () => ({ getChannelData: () => new Float32Array(128), length: 128, duration: 0 }),
    decodeAudioData: () => Promise.resolve({}),
  }, { get: (t, k) => (k in t ? t[k] : () => node()), set: (t, k, v) => ((t[k] = v), true) });
}

function makeDom(calls) {
  const listeners = { keydown: [], keyup: [], mousedown: [], mouseup: [], click: [], pointerdown: [], mousemove: [], touchstart: [], resize: [] };
  const on = (o) => (type, fn) => { if (typeof fn === 'function') (listeners[type] ||= []).push(fn); };
  const ctx = makeCtx(calls);

  const el = () => {
    const e = {
      width: 960, height: 600, style: {}, dataset: {},
      getContext: () => ctx,
      addEventListener: on(), removeEventListener() {},
      appendChild(c) { return c; }, remove() {}, setAttribute() {}, getAttribute: () => null,
      focus() {}, blur() {}, click() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600, right: 960, bottom: 600 }),
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      querySelector: () => el(), querySelectorAll: () => [],
      textContent: '', innerHTML: '', value: '',
    };
    ctx.canvas = e;
    return e;
  };
  const canvas = el();

  const document = {
    getElementById: () => canvas,
    querySelector: () => canvas,
    querySelectorAll: () => [canvas],
    createElement: () => el(),
    createElementNS: () => el(),
    addEventListener: on(), removeEventListener() {},
    body: el(), documentElement: el(), head: el(),
    hidden: false, visibilityState: 'visible',
    fonts: { ready: Promise.resolve(), add() {} },
  };
  return { document, canvas, listeners, ctx };
}

/**
 * AI가 만든 페이지를 가짜 DOM 위에서 돌려본다.
 * 통과하면 null, 실패하면 사람이 읽을 수 있는 실패 사유 문자열.
 */
export function verifyHeadless(html) {
  // 응답이 토큰 한도에서 잘리는 게 가장 흔한 실패다. '스크립트가 없다'가 아니라 잘렸다고 알려줘야 제대로 고친다.
  const opens = (html.match(/<script\b/gi) || []).length;
  const closes = (html.match(/<\/script>/gi) || []).length;
  if (opens > closes) return '응답이 중간에 잘렸다 (script 태그가 닫히지 않음) — 더 짧고 단순한 코드로 다시 만들어라';

  const scripts = scriptsOf(html);
  if (!scripts.length) return '<script>가 없음 (게임 코드가 비어 있다)';
  if (!/<canvas/i.test(html)) return '<canvas> 요소가 없음';
  if (/\b(fetch|XMLHttpRequest|importScripts)\s*\(/.test(html)) return '외부 통신(fetch 등)을 쓰고 있음 — 단일 파일 규칙 위반';
  if (/<script[^>]+\bsrc\s*=/i.test(html)) return '외부 스크립트를 불러오고 있음 — 단일 파일 규칙 위반';

  const calls = [];
  const { document, listeners } = makeDom(calls);
  const store = {};
  let now = 0, queue = [], frames = 0;

  const win = {
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    requestAnimationFrame: (cb) => { queue.push(cb); return queue.length; },
    cancelAnimationFrame() {},
    performance: { now: () => now },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] },
    addEventListener: (type, fn) => { if (typeof fn === 'function') (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    setTimeout: (fn, ms) => { queue.push(() => fn()); return 0; },     // 프레임 루프에 얹어 같이 돌린다
    clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    document, console: { log() {}, warn() {}, error() {} },
    Math, JSON, Date, Object, Array, String, Number, Boolean, isFinite, isNaN, parseInt, parseFloat,
    // 실제 브라우저엔 있는 것들이다. 여기서 던지면 멀쩡한 게임이 '오류'로 잡혀 헛된 수정 요청이 나간다.
    AudioContext: AudioStub, webkitAudioContext: AudioStub,
    Image: function () { return { addEventListener() {}, set src(v) {} }; },
    alert() {}, navigator: { userAgent: 'node', maxTouchPoints: 0 },
  };
  win.window = win; win.self = win; win.globalThis = win; win.top = win; win.parent = win;

  // strict 모드로 돌리면 `onkeydown = fn` 같은 맨몸 전역 대입이 터진다 — 브라우저에선 되는 코드다.
  // 그래서 느슨하게 돌리고, 그렇게 새는 핸들러는 globalThis 에서 주워 쓴다.
  const HANDLERS = ['onkeydown', 'onkeyup', 'onmousedown', 'onmouseup', 'onclick', 'onpointerdown', 'onmousemove', 'ontouchstart'];
  for (const h of HANDLERS) delete globalThis[h];          // 이전 검증이 남긴 것 치우기
  const names = Object.keys(win);
  const run = (code) => new Function(...names, `${code}\n//# sourceURL=aigame.js`)(...names.map((n) => win[n]));

  try { for (const s of scripts) run(s); }
  catch (e) { return `실행 중 예외: ${e.message}`; }

  const step = (n) => {
    for (let i = 0; i < n; i++) {
      now += 16.7;
      const q = queue; queue = [];
      for (const cb of q) { frames++; try { cb(now); } catch (e) { throw new Error(`루프 안에서 예외: ${e.message}`); } }
      if (!q.length) break;
    }
  };
  const fire = (type, ev) => {
    for (const fn of listeners[type] || []) { try { fn(ev); } catch (e) { throw new Error(`${type} 처리 중 예외: ${e.message}`); } }
    const h = win['on' + type] ?? document['on' + type] ?? globalThis['on' + type];
    if (typeof h === 'function') { try { h(ev); } catch (e) { throw new Error(`on${type} 처리 중 예외: ${e.message}`); } }
  };

  // 무엇을 어디에 그렸는지를 거칠게 뭉뚱그린 집합. 화면이 '다른 것'이 됐는지 보려는 것이라
  // 애니메이션으로 조금씩 움직이는 정도로는 안 바뀌어야 한다.
  const shape = (from) => new Set(calls.slice(from).map((c) => {
    const [n, args] = c.split(':');
    return n + ':' + (args || '').split(',').map((v) => (isNaN(+v) ? v : Math.round(+v / 60))).join(',');
  }));
  const similarity = (a, b) => {
    if (!a.size && !b.size) return 1;
    let hit = 0;
    for (const x of a) if (b.has(x)) hit++;
    return hit / Math.max(a.size, b.size);
  };

  try {
    step(90);
    if (frames < 20) return `애니메이션 루프가 돌지 않음 (requestAnimationFrame 호출 ${frames}회)`;
    if (!calls.length) return '로드 직후 캔버스에 아무것도 그리지 않음 (타이틀 화면이 비어 있다)';
    const mark = Math.max(0, calls.length - 600);
    const titleShape = shape(mark);

    const before = calls.length;
    for (const code of ['Space', 'Enter', 'ArrowRight', 'ArrowUp', 'KeyW', 'KeyD']) {
      fire('keydown', { code, key: code === 'Space' ? ' ' : 'x', keyCode: 32, which: 32, preventDefault() {}, stopPropagation() {} });
    }
    const mouse = { clientX: 480, clientY: 300, offsetX: 480, offsetY: 300, button: 0, buttons: 1, preventDefault() {}, stopPropagation() {} };
    for (const type of ['pointerdown', 'mousedown', 'click', 'mousemove', 'touchstart']) fire(type, { ...mouse, touches: [mouse], changedTouches: [mouse] });
    step(150);

    if (calls.length === before) return '입력을 줘도 그리는 내용이 전혀 늘지 않음 (게임이 멈춰 있다)';
    const sim = similarity(titleShape, shape(before));
    if (sim > 0.92) return `입력에도 화면이 그대로 (그리는 내용 ${Math.round(sim * 100)}% 동일 — 게임이 시작되지 않음)`;
  } catch (e) {
    return e.message;
  }
  return null;
}

/** 생성 → 검증 → (실패 시) 오류를 물려 수정. 통과한 HTML을 돌려준다. */
export async function generateGame({ tags, extra = '', model = 'auto/coding', tries = 3, log = () => {} } = {}) {
  const messages = buildMessages(tags, extra);
  const trail = [];
  for (let i = 0; i < tries; i++) {
    log(i === 0 ? `요청 (${model})` : `수정 요청 ${i}/${tries - 1}`);
    const { content: text, model: used } = await chat(messages, { model, maxTokens: 16000, timeout: 300000 });
    const page = extractHtml(text);
    if (!page) {
      trail.push('HTML 코드블록 없음');
      log('✗ HTML 코드블록을 찾지 못함');
      messages.push({ role: 'assistant', content: text.slice(0, 400) },
        { role: 'user', content: '```html 코드블록 하나로만, 파일 전체를 다시 내라.' });
      continue;
    }
    log(`응답 ${(page.length / 1024).toFixed(1)}KB · ${used} · 검증 중`);
    const bad = verifyHeadless(page);
    if (!bad) return { html: page, model: used, attempts: i + 1, trail };
    trail.push(bad);
    log('✗ ' + bad);
    messages.push({ role: 'assistant', content: '```html\n' + page + '\n```' },
      { role: 'user', content: `그 파일을 돌렸더니 이렇게 실패했다:\n\n${bad}\n\n원인을 고쳐 전체 파일을 다시 \`\`\`html 코드블록 하나로 내라. 설명은 쓰지 마라.` });
  }
  return { html: null, attempts: tries, trail };
}
