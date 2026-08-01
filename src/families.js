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
};

export const FAMILY_KEYS = Object.keys(FAMILIES);
