// 방치형: 눌러서 모으고, 모은 걸로 생산기를 사고, 생산기가 대신 모은다.
// 반사신경이 아니라 '언제 재투자할지'가 게임이다. 목숨 개념이 없어 제한시간으로 끝난다.
const GEN_NAMES = ['수집기', '정제로', '증폭탑'];
let bank, gens, clickLv, pulse, lastBuy;

// 가격은 그 단계의 '생산량'을 따라가야 한다.
// 예전엔 단계 가격이 costMul^2.2(≈1.7배)만 오르는데 생산량은 rateMul(≈7배)씩 뛰어서
// 상위 단계가 압도적으로 싸졌고, 복리가 터져 점수가 10^18까지 갔다.
const genCost = (i) => Math.round(P.cost0 * Math.pow(P.rateMul, i * 1.25) * Math.pow(P.costMul, gens[i]));
const clickCost = () => Math.round(P.clickCost0 * Math.pow(P.clickStep * 1.18, clickLv));
const clickGain = () => P.clickBase * Math.pow(P.clickStep, clickLv);
const genRate = (i) => gens[i] * P.rate0 * Math.pow(P.rateMul, i);
const income = () => gens.reduce((s, _, i) => s + genRate(i), 0);

const GAME = {
  reset() {
    bank = 0; gens = [0, 0, 0]; clickLv = 0; pulse = 0; lastBuy = '';
  },

  update(dt) {
    const inc = income() * dt;
    bank += inc; addScore(inc);

    if (tapped('Space') || (down && !GAME._held)) {
      GAME._held = true;
      const g = clickGain();
      bank += g; addScore(g); pulse = 1;
      toast(W / 2 + rr(-60, 60), H - 110, '+' + fmtN(g), C.pickup);
      sfx(600 + clickLv * 40, .06, 'triangle', .12);
    }
    if (!down) GAME._held = false;

    for (let i = 0; i < 3; i++) {
      if (tapped('Digit' + (i + 1))) buyGen(i);
    }
    if (tapped('Digit4')) buyClick();

    pulse = Math.max(0, pulse - dt * 4);
  },

  hud() { return ['초당 ' + fmtN(income()), '보유 ' + fmtN(bank)]; },

  draw() {
    grid(60);
    if (state === 'title') return;

    ctx.textAlign = 'center';
    ctx.fillStyle = C.text; ctx.font = 'bold 44px system-ui,sans-serif';
    ctx.fillText(fmtN(bank), W / 2, 150);
    ctx.fillStyle = C.dim; ctx.font = '15px system-ui,sans-serif';
    ctx.fillText('초당 ' + fmtN(income()), W / 2, 178);

    // 채집 버튼 — 구매 목록(맨 아래 줄이 y≈430)보다 아래에 둬야 겹치지 않는다
    const r = 46 + pulse * 7;
    poly(W / 2, H - 94, r, 6, t * .5, C.player, 20 + pulse * 20);
    ctx.fillStyle = C.bg; ctx.font = 'bold 16px system-ui,sans-serif';
    ctx.fillText('채집', W / 2, H - 88);
    ctx.fillStyle = C.dim; ctx.font = '13px system-ui,sans-serif';
    ctx.fillText('Space / 클릭  ·  +' + fmtN(clickGain()), W / 2, H - 30);

    // 구매 목록
    const rows = [
      ...GEN_NAMES.map((n, i) => ({ key: i + 1, n, own: gens[i], cost: genCost(i), sub: '초당 +' + fmtN(P.rate0 * Math.pow(P.rateMul, i)) })),
      { key: 4, n: '채집 강화', own: clickLv, cost: clickCost(), sub: '채집량 x' + P.clickStep },
    ];
    ctx.textAlign = 'left';
    rows.forEach((row, i) => {
      const y = 210 + i * 56, x = W / 2 - 250, w = 500, afford = bank >= row.cost;
      ctx.globalAlpha = afford ? 1 : .4;
      ctx.fillStyle = C.grid; ctx.fillRect(x, y, w, 48);
      ctx.fillStyle = afford ? C.accent : C.dim;
      ctx.fillRect(x, y, 4, 48);
      ctx.fillStyle = C.text; ctx.font = 'bold 16px system-ui,sans-serif';
      ctx.fillText(`${row.key}. ${row.n}`, x + 18, y + 24);
      ctx.fillStyle = C.dim; ctx.font = '12px system-ui,sans-serif';
      ctx.fillText(row.sub + '   ·   보유 ' + row.own, x + 18, y + 40);
      ctx.textAlign = 'right';
      ctx.fillStyle = afford ? C.pickup : C.dim; ctx.font = 'bold 15px system-ui,sans-serif';
      ctx.fillText(fmtN(row.cost), x + w - 18, y + 30);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    });

    if (lastBuy) {
      ctx.textAlign = 'center'; ctx.fillStyle = C.accent; ctx.font = '13px system-ui,sans-serif';
      ctx.fillText(lastBuy, W / 2, 196);
    }
  },
};

function buyGen(i) {
  const c = genCost(i);
  if (bank < c) { sfx(140, .1, 'square', .1); return; }
  bank -= c; gens[i]++;
  lastBuy = `${GEN_NAMES[i]} ${gens[i]}대`;
  burst(W / 2, 234 + i * 56, 12, C.accent, 180);
  sfx(760 + i * 90, .12, 'triangle', .14);
}

function buyClick() {
  const c = clickCost();
  if (bank < c) { sfx(140, .1, 'square', .1); return; }
  bank -= c; clickLv++;
  lastBuy = `채집 강화 Lv.${clickLv}`;
  burst(W / 2, H - 94, 16, C.pickup, 220);
  sfx(1000, .14, 'triangle', .14);
}

function fmtN(v) {
  if (v < 1000) return v < 10 ? v.toFixed(1) : Math.round(v).toString();
  const U = ['K', 'M', 'B', 'T', 'aa', 'ab'];
  let i = -1;
  while (v >= 1000 && i < U.length - 1) { v /= 1000; i++; }
  return v.toFixed(v < 10 ? 2 : 1) + U[i];
}
