// 뱀: 격자 위를 일정 간격으로 전진한다. 꼬리와 벽이 자기 자신을 가두는 장르.
let cols, rows, snake, dir, want, food, walls, moveAcc, grow, eaten;

const cellPx = () => P.cell;
const key = (x, y) => x + ',' + y;

function placeFood() {
  const taken = new Set(snake.map((s) => key(s.x, s.y)).concat(walls.map((w) => key(w.x, w.y))));
  for (let i = 0; i < 400; i++) {
    const x = (rand() * cols) | 0, y = (rand() * rows) | 0;
    if (!taken.has(key(x, y))) { food = { x, y, ph: 0 }; return; }
  }
  food = null;
}

const GAME = {
  reset() {
    cols = Math.floor(W / cellPx()); rows = Math.floor(H / cellPx());
    snake = [];
    const cx = cols >> 1, cy = rows >> 1;
    for (let i = 0; i < P.startLen; i++) snake.push({ x: cx - i, y: cy });
    dir = { x: 1, y: 0 }; want = { x: 1, y: 0 };
    moveAcc = 0; grow = 0; eaten = 0;
    walls = [];
    for (let i = 0; i < P.walls; i++) {
      const x = (rand() * cols) | 0, y = (rand() * rows) | 0;
      if (Math.abs(x - cx) < 4 && Math.abs(y - cy) < 2) continue; // 시작 지점은 비워둔다
      walls.push({ x, y });
    }
    placeFood();
  },

  update(dt) {
    if (k('KeyW', 'ArrowUp') && dir.y === 0) want = { x: 0, y: -1 };
    else if (k('KeyS', 'ArrowDown') && dir.y === 0) want = { x: 0, y: 1 };
    else if (k('KeyA', 'ArrowLeft') && dir.x === 0) want = { x: -1, y: 0 };
    else if (k('KeyD', 'ArrowRight') && dir.x === 0) want = { x: 1, y: 0 };

    const step = 1 / (P.tickRate * (1 + eaten * P.speedUp));
    moveAcc += dt;
    while (moveAcc >= step) {
      moveAcc -= step;
      dir = want;
      const h = snake[0];
      let nx = h.x + dir.x, ny = h.y + dir.y;

      if (P.wrap) { nx = (nx + cols) % cols; ny = (ny + rows) % rows; }
      else if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) { crash(h); return; }

      if (walls.some((w) => w.x === nx && w.y === ny)) { crash({ x: nx, y: ny }); return; }
      if (snake.some((s, i) => i < snake.length - 1 && s.x === nx && s.y === ny)) { crash({ x: nx, y: ny }); return; }

      snake.unshift({ x: nx, y: ny });
      if (food && nx === food.x && ny === food.y) {
        eaten++; grow += P.growth;
        addScore(P.foodScore);
        const c = cellPx();
        burst(nx * c + c / 2, ny * c + c / 2, 12, C.pickup);
        toast(nx * c + c / 2, ny * c, '+' + Math.round(P.foodScore * combo), C.pickup);
        combo = Math.min(9, combo + (P.combo ? 1 : 0));
        sfx(700 + eaten % 5 * 60, .1, 'triangle');
        placeFood();
      }
      if (grow > 0) grow--; else snake.pop();
    }
    if (food) food.ph += dt * 4;
    addScore(P.survivalScore * dt);
  },

  hud() { return ['길이 ' + snake.length, '먹이 ' + eaten]; },

  draw() {
    const c = cellPx();
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= cols; x++) { ctx.moveTo(x * c, 0); ctx.lineTo(x * c, rows * c); }
    for (let y = 0; y <= rows; y++) { ctx.moveTo(0, y * c); ctx.lineTo(cols * c, y * c); }
    ctx.stroke();

    ctx.fillStyle = C.dim;
    for (const w of walls) ctx.fillRect(w.x * c + 1, w.y * c + 1, c - 2, c - 2);

    if (food) {
      const s = c * .5 + Math.sin(food.ph) * 2;
      poly(food.x * c + c / 2, food.y * c + c / 2, s * .6, P.foodSides, food.ph * .4, C.pickup, 14);
    }

    snake.forEach((s, i) => {
      const head = i === 0;
      ctx.fillStyle = head ? C.player : C.enemy;
      ctx.globalAlpha = head ? 1 : Math.max(.35, 1 - i / (snake.length + 6));
      ctx.shadowBlur = head ? 16 : 0; ctx.shadowColor = C.player;
      ctx.fillRect(s.x * c + 1.5, s.y * c + 1.5, c - 3, c - 3);
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  },
};

function crash(at) {
  const c = cellPx();
  burst(at.x * c + c / 2, at.y * c + c / 2, 26, C.danger, 320);
  combo = 1;
  hit();
  if (lives > 0) GAME.reset();  // 아직 목숨이 남았으면 판만 다시 깐다
}
