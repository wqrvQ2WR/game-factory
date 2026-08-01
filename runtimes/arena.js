// 아레나: 탑다운 회피/수집/슈팅. 적 행동 4종 × 중력 × 발사 × 경계 규칙.
let player, enemies, bullets, pickups, spawnAcc, pickAcc, fireCd, comboT, rival, rivalScore;

const arena = () => {
  const inset = P.shrink ? Math.min(180, t * P.shrink) : 0;
  return { x: inset, y: inset, w: W - inset * 2, h: H - inset * 2 };
};
const ramp = () => 1 + t * P.ramp;

const GAME = {
  reset() {
    player = { x: W / 2, y: P.gravity ? H - 90 : H / 2, vx: 0, vy: 0, r: P.playerSize, inv: 1.2, aim: -Math.PI / 2, onGround: false };
    enemies = []; bullets = []; pickups = [];
    spawnAcc = 0; pickAcc = 0; fireCd = 0; comboT = 0;
    rival = P.rival ? { x: W / 2, y: 120, r: P.playerSize } : null;
    rivalScore = 0;
  },

  update(dt) {
    const a = arena();

    let ax = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    let ay = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
    if (!ax && !ay && down) {
      const d = Math.hypot(mx - player.x, my - player.y);
      if (d > 6) { ax = (mx - player.x) / d; ay = (my - player.y) / d; }
    }
    const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m;

    if (P.gravity) {
      player.vx += ax * P.speed * 8 * dt;
      player.vy += P.gravity * dt;
      if ((k('Space', 'KeyW', 'ArrowUp') || (down && my < player.y)) && player.onGround) { player.vy = -P.jump; sfx(420, .12, 'square'); }
      player.vx *= Math.pow(P.friction, dt * 60);
    } else {
      player.vx += (ax * P.speed - player.vx) * Math.min(1, P.accel * dt);
      player.vy += (ay * P.speed - player.vy) * Math.min(1, P.accel * dt);
    }
    player.x += player.vx * dt; player.y += player.vy * dt;
    if (ax || ay) player.aim = Math.atan2(ay, ax);
    player.inv -= dt;
    player.onGround = false;

    if (P.edge === 'wrap') {
      if (player.x < a.x) player.x = a.x + a.w; if (player.x > a.x + a.w) player.x = a.x;
      if (player.y < a.y) player.y = a.y + a.h; if (player.y > a.y + a.h) player.y = a.y;
    } else {
      const b = P.edge === 'bounce' ? -0.7 : 0;
      if (player.x < a.x + player.r) { player.x = a.x + player.r; player.vx *= b; }
      if (player.x > a.x + a.w - player.r) { player.x = a.x + a.w - player.r; player.vx *= b; }
      if (player.y < a.y + player.r) { player.y = a.y + player.r; player.vy *= b; }
      if (player.y > a.y + a.h - player.r) { player.y = a.y + a.h - player.r; player.vy *= b; player.onGround = true; }
    }

    fireCd -= dt;
    if (P.shoot && fireCd <= 0 && (k('Space') || down)) {
      fireCd = P.fireRate;
      const d = down ? Math.atan2(my - player.y, mx - player.x) : player.aim;
      bullets.push({ x: player.x, y: player.y, vx: Math.cos(d) * P.bulletSpeed, vy: Math.sin(d) * P.bulletSpeed, life: P.bulletLife, r: 5 });
      sfx(760, .07, 'square', .09);
    }

    spawnAcc += dt * P.enemyRate * ramp();
    while (spawnAcc >= 1) { spawnAcc--; if (enemies.length < P.enemyMax) spawnEnemy(); }
    if (P.pickupRate) {
      pickAcc += dt * P.pickupRate;
      while (pickAcc >= 1) { pickAcc--; if (pickups.length < 6) spawnPickup(); }
    }

    for (const e of enemies) {
      e.rot += e.spin * dt;
      if (P.enemyMode === 'chase') {
        const d = Math.atan2(player.y - e.y, player.x - e.x), s = P.enemySpeed * ramp();
        e.vx += (Math.cos(d) * s - e.vx) * Math.min(1, 2.2 * dt);
        e.vy += (Math.sin(d) * s - e.vy) * Math.min(1, 2.2 * dt);
      } else if (P.enemyMode === 'orbit') {
        e.ang += e.spin * dt * (.6 + P.enemySpeed / 400) * ramp();
        e.x = W / 2 + Math.cos(e.ang) * e.orbR; e.y = H / 2 + Math.sin(e.ang) * e.orbR;
      } else if (P.enemyMode === 'drift') {
        if (e.x < a.x || e.x > a.x + a.w) e.vx *= -1;
        if (e.y < a.y || e.y > a.y + a.h) e.vy *= -1;
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (player.inv <= 0 && Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r) { burst(player.x, player.y, 26, C.danger, 320); player.inv = 1.6; hit(); }
    }
    enemies = enemies.filter(e => e.hp > 0 && e.y < H + 120 && e.y > -160 && e.x > -200 && e.x < W + 200);

    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const e of enemies) {
        if (b.life > 0 && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          b.life = 0; e.hp--;
          if (e.hp <= 0) { addScore(P.killScore); burst(e.x, e.y, 14, C.enemy); shake = 6; sfx(180, .18, 'sawtooth'); toast(e.x, e.y, '+' + Math.round(P.killScore * combo), C.accent); }
          else burst(b.x, b.y, 4, C.accent, 90);
        }
      }
    }
    bullets = bullets.filter(b => b.life > 0);

    // 라이벌: 가장 가까운 수집품을 노린다
    if (rival && pickups.length) {
      let n = pickups[0], nd = 1e9;
      for (const p of pickups) { const d = Math.hypot(p.x - rival.x, p.y - rival.y); if (d < nd) { nd = d; n = p; } }
      const d = Math.atan2(n.y - rival.y, n.x - rival.x), s = P.speed * P.rivalSkill;
      rival.x += Math.cos(d) * s * dt; rival.y += Math.sin(d) * s * dt;
    }

    for (const p of pickups) {
      p.ph += dt * 4;
      if (P.magnet) {
        const d = Math.hypot(player.x - p.x, player.y - p.y);
        if (d < P.magnet) { p.x += (player.x - p.x) / d * 260 * dt; p.y += (player.y - p.y) / d * 260 * dt; }
      }
      if (Math.hypot(p.x - player.x, p.y - player.y) < p.r + player.r) {
        p.dead = 1; combo = Math.min(9, combo + (P.combo ? 1 : 0)); comboT = 3;
        addScore(P.pickupScore); burst(p.x, p.y, 12, C.pickup); sfx(880, .12, 'triangle');
        toast(p.x, p.y, '+' + Math.round(P.pickupScore * combo), C.pickup);
      } else if (rival && Math.hypot(p.x - rival.x, p.y - rival.y) < p.r + rival.r) {
        p.dead = 1; rivalScore += P.pickupScore; burst(p.x, p.y, 8, C.enemy); combo = 1;
      }
    }
    pickups = pickups.filter(p => !p.dead);

    if (P.combo) { comboT -= dt; if (comboT <= 0) combo = 1; }
    if (P.survivalScore) addScore(P.survivalScore * dt);
    if (state === 'over' && rival) endMsg = score >= rivalScore ? '승리' : '라이벌에게 패배';
  },

  hud() {
    return rival ? ['라이벌 ' + Math.round(rivalScore).toLocaleString()] : [];
  },

  draw() {
    grid();
    const a = state === 'title' ? { x: 0, y: 0, w: W, h: H } : arena();
    if (P.shrink && state !== 'title') { ctx.strokeStyle = C.danger; ctx.lineWidth = 3; ctx.strokeRect(a.x, a.y, a.w, a.h); }
    if (state === 'title') return;

    for (const p of pickups) poly(p.x, p.y + Math.sin(p.ph) * 3, p.r, P.pickupSides, p.ph * .5, C.pickup, 16);
    for (const e of enemies) poly(e.x, e.y, e.r, P.enemySides, e.rot, C.enemy, 12);
    ctx.fillStyle = C.accent;
    for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill(); }
    if (rival) { poly(rival.x, rival.y, rival.r, P.playerSides, t * 2, C.enemy, 10); ctx.fillStyle = C.dim; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RIVAL', rival.x, rival.y - rival.r - 6); }
    if (player.inv <= 0 || (t * 12 | 0) % 2) poly(player.x, player.y, player.r, P.playerSides, player.aim, C.player, 18);

    if (P.darkness && state === 'play') {
      const g = ctx.createRadialGradient(player.x, player.y, 40, player.x, player.y, P.darkness);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, C.dark ? 'rgba(0,0,0,.92)' : 'rgba(20,20,30,.9)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  },
};

function spawnEnemy() {
  const a = arena(), sp = P.enemySpeed * ramp(), s = P.enemySize * rr(.75, 1.35);
  let x, y, vx = 0, vy = 0, ang = 0;
  if (P.enemyMode === 'rain') { x = rr(a.x, a.x + a.w); y = a.y - 40; vy = sp; }
  else if (P.enemyMode === 'orbit') { ang = rand() * 6.283; x = W / 2; y = H / 2; }
  else {
    const side = (rand() * 4) | 0;
    x = side === 0 ? a.x - 30 : side === 1 ? a.x + a.w + 30 : rr(a.x, a.x + a.w);
    y = side === 2 ? a.y - 30 : side === 3 ? a.y + a.h + 30 : rr(a.y, a.y + a.h);
    const d = Math.atan2(player.y - y, player.x - x) + (P.enemyMode === 'drift' ? rr(-.9, .9) : 0);
    vx = Math.cos(d) * sp; vy = Math.sin(d) * sp;
  }
  enemies.push({ x, y, vx, vy, r: s, ang, orbR: rr(90, Math.min(a.w, a.h) / 2 - 20), spin: rr(.4, 1.1) * (rand() < .5 ? -1 : 1), rot: 0, hp: P.enemyHp });
}

function spawnPickup() {
  const a = arena();
  pickups.push({ x: rr(a.x + 30, a.x + a.w - 30), y: rr(a.y + 30, a.y + a.h - 30), r: 11, ph: rand() * 6.283 });
}
