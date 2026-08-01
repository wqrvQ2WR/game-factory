// 시드 기반 결정론적 난수. 같은 시드 = 같은 게임.
export function makeRng(seed) {
  let s = typeof seed === 'string' ? hashStr(seed) : (seed >>> 0) || 1;
  const next = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.float = (a = 1, b) => (b === undefined ? next() * a : a + next() * (b - a));
  next.range = (a, b) => Math.floor(a + next() * (b - a + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.pickN = (arr, n) => shuffle(arr.slice(), next).slice(0, n);
  next.chance = (p) => next() < p;
  next.sign = () => (next() < 0.5 ? -1 : 1);
  next.seed = seed;
  return next;
}

export function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 사람이 읽고 다시 입력할 수 있는 시드 문자열
const SYL = ['ka', 'zo', 'mi', 'ru', 'ne', 'va', 'to', 'shi', 'lu', 'ba', 'gen', 'dra', 'xi', 'po', 'ta', 'qu'];
export function newSeed() {
  let s = '';
  for (let i = 0; i < 3; i++) s += SYL[Math.floor(Math.random() * SYL.length)];
  return s + '-' + Math.floor(Math.random() * 9000 + 1000);
}
