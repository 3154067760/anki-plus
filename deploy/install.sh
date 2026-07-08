#!/bin/bash
# 从 Windows 上传 anki-plus.zip 后，在服务器执行此脚本完成同步部署
set -euo pipefail

APP_DIR="/var/www/anki-plus"
cd "$APP_DIR"

ZIP=""
for candidate in "$APP_DIR/anki-plus.zip" "$APP_DIR/anki_plus.zip"; do
  if [ -f "$candidate" ]; then
    ZIP="$candidate"
    break
  fi
done

if [ -n "$ZIP" ]; then
  echo "==> 解压 $ZIP（保留 data/ 目录）"
  DATA_BACKUP=$(mktemp -d)
  if [ -d "$APP_DIR/data" ]; then
    cp -a "$APP_DIR/data" "$DATA_BACKUP/"
  fi

  tmpdir=$(mktemp -d)
  unzip -o "$ZIP" -d "$tmpdir"

  src="$tmpdir"
  for sub in anki-plus anki_plus; do
    if [ -d "$tmpdir/$sub" ]; then
      src="$tmpdir/$sub"
      break
    fi
  done

  rsync -a --delete \
    --exclude 'data' \
    --exclude 'node_modules' \
    "$src/" "$APP_DIR/"

  if [ -d "$DATA_BACKUP/data" ]; then
    mkdir -p "$APP_DIR/data"
    cp -a "$DATA_BACKUP/data/." "$APP_DIR/data/"
  fi

  rm -rf "$tmpdir" "$DATA_BACKUP"
  rm -f "$ZIP"
fi

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "错误: 未找到 package.json，请先上传 anki-plus.zip 到 $APP_DIR"
  exit 1
fi

echo "==> 安装依赖"
npm install --omit=dev

echo "==> 启动 PM2"
if pm2 describe anki-plus >/dev/null 2>&1; then
  pm2 restart anki-plus
else
  pm2 start "$APP_DIR/ecosystem.config.js"
fi
pm2 save

sleep 2
curl -sf http://127.0.0.1:3030 >/dev/null \
  && echo "OK: http://127.0.0.1:3030 响应正常" \
  || echo "WARN: 请检查 pm2 logs anki-plus"

echo "完成: $APP_DIR"
