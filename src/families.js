// 장르 계열. 계열마다 런타임 파일 하나 + 파라미터 생성기 하나.
// 새 변주는 새 파일이 아니라 여기 params() 에 값을 추가하는 쪽이 먼저다.

const common = (rnd) => ({
  ramp: +rnd.float(0.01, 0.06).toFixed(3),
  combo: rnd.chance(0.6),
  sfxVol: +rnd.float(0.5, 1).toFixed(2),
  sfxBend: +rnd.float(0.35, 2.2).toFixed(2),
  timeLimit: 0,
});

export const FAMILIES = {
  // ---------- 아레나: 탑다운 회피/수집/슈팅/경쟁 ----------
  arena: {
    ko: '아레나',
    params(rnd) {
      const enemyMode = rnd.pick(['chase', 'drift', 'rain', 'orbit']);
      const gravity = (enemyMode === 'rain' || enemyMode === 'drift') && rnd.chance(0.4) ? rnd.range(1100, 1900) : 0;
      const shoot = rnd.chance(0.55);
      const rival = rnd.chance(0.22);
      // orbit은 장애물이 중앙만 돌아 구석에 붙으면 영원히 안전하다 → 수집품으로 끌어낸다
      // 라이벌도 뺏어갈 수집품이 있어야 성립한다
      const hasPickup = enemyMode === 'orbit' || rival || rnd.chance(0.7) || !shoot;
      const p = {
        ...common(rnd),
        speed: rnd.range(230, 430), accel: rnd.float(6, 15), friction: rnd.float(0.86, 0.95),
        jump: rnd.range(560, 800), gravity,
        playerSize: rnd.range(11, 18), playerSides: rnd.range(3, 6),
        edge: gravity ? 'wall' : rnd.pick(['wrap', 'bounce', 'wall', 'wall']),
        enemyMode, enemySpeed: rnd.range(80, 260), enemySize: rnd.range(12, 27), enemySides: rnd.range(3, 8),
        enemyRate: +rnd.float(0.45, 2.1).toFixed(2), enemyMax: rnd.range(10, 45),
        enemyHp: shoot ? rnd.range(1, 3) : 1,
        shoot, fireRate: +rnd.float(0.11, 0.3).toFixed(3), bulletSpeed: rnd.range(520, 820), bulletLife: +rnd.float(0.6, 1.4).toFixed(2),
        pickupRate: hasPickup ? +rnd.float(0.3, 1.0).toFixed(2) : 0,
        pickupScore: hasPickup ? rnd.range(10, 60) : 0,
        pickupSides: rnd.range(3, 8),
        magnet: hasPickup && rnd.chance(0.35) ? rnd.range(80, 150) : 0,
        killScore: shoot ? rnd.range(15, 80) : 0,
        survivalScore: rnd.chance(0.5) ? rnd.range(2, 12) : 0,
        rival: rival && hasPickup, rivalSkill: +rnd.float(0.55, 0.95).toFixed(2),
        lives: rnd.range(1, 5),
        shrink: rnd.chance(0.2) ? rnd.range(4, 14) : 0,
        darkness: rnd.chance(0.18) ? rnd.range(150, 330) : 0,
      };
      if (rnd.chance(0.25)) p.timeLimit = rnd.pick([45, 60, 90]);
      if (!p.pickupScore && !p.killScore && !p.survivalScore) p.survivalScore = 10;
      return p;
    },
    howto(p) {
      const a = ['이동: WASD / 방향키 / 마우스 드래그'];
      if (p.gravity) a.push('점프: Space / W');
      if (p.shoot) a.push('발사: Space / 클릭');
      return a.join('   ·   ');
    },
    // 제작기(maker.html)에서 손으로 굴릴 노브. params()의 범위와 맞춰 둔다.
    knobs: [
      { k: 'enemyMode', n: '적 행동', type: 'sel', opts: ['chase', 'drift', 'rain', 'orbit'] },
      { k: 'edge', n: '화면 경계', type: 'sel', opts: ['wall', 'wrap', 'bounce'] },
      { k: 'enemyRate', n: '적 스폰(초당)', min: 0.2, max: 4, step: 0.05 },
      { k: 'enemySpeed', n: '적 속도', min: 50, max: 420, step: 5 },
      { k: 'enemyMax', n: '적 최대 수', min: 5, max: 60, step: 1 },
      { k: 'speed', n: '내 속도', min: 150, max: 520, step: 5 },
      { k: 'pickupRate', n: '수집품 스폰', min: 0, max: 1.5, step: 0.05 },
      { k: 'pickupScore', n: '수집 점수', min: 0, max: 100, step: 1 },
      { k: 'magnet', n: '자석 반경', min: 0, max: 220, step: 5 },
      { k: 'shrink', n: '무대 축소', min: 0, max: 20, step: 1 },
      { k: 'darkness', n: '시야 반경(0=끔)', min: 0, max: 400, step: 10 },
      { k: 'gravity', n: '중력(0=탑다운)', min: 0, max: 2200, step: 50 },
      { k: 'lives', n: '목숨', min: 1, max: 9, step: 1 },
      { k: 'timeLimit', n: '제한시간(0=무제한)', min: 0, max: 180, step: 5 },
      { k: 'ramp', n: '난이도 상승', min: 0, max: 0.12, step: 0.005 },
      { k: 'shoot', n: '발사 가능', type: 'bool' },
      { k: 'rival', n: '라이벌 AI', type: 'bool' },
      { k: 'combo', n: '콤보 배수', type: 'bool' },
    ],
    derive(p) { if (p.gravity && p.edge === 'wrap') p.edge = 'wall'; }, // 바닥이 사라지는 조합 차단
    // 아케이드 목표 점수 추정: 그 게임의 채점식으로 '괜찮게 플레이했을 때' 정도
    est(p) {
      const T = p.timeLimit || 45;
      return Math.round(T * (p.pickupScore * p.pickupRate * 0.55 + p.killScore * p.enemyRate * 0.35 + p.survivalScore));
    },
    mech(p) {
      const M = { chase: '추격형 적', drift: '직선으로 튕겨다니는 적', rain: '위에서 쏟아지는 적', orbit: '중앙을 도는 회전 장애물' };
      const s = [M[p.enemyMode]];
      if (p.gravity) s.push('중력 있음(점프)');
      if (p.shoot) s.push('플레이어가 발사 가능');
      if (p.pickupRate) s.push('수집 아이템 있음');
      if (p.rival) s.push('수집품을 노리는 라이벌 AI와 경쟁');
      if (p.shrink) s.push('시간이 갈수록 무대가 좁아짐');
      if (p.darkness) s.push('시야가 어두움');
      if (p.edge === 'wrap') s.push('화면 순환');
      return s;
    },
  },

  // ---------- 리듬 ----------
  rhythm: {
    ko: '리듬',
    params(rnd) {
      const lanes = rnd.pick([4, 4, 5, 6]);
      return {
        ...common(rnd),
        lanes, laneW: lanes >= 6 ? rnd.range(84, 100) : rnd.range(96, 124),
        bpm: rnd.range(92, 178),
        subdiv: rnd.pick([1, 2, 2, 4]),
        density: +rnd.float(0.28, 0.72).toFixed(2),
        noteSpeed: rnd.range(340, 700),
        perfectWindow: rnd.range(26, 42),
        goodWindow: rnd.range(62, 92),
        perfectScore: rnd.range(80, 140),
        goodScore: rnd.range(30, 60),
        chords: rnd.chance(0.4),
        octave: rnd.pick([0.5, 1, 1, 2]),
        lives: rnd.range(4, 9),
        timeLimit: rnd.pick([60, 90, 120]),
        timeUpMsg: '완주!',
        combo: true,
        ramp: +rnd.float(0.005, 0.03).toFixed(3),
      };
    },
    howto(p) {
      const L = ['S', 'D', 'F', 'J', 'K', 'L'].slice(0, p.lanes).join(' ');
      return `노트가 판정선에 닿을 때 해당 레인 키: ${L}`;
    },
    knobs: [
      { k: 'lanes', n: '레인 수', min: 4, max: 6, step: 1 },
      { k: 'bpm', n: 'BPM', min: 70, max: 200, step: 1 },
      { k: 'subdiv', n: '박자 분할', min: 1, max: 4, step: 1 },
      { k: 'density', n: '노트 밀도', min: 0.15, max: 0.95, step: 0.01 },
      { k: 'noteSpeed', n: '노트 속도', min: 250, max: 800, step: 10 },
      { k: 'perfectWindow', n: 'PERFECT 판정폭', min: 15, max: 60, step: 1 },
      { k: 'goodWindow', n: 'GOOD 판정폭', min: 40, max: 120, step: 1 },
      { k: 'perfectScore', n: 'PERFECT 점수', min: 20, max: 200, step: 5 },
      { k: 'lives', n: '목숨', min: 1, max: 15, step: 1 },
      { k: 'timeLimit', n: '곡 길이(초)', min: 30, max: 180, step: 5 },
      { k: 'chords', n: '동시치기', type: 'bool' },
    ],
    derive(p) {
      p.laneW = p.lanes >= 6 ? 92 : 110;
      if (p.goodWindow <= p.perfectWindow) p.goodWindow = p.perfectWindow + 20; // GOOD이 더 좁으면 판정이 뒤집힌다
    },
    est(p) {
      const notesPerSec = p.bpm / 60 * p.subdiv * p.density * 0.6;
      return Math.round(p.timeLimit * notesPerSec * p.perfectScore * 0.5 * 2.5); // 콤보 배수 감안
    },
    mech(p) {
      const s = [`${p.lanes}레인`, `${p.bpm} BPM`, `${p.timeLimit}초 곡`];
      if (p.subdiv > 1) s.push(`${p.subdiv}분할 채보`);
      if (p.chords) s.push('동시치기 있음');
      if (p.density > 0.55) s.push('고밀도');
      return s;
    },
  },

  // ---------- 레이싱 (의사 3D) ----------
  racing: {
    ko: '레이싱',
    params(rnd) {
      const maxSpeed = rnd.range(7000, 13000);
      const laps = rnd.chance(0.6) ? rnd.range(2, 4) : 0;
      const opponents = rnd.range(0, 14);
      return {
        ...common(rnd),
        trackSegs: rnd.range(480, 900),
        curviness: +rnd.float(1.2, 4.6).toFixed(2),
        hilliness: +rnd.float(0.25, 1.2).toFixed(2),
        maxSpeed, accel: +rnd.float(0.45, 1.1).toFixed(2), decel: 0.6, brake: 2.6,
        offSpeed: Math.round(maxSpeed * rnd.float(0.28, 0.42)),
        handling: +rnd.float(1.2, 2.6).toFixed(2),
        centrifugal: +rnd.float(0.3, 0.9).toFixed(2),
        opponents, laps,
        passScore: rnd.range(120, 300),
        scoreRate: +rnd.float(0.002, 0.006).toFixed(4),
        stripe: rnd.range(3, 8),
        lives: rnd.range(3, 5),
        timeLimit: laps ? 0 : rnd.pick([60, 90]),
      };
    },
    knobs: [
      { k: 'maxSpeed', n: '최고 속도', min: 4000, max: 16000, step: 250 },
      { k: 'curviness', n: '코너 강도', min: 0.3, max: 6, step: 0.1 },
      { k: 'hilliness', n: '언덕 강도', min: 0, max: 2, step: 0.05 },
      { k: 'handling', n: '핸들링', min: 0.6, max: 4, step: 0.1 },
      { k: 'centrifugal', n: '원심력', min: 0, max: 1.6, step: 0.05 },
      { k: 'opponents', n: '상대 차', min: 0, max: 24, step: 1 },
      { k: 'laps', n: '랩(0=시간제)', min: 0, max: 8, step: 1 },
      { k: 'trackSegs', n: '트랙 길이', min: 300, max: 1200, step: 20 },
      { k: 'lives', n: '목숨', min: 1, max: 9, step: 1 },
      { k: 'timeLimit', n: '제한시간(0=랩전)', min: 0, max: 180, step: 5 },
    ],
    derive(p) {
      p.offSpeed = Math.round(p.maxSpeed * 0.35);      // 코스 이탈 속도는 최고속에 따라간다
      if (!p.laps && !p.timeLimit) p.timeLimit = 60;   // 둘 다 0이면 끝나지 않는다
    },
    est(p) {
      const T = p.timeLimit || 75;
      return Math.round(T * p.maxSpeed * p.scoreRate * 0.6 + p.passScore * p.opponents * 0.4);
    },
    howto() { return '조향: A / D   ·   가속: W (또는 클릭)   ·   브레이크: S'; },
    mech(p) {
      const s = ['의사 3D 도로'];
      s.push(p.curviness > 3 ? '급코너 많음' : '완만한 코스');
      if (p.hilliness > 0.8) s.push('언덕 심함');
      if (p.opponents) s.push(`상대 차 ${p.opponents}대와 경쟁`);
      s.push(p.laps ? `${p.laps}바퀴 완주` : `${p.timeLimit}초 스코어 어택`);
      return s;
    },
  },

  // ---------- 파쿠르 ----------
  parkour: {
    ko: '파쿠르',
    params(rnd) {
      const runSpeed = rnd.range(320, 560);
      const gravity = rnd.range(1500, 2400);
      const jump = rnd.range(620, 900);
      const airTime = 2 * jump / gravity;          // 점프 체공 시간
      const reach = runSpeed * airTime;            // 그 사이 나아가는 거리
      const rise = jump * jump / (2 * gravity);    // 점프 최고 높이
      return {
        ...common(rnd),
        runSpeed, gravity, jump,
        doubleJump: rnd.chance(0.5),
        bodyW: 26, bodyH: 44,
        platMin: rnd.range(240, 380), platMax: rnd.range(420, 700),
        stepY: Math.round(Math.min(rnd.range(60, 140), rise * 0.7)),   // 못 올라가는 단차 금지
        gapRate: +rnd.float(0.35, 0.75).toFixed(2),
        gapMin: Math.round(reach * 0.25),
        gapMax: Math.round(reach * rnd.float(0.5, 0.72)),              // 반드시 뛸 수 있는 폭
        obsRate: +rnd.float(0.3, 0.7).toFixed(2),
        coyote: 0.12,
        crashBack: rnd.range(60, 150),
        scoreRate: +rnd.float(0.05, 0.12).toFixed(3),
        lives: rnd.range(3, 5),
      };
    },
    knobs: [
      { k: 'runSpeed', n: '주행 속도', min: 200, max: 700, step: 10 },
      { k: 'gravity', n: '중력', min: 900, max: 3200, step: 50 },
      { k: 'jump', n: '점프력', min: 450, max: 1100, step: 10 },
      { k: 'gapRate', n: '구멍 빈도', min: 0, max: 1, step: 0.05 },
      { k: 'obsRate', n: '장애물 빈도', min: 0, max: 1, step: 0.05 },
      { k: 'platMin', n: '발판 최소 길이', min: 150, max: 500, step: 10 },
      { k: 'platMax', n: '발판 최대 길이', min: 300, max: 900, step: 10 },
      { k: 'crashBack', n: '충돌 후퇴', min: 0, max: 300, step: 10 },
      { k: 'lives', n: '목숨', min: 1, max: 9, step: 1 },
      { k: 'ramp', n: '가속', min: 0, max: 0.12, step: 0.005 },
      { k: 'doubleJump', n: '더블 점프', type: 'bool' },
    ],
    // 구멍 폭과 단차는 점프 성능에서 나온다. 손으로 속도를 바꾸면 여기서 다시 계산해야 못 넘는 맵이 안 나온다.
    derive(p) {
      const airTime = 2 * p.jump / p.gravity;
      const reach = p.runSpeed * airTime;
      const rise = p.jump * p.jump / (2 * p.gravity);
      p.gapMin = Math.round(reach * 0.25);
      p.gapMax = Math.round(reach * 0.6);
      p.stepY = Math.round(Math.min(p.stepY ?? 100, rise * 0.7));
      if (p.platMax < p.platMin + 60) p.platMax = p.platMin + 60;
    },
    est(p) {
      const T = p.timeLimit || 45;
      return Math.round(T * p.runSpeed * p.scoreRate * 0.55);
    },
    howto(p) {
      const a = ['점프: Space / W' + (p.doubleJump ? ' (더블 점프)' : ''), '슬라이드: S'];
      return a.join('   ·   ') + '   ·   전진은 자동';
    },
    mech(p) {
      const s = ['자동 전진 사이드스크롤', '구멍·장애물·낮은 천장'];
      if (p.doubleJump) s.push('더블 점프');
      if (p.gapRate > 0.6) s.push('구멍 많음');
      if (p.runSpeed > 470) s.push('고속');
      return s;
    },
  },

  // ---------- 3D 터널 ----------
  tunnel3d: {
    ko: '3D 터널',
    params(rnd) {
      const shoot = rnd.chance(0.5);
      return {
        ...common(rnd),
        tunnelSpeed: rnd.range(900, 1800),
        focal: rnd.range(380, 620),
        zFar: rnd.range(3000, 5200),
        tunnelR: rnd.range(160, 235),
        rotSpeed: +rnd.float(2.4, 4.6).toFixed(2),
        gapWidth: +rnd.float(0.9, 1.9).toFixed(2),
        ringRate: +rnd.float(0.5, 1.4).toFixed(2),
        roll: +rnd.float(0.2, 0.9).toFixed(2),
        shoot, shotSpeed: rnd.range(2500, 4200),
        orbRate: +rnd.float(0.35, 1.0).toFixed(2),
        ringScore: rnd.range(60, 140),
        orbScore: rnd.range(40, 90),
        survivalScore: rnd.range(2, 8),
        lives: rnd.range(3, 5),
      };
    },
    knobs: [
      { k: 'tunnelSpeed', n: '전진 속도', min: 500, max: 2600, step: 25 },
      { k: 'ringRate', n: '링 빈도(초당)', min: 0.2, max: 2.5, step: 0.05 },
      { k: 'gapWidth', n: '틈 각도(rad)', min: 0.4, max: 2.6, step: 0.05 },
      { k: 'rotSpeed', n: '회전 속도', min: 1.2, max: 6, step: 0.1 },
      { k: 'roll', n: '관 흔들림', min: 0, max: 1.6, step: 0.05 },
      { k: 'tunnelR', n: '관 반지름', min: 110, max: 270, step: 5 },
      { k: 'focal', n: '초점 거리', min: 250, max: 800, step: 10 },
      { k: 'zFar', n: '가시 거리', min: 2000, max: 7000, step: 100 },
      { k: 'orbRate', n: '오브 빈도', min: 0, max: 2, step: 0.05 },
      { k: 'ringScore', n: '링 통과 점수', min: 10, max: 300, step: 5 },
      { k: 'lives', n: '목숨', min: 1, max: 9, step: 1 },
      { k: 'ramp', n: '난이도 상승', min: 0, max: 0.12, step: 0.005 },
      { k: 'shoot', n: '발사 가능', type: 'bool' },
      { k: 'combo', n: '콤보 배수', type: 'bool' },
    ],
    est(p) {
      const T = p.timeLimit || 45;
      return Math.round(T * (p.ringRate * p.ringScore * 0.6 + p.orbRate * p.orbScore * 0.3 + p.survivalScore));
    },
    howto(p) {
      return '회전: A / D (또는 마우스)' + (p.shoot ? '   ·   발사: Space' : '');
    },
    mech(p) {
      const s = ['원근 투영 3D 터널', '링의 틈에 각도를 맞춰 통과'];
      if (p.shoot) s.push('전방 발사 가능');
      if (p.gapWidth < 1.2) s.push('틈이 좁음');
      if (p.tunnelSpeed > 1500) s.push('고속');
      return s;
    },
  },
  // ---------- 뱀 ----------
  snake: {
    ko: '뱀',
    params(rnd) {
      return {
        ...common(rnd),
        cell: rnd.pick([24, 30, 30, 40]),
        tickRate: +rnd.float(5, 13).toFixed(2),
        speedUp: +rnd.float(0, 0.03).toFixed(4),
        startLen: rnd.range(3, 6),
        growth: rnd.range(1, 4),
        wrap: rnd.chance(0.4),
        walls: rnd.chance(0.55) ? rnd.range(4, 40) : 0,
        foodScore: rnd.range(20, 80),
        foodSides: rnd.range(3, 8),
        survivalScore: rnd.chance(0.5) ? rnd.range(1, 6) : 0,
        lives: rnd.range(1, 4),
        timeLimit: rnd.chance(0.25) ? rnd.pick([60, 90]) : 0,
      };
    },
    howto() { return '이동: WASD / 방향키   ·   진행 방향으로 계속 나아간다'; },
    knobs: [
      { k: 'cell', n: '칸 크기', min: 16, max: 60, step: 2 },
      { k: 'tickRate', n: '초당 이동 칸', min: 2, max: 20, step: 0.5 },
      { k: 'speedUp', n: '먹을수록 가속', min: 0, max: 0.08, step: 0.002 },
      { k: 'startLen', n: '시작 길이', min: 2, max: 12, step: 1 },
      { k: 'growth', n: '먹을 때 성장', min: 1, max: 8, step: 1 },
      { k: 'walls', n: '장애물 수', min: 0, max: 80, step: 1 },
      { k: 'foodScore', n: '먹이 점수', min: 5, max: 200, step: 5 },
      { k: 'lives', n: '목숨', min: 1, max: 9, step: 1 },
      { k: 'timeLimit', n: '제한시간(0=무제한)', min: 0, max: 180, step: 5 },
      { k: 'wrap', n: '화면 순환', type: 'bool' },
      { k: 'combo', n: '콤보 배수', type: 'bool' },
    ],
    derive(p) {
      const cols = Math.floor(960 / p.cell), rows = Math.floor(600 / p.cell);
      p.startLen = Math.min(p.startLen, Math.max(2, cols - 4));       // 시작부터 벽에 박히지 않게
      p.walls = Math.min(p.walls, Math.floor(cols * rows * 0.15));    // 길이 막히지 않게
    },
    est(p) {
      const T = p.timeLimit || 45;
      return Math.round(T * (p.tickRate / 14 * p.foodScore + p.survivalScore));
    },
    mech(p) {
      const s = ['격자 위를 계속 전진', `초당 ${p.tickRate}칸`];
      if (p.wrap) s.push('화면 순환');
      if (p.walls) s.push(`장애물 ${p.walls}개`);
      if (p.speedUp > 0.012) s.push('먹을수록 빨라짐');
      return s;
    },
  },

  // ---------- 벽돌깨기 ----------
  breakout: {
    ko: '벽돌깨기',
    params(rnd) {
      return {
        ...common(rnd),
        paddleW: rnd.range(90, 200), paddleSpeed: rnd.range(400, 800),
        ballSpeed: rnd.range(260, 460), ballR: rnd.range(6, 10),
        rows: rnd.range(3, 7), cols: rnd.range(8, 14),
        maxHp: rnd.range(1, 3),
        gaps: rnd.chance(0.5) ? +rnd.float(0.05, 0.25).toFixed(2) : 0,
        spread: +rnd.float(0.9, 1.25).toFixed(2),
        brickScore: rnd.range(15, 60),
        waveScore: rnd.range(200, 600),
        waveSpeed: +rnd.float(0.06, 0.16).toFixed(3),
        survivalScore: rnd.chance(0.4) ? rnd.range(1, 4) : 0,
        lives: rnd.range(2, 5),
        timeLimit: rnd.chance(0.2) ? 90 : 0,
      };
    },
    howto() { return '패들: A / D 또는 마우스   ·   발사: Space / 클릭'; },
    knobs: [
      { k: 'paddleW', n: '패들 너비', min: 50, max: 300, step: 5 },
      { k: 'paddleSpeed', n: '패들 속도', min: 200, max: 1200, step: 20 },
      { k: 'ballSpeed', n: '공 속도', min: 150, max: 700, step: 10 },
      { k: 'ballR', n: '공 크기', min: 4, max: 16, step: 1 },
      { k: 'rows', n: '벽돌 줄', min: 1, max: 10, step: 1 },
      { k: 'cols', n: '벽돌 칸', min: 4, max: 20, step: 1 },
      { k: 'maxHp', n: '최대 내구도', min: 1, max: 6, step: 1 },
      { k: 'gaps', n: '빈칸 비율', min: 0, max: 0.5, step: 0.01 },
      { k: 'spread', n: '반사 각도폭', min: 0.4, max: 1.4, step: 0.05 },
      { k: 'waveSpeed', n: '판당 가속', min: 0, max: 0.3, step: 0.01 },
      { k: 'brickScore', n: '벽돌 점수', min: 5, max: 150, step: 5 },
      { k: 'lives', n: '목숨', min: 1, max: 9, step: 1 },
      { k: 'timeLimit', n: '제한시간(0=무제한)', min: 0, max: 180, step: 5 },
      { k: 'combo', n: '콤보 배수', type: 'bool' },
    ],
    derive(p) {
      p.rows = Math.max(1, Math.round(p.rows));
      p.cols = Math.max(4, Math.round(p.cols));
      if (p.gaps > 0.45) p.gaps = 0.45;              // 다 비면 깰 벽돌이 없다
      if (p.paddleW < p.ballR * 4) p.paddleW = p.ballR * 4;
    },
    est(p) {
      const T = p.timeLimit || 60;
      const perWave = p.rows * p.cols * (1 - p.gaps) * p.brickScore * ((1 + p.maxHp) / 2);
      return Math.round(perWave * 1.3 + p.waveScore + T * p.survivalScore);
    },
    mech(p) {
      const s = [`${p.rows}줄 × ${p.cols}칸`];
      if (p.maxHp > 1) s.push(`내구도 최대 ${p.maxHp}`);
      if (p.gaps) s.push('빈칸 있는 배치');
      s.push('판을 깰수록 빨라지고 패들이 좁아짐');
      return s;
    },
  },

  // ---------- 탄막 ----------
  danmaku: {
    ko: '탄막',
    params(rnd) {
      return {
        ...common(rnd),
        playerSpeed: rnd.range(200, 340), focusMul: +rnd.float(0.35, 0.55).toFixed(2),
        hitR: rnd.range(3, 5), grazeR: rnd.range(26, 48),
        bulletSpeed: rnd.range(90, 210), bulletR: rnd.range(4, 7), bulletMax: rnd.range(400, 800),
        foeRate: +rnd.float(0.2, 0.6).toFixed(2), foeMax: rnd.range(3, 7), foeHp: rnd.range(6, 24),
        emitEvery: +rnd.float(0.35, 1.1).toFixed(2),
        ringCount: rnd.range(6, 18), arms: rnd.range(2, 5),
        spin: +rnd.float(0.15, 0.5).toFixed(2), fan: +rnd.float(0.6, 1.6).toFixed(2),
        fireRate: +rnd.float(0.07, 0.14).toFixed(3), shotSpeed: rnd.range(700, 1000),
        foeScore: rnd.range(200, 600), grazeScore: rnd.range(8, 25),
        survivalScore: rnd.range(3, 10),
        lives: rnd.range(2, 5),
        timeLimit: rnd.chance(0.3) ? rnd.pick([60, 90]) : 0,
      };
    },
    howto() { return '이동: WASD / 방향키 / 드래그   ·   Shift: 집중(저속·판정점 표시)   ·   사격은 자동'; },
    knobs: [
      { k: 'playerSpeed', n: '이동 속도', min: 120, max: 500, step: 10 },
      { k: 'focusMul', n: '집중 시 배율', min: 0.2, max: 0.9, step: 0.05 },
      { k: 'hitR', n: '판정점 크기', min: 1, max: 12, step: 1 },
      { k: 'grazeR', n: '스치기 반경', min: 10, max: 80, step: 2 },
      { k: 'bulletSpeed', n: '탄 속도', min: 40, max: 400, step: 5 },
      { k: 'bulletR', n: '탄 크기', min: 2, max: 14, step: 1 },
      { k: 'emitEvery', n: '발사 간격', min: 0.15, max: 2, step: 0.05 },
      { k: 'ringCount', n: '한 번에 쏘는 수', min: 3, max: 36, step: 1 },
      { k: 'spin', n: '패턴 회전', min: 0, max: 1.2, step: 0.05 },
      { k: 'foeRate', n: '적 등장', min: 0.05, max: 1.5, step: 0.05 },
      { k: 'foeMax', n: '동시 적 수', min: 1, max: 12, step: 1 },
      { k: 'foeHp', n: '적 체력', min: 2, max: 60, step: 1 },
      { k: 'grazeScore', n: '스치기 점수', min: 0, max: 80, step: 1 },
      { k: 'lives', n: '목숨', min: 1, max: 9, step: 1 },
      { k: 'timeLimit', n: '제한시간(0=무제한)', min: 0, max: 180, step: 5 },
      { k: 'combo', n: '콤보 배수', type: 'bool' },
    ],
    derive(p) {
      if (p.grazeR < p.hitR + 12) p.grazeR = p.hitR + 12;   // 스치기가 판정점보다 좁으면 의미가 없다
      p.bulletMax = Math.max(200, Math.min(1200, p.bulletMax));
      p.ringCount = Math.max(2, Math.round(p.ringCount));
    },
    est(p) {
      const T = p.timeLimit || 45;
      return Math.round(T * (p.foeRate * p.foeScore * 0.5 + p.grazeScore * 2.5 + p.survivalScore));
    },
    mech(p) {
      const s = ['작은 판정점 + 화면을 덮는 탄', '링·나선·조준·부채 4패턴'];
      s.push(`스치면 +${p.grazeScore}`);
      if (p.bulletSpeed < 130) s.push('저속 고밀도');
      if (p.emitEvery < 0.5) s.push('연발');
      return s;
    },
  },

  // ---------- 방치형 ----------
  idle: {
    ko: '방치형',
    params(rnd) {
      return {
        ...common(rnd),
        clickBase: +rnd.float(1, 5).toFixed(2),
        clickStep: +rnd.float(1.6, 2.4).toFixed(2),
        clickCost0: rnd.range(15, 40),
        cost0: rnd.range(10, 30),
        costMul: +rnd.float(1.14, 1.32).toFixed(3),
        rate0: +rnd.float(0.4, 1.2).toFixed(2),
        rateMul: +rnd.float(5, 9).toFixed(2),
        lives: 1,
        combo: false,
        timeLimit: rnd.pick([90, 120, 180]),
        timeUpMsg: '정산',
      };
    },
    howto() { return '채집: Space / 클릭   ·   구매: 1 2 3 (생산기) · 4 (채집 강화)'; },
    knobs: [
      { k: 'clickBase', n: '기본 채집량', min: 0.5, max: 20, step: 0.5 },
      { k: 'clickStep', n: '채집 강화 배수', min: 1.1, max: 4, step: 0.1 },
      { k: 'clickCost0', n: '채집 강화 기본가', min: 5, max: 200, step: 5 },
      { k: 'cost0', n: '생산기 기본가', min: 5, max: 200, step: 5 },
      { k: 'costMul', n: '가격 상승률', min: 1.05, max: 1.6, step: 0.01 },
      { k: 'rate0', n: '1단 생산량', min: 0.1, max: 5, step: 0.1 },
      { k: 'rateMul', n: '단계별 배수', min: 2, max: 20, step: 0.5 },
      { k: 'timeLimit', n: '한 판 길이(초)', min: 30, max: 300, step: 10 },
    ],
    derive(p) {
      p.lives = 1;                                   // 죽는 개념이 없다
      if (p.costMul <= 1.01) p.costMul = 1.05;       // 가격이 안 오르면 게임이 아니다
      if (!p.timeLimit) p.timeLimit = 120;           // 끝나야 점수가 확정된다
      p.timeUpMsg = '정산';
    },
    // 헤드리스 봇(초당 4회 채집 + 2초마다 구매)으로 8판 재서 맞춘 계수.
    // 복리라 편차가 커서(실측 대비 0.7~6배) 정확한 값은 못 낸다 — 아케이드 목표는 넉넉한 쪽으로 잡는다.
    est(p) {
      return Math.round(p.timeLimit * p.timeLimit * p.rate0 * 0.5 + p.clickBase * p.timeLimit * 14);
    },
    mech(p) {
      return ['눌러 모으고 생산기를 사서 자동화', `생산기 3종 · 가격 상승률 ${p.costMul}`, `${p.timeLimit}초 안에 총생산량 겨루기`];
    },
  },

};

export const FAMILY_KEYS = Object.keys(FAMILIES);
