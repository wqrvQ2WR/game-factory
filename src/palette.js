// 게임마다 다른 색 팔레트를 절차적으로 생성한다.
// HSL로 조화 규칙을 만든 다음 hex로 굳혀서 런타임에 넘긴다.

const HARMONIES = {
  analogous: [0, 28, -28, 56],
  complementary: [0, 180, 20, 200],
  triad: [0, 120, 240, 60],
  splitComp: [0, 150, 210, 30],
  monochrome: [0, 8, -8, 16],
};

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c);
  };
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

export function makePalette(rnd, hint) {
  const scheme = hint?.scheme && HARMONIES[hint.scheme] ? hint.scheme : rnd.pick(Object.keys(HARMONIES));
  const base = hint?.hue != null ? hint.hue : rnd.range(0, 359);
  const offs = HARMONIES[scheme];
  const dark = !hint || hint.dark !== false;

  const sat = rnd.range(55, 95);
  const bgL = dark ? rnd.range(6, 13) : rnd.range(88, 95);
  const bg = hsl(base + rnd.range(-10, 10), Math.min(sat, 30), bgL);
  const bg2 = hsl(base + rnd.range(-20, 20), Math.min(sat, 40), dark ? bgL + 6 : bgL - 8);

  const p = {
    scheme,
    bg,
    bg2,
    grid: hsl(base, 30, dark ? bgL + 9 : bgL - 12),
    player: hsl(base + offs[0], sat, dark ? 62 : 45),
    enemy: hsl(base + offs[1], sat, dark ? 58 : 45),
    pickup: hsl(base + offs[2], Math.min(100, sat + 10), dark ? 66 : 48),
    accent: hsl(base + offs[3], Math.min(100, sat + 5), dark ? 70 : 42),
    text: dark ? hsl(base, 18, 92) : hsl(base, 30, 12),
    dim: dark ? hsl(base, 14, 55) : hsl(base, 16, 40),
    danger: hsl(rnd.chance(0.5) ? 355 : 12, 85, dark ? 62 : 48),
    dark,
  };
  return p;
}
