#!/usr/bin/env bash
# Builds the Android release and publishes it for download.
#
#   ./scripts/publish-apk.sh
#
# Produces one APK, uploads it beside a manifest the app reads to decide whether an update
# exists, and leaves the previous build in place so a phone mid-download does not get a
# truncated file.
#
# Why a universal APK rather than the per-ABI splits: this is sideloaded from a web page, and
# a download page cannot know which architecture the visitor's phone is. The split builds are
# ~22 MB each against ~50 MB universal — worth it in the Play Store, wrong here, where the
# alternative is asking a user to know what "arm64-v8a" means.
set -euo pipefail

VPS="${LOCZ_VPS:-sreekara}"
REMOTE_DIR="/home/locz.in/public_html/download"
MOBILE_DIR="$(cd "$(dirname "$0")/../apps/mobile" && pwd)"

API_URL="${LOCZ_API_URL:-https://api.locz.in/api/v1}"
SITE_URL="${LOCZ_SITE_URL:-https://locz.in}"
# This is the WEB OAuth client id, deliberately. `google_sign_in` sends it as
# `serverClientId`, so Google mints an ID token whose audience is the same id the API
# verifies. The Android OAuth client is discovered from com.locz.app + the signing SHA-1
# and must never be passed here.
GOOGLE_CLIENT_ID="${LOCZ_GOOGLE_CLIENT_ID:-327351912011-9332b953dn137qsnukmgbrljj0g3u1t5.apps.googleusercontent.com}"

cd "$MOBILE_DIR"

# The version the app reports about itself comes from pubspec: `version: 1.2.0+7` means
# versionName 1.2.0 and versionCode 7. The manifest below must agree with it, so it is read
# from there rather than typed in twice.
VERSION_LINE="$(grep -E '^version:' pubspec.yaml | awk '{print $2}')"
VERSION_NAME="${VERSION_LINE%%+*}"
VERSION_CODE="${VERSION_LINE##*+}"

if [ "$VERSION_NAME" = "$VERSION_CODE" ]; then
  echo "pubspec version '$VERSION_LINE' has no build number." >&2
  echo "Use 'version: x.y.z+n' — the app compares n to decide whether an update exists." >&2
  exit 1
fi

echo "→ Building LocZ $VERSION_NAME (build $VERSION_CODE)"
flutter build apk --release \
  --dart-define=API_BASE_URL="$API_URL" \
  --dart-define=SITE_URL="$SITE_URL" \
  --dart-define=GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID"

APK="build/app/outputs/flutter-apk/app-release.apk"
[ -f "$APK" ] || { echo "Build produced no APK at $APK" >&2; exit 1; }

SIZE_BYTES="$(stat -c %s "$APK" 2>/dev/null || stat -f %z "$APK")"
SHA="$(sha256sum "$APK" | awk '{print $1}')"

echo "   ✓ $APK ($((SIZE_BYTES / 1048576)) MB)"
echo "   sha256 $SHA"

# Uploaded under a versioned name first, so a phone downloading the previous build is never
# reading a file that changes underneath it. The stable name is repointed afterwards.
VERSIONED="locz-$VERSION_NAME-$VERSION_CODE.apk"

echo "→ Uploading to $VPS:$REMOTE_DIR"
ssh "$VPS" "mkdir -p $REMOTE_DIR"
scp -q "$APK" "$VPS:$REMOTE_DIR/$VERSIONED"

# The manifest the app polls. `versionCode` is the only field it compares — names are for
# humans and sort unreliably ("1.10.0" is not less than "1.9.0" as a string).
ssh "$VPS" "cat > $REMOTE_DIR/latest.json" <<JSON
{
  "versionName": "$VERSION_NAME",
  "versionCode": $VERSION_CODE,
  "url": "$SITE_URL/download/$VERSIONED",
  "sizeBytes": $SIZE_BYTES,
  "sha256": "$SHA",
  "publishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

# A stable link for the website, repointed only once the versioned file is fully uploaded.
ssh "$VPS" "cd $REMOTE_DIR && ln -sfn $VERSIONED locz-latest.apk && chown -R locz:locz $REMOTE_DIR 2>/dev/null || true"

echo "   ✓ published"
echo
echo "Download : $SITE_URL/download/locz-latest.apk"
echo "Manifest : $SITE_URL/download/latest.json"
