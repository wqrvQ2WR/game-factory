#!/usr/bin/env bash
# 부팅하면 아케이드가 전체화면으로 뜨게 한다. 데스크톱 세션(Pi OS Desktop)에서만 의미가 있다.
set -euo pipefail

PORT="${PORT:-8791}"
URL="${URL:-http://localhost:$PORT/arcade.html}"
AUTOSTART="$HOME/.config/autostart"

BROWSER=""
for b in chromium-browser chromium; do
  command -v "$b" >/dev/null 2>&1 && BROWSER="$b" && break
done
if [ -z "$BROWSER" ]; then
  echo "✗ chromium 이 없습니다.  sudo apt install -y chromium-browser"
  exit 1
fi

mkdir -p "$AUTOSTART"
cat > "$AUTOSTART/game-factory-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=게임 공장 아케이드
Comment=부팅 시 아케이드를 전체화면으로
Exec=$BROWSER --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required --start-fullscreen $URL
X-GNOME-Autostart-enabled=true
EOF

echo "✓ 자동 시작 등록: $AUTOSTART/game-factory-kiosk.desktop"
echo "   $BROWSER --kiosk $URL"
echo
echo "화면 꺼짐 방지는 raspi-config 에서: Display Options → Screen Blanking → No"
echo "지금 바로 띄워 보려면:  $BROWSER --kiosk $URL"
echo "해제하려면:  rm $AUTOSTART/game-factory-kiosk.desktop"
