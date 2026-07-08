# Anki-plus

基于 SM-2 间隔重复算法的记忆卡片 Web 应用。支持文本、图片、音频，数据存储在本地 SQLite，无需外部数据库。

## 功能概览

| 模块 | 说明 |
|------|------|
| 新建卡片 | 正/背面文本，粘贴/拖拽/批量上传图片，录音，MP3 |
| 今日复习 | SM-2 算法调度，四档评分并显示下次复习天数 |
| 系统设置 | 自定义复习节奏（初始间隔、简单加成、最大间隔等） |
| 本地存储 | SQLite 数据库 + 文件系统，所有数据在 `data/` 目录 |

## 技术栈

- **后端：** Node.js + Express + better-sqlite3
- **前端：** 原生 HTML / CSS / JavaScript
- **算法：** SM-2 间隔重复
- **进程管理（服务器）：** PM2

## 项目结构

```
anki_plus/
├── server.js              # Express 入口
├── db.js                  # SQLite 数据库
├── sm2.js                 # SM-2 复习算法
├── ecosystem.config.js    # PM2 配置（服务器用）
├── public/                # 前端静态文件
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── deploy/                # Nginx + HTTPS 部署脚本
│   ├── deploy.sh
│   └── nginx.conf
├── data/                  # 运行时数据（自动生成，勿删）
│   ├── anki.db
│   └── uploads/
└── docs/                  # 文档
    ├── WINDOWS-LOCAL.md   # Windows 本地开发
    ├── SERVER-DEPLOY.md   # 服务器部署
    └── USAGE.md           # 使用说明
```

## 文档导航

| 文档 | 适用场景 |
|------|----------|
| [Windows 本地开发](docs/WINDOWS-LOCAL.md) | 在 Windows 电脑上开发、调试、手机局域网测试 |
| [服务器部署](docs/SERVER-DEPLOY.md) | 部署到阿里云 Ubuntu，PM2 守护、HTTPS |
| [使用说明](docs/USAGE.md) | 新建卡片、复习、设置复习节奏 |

## 快速开始

### Windows 本地

```powershell
cd anki_plus
npm install
npm run dev
```

浏览器访问：http://localhost:3030

### 服务器（Ubuntu + PM2）

```bash
cd /var/www/anki_plus
rm -rf node_modules          # 切勿使用 Windows 打包的 node_modules
npm install --production
pm2 start ecosystem.config.js
pm2 save
```

浏览器访问：http://你的服务器IP:3030

> 详细步骤、打包注意事项、故障排查见 [docs/SERVER-DEPLOY.md](docs/SERVER-DEPLOY.md)

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3030` | 监听端口 |
| `DATA_DIR` | `./data` | 数据目录（数据库 + 上传文件） |

## 数据备份

定期备份 `data/` 目录即可：

```
data/
├── anki.db          # 卡片与设置
└── uploads/         # 图片、音频
```

## 许可证

MIT
