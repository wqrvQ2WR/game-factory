// 파쿠르: 자동 전진 사이드스크롤. 발판·구멍·벽·낮은 천장이 앞으로 계속 생성된다.
const PX = 240; // 화면상 플레이어 x 고정

let camX, py, vy, onGround, coyote, jumpsLeft, sliding, inv, plats, obs, genX, lastY;

const runSpeed = () => P.runSpeed * (1 + t * P.ramp);
const playerH = () => (sliding ? P.bodyH * .5 : P.bodyH);

function generateAhead() {
  while (genX < camX + W * 2) {
    const w = rr(P.platMin, P.platMax);
    const y = Math.max(220, Math.min(H - 70, lastY + rr(-P.stepY, P.stepY)));
    plats.push({ x: genX, w, y });

    // 발판 위 장애물
    if (rand() < P.obsRate && w > 220) {
      const ox = genX + rr(90, w - 90);
      if (rand() < .5) obs.push({ x: ox, y: y - 46, w: 26, h: 46, type: 'block' });
      else obs.push({ x: ox, y: y - P.bodyH - 52, w: 90, h: 52, type: 'ceil' });
    }
    lastY = y;
    genX += w + (rand() < P.gapRate ? rr(P.gapMin, P.gapMax) : 0);
  }
  plats = plats.filter(p => p.x + p.w > camX - 200);
  obs = obs.filter(o => o.x + o.w > camX - 200);
}

const GAME = {
  reset() {
    camX = 0; py = 300; vy = 0; onGround = false; coyote = 0; jumpsLeft = 0;
    sliding = false; inv = 0; plats = []; obs = []; genX = 0; lastY = 420;
    plats.push({ x: -400, w: 1200, y: 420 }); genX = 800; lastY = 420;
    generateAhead();
  },

  update(dt) {
    camX += runSpeed() * dt;
    generateAhead();
    const wx = camX + PX;

    sliding = k('KeyS', 'ArrowDown') && !P.gravity0;
    const wantJump = tapped('Space', 'KeyW', 'ArrowUp') || (down && my < H / 2 && !onGround && jumpsLeft > 0);
    if (wantJump && (onGround || coyote > 0 || jumpsLeft > 0)) {
      if (!onGround && coyote <= 0) jumpsLeft--;
      vy = -P.jump; onGround = false; coyote = 0;
      sfx(440, .12, 'square', .12);
      burst(PX, py + playerH(), 6, C.dim, 120);
    }

    vy += P.gravity * dt;
    if (vy < 0 && !k('Space', 'KeyW', 'ArrowUp') && !down) vy += P.gravity * .9 * dt; // 짧게 누르면 낮게
    py += vy * dt;

    // 착지 판정
    const wasAir = !onGround;
    onGround = false;
    for (const p of plats) {
      if (wx < p.x || wx > p.x + p.w) continue;
      if (vy >= 0 && py + playerH() >= p.y && py + playerH() - vy * dt <= p.y + 4) {
        py = p.y - playerH(); vy = 0; onGround = true;
        if (wasAir) burst(PX, p.y, 5, C.dim, 100);
      }
    }
    coyote = onGround ? P.coyote : coyote - dt;
    if (onGround) jumpsLeft = P.doubleJump ? 1 : 0;

    // 장애물
    inv -= dt;
    for (const o of obs) {
      if (o.dead || inv > 0) continue;
      const top = py, bot = py + playerH();
      if (wx + P.bodyW / 2 > o.x && wx - P.bodyW / 2 < o.x + o.w && bot > o.y && top < o.y + o.h) {
        o.dead = 1; inv = 1; burst(PX, py + playerH() / 2, 16, C.danger, 260);
        camX -= P.crashBack; hit();
      }
    }
    obs = obs.filter(o => !o.dead);

    if (py > H + 120) { // 낙사
      const p = plats.find(p => p.x > camX + PX) || plats[plats.length - 1];
      camX = Math.max(0, p.x - PX + 60); py = p.y - playerH() - 40; vy = 0; inv = 1;
      combo = 1; hit();
    }

    addScore(runSpeed() * dt * P.scoreRate);
  },

  hud() { return [Math.round(camX / 10) + ' m']; },

  draw() {
    // 시차 배경
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = 60 + i * 66, off = (camX * (.15 + i * .04)) % 120;
      ctx.beginPath(); ctx.moveTo(-off, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (const p of plats) {
      const sx = p.x - camX;
      if (sx > W || sx + p.w < 0) continue;
      ctx.fillStyle = C.dim; ctx.fillRect(sx, p.y, p.w, 10);
      ctx.globalAlpha = .25; ctx.fillRect(sx, p.y + 10, p.w, H - p.y); ctx.globalAlpha = 1;
    }
    for (const o of obs) {
      const sx = o.x - camX;
      if (sx > W || sx + o.w < 0) continue;
      ctx.fillStyle = o.type === 'ceil' ? C.enemy : C.danger;
      ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
      ctx.fillRect(sx, o.y, o.w, o.h);
      ctx.shadowBlur = 0;
    }
    if (inv <= 0 || (t * 12 | 0) % 2) {
      ctx.fillStyle = C.player; ctx.shadowBlur = 16; ctx.shadowColor = C.player;
      ctx.fillRect(PX - P.bodyW / 2, py, P.bodyW, playerH());
      ctx.shadowBlur = 0;
    }
  },
};
