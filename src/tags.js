// AI 제작기용 태그 체계. 이 조합이 프롬프트가 되고, AI가 게임 코드를 통째로 쓴다.
// (파라미터 공장과는 별개 갈래 — 여기선 엔진이 없고 매번 새 코드가 나온다)
export const TAG_GROUPS = [
  {
    key: 'dim', name: '차원', pick: 1, req: true,
    tags: ['2D', '의사 3D(원근 투영)', '아이소메트릭(쿼터뷰)', '와이어프레임 3D'],
  },
  {
    key: 'genre', name: '장르', pick: 2, req: true,
    tags: ['액션', '퍼즐', '슈팅', '리듬', '레이싱', '플랫포머', '전략', '타워 디펜스',
      '방치형', '서바이벌', '수집', '스텔스', '낙하물 회피', '두뇌·기억력'],
  },
  {
    key: 'view', name: '시점', pick: 1,
    tags: ['탑뷰', '사이드뷰', '고정 화면', '스크롤', '1인칭 느낌'],
  },
  {
    key: 'theme', name: '소재', pick: 2,
    tags: ['우주', '심해', '사이버펑크', '동양풍', '뱀파이어', '밀리터리', '힐링',
      '재난', '폐허', '선협', '거대로봇', '고전 오락실', '생체', '공장'],
  },
  {
    key: 'run', name: '진행', pick: 2,
    tags: ['끝없는', '시간 제한', '하드코어(목숨 1)', '웨이브', '스테이지', '로그라이트', '보스전'],
  },
  {
    key: 'control', name: '조작', pick: 1,
    tags: ['키보드 방향키', 'WASD + 마우스', '마우스만', '한 버튼', '두 버튼'],
  },
  {
    key: 'spice', name: '맛', pick: 3,
    tags: ['콤보 배수', '파워업', '중력 반전', '물리 반동', '절차 생성 맵', '화면 흔들림',
      '슬로우 모션', '연쇄 폭발', '시야 제한', '리소스 관리'],
  },
];

// 자유 조합이라 서로 안 맞는 짝이 나온다. 프롬프트에 넣기 전에 걸러낸다.
export const CONFLICTS = [
  [['마우스만'], ['키보드 방향키', 'WASD + 마우스']],
  [['한 버튼'], ['WASD + 마우스', '키보드 방향키']],
  [['방치형'], ['액션', '슈팅', '리듬', '레이싱', '플랫포머']],
  [['하드코어(목숨 1)'], ['방치형']],
];

export function conflictsIn(tags) {
  const set = new Set(tags), bad = [];
  for (const [a, b] of CONFLICTS) {
    const ha = a.find((x) => set.has(x)), hb = b.find((x) => set.has(x));
    if (ha && hb) bad.push(`${ha} + ${hb}`);
  }
  return bad;
}

// 이미 고른 것은 두고 비어 있는 그룹만 랜덤으로 채운다. 그룹 정원과 충돌 규칙을 지킨다.
export function fillRandom(picked, rndFn = Math.random) {
  const out = [...new Set(picked)];
  for (const g of TAG_GROUPS) {
    const have = g.tags.filter((t) => out.includes(t));
    if (have.length) continue;                    // 이 그룹은 이미 골랐다
    if (!g.req && rndFn() < 0.3) continue;
    const pool = g.tags.filter((t) => !conflictsIn([...out, t]).length);
    if (!pool.length) continue;
    const n = 1 + Math.floor(rndFn() * Math.min(g.pick, pool.length));
    for (let i = 0; i < n && pool.length; i++) {
      const t = pool.splice(Math.floor(rndFn() * pool.length), 1)[0];
      if (!conflictsIn([...out, t]).length) out.push(t);
    }
  }
  return out;
}

export function randomTags(rndFn = Math.random) {
  const out = [];
  for (const g of TAG_GROUPS) {
    if (!g.req && rndFn() < 0.25) continue;
    const pool = g.tags.slice();
    const n = 1 + Math.floor(rndFn() * g.pick);
    for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rndFn() * pool.length), 1)[0]);
  }
  return conflictsIn(out).length ? randomTags(rndFn) : out;
}

export const SYSTEM_PROMPT = `너는 아케이드 게임을 단일 HTML 파일 하나로 만드는 개발자다.
주어진 태그를 전부 만족하는, 실제로 플레이 가능한 게임을 만든다.

반드시 지킬 것:
1. 출력은 \`\`\`html 코드블록 하나뿐. 설명·주석성 서문 금지.
2. 외부 리소스 완전 금지 — CDN, <img>, 폰트, fetch, import, 워커 전부 안 된다. 파일 하나로 완결.
3. <canvas> 하나에 전부 그린다. 내부 좌표계는 960x600 고정, 창 크기에 letterbox로 맞춘다.
4. requestAnimationFrame 루프. 이동·타이머는 전부 dt(초) 기반이라 프레임레이트가 달라도 속도가 같아야 한다.
5. 상태 3개: 타이틀 / 플레이 / 게임오버. 게임오버에서 아무 키나 누르면 재시작.
6. 점수와 최고점수(localStorage)를 HUD에 표시.
7. 조작은 키보드와 마우스 둘 다 받는다. 타이틀 화면에 조작법을 한국어로 적는다.
8. 제목과 모든 UI 문구는 한국어. 그림은 도형·선·색으로만 (이미지 없음).
9. 예외가 나면 안 된다. 빈 배열 접근, 0 나누기, undefined 참조를 특히 조심할 것.
10. 반드시 끝이 있어야 한다 — 죽거나 시간이 다 되면 게임오버로 간다.
11. 게임은 로드 직후부터 캔버스에 뭔가 그려야 한다(타이틀 화면).

12. 파일 전체를 250줄 안에 끝내라. 길게 쓰면 응답이 중간에 잘려서 아예 못 쓴다.
    주석·빈 줄·긴 변수명을 줄이고, 기능을 욕심내지 마라.

코드는 짧고 확실하게. 못 돌아가는 화려한 코드보다 돌아가는 단순한 코드가 낫다.`;
