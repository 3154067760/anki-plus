#!/bin/bash
# Anki-plus 服务器部署脚本（Nginx + HTTPS）
# 用法: bash deploy/deploy.sh YOUR_DOMAIN
set -e

DOMAIN=${1:?"请提供域名，例如: bash deploy/deploy.sh anki.example.com"}
APP_DIR=/var/www/anki_plus
echo "==> 安装依赖..."
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> 部署应用..."
sudo mkdir -p $APP_DIR
sudo cp -r . $APP_DIR/
cd $APP_DIR
sudo npm install --production

echo "==> 配置 systemd 服务..."
sudo tee /etc/systemd/system/anki-plus.service > /dev/null <<EOF
[Unit]
Description=Anki-plus Flashcard App
After=network.target

[Service]
Type=simple
User=admin
WorkingDirectory=$APP_DIR
Environment=PORT=3030
Environment=DATA_DIR=$APP_DIR/data
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable anki-plus
sudo systemctl restart anki-plus

echo "==> 配置 Nginx..."
sudo sed "s/YOUR_DOMAIN/$DOMAIN/g" deploy/nginx.conf | sudo tee /etc/nginx/sites-available/anki-plus > /dev/null
sudo ln -sf /etc/nginx/sites-available/anki-plus /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo "==> 申请 SSL 证书..."
sudo certbot certonly --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN || {
  echo "证书申请失败，先用 HTTP 模式启动 Nginx"
  sudo tee /etc/nginx/sites-available/anki-plus > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 25M;
    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF
}

sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "部署完成!"
echo "  HTTP:  http://$DOMAIN"
echo "  HTTPS: https://$DOMAIN (证书就绪后)"
echo "  数据目录: $APP_DIR/data"
echo ""
echo "防火墙请确保开放: 80, 443, 3030"
