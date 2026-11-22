#!/usr/bin/env bash
# Build dist/StorePOS.apk from the bundled web app (no Gradle required).
#
# Requirements: JDK 17+, Android SDK build-tools 34 + platform 34.
#   ANDROID_SDK_ROOT   default $HOME/android-sdk
#   JAVA_HOME          default $HOME/tools/jdk
#
# Signing: a self-signed key is created once at ~/.storepos/storepos.keystore.
# Override with STOREPOS_KEYSTORE / STOREPOS_STOREPASS / STOREPOS_ALIAS.
# Sideloading works with this key; upload to Play with your own upload key.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK_ROOT:-$HOME/android-sdk}"
JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk}"
BUILD_TOOLS="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
export PATH="$JAVA_HOME/bin:$PATH"

for f in "$BUILD_TOOLS/aapt2" "$BUILD_TOOLS/d8" "$BUILD_TOOLS/zipalign" "$BUILD_TOOLS/apksigner" "$PLATFORM"; do
  if [ ! -e "$f" ]; then
    echo "Missing: $f" >&2
    echo "Install with: sdkmanager 'platforms;android-34' 'build-tools;34.0.0'" >&2
    exit 1
  fi
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
OUT="$ROOT/dist"
mkdir -p "$OUT"

echo "== 1/7  bundle web app =="
rm -rf "$ROOT/android/assets"
mkdir -p "$ROOT/android/assets/www"
cp -R "$ROOT/www/." "$ROOT/android/assets/www/"
find "$ROOT/android/assets/www" -name '.DS_Store' -delete
echo "   $(find "$ROOT/android/assets/www" -type f | wc -l) files"

echo "== 2/7  compile resources =="
"$BUILD_TOOLS/aapt2" compile --dir "$ROOT/android/res" -o "$WORK/res.zip"

echo "== 3/7  link manifest, assets, resources =="
"$BUILD_TOOLS/aapt2" link \
  -o "$WORK/base.apk" \
  -I "$PLATFORM" \
  --manifest "$ROOT/android/AndroidManifest.xml" \
  -R "$WORK/res.zip" \
  -A "$ROOT/android/assets" \
  --java "$WORK/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --auto-add-overlay

echo "== 4/7  compile java =="
find "$ROOT/android/src" "$WORK/gen" -name '*.java' > "$WORK/sources.txt"
mkdir -p "$WORK/classes"
javac -source 8 -target 8 -nowarn -classpath "$PLATFORM" -d "$WORK/classes" @"$WORK/sources.txt"

echo "== 5/7  dex =="
find "$WORK/classes" -name '*.class' > "$WORK/classes.txt"
mkdir -p "$WORK/dex"
"$BUILD_TOOLS/d8" --release --min-api 24 --lib "$PLATFORM" --output "$WORK/dex" @"$WORK/classes.txt"
(cd "$WORK/dex" && zip -q "$WORK/base.apk" classes.dex)

echo "== 6/7  align =="
"$BUILD_TOOLS/zipalign" -f -p 4 "$WORK/base.apk" "$WORK/aligned.apk"

echo "== 7/7  sign =="
KEYSTORE="${STOREPOS_KEYSTORE:-$HOME/.storepos/storepos.keystore}"
STOREPASS="${STOREPOS_STOREPASS:-storepos-local-key}"
ALIAS="${STOREPOS_ALIAS:-storepos}"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$STOREPASS" -keypass "$STOREPASS" \
    -dname "CN=Store POS, OU=Retail, O=Store POS, L=Manila, ST=Metro Manila, C=PH" >/dev/null 2>&1
  echo "   created signing key: $KEYSTORE"
fi

"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" --ks-key-alias "$ALIAS" \
  --ks-pass "pass:$STOREPASS" --key-pass "pass:$STOREPASS" \
  --out "$OUT/StorePOS.apk" "$WORK/aligned.apk"

"$BUILD_TOOLS/apksigner" verify --print-certs "$OUT/StorePOS.apk" | head -4
echo
echo "APK: $OUT/StorePOS.apk ($(du -h "$OUT/StorePOS.apk" | cut -f1))"

echo "== web bundle =="
rm -f "$OUT/store-pos-web.zip"
(cd "$ROOT/www" && zip -qr "$OUT/store-pos-web.zip" .)
echo "WEB: $OUT/store-pos-web.zip ($(du -h "$OUT/store-pos-web.zip" | cut -f1))"

echo "== single-file html =="
python3 "$ROOT/scripts/build-html.py"
