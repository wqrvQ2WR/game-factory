// LLM 없이 돌릴 때 쓰는 절차적 컨셉 워드뱅크.
// 조합 수만 수십만 단위라 폴백만으로도 계속 다른 게임이 나온다.

export const THEMES = [
  { key: 'neon', ko: '네온', words: ['네온', '홀로', '픽셀', '글리치', '사이버', '전류'], en: ['Neon', 'Glitch', 'Circuit', 'Vapor'], hue: 300 },
  { key: 'deep', ko: '심해', words: ['심해', '해구', '수압', '기포', '산호', '고래'], en: ['Abyss', 'Trench', 'Kelp', 'Tide'], hue: 200 },
  { key: 'space', ko: '우주', words: ['궤도', '성운', '중력', '위성', '블랙홀', '항성'], en: ['Orbit', 'Nebula', 'Pulsar', 'Void'], hue: 250 },
  { key: 'desert', ko: '사막', words: ['모래', '신기루', '오아시스', '폭풍', '유적', '태양'], en: ['Dune', 'Mirage', 'Ember', 'Sirocco'], hue: 35 },
  { key: 'forest', ko: '숲', words: ['포자', '이끼', '버섯', '수액', '뿌리', '안개'], en: ['Spore', 'Moss', 'Fungal', 'Bloom'], hue: 130 },
  { key: 'ice', ko: '빙하', words: ['빙하', '서리', '결정', '한파', '눈보라', '유빙'], en: ['Frost', 'Glacier', 'Rime', 'Shiver'], hue: 190 },
  { key: 'ruin', ko: '폐허', words: ['폐허', '잔해', '녹슨', '고철', '먼지', '경보'], en: ['Rust', 'Debris', 'Husk', 'Fallout'], hue: 20 },
  { key: 'dream', ko: '꿈', words: ['꿈결', '잔상', '몽상', '흐릿한', '기억', '메아리'], en: ['Reverie', 'Echo', 'Lucid', 'Drift'], hue: 280 },
  { key: 'volcano', ko: '화산', words: ['용암', '화산재', '균열', '마그마', '분화', '불씨'], en: ['Magma', 'Cinder', 'Rift', 'Pyro'], hue: 12 },
  { key: 'machine', ko: '기계', words: ['톱니', '증기', '태엽', '용광로', '배관', '과부하'], en: ['Cogwork', 'Steam', 'Boiler', 'Overload'], hue: 45 },
  { key: 'storm', ko: '폭풍', words: ['번개', '뇌운', '정전기', '태풍', '방전', '천둥'], en: ['Volt', 'Tempest', 'Static', 'Surge'], hue: 220 },
  { key: 'bio', ko: '생체', words: ['세포', '점액', '변이', '촉수', '증식', '항체'], en: ['Cell', 'Mutant', 'Slime', 'Vector'], hue: 100 },
  // 아래는 '소재별 장르'를 테마로 흡수한 것들 — 규칙이 아니라 배경/분위기를 가른다
  { key: 'military', ko: '밀리터리', words: ['참호', '보급', '포탄', '전선', '위장', '작전'], en: ['Trench', 'Recon', 'Salvo', 'Frontline'], hue: 90 },
  { key: 'vampire', ko: '뱀파이어', words: ['혈족', '관', '박쥐', '초대', '갈증', '성혈'], en: ['Sanguine', 'Crypt', 'Thirst', 'Nocturne'], hue: 350 },
  { key: 'xianxia', ko: '선협', words: ['단전', '검기', '연단', '천겁', '내공', '선인'], en: ['Cultivation', 'Qi', 'Ascension', 'Immortal'], hue: 165 },
  { key: 'oriental', ko: '동양풍', words: ['묵향', '단청', '기와', '부적', '풍경', '구미호'], en: ['Ink', 'Lantern', 'Talisman', 'Ninetails'], hue: 15 },
  { key: 'history', ko: '역사', words: ['연대', '왕조', '유물', '비문', '기록', '고분'], en: ['Dynasty', 'Relic', 'Chronicle', 'Epitaph'], hue: 40 },
  { key: 'disaster', ko: '재난', words: ['경보', '붕괴', '해일', '진앙', '대피', '여진'], en: ['Aftershock', 'Collapse', 'Siren', 'Evacuate'], hue: 25 },
  { key: 'hero', ko: '슈퍼히어로', words: ['망토', '초능', '각성', '시민', '숙적', '섬광'], en: ['Cape', 'Awaken', 'Nemesis', 'Beacon'], hue: 215 },
  { key: 'healing', ko: '힐링', words: ['햇살', '온실', '뜨개', '수프', '오후', '숨결'], en: ['Sunlit', 'Cozy', 'Simmer', 'Breeze'], hue: 55 },
  { key: 'aviation', ko: '항공', words: ['활주로', '고도', '실속', '난기류', '편대', '관제'], en: ['Runway', 'Altitude', 'Squadron', 'Vector'], hue: 205 },
  { key: 'crime', ko: '수사', words: ['단서', '알리바이', '증거', '심문', '미제', '잠복'], en: ['Alibi', 'Evidence', 'Coldcase', 'Stakeout'], hue: 240 },
  { key: 'mecha', ko: '거대로봇', words: ['격납고', '출격', '장갑', '관절', '동력로', '탑승'], en: ['Hangar', 'Sortie', 'Armature', 'Reactor'], hue: 195 },
  { key: 'survival', ko: '서바이벌', words: ['배급', '체온', '모닥불', '식수', '은신', '겨울나기'], en: ['Ration', 'Shelter', 'Frostbite', 'Forage'], hue: 75 },
  { key: 'retro', ko: '고전', words: ['오락실', '동전', '스캔라인', '카트리지', '8비트', '하이스코어'], en: ['Arcade', 'Coin-Op', 'Scanline', 'Highscore'], hue: 310 },
  { key: 'factory', ko: '공장', words: ['컨베이어', '적재', '수율', '라인', '가동률', '생산량'], en: ['Conveyor', 'Throughput', 'Assembly', 'Yield'], hue: 50 },
];

