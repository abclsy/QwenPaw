#!/bin/bash
# publish.sh — 一键打包 + 压缩 + 上传到 MinIO + 更新 manifest.json
#
# 用法:
#   ./publish.sh 1.1.6 "1. 修复钉钉文件发送\n2. 新增自动更新"
#
# 前提: 需要安装 mc (MinIO Client) 并配置好 alias

set -e

# ── 参数 ────────────────────────────────────────────────────────────────────
VERSION="${1:?Usage: ./publish.sh <version> [release_notes_zh]}"
RELEASE_NOTES_ZH="${2:-}"
RELEASE_NOTES_EN="${3:-$RELEASE_NOTES_ZH}"

# MinIO 配置
MC_ALIAS="minio"                          # mc alias 名称
BUCKET="ai-client-package"                # MinIO 桶名
MANIFEST_URL_BASE="https://io.crec.cn:30090/api/v1/buckets/$BUCKET/objects/download?prefix="

# 项目路径
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"

echo "================================================"
echo "  小铁智友 v$VERSION 发布脚本"
echo "================================================"

# ── Step 1: PyInstaller 打包 ────────────────────────────────────────────────
echo ""
echo "[1/5] Running PyInstaller..."
cd "$PROJECT_ROOT"
/opt/homebrew/bin/pyinstaller CrecPaw_desktop.spec --noconfirm --clean

# ── Step 2: 压缩 .app ────────────────────────────────────────────────────────
echo ""
echo "[2/5] Creating zip archive..."
PLATFORM=""
ZIP_NAME=""
if [[ "$(uname)" == "Darwin" ]]; then
    PLATFORM="darwin"
    ZIP_NAME="CrecPaw-$VERSION-mac.zip"
    cd "$DIST_DIR"
    zip -r -y "$ZIP_NAME" "小铁智友.app"
elif [[ "$(uname)" == MINGW* ]] || [[ "$(uname)" == MSYS* ]]; then
    PLATFORM="win32"
    ZIP_NAME="CrecPaw-$VERSION-win.zip"
    cd "$DIST_DIR"
    # Windows: 压缩 Xiaotiezhiyou 目录
    7z a -tzip "$ZIP_NAME" "Xiaotiezhiyou"
else
    echo "Unsupported platform: $(uname)"
    exit 1
fi

ZIP_PATH="$DIST_DIR/$ZIP_NAME"
echo "Created: $ZIP_PATH"

# ── Step 3: 计算 SHA256 ─────────────────────────────────────────────────────
echo ""
echo "[3/5] Computing SHA256..."
SHA256=$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')
FILE_SIZE=$(stat -f%z "$ZIP_PATH" 2>/dev/null || stat --format=%s "$ZIP_PATH" 2>/dev/null || echo "0")
echo "SHA256: $SHA256"
echo "Size: $FILE_SIZE bytes"

# ── Step 4: 上传到 MinIO ─────────────────────────────────────────────────────
echo ""
echo "[4/5] Uploading to MinIO..."
mc cp "$ZIP_PATH" "$MC_ALIAS/$BUCKET/"

# ── Step 5: 生成并上传 manifest.json ─────────────────────────────────────────
echo ""
echo "[5/5] Updating manifest.json..."

# 下载现有 manifest（如果存在）
TEMP_MANIFEST=$(mktemp)
mc cp "$MC_ALIAS/$BUCKET/manifest.json" "$TEMP_MANIFEST" 2>/dev/null || echo '{}'

# 使用 Python 生成新 manifest
python3 -c "
import json, sys, datetime

version = '$VERSION'
platform_key = '$PLATFORM'
zip_name = '$ZIP_NAME'
sha256 = '$SHA256'
file_size = $FILE_SIZE
base_url = '$MANIFEST_URL_BASE'
notes_zh = '''$RELEASE_NOTES_ZH'''
notes_en = '''$RELEASE_NOTES_EN'''

# Load existing manifest
try:
    with open('$TEMP_MANIFEST') as f:
        manifest = json.load(f)
except:
    manifest = {}

# Update fields
manifest['version'] = version
manifest['date'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
manifest['releaseNotes'] = {
    'zh': notes_zh,
    'en': notes_en,
}

if 'platforms' not in manifest:
    manifest['platforms'] = {}

manifest['platforms'][platform_key] = {
    'url': f'{base_url}{zip_name}',
    'sha256': sha256,
    'size': file_size,
}

manifest.setdefault('minAppVersion', '1.0.0')

with open('$TEMP_MANIFEST', 'w') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(json.dumps(manifest, ensure_ascii=False, indent=2))
"

mc cp "$TEMP_MANIFEST" "$MC_ALIAS/$BUCKET/manifest.json"
rm -f "$TEMP_MANIFEST"

echo ""
echo "================================================"
echo "  发布完成! v$VERSION"
echo "  Manifest: $MANIFEST_URL_BASE/manifest.json"
echo "  Package:  $MANIFEST_URL_BASE/$ZIP_NAME"
echo "================================================"
