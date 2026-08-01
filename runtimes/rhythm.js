// 리듬: BPM에 맞춰 떨어지는 노트를 레인 키로 친다. 채보는 시드 없이 매 판 절차 생성.
const LANE_KEYS = ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'];
const LANE_LABEL = ['S', 'D', 'F', 'J', 'K', 'L'];
const PENTA = [0, 2, 4, 7, 9, 12];
const HIT_Y = H - 110;

let notes, beatAcc, beatIdx, judge, judgeT, hits, total, laneFlash, chain;

const laneX = (i) => W / 2 + (i - (P.lanes - 1) / 2) * P.laneW;
const noteFreq = (i) => 220 * Math.pow(2, PENTA[i % PENTA.length] / 12) * (P.octave || 1);

const GAME = {
  reset() {
    notes = []; beatAcc = 0; beatIdx = 0; judge = ''; judgeT = 0;
    hits = 0; total = 0; chain = 0; laneFlash = new Array(P.lanes).fill(0);
  },

  update(dt) {
    // 채보 생성: 박자마다 확률적으로, 8박마다 밀도 상승
    const beat = 60 / P.bpm / P.subdiv;
    beatAcc += dt;
    while (beatAcc >= beat) {
      beatAcc -= beat;
      const phrase = 1 + Math.min(1.4, t * P.ramp);
      const dens = Math.min(.95, P.density * phrase) * (beatIdx % P.subdiv === 0 ? 1 : .45);
      if (rand() < dens) {
        const lane = (rand() * P.lanes) | 0;
        notes.push({ lane, y: -30 });
        if (P.chords && rand() < .18) {
          const l2 = (lane + 1 + ((rand() * (P.lanes - 1)) | 0)) % P.lanes;
          notes.push({ lane: l2, y: -30 });
        }
      }
      beatIdx++;
    }

    const speed = P.noteSpeed * (1 + t * P.ramp * .5);
    for (const n of notes) n.y += speed * dt;

    for (let i = 0; i < P.lanes; i++) {
      laneFlash[i] = Math.max(0, laneFlash[i] - dt * 4);
      if (!tapped(LANE_KEYS[i])) continue;
      laneFlash[i] = 1;
      // 판정선에 가장 가까운 노트
      let best = null, bd = 1e9;
      for (const n of notes) {
        if (n.lane !== i || n.dead) continue;
        const d = Math.abs(n.y - HIT_Y);
        if (d < bd) { bd = d; best = n; }
      }
      if (best && bd < P.goodWindow) {
        best.dead = 1; hits++; total++;
        const perfect = bd < P.perfectWindow;
        judge = perfect ? 'PERFECT' : 'GOOD'; judgeT = .5;
        chain++;
        combo = 1 + Math.min(7, Math.floor(chain / 8)); // 연속 8개마다 배수 1 상승, 최대 8배
        addScore(perfect ? P.perfectScore : P.goodScore);
        burst(laneX(i), HIT_Y, perfect ? 14 : 7, perfect ? C.pickup : C.accent, 200);
        sfx(noteFreq(i), .16, 'triangle', .16);
      }
    }

    // 놓친 노트
    for (const n of notes) {
      if (!n.dead && n.y > HIT_Y + P.goodWindow) {
        n.dead = 1; total++; combo = 1; chain = 0;
        judge = 'MISS'; judgeT = .5;
        hit();
      }
    }
    notes = notes.filter(n => !n.dead && n.y < H + 60);
    judgeT -= dt;
  },

  hud() {
    return [total ? '정확도 ' + Math.round(hits / total * 100) + '%' : '정확도 —', 'COMBO ' + chain];
  },

  draw() {
    const half = P.laneW / 2;
    for (let i = 0; i < P.lanes; i++) {
      const x = laneX(i);
      ctx.fillStyle = i % 2 ? C.bg2 : C.grid;
      ctx.globalAlpha = .5; ctx.fillRect(x - half, 0, P.laneW, H); ctx.globalAlpha = 1;
      if (laneFlash[i] > 0) { ctx.globalAlpha = laneFlash[i] * .35; ctx.fillStyle = C.player; ctx.fillRect(x - half, 0, P.laneW, H); ctx.globalAlpha = 1; }
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - half, 0); ctx.lineTo(x - half, H); ctx.stroke();
    }
    const L = laneX(0) - half, R = laneX(P.lanes - 1) + half;

    ctx.strokeStyle = C.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L, HIT_Y); ctx.lineTo(R, HIT_Y); ctx.stroke();

    ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui,sans-serif'; ctx.fillStyle = C.dim;
    for (let i = 0; i < P.lanes; i++) ctx.fillText(LANE_LABEL[i], laneX(i), HIT_Y + 34);

    if (state === 'title') return;
    for (const n of notes) {
      const x = laneX(n.lane);
      ctx.shadowBlur = 12; ctx.shadowColor = C.player; ctx.fillStyle = C.player;
      ctx.fillRect(x - half + 8, n.y - 9, P.laneW - 16, 18);
      ctx.shadowBlur = 0;
    }
    if (judgeT > 0) {
      ctx.globalAlpha = Math.min(1, judgeT * 2);
      ctx.fillStyle = judge === 'MISS' ? C.danger : judge === 'PERFECT' ? C.pickup : C.accent;
      ctx.font = 'bold 32px system-ui,sans-serif';
      ctx.fillText(judge, W / 2, HIT_Y - 80);
      ctx.globalAlpha = 1;
    }
  },
};