export const NOUNS_KO = ['소용돌이', '프로토콜', '표류기', '광시곡', '주기', '연대기', '실험', '역설', '난기류', '수집가', '심판', '유령', '기하학', '전조', '대탈출', '기관', '회로', '방주', '균열', '심장'];
export const ADJ_KO = ['끝없는', '무너지는', '깨어진', '뒤틀린', '고요한', '굶주린', '잊혀진', '가속하는', '마지막', '역행하는', '불안정한', '눈부신'];

export const NOUNS_EN = ['Vortex', 'Protocol', 'Drifter', 'Rhapsody', 'Cycle', 'Chronicle', 'Paradox', 'Turbulence', 'Collector', 'Verdict', 'Geometry', 'Omen', 'Exodus', 'Engine', 'Ark', 'Fracture'];
export const ADJ_EN = ['Endless', 'Collapsing', 'Broken', 'Twisted', 'Silent', 'Starving', 'Forgotten', 'Accelerating', 'Final', 'Unstable', 'Blinding'];

export const TAGLINES_KO = [
  '한 번의 실수면 끝난다.',
  '멈추는 순간 삼켜진다.',
  '점수는 오래 버틴 자의 몫.',
  '규칙은 단순하다. 살아남아라.',
  '빨라지는 건 너뿐이 아니다.',
  '조금만 더, 라는 생각이 늘 문제였다.',
  '피할 수 없다면 정확해져라.',
  '숫자가 올라갈수록 손이 떨린다.',
];

export function proceduralConcept(rnd, genre, mutators) {
  const theme = rnd.pick(THEMES);
  const koTitle = rnd.chance(0.55)
    ? `${rnd.pick(ADJ_KO)} ${rnd.pick(theme.words)}`
    : `${rnd.pick(theme.words)}의 ${rnd.pick(NOUNS_KO)}`;
  const enTitle = `${rnd.pick(ADJ_EN)} ${rnd.pick(theme.en)} ${rnd.pick(NOUNS_EN)}`.replace(/\s+/g, ' ');
  return {
    title: koTitle,
    subtitle: enTitle,
    tagline: rnd.pick(TAGLINES_KO),
    theme: theme.key,
    themeKo: theme.ko,
    hue: theme.hue + rnd.range(-25, 25),
    playerName: rnd.pick(theme.words),
    enemyName: rnd.pick(theme.words),
    pickupName: rnd.pick(theme.words),
    source: 'procedural',
    genre,
    mutators,
  };
}
