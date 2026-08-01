# 게임 공장 (game-factory)

플레이 가능한 HTML5 게임을 무한히 찍어내는 프로그램.
절차적 파라미터가 게임의 뼈대를 만들고, omniroute를 통한 LLM이 컨셉(제목·부제·카피·색)과 난이도를 씌운다.
결과물은 **의존성 없는 단일 .html 파일** — 더블클릭하면 바로 플레이된다.

```bash
node factory.js              # 1개
node factory.js 50           # 50개
node factory.js --forever    # Ctrl+C 칠 때까지 무한
node factory.js --no-ai      # LLM 없이 절차적으로만
node factory.js --seed kazomi-4821   # 같은 시드 = 완전히 같은 게임
node factory.js 10 --family racing   # 장르 고정 (arena|rhythm|racing|parkour|tunnel3d)
node factory.js 1 --open     # 만들고 바로 열기
node factory.js --selftest   # 자체 점검
```

옵션: `--model auto/coding` (기본 `auto/fast`), `--family`, `--delay 2` (초), `--open`

## 결과물

- `out/*.html` — 게임 하나당 파일 하나 (약 20KB, 오프라인 동작, localStorage에 최고점수)
- `out/index.html` — 지금까지 만든 전부를 보여주는 갤러리
- `out/games.json` — 생산 대장

## 구조

| 파일 | 역할 |
|---|---|
| `factory.js` | LLM 컨셉 · HTML 빌드 · 갤러리 · CLI · 자체 점검 |
| `src/families.js` | 장르 계열별 파라미터 생성기 |
| `runtimes/shell.js` | 모든 장르 공용: 캔버스·입력·루프·점수·이펙트·타이틀/게임오버 |
| `runtimes/<장르>.js` | 장르 하나당 파일 하나. `GAME = { reset, update, draw }` 만 정의 |
| `src/rng.js` | 시드 기반 결정론적 난수 |
| `src/palette.js` | HSL 조화 규칙으로 팔레트 생성 |
| `src/naming.js` | LLM 없을 때 쓰는 컨셉 워드뱅크 |
| `src/llm.js` | omniroute (OpenAI 호환) 클라이언트 |

## 장르 5계열

`--family <이름>` 으로 고정할 수 있다. 지정 안 하면 시드가 고른다.

| 계열 | 무엇 | 주요 파라미터 |
|---|---|---|
| `arena` | 탑다운 회피·수집·슈팅·경쟁 | 적 행동 4종, 중력, 발사, 경계 규칙, 라이벌 AI |
| `rhythm` | 4~6레인 리듬 | BPM, 분할, 밀도, 노트 속도, 판정폭, 동시치기 |
| `racing` | 의사 3D 도로 레이싱 | 곡률, 언덕, 최고속, 핸들링, 원심력, 상대 차 |
| `parkour` | 자동 전진 사이드스크롤 | 주행속도, 중력, 점프, 더블점프, 구멍·장애물 빈도 |
| `tunnel3d` | 원근 투영 3D 터널 | 터널 속도, 초점거리, 회전속도, 틈 각도, 링 빈도 |

계열 안에서 또 갈린다. 예를 들어 `arena` 는

- **적 행동** `chase`(추격) / `drift`(직선 반사) / `rain`(낙하) / `orbit`(중앙 회전)
- **중력** 있으면 점프 액션, 없으면 탑다운
- **화면 경계** `wrap`(순환) / `bounce`(튕김) / `wall`(벽)
- **경쟁** 수집품을 노리는 라이벌 AI (`rivalSkill` 로 실력 조절)
- **변형** 무대 축소, 시야 제한, 시간 제한, 콤보 배수, 자석
- **연출** 팔레트 5색 · 도형 변 개수 · 효과음 피치벤드

파라미터끼리 모순되는 조합은 생성 단계에서 막는다: 중력+화면순환(바닥이 사라짐),
orbit인데 수집품 없음(구석에서 무한 생존), 점프로 못 넘는 구멍 폭, PERFECT보다 좁은 GOOD 판정 등.

## AI 레이어 (omniroute)

`http://127.0.0.1:20128/v1` 의 OpenAI 호환 엔드포인트로 붙는다.
LLM은 **기계적 규칙을 먼저 읽고** 거기에 맞는 제목·색·난이도 보정을 JSON으로 낸다
(예: "중력 있음 + 직선 반사 적 + 발사 가능" → `용암파편 / Volcanic Shard Blast`).
서버가 꺼져 있거나 응답이 깨지면 자동으로 절차적 생성으로 떨어진다 — 공장은 멈추지 않는다.

환경변수: `OMNIROUTE_BASE_URL`, `OMNIROUTE_MODEL`, `OMNIROUTE_API_KEY`

LLM이 준 `tweaks`는 그대로 믿지 않는다. 화이트리스트에 있는 키만, 범위 안으로 클램프해서 받는다.
`runSpeed`·`maxSpeed` 처럼 다른 값이 파생되는 노브는 아예 화이트리스트에서 뺐다
(구멍 폭이 점프 거리에서 계산되므로 주행속도만 바뀌면 못 넘는 맵이 나온다).

## 자체 점검

`node factory.js --selftest` 은 **5개 계열 전부**를 가짜 캔버스 위에서 실제로 돌린다.
봇이 아무 키나 두드리는 동안 예외·NaN 없이 60초를 버텨야 하고,
`arena` 는 스폰 → 추격 → 충돌 → 사망 → 점수 기록까지 이어져야 한다.
계열별 파라미터 200개 시드와 LLM tweaks 클램프/필터도 함께 검사한다.

이 하네스로 잡은 실제 버그: `addScore` 가 매 프레임 반올림해서 초당 생존점수(프레임당 0.17)가
통째로 0이 되던 문제. 점수 반올림은 표시할 때만 한다.
