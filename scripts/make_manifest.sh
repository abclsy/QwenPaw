#!/bin/bash
# make_manifest.sh — 为发布包生成/更新 MinIO 上的 manifest.json
#
# 用途：publish.sh 的替代品（在 mc 直传 MinIO 打通之前的手动发布流程）。
# 产出 manifest.new.json 到项目根目录，内容与线上 manifest.json 结构一致。
# 流程：把安装包 zip + manifest.new.json 两个文件上传到 MinIO 控制台
#       (https://io.crec.cn:30090 → ai-client-package 桶)，上传后用
#       本脚本最后的验证 URL 自测客户端能否发现新版本。
#
# 用法:
#   ./make_manifest.sh <版本号> <win_zip路径> [mac_zip路径] "中文更新说明" ["英文更新说明"]
# 示例:
#   ./make_manifest.sh 1.1.8 dist/CrecPaw-1.1.8-win.zip dist/CrecPaw-1.1.8-mac.zip \
#       "1. 修复调用上限\n2. 修复页面卡死\n3. 更新链路修复"

set -e

VERSION="${1:?用法: ./make_manifest.sh <版本号> <win_zip> [mac_zip] <中文说明> [英文说明]}"
WIN_ZIP="${2:?缺少 Windows zip 路径}"
MAC_ZIP="${3:-}"
NOTES_ZH="${4:-}"
NOTES_EN="${5:-$NOTES_ZH}"

MANIFEST_URL_BASE="https://io.crec.cn:30090/api/v1/buckets/ai-client-package/objects/download?prefix="
MANIFEST_URL="${MANIFEST_URL_BASE}manifest.json"
OUT="manifest.new.json"

for f in "$WIN_ZIP" "$MAC_ZIP"; do
  [ -n "$f" ] && [ ! -f "$f" ] && { echo "错误: 文件不存在 $f"; exit 1; }
done

sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }
size_of() { stat -f%z "$1" 2>/dev/null || stat --format=%s "$1"; }

# 下载线上现有 manifest 作为基础（保留另一平台的条目）
curl -s --noproxy "*" --max-time 20 "$MANIFEST_URL" -o /tmp/manifest_old.json || echo '{}'

python3 - "$VERSION" "$WIN_ZIP" "$MAC_ZIP" "$NOTES_ZH" "$NOTES_EN" "$OUT" <<'PYEOF'
import datetime, json, sys

version, win_zip, mac_zip, notes_zh, notes_en, out = sys.argv[1:7]

with open("/tmp/manifest_old.json", encoding="utf-8") as f:
    manifest = json.load(f)

manifest["version"] = version
manifest["date"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
manifest["releaseNotes"] = {"zh": notes_zh.replace("\\n", "\n"), "en": notes_en.replace("\\n", "\n")}
manifest.setdefault("platforms", {})
manifest.setdefault("minAppVersion", "1.0.0")

BASE = "https://io.crec.cn:30090/api/v1/buckets/ai-client-package/objects/download?prefix="

def sha256(p):
    import hashlib
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

import os

def entry(path, name):
    return {
        "url": f"{BASE}{name}",
        "sha256": sha256(path),
        "size": os.path.getsize(path),
    }

# 桶内对象名沿用线上惯例：Windows 用 crecpaw_windows.zip（覆盖旧包），mac 用带版本名
manifest["platforms"]["win32"] = entry(win_zip, "crecpaw_windows.zip")
if mac_zip:
    manifest["platforms"]["darwin"] = entry(mac_zip, os.path.basename(mac_zip))

with open(out, "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"✓ 已生成 {out}")
print(f"  版本: {version}")
for k, v in manifest["platforms"].items():
    print(f"  {k}: {v['url'].split('prefix=')[-1]}  sha256={v['sha256'][:16]}...  {v['size']//1048576}MB")
PYEOF

cat <<'EOF'

═══════════════════════════════════════════════════════
 手动发布步骤（上传两个文件到 MinIO 控制台）:
 1. 打开 https://io.crec.cn:30090 → 登录 → ai-client-package 桶
 2. 上传 Windows 安装包 zip，重命名为 crecpaw_windows.zip（覆盖旧文件）
 3. 上传 manifest.new.json，重命名为 manifest.json（覆盖旧文件）
    ⚠️ 控制台上传大 zip 可能在 100% 后报 network error ——
       若报错就重试一次；重试仍失败说明分片会话过期，需重新进桶页面再传
 4. 验证（浏览器打开应返回新版本 JSON）:
    https://io.crec.cn:30090/api/v1/buckets/ai-client-package/objects/download?prefix=manifest.json
 5. 客户端验证: 打开小铁智友 → 设置 → 检查更新 → 应提示新版本
═══════════════════════════════════════════════════════
EOF
