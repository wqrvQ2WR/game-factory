#!/usr/bin/env bash
# 라즈베리파이 5에 게임 공장을 상주시킨다.
#  - 갤러리 서버 (8791) 를 systemd 유저 서비스로
#  - 공장을 계속 돌려 게임이 끝없이 늘어나게 (--keep 으로 디스크는 고정)
# 로그인 안 해도 돌게 lingering 을 켠다. sudo 는 lingering 한 줄에만 쓴다.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UNITS="$HOME/.config/systemd/user"
ENVFILE="$HOME/.config/game-factory.env"

KEEP="${KEEP:-300}"          # out/ 에 남길 게임 수
DELAY="${DELAY:-25}"         # 한 판 만들고 쉬는 초
PORT="${PORT:-8791}"

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

# AI 컨셉을 쓰려면 omniroute 주소를 적는다 (맥의 Tailscale 주소 등).
# 비워 두면 절차적 생성만 쓴다 — 파이 혼자서도 무한히 돌아간다.
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
# AI 서버가 없으면 factory 가 알아서 절차적 생성으로 떨어진다
ExecStart=$(command -v node) $REPO/factory.js --forever --arcade --delay $DELAY --keep $KEEP
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
  AI 제작기  http://${IP:-localhost}:$PORT/aimaker.html   (omniroute 주소를 넣어야 동작)

  상태   systemctl --user status game-factory-forever
  로그   journalctl --user -u game-factory-forever -f
  멈춤   systemctl --user stop game-factory-forever

  키오스크(부팅하면 아케이드 전체화면):  bash deploy/pi/kiosk.sh
  바깥에서 접속:  tailscale funnel $PORT
EOF
