// 벽돌깨기: 패들로 공을 받아 벽돌을 턴다. 다 부수면 다음 판이 더 빡세게 깔린다.
let paddle, balls, bricks, wave, sticky;

const brickW = () => (W - 80) / P.cols;
const brickH = () => 26;
const BRICK_TOP = 108;   // HUD(점수·판·남은 벽돌) 아래에서 시작해야 글자와 겹치지 않는다

function layout() {
  bricks = [];
  for (let r = 0; r < P.rows; r++) {
    for (let c = 0; c < P.cols; c++) {
      if (P.gaps && rand() < P.gaps) continue;
      const hp = 1 + ((rand() * P.maxHp) | 0);
      bricks.push({ c, r, hp, max: hp });
    }
  }
  if (!bricks.length) bricks.push({ c: 0, r: 0, hp: 1, max: 1 }); // 전부 구멍이면 깰 게 없다
}

function launch() {
  const a = -Math.PI / 2 + rr(-.5, .5), s = P.ballSpeed * (1 + wave * P.waveSpeed);
  balls.push({ x: paddle.x, y: H - 70, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: P.ballR });
}

const GAME = {
  reset() {
    paddle = { x: W / 2, w: P.paddleW };
    balls = []; wave = 0; sticky = true;
    layout(); launch();
  },

  update(dt) {
    // 패들
    const ax = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    if (down) paddle.x += (mx - paddle.x) * Math.min(1, 14 * dt);
    else paddle.x += ax * P.paddleSpeed * dt;
    paddle.w = P.paddleW * Math.max(.45, 1 - wave * .06);   // 판이 오를수록 패들이 좁아진다
    paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));

    if (sticky) {
      balls[0].x = paddle.x; balls[0].y = H - 70;
      if (k('Space') || down) { sticky = false; sfx(520, .1, 'square', .12); }
      return;
    }

    const bw = brickW(), bh = brickH();
    for (const b of balls) {
      b.x += b.vx * dt; b.y += b.vy * dt;

      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); sfx(300, .05, 'square', .08); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); sfx(300, .05, 'square', .08); }
      if (b.y < b.r + 40) { b.y = b.r + 40; b.vy = Math.abs(b.vy); sfx(300, .05, 'square', .08); }

      // 패들
      if (b.vy > 0 && b.y > H - 62 && b.y < H - 42 && Math.abs(b.x - paddle.x) < paddle.w / 2 + b.r) {
        const off = (b.x - paddle.x) / (paddle.w / 2);          // 어디로 받느냐로 각도를 준다
        const sp = Math.hypot(b.vx, b.vy);
        const a = -Math.PI / 2 + off * P.spread;
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        combo = 1;
        sfx(440, .07, 'triangle', .12);
      }
      if (b.y > H + 30) b.dead = 1;

      // 벽돌
      for (const k2 of bricks) {
        if (k2.hp <= 0) continue;
        const bx = 40 + k2.c * bw, by = BRICK_TOP + k2.r * bh;
        if (b.x > bx && b.x < bx + bw && b.y > by && b.y < by + bh) {
          k2.hp--;
          const cx = bx + bw / 2, cy = by + bh / 2;
          // 어느 면으로 들어왔는지로 반사축을 고른다
          if (Math.abs(b.x - cx) / bw > Math.abs(b.y - cy) / bh) b.vx *= -1; else b.vy *= -1;
          if (k2.hp <= 0) {
            addScore(P.brickScore * k2.max);
            combo = Math.min(9, combo + (P.combo ? 1 : 0));
            burst(cx, cy, 10, C.enemy);
            toast(cx, cy, '+' + Math.round(P.brickScore * k2.max * combo), C.accent);
          }
          shake = 4;
          sfx(220 + k2.max * 60, .06, 'sawtooth', .1);
          break;
        }
      }
    }
    balls = balls.filter((b) => !b.dead);

    if (!balls.length) {
      combo = 1; shake = 16;
      burst(paddle.x, H - 50, 20, C.danger, 260);
      hit();
      if (lives > 0) { sticky = true; launch(); }
    }

    if (bricks.every((b) => b.hp <= 0)) {
      wave++;
      addScore(P.waveScore);
      toast(W / 2, H / 2, '판 클리어 +' + P.waveScore, C.pickup);
      sfx(880, .3, 'triangle', .2);
      layout(); balls = []; sticky = true; launch();
    }
    addScore(P.survivalScore * dt);
  },

  hud() {
    return ['판 ' + (wave + 1), '남은 벽돌 ' + bricks.filter((b) => b.hp > 0).length];
  },

  draw() {
    grid(40);
    if (state === 'title') return;
    const bw = brickW(), bh = brickH();
    for (const b of bricks) {
      if (b.hp <= 0) continue;
      const x = 40 + b.c * bw, y = BRICK_TOP + b.r * bh;
      ctx.globalAlpha = .35 + .65 * (b.hp / b.max);
      ctx.fillStyle = b.max > 1 ? C.enemy : C.accent;
      ctx.shadowBlur = 8; ctx.shadowColor = ctx.fillStyle;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (b.max > 1) {
        ctx.fillStyle = C.bg; ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(b.hp, x + bw / 2, y + bh / 2 + 4);
      }
    }
    ctx.fillStyle = C.player; ctx.shadowBlur = 16; ctx.shadowColor = C.player;
    ctx.fillRect(paddle.x - paddle.w / 2, H - 56, paddle.w, 12);
    ctx.shadowBlur = 0;
    for (const b of balls) poly(b.x, b.y, b.r, 8, t * 3, C.pickup, 14);

    if (sticky) {
      ctx.fillStyle = C.dim; ctx.font = '14px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Space / 클릭 으로 발사', W / 2, H - 90);
    }
  },
};
