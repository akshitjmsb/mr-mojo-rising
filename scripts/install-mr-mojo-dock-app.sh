#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

START_SCRIPT="$PROJECT_DIR/scripts/start-mr-mojo.command"
APP_NAME="Mr. Mojo Rising"
APP_PATH_GLOBAL="/Applications/$APP_NAME.app"
APP_PATH_HOME="$HOME/Applications/$APP_NAME.app"
LEGACY_APP_PATH_GLOBAL="/Applications/MrMojoRising.app"
LEGACY_APP_PATH_HOME="$HOME/Applications/MrMojoRising.app"
LOG_FILE="$HOME/Library/Logs/MrMojoRising-launch.log"
ICON_SOURCE="$PROJECT_DIR/public/icon-512.png"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ -w /Applications ]; then
  APP_PATH="$APP_PATH_GLOBAL"
else
  APP_PATH="$APP_PATH_HOME"
  mkdir -p "$HOME/Applications"
fi

mkdir -p "$HOME/Library/Logs"

if [ ! -x "$START_SCRIPT" ]; then
  chmod +x "$START_SCRIPT"
fi

if [ ! -d "$PROJECT_DIR/.git" ]; then
  echo "Warning: project does not appear to be a git checkout. Continuing."
fi

if ! command -v osacompile >/dev/null 2>&1; then
  echo "Error: osacompile is required. Install Xcode command line tools."
  exit 1
fi

[ -d "$APP_PATH_GLOBAL" ] && rm -rf "$APP_PATH_GLOBAL"
[ -d "$APP_PATH_HOME" ] && rm -rf "$APP_PATH_HOME"
[ -d "$LEGACY_APP_PATH_GLOBAL" ] && rm -rf "$LEGACY_APP_PATH_GLOBAL"
[ -d "$LEGACY_APP_PATH_HOME" ] && rm -rf "$LEGACY_APP_PATH_HOME"

WRAPPER_APPSCRIPT="$TMP_DIR/launcher.applescript"
cat <<EOF > "$WRAPPER_APPSCRIPT"
on run
  tell application "Terminal"
    do script quoted form of "${START_SCRIPT}"
    activate
  end tell
end run
EOF

if ! osacompile -o "$APP_PATH" "$WRAPPER_APPSCRIPT"; then
  echo "Error: failed to build Dock app bundle."
  exit 1
fi

if [ -f "$ICON_SOURCE" ] && command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1 && command -v plutil >/dev/null 2>&1; then
  ICONSET_DIR="$TMP_DIR/icon.iconset"
  GENERATED_ICNS="$TMP_DIR/MrMojoRising.icns"
  mkdir -p "$ICONSET_DIR"

  sips -z 16 16 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
  sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
  sips -z 64 64 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
  sips -z 64 64 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_64x64.png" >/dev/null
  sips -z 128 128 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_64x64@2x.png" >/dev/null
  sips -z 128 128 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
  sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
  sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
  sips -z 1024 1024 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

  iconutil -c icns "$ICONSET_DIR" -o "$GENERATED_ICNS"
  cp "$GENERATED_ICNS" "$APP_PATH/Contents/Resources/AppIcon.icns"
  cp "$GENERATED_ICNS" "$APP_PATH/Contents/Resources/applet.icns"
  plutil -replace CFBundleIconFile -string AppIcon "$APP_PATH/Contents/Info.plist"
  plutil -replace CFBundleIconName -string AppIcon "$APP_PATH/Contents/Info.plist"
  plutil -replace CFBundleName -string "$APP_NAME" "$APP_PATH/Contents/Info.plist"
  plutil -replace CFBundleDisplayName -string "$APP_NAME" "$APP_PATH/Contents/Info.plist"
else
  echo "Warning: could not generate a custom icon; ensure sips, iconutil, and plutil are available."
fi

if [ "$APP_PATH" = "$APP_PATH_GLOBAL" ]; then
  mkdir -p "$HOME/Applications"
  ln -sfn "$APP_PATH" "$APP_PATH_HOME"
fi

touch "$APP_PATH"

if [ "$APP_PATH" = "$APP_PATH_HOME" ]; then
  LOCATION_MESSAGE="Saved in: $APP_PATH_HOME (Home Applications)."
else
  LOCATION_MESSAGE="Saved in: /Applications. Also available in: $APP_PATH_HOME."
fi

cat <<EOF

Done. App created at:
  $APP_PATH
$LOCATION_MESSAGE

Tip:
  Drag the app to your Dock to pin it.
  Your launcher writes logs to: $LOG_FILE
EOF
