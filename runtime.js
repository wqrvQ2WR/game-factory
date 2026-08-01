// 생성된 모든 게임에 그대로 박히는 런타임. CFG(팔레트+파라미터)만 바꿔 다른 게임이 된다.
// 전역 CFG는 빌드 시 주입됨.
(() => {
  const P = CFG.params, C = CFG.palette;
  const W = 960, H = 600;
  const cvs = document.getElementById('c'), ctx = cvs.getContext('2d');
  let scale = 1, ox = 0, oy = 0, dpr = 1;

  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    scale = Math.min(innerWidth / W, innerHeight / H);
    cvs.width = innerWidth * dpr; cvs.height = innerHeight * dpr;
    cvs.style.width = innerWidth + 'px'; cvs.style.height = innerHeight + 'px';
    ox = (innerWidth - W * scale) / 2; oy = (innerHeight - H * scale) / 2;
  };
  addEventListener('resize', resize); resize();

  // ---- 입력 ----
  const keys = new Set();
  let mx = W / 2, my = H / 2, down = false;
  onkeydown = e => { keys.add(e.code); if (e.code === 'Space') e.preventDefault(); if (state !== 'play') start(); };
  onkeyup = e => keys.delete(e.code);
  const toWorld = e => { mx = (e.clientX - ox) / scale; my = (e.clientY - oy) / scale; };
  cvs.onpointermove = toWorld;
  cvs.onpointerdown = e => { toWorld(e); down = true; if (state !== 'play') start(); };
  onpointerup = () => down = false;
  const k = (...c) => c.some(x => keys.has(x));

  // ---- 상태 ----
  const BEST_KEY = 'gf:' + CFG.id + ':best';
  let state = 'title', score = 0, best = +localStorage.getItem(BEST_KEY) || 0;
  let lives, t, shake = 0, spawnAcc, pickAcc, fireCd, combo, comboT, flash = 0;
  let player, enemies, bullets, pickups, parts, toasts;
  const rr = (a, b) => a + Math.random() * (b - a);

  function start() {
    state = 'play'; score = 0; lives = P.lives; t = 0; combo = 1; comboT = 0;
    spawnAcc = 0; pickAcc = 0; fireCd = 0; shake = 0;
    player = { x: W / 2, y: P.gravity ? H - 90 : H / 2, vx: 0, vy: 0, r: P.playerSize, inv: 1.2, aim: -Math.PI / 2 };
    enemies = []; bullets = []; pickups = []; parts = []; toasts = [];
    if (AC && AC.state === 'suspended') AC.resume();
  }

  // ---- 오디오: 오실레이터 하나짜리 삑삑이 ----
  let AC = null;
  function sfx(freq, dur, type, vol) {
    try {
      AC = AC || new (AudioContext || webkitAudioContext)();
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, AC.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * P.sfxBend), AC.currentTime + dur);
      g.gain.setValueAtTime((vol ?? 0.18) * P.sfxVol, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
      o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
    } catch {}
  }

  // ---- 이펙트 ----
  const burst = (x, y, n, col, spd = 220) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = rr(spd * 0.2, spd);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rr(0.3, 0.8), max: 0.8, c: col, r: rr(1.5, 4) });
    }
  };
  const toast = (x, y, txt, c) => toasts.push({ x, y, txt, c, life: 0.9 });

  const arena = () => {
    const inset = P.shrink ? Math.min(180, t * P.shrink) : 0;
    return { x: inset, y: inset, w: W - inset * 2, h: H - inset * 2 };
  };

  // 반올림은 표시할 때만. 여기서 반올림하면 프레임당 생존점수(0.x)가 통째로 날아간다.
  function addScore(n) { score += n * combo; }

  // ---- 스폰 ----
  function spawnEnemy() {
    const a = arena(), sp = P.enemySpeed * ramp(), s = P.enemySize * rr(0.75, 1.35);
    let x, y, vx = 0, vy = 0, ang = 0;
    if (P.enemyMode === 'rain') { x = rr(a.x, a.x + a.w); y = a.y - 40; vy = sp; }
    else if (P.enemyMode === 'orbit') { ang = Math.random() * 6.283; x = W / 2; y = H / 2; }
    else {
      const side = (Math.random() * 4) | 0;
      x = side === 0 ? a.x - 30 : side === 1 ? a.x + a.w + 30 : rr(a.x, a.x + a.w);
      y = side === 2 ? a.y - 30 : side === 3 ? a.y + a.h + 30 : rr(a.y, a.y + a.h);
      const d = Math.atan2(player.y - y, player.x - x) + (P.enemyMode === 'drift' ? rr(-0.9, 0.9) : 0);
      vx = Math.cos(d) * sp; vy = Math.sin(d) * sp;
    }
    enemies.push({ x, y, vx, vy, r: s, ang, orbR: rr(90, Math.min(a.w, a.h) / 2 - 20), spin: rr(0.4, 1.1) * (Math.random() < .5 ? -1 : 1), rot: 0, hp: P.enemyHp });
  }
  const ramp = () => 1 + t * P.ramp;

  function spawnPickup() {
    const a = arena();
    pickups.push({ x: rr(a.x + 30, a.x + a.w - 30), y: rr(a.y + 30, a.y + a.h - 30), r: 11, ph: Math.random() * 6.283 });
  }

  // ---- 업데이트 ----
  function update(dt) {
    t += dt;
    const a = arena();

    // 플레이어
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
      if ((k('Space', 'KeyW', 'ArrowUp') || (down && my < player.y)) && player.onGround) { player.vy = -P.jump; player.onGround = false; sfx(420, .12, 'square'); }
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
      const bounce = P.edge === 'bounce' ? -0.7 : 0;
      if (player.x < a.x + player.r) { player.x = a.x + player.r; player.vx *= bounce; }
      if (player.x > a.x + a.w - player.r) { player.x = a.x + a.w - player.r; player.vx *= bounce; }
      if (player.y < a.y + player.r) { player.y = a.y + player.r; player.vy *= bounce; }
      if (player.y > a.y + a.h - player.r) { player.y = a.y + a.h - player.r; player.vy *= bounce; player.onGround = true; }
    }

    // 발사
    fireCd -= dt;
    if (P.shoot && fireCd <= 0 && (k('Space') || down)) {
      fireCd = P.fireRate;
      const d = down ? Math.atan2(my - player.y, mx - player.x) : player.aim;
      bullets.push({ x: player.x, y: player.y, vx: Math.cos(d) * P.bulletSpeed, vy: Math.sin(d) * P.bulletSpeed, life: P.bulletLife, r: 5 });
      sfx(760, .07, 'square', .09);
    }

    // 스폰
    spawnAcc += dt * P.enemyRate * ramp();
    while (spawnAcc >= 1) { spawnAcc--; if (enemies.length < P.enemyMax) spawnEnemy(); }
    if (P.pickupRate) {
      pickAcc += dt * P.pickupRate;
      while (pickAcc >= 1) { pickAcc--; if (pickups.length < 6) spawnPickup(); }
    }

    // 적
    for (const e of enemies) {
      e.rot += e.spin * dt;
      if (P.enemyMode === 'chase') {
        const d = Math.atan2(player.y - e.y, player.x - e.x), s = P.enemySpeed * ramp();
        e.vx += (Math.cos(d) * s - e.vx) * Math.min(1, 2.2 * dt);
        e.vy += (Math.sin(d) * s - e.vy) * Math.min(1, 2.2 * dt);
      } else if (P.enemyMode === 'orbit') {
        e.ang += e.spin * dt * (0.6 + P.enemySpeed / 400) * ramp();
        e.x = W / 2 + Math.cos(e.ang) * e.orbR; e.y = H / 2 + Math.sin(e.ang) * e.orbR;
      }
      if (P.enemyMode === 'drift') {
        if (e.x < a.x || e.x > a.x + a.w) e.vx *= -1;
        if (e.y < a.y || e.y > a.y + a.h) e.vy *= -1;
      }
      e.x += e.vx * dt; e.y += e.vy * dt;

      if (player.inv <= 0 && Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r) hit();
    }
    enemies = enemies.filter(e => e.hp > 0 && e.y < H + 120 && e.y > -160 && e.x > -200 && e.x < W + 200);

    // 총알
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const e of enemies) {
        if (b.life > 0 && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          b.life = 0; e.hp--;
          if (e.hp <= 0) { addScore(P.killScore); burst(e.x, e.y, 14, C.enemy); shake = 6; sfx(180, .18, 'sawtooth'); toast(e.x, e.y, '+' + Math.round(P.killScore * combo), C.accent); }
          else { burst(b.x, b.y, 4, C.accent, 90); }
        }
      }
    }
    bullets = bullets.filter(b => b.life > 0);

    // 픽업
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
      }
    }
    pickups = pickups.filter(p => !p.dead);

    if (P.combo) { comboT -= dt; if (comboT <= 0) combo = 1; }
    if (P.survivalScore) addScore(P.survivalScore * dt);

    // 파티클/토스트
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
    parts = parts.filter(p => p.life > 0);
    for (const s of toasts) { s.y -= 34 * dt; s.life -= dt; }
    toasts = toasts.filter(s => s.life > 0);

    shake *= Math.pow(0.001, dt); flash *= Math.pow(0.002, dt);
    if (P.timeLimit && t >= P.timeLimit) over();
  }

  function hit() {
    lives--; player.inv = 1.6; combo = 1; shake = 18; flash = 1;
    burst(player.x, player.y, 26, C.danger, 320); sfx(120, .35, 'sawtooth', .3);
    if (lives <= 0) over();
  }

  function over() {
    state = 'over';
    if (score > best) { best = Math.round(score); localStorage.setItem(BEST_KEY, best); }
    sfx(90, .7, 'sine', .25);
  }

  // ---- 그리기 ----
  function poly(x, y, r, sides, rot, fill, glow) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + i / sides * 6.283;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.shadowBlur = glow || 0; ctx.shadowColor = fill;
    ctx.fillStyle = fill; ctx.fill(); ctx.shadowBlur = 0;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg2; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    ctx.translate(ox + (Math.random() - .5) * shake, oy + (Math.random() - .5) * shake);
    ctx.scale(scale, scale);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    const a = state === 'title' ? { x: 0, y: 0, w: W, h: H } : arena();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    // 배경 격자
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    if (P.shrink) { ctx.strokeStyle = C.danger; ctx.lineWidth = 3; ctx.strokeRect(a.x, a.y, a.w, a.h); }

    if (state !== 'title') {
      for (const p of pickups) poly(p.x, p.y + Math.sin(p.ph) * 3, p.r, P.pickupSides, p.ph * .5, C.pickup, 16);
      for (const e of enemies) poly(e.x, e.y, e.r, P.enemySides, e.rot, C.enemy, 12);
      ctx.fillStyle = C.accent;
      for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill(); }
      for (const p of parts) { ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.c; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
      ctx.globalAlpha = 1;
      if (player.inv <= 0 || (t * 12 | 0) % 2) poly(player.x, player.y, player.r, P.playerSides, player.aim, C.player, 18);
      ctx.font = 'bold 17px system-ui,sans-serif'; ctx.textAlign = 'center';
      for (const s of toasts) { ctx.globalAlpha = s.life; ctx.fillStyle = s.c; ctx.fillText(s.txt, s.x, s.y); }
      ctx.globalAlpha = 1;
    }

    if (P.darkness && state === 'play') {
      const g = ctx.createRadialGradient(player.x, player.y, 40, player.x, player.y, P.darkness);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, C.dark ? 'rgba(0,0,0,.92)' : 'rgba(20,20,30,.9)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (flash > .01) { ctx.fillStyle = C.danger; ctx.globalAlpha = flash * .35; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

    // HUD
    ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = 'bold 26px system-ui,sans-serif';
    if (state !== 'title') {
      ctx.fillText(Math.round(score).toLocaleString(), 20, 40);
      ctx.font = '13px system-ui,sans-serif'; ctx.fillStyle = C.dim;
      ctx.fillText('BEST ' + best.toLocaleString(), 20, 60);
      ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.font = 'bold 20px system-ui,sans-serif';
      ctx.fillText('♥'.repeat(Math.max(0, lives)), W - 20, 38);
      if (P.timeLimit) { ctx.font = '14px system-ui,sans-serif'; ctx.fillStyle = C.dim; ctx.fillText(Math.max(0, P.timeLimit - t).toFixed(1) + 's', W - 20, 58); }
      if (P.combo && combo > 1) { ctx.fillStyle = C.accent; ctx.font = 'bold 22px system-ui,sans-serif'; ctx.fillText('x' + combo, W - 20, 84); }
    }

    ctx.textAlign = 'center';
    if (state === 'title') {
      ctx.fillStyle = C.text; ctx.font = 'bold 54px system-ui,sans-serif';
      ctx.fillText(CFG.title, W / 2, H / 2 - 46);
      ctx.fillStyle = C.accent; ctx.font = '18px system-ui,sans-serif';
      ctx.fillText(CFG.subtitle, W / 2, H / 2 - 14);
      ctx.fillStyle = C.dim; ctx.font = '15px system-ui,sans-serif';
      ctx.fillText(CFG.tagline, W / 2, H / 2 + 22);
      ctx.fillStyle = C.text; ctx.font = '14px system-ui,sans-serif';
      ctx.fillText(CFG.howto, W / 2, H / 2 + 70);
      ctx.fillStyle = C.player; ctx.font = 'bold 17px system-ui,sans-serif';
      ctx.fillText('아무 키나 누르면 시작', W / 2, H / 2 + 112);
    } else if (state === 'over') {
      ctx.fillStyle = C.dark ? 'rgba(0,0,0,.62)' : 'rgba(255,255,255,.62)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.text; ctx.font = 'bold 44px system-ui,sans-serif';
      ctx.fillText(P.timeLimit && t >= P.timeLimit ? '시간 종료' : 'GAME OVER', W / 2, H / 2 - 28);
      ctx.font = 'bold 30px system-ui,sans-serif'; ctx.fillStyle = C.accent;
      ctx.fillText(Math.round(score).toLocaleString(), W / 2, H / 2 + 16);
      ctx.font = '15px system-ui,sans-serif'; ctx.fillStyle = C.dim;
      ctx.fillText('BEST ' + best.toLocaleString() + ' · 아무 키나 눌러 재시작', W / 2, H / 2 + 50);
    }
    ctx.restore();
  }

  // ---- 루프 ----
  let last = performance.now();
  (function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'play') update(dt);
    draw();
    requestAnimationFrame(frame);
  })(last);
})();
