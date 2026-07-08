# 服务器部署指南（Ubuntu + PM2）

本文档说明如何将 Anki-plus 部署到 **阿里云 Ubuntu 服务器**，并使用 **PM2** 保持后台运行。

---

## 部署概览

```
Windows 本地打包 zip（不含 node_modules）
        ↓
上传到服务器 /var/www/
        ↓
解压 → npm install → PM2 启动
        ↓
访问 http://公网IP:3030
```

---

## 服务器环境要求

| 项目 | 要求 |
|------|------|
| 系统 | Ubuntu 20.04 / 22.04 |
| Node.js | 18+（推荐 20） |
| 进程管理 | PM2 |
| 端口 | 3030（应用），80/443（HTTPS 可选） |

---

## 第一步：阿里云安全组

在阿里云控制台 → 实例 → 安全组 → 入方向，添加规则：

| 协议 | 端口 | 来源 | 说明 |
|------|------|------|------|
| TCP | 3030 | 0.0.0.0/0 | 应用访问 |
| TCP | 80 | 0.0.0.0/0 | HTTP（HTTPS 时需要） |
| TCP | 443 | 0.0.0.0/0 | HTTPS（可选） |
| TCP | 22 | 你的IP | SSH |

---

## 第二步：安装 Node.js 和 PM2

SSH 登录服务器：

```bash
ssh admin@39.105.176.96
```

安装 Node.js 20：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential
node -v
npm -v
```

安装 PM2：

```bash
sudo npm install -g pm2
```

---

## 第三步：上传并解压项目

### 方式 A：Workbench 文件管理器

1. 登录阿里云 Workbench
2. 进入 `/var/www/`
3. 上传 `anki_plus.zip`
4. 终端解压：

```bash
cd /var/www
unzip -o anki_plus.zip
cd anki_plus
```

### 方式 B：SCP 从 Windows 上传

```powershell
scp anki_plus.zip admin@39.105.176.96:/var/www/
```

```bash
cd /var/www
unzip -o anki_plus.zip
cd anki_plus
```

### 确认文件结构

```bash
ls /var/www/anki_plus
```

应包含：`server.js` `package.json` `public/` `ecosystem.config.js` 等。

> **重要：** zip 里不能有 `node_modules`（Windows 编译的无法在 Linux 运行）。

---

## 第四步：安装依赖

```bash
cd /var/www/anki_plus

# 如果 zip 里误带了 node_modules，必须先删
rm -rf node_modules

npm install --production
```

成功标志：无报错，且 `node_modules/better-sqlite3` 存在。

---

## 第五步：设置文件权限

```bash
sudo chown -R admin:admin /var/www/anki_plus
chmod -R 755 /var/www/anki_plus
mkdir -p /var/www/anki_plus/data/uploads
chmod -R 775 /var/www/anki_plus/data
```

---

## 第六步：手动测试

```bash
cd /var/www/anki_plus
PORT=3030 DATA_DIR=./data node server.js
```

看到以下输出表示成功：

```
Anki-plus 运行在 http://0.0.0.0:3030
数据目录: /var/www/anki_plus/data
```

另开终端测试：

```bash
curl http://127.0.0.1:3030/api/stats
```

有 JSON 返回即可。按 `Ctrl + C` 停止。

---

## 第七步：PM2 启动

```bash
cd /var/www/anki_plus
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

`anki-plus` 状态应为 **online**，模式为 **fork**（不要用 cluster，SQLite 不兼容）。

查看日志：

```bash
pm2 logs anki-plus
```

### 设置开机自启

```bash
pm2 startup
```

执行输出的 `sudo env PATH=...` 命令，然后：

```bash
pm2 save
```

---

## 第八步：外网访问

浏览器打开：

```
http://39.105.176.96:3030
```

（替换为你的公网 IP）

---

## PM2 常用命令

| 命令 | 作用 |
|------|------|
| `pm2 status` | 查看所有进程 |
| `pm2 logs anki-plus` | 查看日志 |
| `pm2 restart anki-plus` | 重启 |
| `pm2 stop anki-plus` | 停止 |
| `pm2 delete anki-plus` | 删除进程 |
| `pm2 save` | 保存进程列表 |

---

## 更新部署

```bash
cd /var/www

# 备份数据（重要！）
cp -r anki_plus/data anki_plus/data_backup_$(date +%Y%m%d)

# 上传新 zip 并解压覆盖（或 git pull）
unzip -o anki_plus.zip

cd anki_plus
rm -rf node_modules
npm install --production
pm2 restart anki-plus
```

> 更新代码时不要删除 `data/` 目录，否则会丢失所有卡片。

---

## 配置 HTTPS（可选，需要域名）

1. 域名 A 记录指向服务器 IP
2. 安全组开放 80、443
3. 执行：

```bash
cd /var/www/anki_plus
bash deploy/deploy.sh 你的域名.com
```

脚本会配置 Nginx 反向代理并申请 Let's Encrypt 证书。

无域名时直接用 `http://IP:3030` 访问即可。

---

## 故障排查

### 1. 外网无法访问，PM2 显示 online

```bash
# 服务器本地测试
curl http://127.0.0.1:3030/api/stats

# 检查端口
ss -tlnp | grep 3030
```

- 本地不通 → 看 `pm2 logs anki-plus`
- 本地通、外网不通 → 检查阿里云安全组

### 2. `invalid ELF header`（better-sqlite3）

**原因：** zip 包含了 Windows 的 `node_modules`。

**解决：**

```bash
cd /var/www/anki_plus
pm2 delete anki-plus
rm -rf node_modules
npm install --production
pm2 start ecosystem.config.js
```

### 3. PM2 online 但日志为空 / 不断重启

改用 fork 模式直接启动：

```bash
pm2 delete anki-plus
PORT=3030 DATA_DIR=/var/www/anki_plus/data pm2 start server.js --name anki-plus
pm2 save
```

### 4. 上传图片失败 / EACCES

```bash
chmod -R 775 /var/www/anki_plus/data
chown -R admin:admin /var/www/anki_plus
```

### 5. 端口被占用

```bash
ss -tlnp | grep 3030
# 杀掉占用进程或换端口
PORT=3031 pm2 start server.js --name anki-plus --update-env
```

---

## 数据备份

```bash
# 备份
tar -czf anki_backup_$(date +%Y%m%d).tar.gz -C /var/www/anki_plus data

# 恢复
tar -xzf anki_backup_20250622.tar.gz -C /var/www/anki_plus
pm2 restart anki-plus
```

---

## 目录与端口参考

| 项目 | 值 |
|------|-----|
| 项目路径 | `/var/www/anki_plus` |
| 数据目录 | `/var/www/anki_plus/data` |
| 应用端口 | `3030` |
| PM2 进程名 | `anki-plus` |
| 公网 IP 示例 | `39.105.176.96` |
