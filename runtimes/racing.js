// 레이싱: 의사 3D 도로(아웃런 방식). 세그먼트를 원근 투영해 곡선·언덕을 만든다.
const SEG = 200, ROADW = 2000, CAMD = 0.84, DRAW = 180, CAMH = 1300;

let segs, pos, playerX, speed, cars, lap, overtakes, offRoad, totalLen;
const sp = []; // 이번 프레임 투영 결과 (세그먼트 인덱스 n 기준)

function buildTrack() {
  const n = P.trackSegs, out = [];
  const ph = [rr(0, 6.28), rr(0, 6.28), rr(0, 6.28), rr(0, 6.28)];
  for (let i = 0; i < n; i++) {
    const u = 2 * Math.PI * i / n;
    out.push({
      curve: P.curviness * (Math.sin(3 * u + ph[0]) + .55 * Math.sin(7 * u + ph[1])),
      y: P.hilliness * (Math.sin(2 * u + ph[2]) * 1400 + .4 * Math.sin(5 * u + ph[3]) * 1400),
    });
  }
  return out;
}

const GAME = {
  reset() {
    segs = buildTrack(); totalLen = segs.length * SEG;
    pos = 0; playerX = 0; speed = 0; lap = 0; overtakes = 0; offRoad = false;
    cars = [];
    for (let i = 0; i < P.opponents; i++) {
      cars.push({ z: rr(totalLen * .1, totalLen * .95), x: rr(-.7, .7), spd: P.maxSpeed * rr(.55, .88), passed: false });
    }
  },

  update(dt) {
    const steer = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0)
      || (down ? Math.max(-1, Math.min(1, (mx - W / 2) / 200)) : 0);
    const gas = k('KeyW', 'ArrowUp', 'Space') || down;
    const brake = k('KeyS', 'ArrowDown');

    offRoad = Math.abs(playerX) > 1;
    const target = brake ? 0 : gas ? P.maxSpeed : P.maxSpeed * .35;
    const rate = brake ? P.brake : speed < target ? P.accel : P.decel;
    speed += (target - speed) * Math.min(1, rate * dt);
    if (offRoad && speed > P.offSpeed) speed += (P.offSpeed - speed) * Math.min(1, 3 * dt);

    const frac = speed / P.maxSpeed;
    playerX += steer * P.handling * dt * (.35 + frac * .65);
    // 원심력: 코너에서 바깥으로 밀린다
    playerX -= segs[Math.floor(pos / SEG) % segs.length].curve * frac * P.centrifugal * dt;
    playerX = Math.max(-1.6, Math.min(1.6, playerX));

    pos += speed * dt;
    if (pos >= totalLen) {
      pos -= totalLen; lap++;
      sfx(660, .3, 'square', .2);
      if (P.laps && lap >= P.laps) { over('완주!'); return; }
    }

    for (const c of cars) {
      c.z += c.spd * dt;
      if (c.z >= totalLen) { c.z -= totalLen; c.passed = false; }
      let rel = c.z - pos; if (rel < -totalLen / 2) rel += totalLen; if (rel > totalLen / 2) rel -= totalLen;
      if (rel > -400 && rel < 400 && Math.abs(c.x - playerX) < .38) {
        speed *= .45; shake = 14; burst(W / 2 + (c.x - playerX) * 260, H - 150, 12, C.danger, 260);
        c.z -= 600; hit();
      }
      if (!c.passed && rel < -120 && rel > -900) { c.passed = true; overtakes++; addScore(P.passScore); toast(W / 2, H - 220, '추월 +' + P.passScore, C.accent); sfx(520, .12, 'triangle'); }
    }

    if (offRoad) { shake = Math.max(shake, 5); if ((t * 20 | 0) % 3 === 0) burst(W / 2, H - 120, 2, C.dim, 120); }
    addScore(speed * dt * P.scoreRate);
  },

  hud() {
    const rows = [Math.round(speed / 12) + ' km/h'];
    if (P.laps) rows.push('LAP ' + Math.min(lap + 1, P.laps) + '/' + P.laps);
    if (P.opponents) rows.push('추월 ' + overtakes);
    return rows;
  },

  draw() {
    // 하늘 / 지평선
    ctx.fillStyle = C.bg2; ctx.fillRect(0, 0, W, H);
    const base = Math.floor(pos / SEG) % segs.length;
    const camY = CAMH + segs[base].y;
    let x = 0, dx = 0, maxy = H;
    sp.length = 0;

    for (let n = 0; n < DRAW; n++) {
      const i = (base + n) % segs.length, s = segs[i];
      const z = n * SEG - (pos % SEG);
      const scl = CAMD / Math.max(SEG * .5, z);
      const p = {
        sx: W / 2 + scl * (x - playerX * ROADW) * W / 2,
        sy: H / 2 - scl * (s.y - camY) * H / 2,
        sw: scl * ROADW * W / 2,
        scl, x,
      };
      sp.push(p);
      x += dx; dx += s.curve;

      if (n === 0 || p.sy >= maxy) continue;
      const q = sp[n - 1];
      const light = ((base + n) / P.stripe | 0) % 2 === 0;

      // 잔디
      ctx.fillStyle = light ? C.grid : C.bg;
      ctx.fillRect(0, p.sy, W, q.sy - p.sy + 1);
      // 도로
      ctx.fillStyle = light ? C.dim : C.text;
      ctx.globalAlpha = light ? .28 : .18;
      quad(q.sx, q.sy, q.sw * 1.12, p.sx, p.sy, p.sw * 1.12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.dark ? '#0b0b0f' : '#2a2a33';
      quad(q.sx, q.sy, q.sw, p.sx, p.sy, p.sw);
      // 중앙선
      if (light) { ctx.fillStyle = C.accent; ctx.globalAlpha = .5; quad(q.sx, q.sy, q.sw * .02, p.sx, p.sy, p.sw * .02); ctx.globalAlpha = 1; }
      maxy = p.sy;
    }

    if (state === 'title') return;

    // 상대 차 (먼 것부터)
    for (const c of cars) {
      let rel = c.z - pos; if (rel < 0) rel += totalLen;
      const n = Math.floor(rel / SEG);
      if (n < 1 || n >= sp.length) continue;
      const p = sp[n];
      const w = p.sw * .34, cx = p.sx + p.scl * c.x * ROADW * W / 2;
      ctx.fillStyle = C.enemy; ctx.shadowBlur = 8; ctx.shadowColor = C.enemy;
      ctx.fillRect(cx - w / 2, p.sy - w * .62, w, w * .62);
      ctx.shadowBlur = 0;
    }

    // 내 차
    const pw = 92, py = H - 96;
    ctx.fillStyle = C.player; ctx.shadowBlur = 16; ctx.shadowColor = C.player;
    ctx.fillRect(W / 2 - pw / 2, py, pw, 46);
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.bg;
    ctx.fillRect(W / 2 - pw / 2 + 10, py + 8, pw - 20, 16);

    if (offRoad) {
      ctx.fillStyle = C.danger; ctx.globalAlpha = .18; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.fillStyle = C.danger; ctx.font = 'bold 20px system-ui,sans-serif';
      ctx.fillText('코스 이탈', W / 2, 120);
    }
  },
};

function quad(x1, y1, w1, x2, y2, w2) {
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1); ctx.lineTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 - w2, y2);
  ctx.closePath(); ctx.fill();
}
