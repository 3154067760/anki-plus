# Windows 本地开发指南

本文档说明如何在 **Windows 电脑** 上安装、运行和调试 Anki-plus。

---

## 环境要求

| 软件 | 版本要求 |
|------|----------|
| Node.js | 18 或更高（推荐 20 LTS） |
| npm | 随 Node.js 安装 |

检查是否已安装：

```powershell
node -v
npm -v
```

未安装请前往 https://nodejs.org/ 下载 LTS 版本。

---

## 第一次运行

### 1. 进入项目目录

```powershell
cd C:\Users\你的用户名\Desktop\project\study\anki_plus
```

### 2. 安装依赖

```powershell
npm install
```

> `better-sqlite3` 是原生模块，首次安装会在 Windows 上编译，可能需要几分钟。

### 3. 启动开发服务器

```powershell
npm run dev
```

或：

```powershell
npm start
```

成功后会看到：

```
Anki-plus 运行在 http://0.0.0.0:3030
数据目录: ...\anki_plus\data
手机端测试（同一 WiFi）：
  http://192.168.x.x:3030
```

### 4. 浏览器访问

打开：**http://localhost:3030**

---

## 常用命令

| 命令 | 作用 |
|------|------|
| `npm install` | 安装/更新依赖 |
| `npm run dev` | 开发模式（文件改动自动重启） |
| `npm start` | 普通启动 |
| `Ctrl + C` | 停止服务 |

---

## 手机局域网测试

1. 电脑和手机连接 **同一 WiFi**
2. 启动服务后，终端会打印局域网 IP，例如 `http://192.168.2.5:3030`
3. 在手机浏览器输入该地址

### 若手机无法访问

1. **Windows 防火墙** 可能拦截 3030 端口  
   - 控制面板 → Windows Defender 防火墙 → 高级设置  
   - 入站规则 → 新建规则 → 端口 → TCP 3030 → 允许

2. 确认服务监听 `0.0.0.0`（项目默认已配置）

---

## 数据存储位置

本地运行时，数据保存在项目目录下：

```
anki_plus/data/
├── anki.db
└── uploads/
```

删除 `data/` 会清空所有卡片和上传文件。

---

## 打包上传到服务器

上传到服务器时，**不要包含 `node_modules` 和 `data`**。

### 推荐打包方式

**方式 A：使用打包脚本（推荐）**

```powershell
cd C:\Users\你的用户名\Desktop\project\study\anki_plus
powershell -ExecutionPolicy Bypass -File scripts/pack.ps1
```

会在上级目录生成 `anki_plus.zip`（已排除 `node_modules` 和 `data`）。

**方式 B：手动打包**

```powershell
cd C:\Users\你的用户名\Desktop\project\study\anki_plus

# 删除不需要上传的目录
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force data -ErrorAction SilentlyContinue

# 压缩（需要 Windows 自带 tar，或手动右键压缩）
Compress-Archive -Path * -DestinationPath ..\anki_plus.zip -Force
```

### 应包含的文件

```
server.js
db.js
sm2.js
package.json
package-lock.json
ecosystem.config.js
public/
deploy/
docs/
README.md
```

### 切勿包含

- `node_modules/` — Windows 编译的原生模块无法在 Linux 使用
- `data/` — 本地测试数据，不必上传

打包后上传到服务器，在 Linux 上执行 `npm install --production`。详见 [SERVER-DEPLOY.md](SERVER-DEPLOY.md)。

---

## 在 Cursor 中开发

1. 用 Cursor 打开 `anki_plus` 文件夹
2. 终端中运行 `npm run dev`
3. 修改 `public/`、`server.js` 等文件后，dev 模式会自动重启

### 连接阿里云服务器（Remote SSH）

1. 安装 **Remote - SSH** 扩展
2. `Ctrl + Shift + P` → `Remote-SSH: Connect to Host...`
3. 选择配置好的主机（如 `admin@39.105.176.96`）
4. 连接后打开 `/var/www/anki_plus` 目录

SSH 配置示例（`C:\Users\你的用户名\.ssh\config`）：

```
Host aliyun
    HostName 39.105.176.96
    User admin
    Port 22
```

---

## 常见问题

### `npm install` 编译 better-sqlite3 失败

安装 Visual Studio Build Tools：

```powershell
npm install -g windows-build-tools
```

或安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，勾选「使用 C++ 的桌面开发」。

### 端口 3030 被占用

```powershell
netstat -ano | findstr :3030
taskkill /PID 进程号 /F
```

或换端口启动：

```powershell
$env:PORT=3031; npm start
```

### 修改代码后不生效

- 使用 `npm run dev` 而非 `npm start`
- 浏览器强制刷新：`Ctrl + Shift + R`
