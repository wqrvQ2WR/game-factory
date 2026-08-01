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
node factory.js 1 --open     # 만들고 바로 열기
node factory.js --selftest   # 자체 점검
```

옵션: `--model auto/coding` (기본 `auto/fast`), `--delay 2` (초), `--open`

## 결과물

- `out/*.html` — 게임 하나당 파일 하나 (약 20KB, 오프라인 동작, localStorage에 최고점수)
- `out/index.html` — 지금까지 만든 전부를 보여주는 갤러리
- `out/games.json` — 생산 대장

## 구조

| 파일 | 역할 |
|---|---|
| `factory.js` | 파라미터 생성 · LLM 컨셉 · HTML 빌드 · 갤러리 · CLI |
| `runtime.js` | 모든 게임에 그대로 박히는 엔진. `CFG`만 바뀌면 다른 게임이 된다 |
| `src/rng.js` | 시드 기반 결정론적 난수 |
| `src/palette.js` | HSL 조화 규칙으로 팔레트 생성 |
| `src/naming.js` | LLM 없을 때 쓰는 컨셉 워드뱅크 |
| `src/llm.js` | omniroute (OpenAI 호환) 클라이언트 |

## 변주의 근원

엔진은 하나지만 파라미터 공간이 게임을 가른다.

- **적 행동** `chase`(추격) / `drift`(직선 반사) / `rain`(낙하) / `orbit`(중앙 회전)
- **중력** 있으면 점프 액션, 없으면 탑다운
- **화면 경계** `wrap`(순환) / `bounce`(튕김) / `wall`(벽)
- **플레이어 발사** 유무 · 연사속도 · 탄속 · 적 체력
- **수집품** 스폰율 · 점수 · 자석 반경
- **변형** 무대 축소, 시야 제한, 시간 제한, 콤보 배수, 난이도 상승률
- **연출** 팔레트 5색 · 도형 변 개수 · 효과음 피치벤드

## AI 레이어 (omniroute)

`http://127.0.0.1:20128/v1` 의 OpenAI 호환 엔드포인트로 붙는다.
LLM은 **기계적 규칙을 먼저 읽고** 거기에 맞는 제목·색·난이도 보정을 JSON으로 낸다
(예: "중력 있음 + 직선 반사 적 + 발사 가능" → `용암파편 / Volcanic Shard Blast`).
서버가 꺼져 있거나 응답이 깨지면 자동으로 절차적 생성으로 떨어진다 — 공장은 멈추지 않는다.

환경변수: `OMNIROUTE_BASE_URL`, `OMNIROUTE_MODEL`, `OMNIROUTE_API_KEY`

LLM이 준 `tweaks`는 그대로 믿지 않고 전부 클램프한다 (`enemyRate` 0.2~4, `lives` 1~5 등).

## 자체 점검

`node factory.js --selftest` 은 가짜 캔버스 위에서 런타임을 실제로 40초 돌린다.
스폰 → 추격 → 충돌 → 사망 → 점수 기록까지 이어지지 않으면 실패한다.
파라미터 300개 시드도 함께 검사한다 (점수 획득 경로 존재, 중력+화면순환 금지, orbit+수집품 등).
