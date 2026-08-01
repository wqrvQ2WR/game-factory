// 3D 터널: 원근 투영으로 다가오는 링의 틈을 각도로 맞춰 통과한다. WebGL 없이 캔버스 투영만.
let ang, rings, orbs, shots, ringAcc, orbAcc, passed, camRoll;

const proj = (z) => P.focal / (z + P.focal);            // 0(코앞) ~ 1
const wrapPi = (d) => { while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; return d; };
// 관이 휘어 보이도록 먼 곳일수록 중심이 어긋난다. 진폭을 키우면 관이 아니라 얼룩으로 보인다.
const bend = (z) => Math.min(1, z / P.zFar) ** 1.6;
const centerX = (z) => W / 2 + Math.sin(camRoll) * 55 * bend(z);
const centerY = (z) => H / 2 + Math.cos(camRoll * .7) * 38 * bend(z);

const GAME = {
  reset() {
    ang = -Math.PI / 2; rings = []; orbs = []; shots = [];
    ringAcc = 0; orbAcc = 0; passed = 0; camRoll = 0;
  },

  update(dt) {
    const speed = P.tunnelSpeed * (1 + t * P.ramp);
    camRoll += dt * P.roll;

    let steer = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    if (!steer && down) {
      const d = wrapPi(Math.atan2(my - H / 2, mx - W / 2) - ang);
      steer = Math.abs(d) < .05 ? 0 : Math.sign(d);
    }
    ang += steer * P.rotSpeed * dt;

    ringAcc += dt * P.ringRate * (1 + t * P.ramp * .5);
    while (ringAcc >= 1) {
      ringAcc--;
      rings.push({ z: P.zFar, gap: rand() * 6.283, w: P.gapWidth, done: false });
    }
    if (P.orbRate) {
      orbAcc += dt * P.orbRate;
      while (orbAcc >= 1) { orbAcc--; orbs.push({ z: P.zFar, a: rand() * 6.283 }); }
    }

    for (const r of rings) {
      r.z -= speed * dt;
      if (!r.done && r.z <= 0) {
        r.done = true;
        if (Math.abs(wrapPi(ang - r.gap)) < r.w / 2) {
          passed++; addScore(P.ringScore);
          combo = Math.min(9, combo + (P.combo ? 1 : 0));
          burst(centerX(0) + Math.cos(ang) * P.tunnelR, centerY(0) + Math.sin(ang) * P.tunnelR, 10, C.pickup, 220);
          sfx(660 + passed % 6 * 40, .1, 'triangle', .12);
        } else {
          shake = 20; combo = 1;
          burst(W / 2 + Math.cos(ang) * P.tunnelR, H / 2 + Math.sin(ang) * P.tunnelR, 22, C.danger, 300);
          hit();
        }
      }
    }
    rings = rings.filter(r => r.z > -200);

    if (P.shoot && tapped('Space')) {
      shots.push({ z: 0, a: ang, life: .5 });
      sfx(880, .06, 'square', .08);
    }
    for (const s of shots) { s.z += P.shotSpeed * dt; s.life -= dt; }
    shots = shots.filter(s => s.life > 0);

    for (const o of orbs) {
      o.z -= speed * dt;
      for (const s of shots) {
        if (!o.dead && Math.abs(s.z - o.z) < 220 && Math.abs(wrapPi(s.a - o.a)) < .35) {
          o.dead = 1; addScore(P.orbScore);
          burst(centerX(o.z) + Math.cos(o.a) * P.tunnelR * proj(o.z), centerY(o.z) + Math.sin(o.a) * P.tunnelR * proj(o.z), 12, C.accent, 200);
          sfx(300, .14, 'sawtooth', .12);
        }
      }
      if (!o.dead && o.z <= 0) { o.dead = 1; if (Math.abs(wrapPi(ang - o.a)) < .3) { addScore(P.orbScore); sfx(990, .1, 'triangle', .12); } }
    }
    orbs = orbs.filter(o => !o.dead && o.z > -200);

    addScore(P.survivalScore * dt);
  },

  hud() { return ['통과 ' + passed]; },

  draw() {
    // 관 벽: 깊이별 원 + 세로 능선. 스크롤되는 오프셋을 줘야 전진하는 느낌이 난다.
    const STEPS = 16, SPOKES = 12;
    const zAt = (i) => ((i + (t * P.tunnelSpeed / P.zFar) % 1) / STEPS) * P.zFar;
    ctx.lineWidth = 1.5;
    for (let i = STEPS; i >= 1; i--) {
      const z = zAt(i), s = proj(z);
      ctx.strokeStyle = C.dim; ctx.globalAlpha = .12 + s * .5;
      ctx.beginPath(); ctx.arc(centerX(z), centerY(z), P.tunnelR * s, 0, 6.283); ctx.stroke();
    }
    ctx.strokeStyle = C.dim; ctx.globalAlpha = .3; ctx.lineWidth = 1;
    for (let a = 0; a < SPOKES; a++) {
      const ang2 = a / SPOKES * 6.283 + camRoll * .25;
      ctx.beginPath();
      for (let i = 1; i <= STEPS; i++) {
        const z = zAt(i), s = proj(z);
        ctx[i === 1 ? 'moveTo' : 'lineTo'](centerX(z) + Math.cos(ang2) * P.tunnelR * s, centerY(z) + Math.sin(ang2) * P.tunnelR * s);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (state === 'title') return;

    // 링 (먼 것부터)
    const sorted = rings.slice().sort((a, b) => b.z - a.z);
    for (const r of sorted) {
      if (r.z < -40) continue;
      const s = proj(r.z), rad = P.tunnelR * s;
      ctx.strokeStyle = r.done ? C.dim : C.enemy;
      ctx.globalAlpha = Math.min(1, s * 2.2);
      ctx.lineWidth = Math.max(2, 26 * s);
      ctx.beginPath();
      ctx.arc(centerX(r.z), centerY(r.z), rad, r.gap + r.w / 2, r.gap - r.w / 2 + 6.283);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const o of orbs) {
      const s = proj(o.z);
      poly(centerX(o.z) + Math.cos(o.a) * P.tunnelR * s, centerY(o.z) + Math.sin(o.a) * P.tunnelR * s, Math.max(3, 16 * s), 6, t, C.pickup, 14);
    }
    for (const sh of shots) {
      const s = proj(sh.z);
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(centerX(sh.z) + Math.cos(sh.a) * P.tunnelR * s, centerY(sh.z) + Math.sin(sh.a) * P.tunnelR * s, Math.max(2, 8 * s), 0, 6.283); ctx.fill();
    }

    // 내 기체 (z=0 평면)
    const cx = centerX(0), cy = centerY(0);
    poly(cx + Math.cos(ang) * P.tunnelR, cy + Math.sin(ang) * P.tunnelR, 15, 3, ang + Math.PI / 2, C.player, 20);
    ctx.strokeStyle = C.player; ctx.globalAlpha = .25; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, P.tunnelR, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
  },
};
