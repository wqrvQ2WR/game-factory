// 탄막: 판정점은 아주 작고 화면은 탄으로 덮인다. 스치면(그레이즈) 점수가 붙는다.
let me, foes, shots, bul, spawnAcc, fireCd, grazed, focus;

const PATTERNS = ['ring', 'spiral', 'aimed', 'fan'];

function spawnFoe() {
  foes.push({
    x: rr(120, W - 120), y: rr(70, 220),
    vx: rr(-40, 40), r: 22,
    hp: P.foeHp, max: P.foeHp,
    pat: PATTERNS[(rand() * PATTERNS.length) | 0],
    ph: rand() * 6.283, cd: rr(.3, 1.2),
  });
}

function emit(f) {
  const s = P.bulletSpeed * (1 + t * P.ramp);
  const push = (a, sp) => { if (bul.length < P.bulletMax) bul.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: P.bulletR, grazed: false }); };
  if (f.pat === 'ring') {
    for (let i = 0; i < P.ringCount; i++) push(f.ph + i / P.ringCount * 6.283, s);
    f.ph += P.spin;
  } else if (f.pat === 'spiral') {
    for (let i = 0; i < P.arms; i++) push(f.ph + i / P.arms * 6.283, s);
    f.ph += P.spin * 2.4;
  } else if (f.pat === 'aimed') {
    const a = Math.atan2(me.y - f.y, me.x - f.x);
    for (let i = 0; i < 3; i++) push(a + (i - 1) * .16, s * 1.25);
  } else {
    const a = Math.atan2(me.y - f.y, me.x - f.x);
    for (let i = 0; i < P.ringCount; i++) push(a - P.fan / 2 + (i / (P.ringCount - 1 || 1)) * P.fan, s);
  }
  sfx(180, .05, 'square', .05);
}

const GAME = {
  reset() {
    me = { x: W / 2, y: H - 110, r: P.hitR };
    foes = []; shots = []; bul = [];
    spawnAcc = 0; fireCd = 0; grazed = 0; focus = false;
  },

  update(dt) {
    focus = k('ShiftLeft', 'ShiftRight');
    const sp = focus ? P.playerSpeed * P.focusMul : P.playerSpeed;
    let ax = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    let ay = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
    if (!ax && !ay && down) {
      const d = Math.hypot(mx - me.x, my - me.y);
      if (d > 4) { ax = (mx - me.x) / d; ay = (my - me.y) / d; }
    }
    const m = Math.hypot(ax, ay) || 1;
    me.x = Math.max(12, Math.min(W - 12, me.x + ax / m * sp * dt));
    me.y = Math.max(12, Math.min(H - 12, me.y + ay / m * sp * dt));

    // 자동 사격
    fireCd -= dt;
    if (fireCd <= 0) { fireCd = P.fireRate; shots.push({ x: me.x, y: me.y - 10 }); sfx(920, .04, 'square', .05); }
    for (const s of shots) s.y -= P.shotSpeed * dt;
    shots = shots.filter((s) => s.y > -20);

    // 적
    spawnAcc += dt * P.foeRate;
    while (spawnAcc >= 1) { spawnAcc--; if (foes.length < P.foeMax) spawnFoe(); }
    for (const f of foes) {
      f.x += f.vx * dt;
      if (f.x < 90 || f.x > W - 90) f.vx *= -1;
      f.cd -= dt;
      if (f.cd <= 0) { f.cd = P.emitEvery; emit(f); }
      for (const s of shots) {
        if (!s.dead && Math.abs(s.x - f.x) < f.r && Math.abs(s.y - f.y) < f.r) {
          s.dead = 1; f.hp--;
          burst(s.x, s.y, 3, C.accent, 70);
          if (f.hp <= 0) {
            f.dead = 1; addScore(P.foeScore);
            burst(f.x, f.y, 20, C.enemy, 280); shake = 8;
            toast(f.x, f.y, '+' + Math.round(P.foeScore * combo), C.accent);
            combo = Math.min(9, combo + (P.combo ? 1 : 0));
            sfx(150, .2, 'sawtooth', .16);
          }
        }
      }
    }
    shots = shots.filter((s) => !s.dead);
    foes = foes.filter((f) => !f.dead);

    // 탄
    for (const b of bul) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const d = Math.hypot(b.x - me.x, b.y - me.y);
      if (d < b.r + me.r) { b.dead = 1; burst(me.x, me.y, 24, C.danger, 320); combo = 1; hit(); clearNear(); }
      else if (!b.grazed && d < b.r + P.grazeR) {   // 스치기: 가까울수록 벌어지는 점수
        b.grazed = true; grazed++;
        addScore(P.grazeScore);
        if (grazed % 10 === 0) toast(me.x, me.y - 20, '그레이즈 ' + grazed, C.pickup);
        sfx(1200, .03, 'triangle', .04);
      }
    }
    bul = bul.filter((b) => !b.dead && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);
    addScore(P.survivalScore * dt);
  },

  hud() { return ['그레이즈 ' + grazed, '탄 ' + bul.length + (focus ? ' · 집중' : '')]; },

  draw() {
    grid(60);
    if (state === 'title') return;

    for (const f of foes) {
      poly(f.x, f.y, f.r, 6, t * .8, C.enemy, 12);
      if (f.max > 1) {
        ctx.fillStyle = C.dim;
        ctx.fillRect(f.x - 20, f.y - f.r - 9, 40, 3);
        ctx.fillStyle = C.accent;
        ctx.fillRect(f.x - 20, f.y - f.r - 9, 40 * (f.hp / f.max), 3);
      }
    }
    ctx.fillStyle = C.accent;
    for (const s of shots) ctx.fillRect(s.x - 2, s.y - 9, 4, 12);

    for (const b of bul) {
      ctx.fillStyle = b.grazed ? C.pickup : C.danger;
      ctx.shadowBlur = 8; ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // 기체: 바깥은 크게, 판정점은 작게 — 집중하면 판정점이 드러난다
    ctx.globalAlpha = focus ? .5 : .85;
    poly(me.x, me.y, 13, 3, -Math.PI / 2, C.player, 14);
    ctx.globalAlpha = 1;
    ctx.fillStyle = focus ? C.pickup : C.text;
    ctx.beginPath(); ctx.arc(me.x, me.y, me.r, 0, 6.283); ctx.fill();
    if (focus) {
      ctx.strokeStyle = C.pickup; ctx.globalAlpha = .35; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(me.x, me.y, P.grazeR, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },
};

// 맞은 직후 겹쳐 있는 탄에 연달아 죽지 않게 주변을 턴다
function clearNear() {
  for (const b of bul) if (Math.hypot(b.x - me.x, b.y - me.y) < 130) b.dead = 1;
}
