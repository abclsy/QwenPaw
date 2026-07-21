#!/bin/bash
# 小铁智友 桌面部署脚本
# 用法: bash deploy_to_desktop.sh

set -e

NEW_APP="/Users/liusiyuan/Documents/workSpaceNew/QwenPaw/dist/CrecPaw_final4.app"
DESKTOP_APP="$HOME/Desktop/CrecPaw.app"

echo "=== 小铁智友 桌面部署 ==="
echo ""

# 检查新 app 是否存在
if [ ! -d "$NEW_APP" ]; then
    echo "错误: 找不到 $NEW_APP"
    exit 1
fi

# 移除桌面旧 app
if [ -d "$DESKTOP_APP" ]; then
    echo "移除桌面旧 app..."
    rm -rf "$DESKTOP_APP"
fi

# 复制新 app 到桌面
echo "部署新 app 到桌面..."
ditto "$NEW_APP" "$DESKTOP_APP"

# 清理 HTTP 缓存
echo "清理 WebView HTTP 缓存..."
rm -rf ~/Library/Caches/com.crec.crecpaw 2>/dev/null || true

echo ""
echo "=== 部署完成 ==="
echo "桌面 小铁智友.app 已更新，双击即可运行"
echo ""
echo "如果系统提示无法打开，请在终端执行:"
echo "  xattr -cr ~/Desktop/CrecPaw.app"
