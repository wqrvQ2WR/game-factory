#!/usr/bin/env bash
# 라즈베리파이 5에 게임 공장을 상주시킨다.
#  - 갤러리 서버 (8791) 를 systemd 유저 서비스로
#  - 공장을 계속 돌려 게임이 끝없이 늘어나게 (--keep 으로 디스크는 고정)
# 로그인 안 해도 돌게 lingering 을 켠다. sudo 는 lingering 한 줄에만 쓴다.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNITS="$HOME/.config/systemd/user"
ENVFILE="$HOME/.config/game-factory.env"

KEEP="${KEEP:-2000}"         # out/ 에 남길 게임 수 (2000개 ≈ 50MB)
DELAY="${DELAY:-25}"         # 한 판 만들고 쉬는 초
PORT="${PORT:-8791}"
USE_AI="${USE_AI:-0}"        # 1 이면 omniroute 로 컨셉을 받는다. 기본은 파이 혼자 도는 절차적 생성

echo "== 게임 공장 · 라즈베리파이 설치 =="
echo "   저장소 $REPO"

# ---- node 확인 ----
if ! command -v node >/dev/null 2>&1; then
  echo "✗ node 가 없습니다.  sudo apt install -y nodejs   (또는 nodesource 로 20.x)"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ node 18 이상이 필요합니다 (지금 $(node -v))."
  exit 1
fi
echo "✓ $(node -v) · $(uname -m)"

# ---- 환경 파일 ----
if [ ! -f "$ENVFILE" ]; then
  mkdir -p "$(dirname "$ENVFILE")"
  cat > "$ENVFILE" <<EOF
# 게임 공장 설정. 고치고 나면:  systemctl --user restart game-factory-forever
PORT=$PORT

# 기본은 파이 혼자 도는 절차적 생성이다. 바깥 서버를 전혀 안 탄다.
# AI 컨셉(제목·색)을 쓰고 싶을 때만 아래 둘을 켠다.
#   USE_AI=1 bash deploy/pi/setup.sh  로 다시 설치하고
#OMNIROUTE_BASE_URL=http://맥이름.tailnet.ts.net:20128/v1
EOF
  echo "✓ 설정 파일 만듦: $ENVFILE"
else
  echo "· 설정 파일 유지: $ENVFILE"
fi

# ---- 첫 밑천: 툴 페이지와 게임 몇 개 ----
cd "$REPO"
echo "== 첫 빌드 =="
node factory.js --maker      >/dev/null
node factory.js --aimaker    >/dev/null
node factory.js --showcase   >/dev/null
if [ ! -f out/arcade.html ]; then
  echo "   아케이드용 게임 12개 만드는 중 (절차적, AI 없이)…"
  node factory.js 12 --arcade --no-ai >/dev/null
fi
echo "✓ out/ 준비됨"

# ---- systemd 유저 서비스 ----
# 기본은 --no-ai: 바깥 서버를 안 타므로 맥이 꺼져 있어도, 인터넷이 없어도 계속 돈다.
if [ "$USE_AI" = "1" ]; then
  AI_FLAG=""
  echo "· AI 컨셉 사용 — $ENVFILE 의 OMNIROUTE_BASE_URL 이 살아 있어야 한다"
else
  AI_FLAG="--no-ai"
  echo "· 로컬 전용(절차적 생성) — 바깥 서버를 타지 않는다"
fi

mkdir -p "$UNITS"

cat > "$UNITS/game-factory-gallery.service" <<EOF
[Unit]
Description=게임 공장 갤러리 서버
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO
EnvironmentFile=-$ENVFILE
ExecStart=$(command -v node) $REPO/server/gallery.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

cat > "$UNITS/game-factory-forever.service" <<EOF
[Unit]
Description=게임 공장 — 무한 생성
After=game-factory-gallery.service

[Service]
Type=simple
WorkingDirectory=$REPO
EnvironmentFile=-$ENVFILE
ExecStart=$(command -v node) $REPO/factory.js --forever --arcade --delay $DELAY --keep $KEEP $AI_FLAG
Restart=always
RestartSec=10
Nice=10
CPUWeight=30

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now game-factory-gallery.service
systemctl --user enable --now game-factory-forever.service

# 로그인 없이도 계속 돌게
if ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q "Linger=yes"; then
  echo "· 로그인 안 해도 돌게 하려면:  sudo loginctl enable-linger $USER"
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

== 끝 ==
  갤러리     http://${IP:-localhost}:$PORT/
  아케이드   http://${IP:-localhost}:$PORT/arcade.html
  AI 제작기  http://${IP:-localhost}:$PORT/aimaker.html   (이건 omniroute 가 있어야 동작)

  지금 설정: 최신 ${KEEP}개 보존 · ${DELAY}초 간격 · $([ "$USE_AI" = "1" ] && echo 'AI 컨셉' || echo '로컬 절차적 생성')

  상태   systemctl --user status game-factory-forever
  로그   journalctl --user -u game-factory-forever -f
  멈춤   systemctl --user stop game-factory-forever

  키오스크(부팅하면 아케이드 전체화면):  bash deploy/pi/kiosk.sh
  바깥에서 접속:  tailscale funnel $PORT
EOF
