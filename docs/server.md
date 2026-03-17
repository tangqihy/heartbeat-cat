# 服务端文档

服务端是整个项目的核心，负责接收所有设备的心跳数据、管理 session、存储到 SQLite 数据库，并提供查询 API 和托管前端看板。

---

## 系统要求

| 项目 | 要求 |
|------|------|
| Node.js | 18.x 或以上 |
| 操作系统 | Linux（推荐 Ubuntu 22.04）、macOS、Windows |
| 磁盘空间 | 数据库约 1 MB / 10 万条 session（可忽略不计） |
| 内存 | 最低 256 MB（单进程） |

---

## 快速开始

```bash
cd server
cp .env.example .env       # 复制配置模板
# 编辑 .env，至少修改 API_KEY
npm install
npm run dev                # 开发模式（自动重载）
```

访问 `http://localhost:3000/health`，返回 `{"ok":true}` 即为启动成功。

---

## 配置说明（.env）

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `API_KEY` | ✅ | — | 客户端鉴权密钥。推荐生成：`openssl rand -hex 32` |
| `PORT` | | `3000` | HTTP 监听端口 |
| `HOST` | | `0.0.0.0` | 监听地址。`0.0.0.0` 表示接受所有来源 |
| `DATABASE_PATH` | | `./heartbeat.db` | SQLite 文件路径，相对于 server/ 目录 |

**.env 示例：**
```dotenv
API_KEY=a1b2c3d4e5f6...    # 用 openssl rand -hex 32 生成
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=./heartbeat.db
```

---

## 生产部署

### 方式一：PM2（推荐）

PM2 是 Node.js 的进程管理器，支持开机自启、日志管理、崩溃重启。

```bash
# 1. 构建
npm run build

# 2. 全局安装 PM2
npm install -g pm2

# 3. 启动
pm2 start dist/index.js --name heartbeat-server

# 4. 开机自启
pm2 save
pm2 startup          # 按提示执行输出的命令

# 常用管理命令
pm2 status           # 查看运行状态
pm2 logs heartbeat-server    # 查看日志
pm2 restart heartbeat-server # 重启
pm2 stop heartbeat-server    # 停止
```

### 方式二：systemd

```bash
# 1. 构建
npm run build

# 2. 创建服务文件
sudo nano /etc/systemd/system/heartbeat.service
```

```ini
[Unit]
Description=My Heartbeat Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/my-heartbeat/server
ExecStart=/usr/bin/node dist/index.js
EnvironmentFile=/home/ubuntu/my-heartbeat/server/.env
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 3. 启用并启动
sudo systemctl daemon-reload
sudo systemctl enable --now heartbeat

# 查看状态和日志
sudo systemctl status heartbeat
sudo journalctl -u heartbeat -f
```

---

## 前端集成（一体化部署）

服务端会自动检测并托管 `web/dist`，无需单独的 Web 服务器：

```bash
# 1. 先构建前端
cd web && npm run build && cd ..

# 2. 启动服务端（同时托管 API 和前端）
cd server && npm start
```

浏览器访问 `http://your-vps:3000` 即可看到看板。

---

## Nginx 反向代理 + HTTPS（推荐生产环境）

用 Nginx 做反向代理可以添加 HTTPS 和域名访问。

### 安装证书（Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d heartbeat.yourdomain.com
```

### Nginx 配置

```nginx
server {
    listen 443 ssl;
    server_name heartbeat.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/heartbeat.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/heartbeat.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
    }
}

server {
    listen 80;
    server_name heartbeat.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

配置完成后，将所有客户端的 `SERVER_URL` 改为 `https://heartbeat.yourdomain.com`。

---

## API 参考

所有时间戳均为 **Unix 秒级时间戳**。

### POST /api/heartbeat

上报心跳数据。所有客户端通过此接口报告当前前台应用。

**请求头：**
```
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

**请求体：**
```jsonc
{
  "device_id":   "work-pc",          // 必填，设备唯一标识
  "device_name": "Work PC",          // 必填，显示名称
  "device_type": "windows",          // 可选：windows | linux | ios | unknown
  "app_name":    "Google Chrome",    // 必填，当前前台应用名称
  "app_title":   "GitHub - Chrome",  // 可选，窗口标题
  "timestamp":   1700000000,         // 可选，缺省取服务器时间
  "event":       "open",             // 可选：open | close（iOS 专用）
  "input_events": {                  // 可选，本次间隔内的输入计数
    "keyboard": 42,
    "mouse": 8
  },
  "ai_context": {                    // 可选，AI 生成的画面描述
    "activity_type": "work",
    "description": "Writing TypeScript in VS Code",
    "details": "Implementing the heartbeat Windows client",
    "apps_visible": ["VS Code", "Terminal"],
    "is_idle": false
  }
}
```

**响应：** `{"ok": true}`

---

### GET /api/devices

获取所有已注册设备列表，按最后心跳时间倒序。

**响应示例：**
```json
[
  { "id": "work-pc", "name": "Work PC", "type": "windows", "last_seen": 1700000000 },
  { "id": "iphone",  "name": "iPhone",  "type": "ios",     "last_seen": 1699999000 }
]
```

---

### GET /api/usage/summary

获取时间范围内各应用的总使用时长。

**查询参数：**

| 参数 | 必填 | 说明 |
|------|:----:|------|
| `start` | ✅ | 起始 Unix 时间戳（秒） |
| `end` | ✅ | 结束 Unix 时间戳（秒） |
| `device_id` | | 指定设备；省略或填 `all` 表示全部设备 |

**响应示例：**
```json
[
  { "app_name": "Google Chrome", "total_duration": 11700, "total_keyboard": 3200, "total_mouse": 840 },
  { "app_name": "VS Code",       "total_duration": 7200,  "total_keyboard": 8100, "total_mouse": 120 }
]
```

---

### GET /api/usage/timeline

获取时间范围内的原始 session 列表，用于甘特图展示。

**查询参数：** 同 `/api/usage/summary`

**响应示例：**
```json
[
  {
    "device_id": "work-pc",
    "app_name": "VS Code",
    "app_title": "session.ts - my-heartbeat",
    "start_time": 1700010000,
    "end_time":   1700017200,
    "duration":   7200,
    "keyboard_events": 8100,
    "mouse_events": 120
  }
]
```

---

### GET /api/usage/weekly

获取一周内按天分组的使用统计，用于周视图堆叠柱状图。

**查询参数：**

| 参数 | 必填 | 说明 |
|------|:----:|------|
| `week_start` | ✅ | 周一 00:00:00 的 Unix 时间戳（秒，由前端按本地时区计算） |
| `device_id` | | 指定设备；省略或填 `all` 表示全部设备 |

**响应示例：**
```json
[
  { "day_index": 0, "app_name": "Chrome",  "total_duration": 11700, "total_keyboard": 3200, "total_mouse": 840 },
  { "day_index": 0, "app_name": "VS Code", "total_duration": 7200,  "total_keyboard": 8100, "total_mouse": 120 },
  { "day_index": 1, "app_name": "Chrome",  "total_duration": 9000,  "total_keyboard": 2800, "total_mouse": 600 }
]
```

`day_index` 从 0 开始，0 = 周一，6 = 周日。

---

## 数据库管理

数据库是一个 SQLite 文件，默认位于 `server/heartbeat.db`。

### 备份

```bash
# 方式一：直接复制文件（简单）
cp server/heartbeat.db server/heartbeat.db.bak

# 方式二：SQLite 在线备份（安全，不影响正在运行的服务）
sqlite3 server/heartbeat.db ".backup server/heartbeat_$(date +%Y%m%d).db"
```

建议配置 cron 定时备份：
```bash
# 每天凌晨 3 点备份，保留 30 天
0 3 * * * sqlite3 /path/to/heartbeat.db ".backup /path/to/backups/heartbeat_$(date +\%Y\%m\%d).db" && find /path/to/backups -name "*.db" -mtime +30 -delete
```

### 查看数据

```bash
sqlite3 server/heartbeat.db

# 查看所有设备
SELECT * FROM devices;

# 查看今天的 session
SELECT device_id, app_name, datetime(start_time, 'unixepoch', 'localtime'),
       duration/60 as minutes
FROM sessions
WHERE start_time >= strftime('%s', 'now', 'start of day')
ORDER BY start_time;

# 按应用统计总时长（小时）
SELECT app_name, SUM(duration)/3600.0 as hours
FROM sessions
GROUP BY app_name
ORDER BY hours DESC;
```

### 重置数据

```bash
# 删除所有 session 数据（保留设备注册信息）
sqlite3 server/heartbeat.db "DELETE FROM sessions; DELETE FROM heartbeat_snapshots;"

# 完全重置（删除数据库文件，重启后自动重建）
rm server/heartbeat.db
```

---

## 常见问题

**Q: 启动报错 `Cannot find module 'better-sqlite3'`**
A: 运行 `npm install`，或在 Linux 上执行 `npm install --build-from-source`

**Q: 收到心跳但数据库没有数据**
A: session 在会话结束后才写入数据库。连续使用同一应用时，session 保持在内存中；切换应用或超过 30 秒无心跳后才会落盘。可通过 `/api/usage/timeline` 验证（需要已完成的 session）。

**Q: 端口 3000 已被占用**
A: 修改 `.env` 中的 `PORT`，同时更新所有客户端的 `SERVER_URL`。

**Q: 如何查看实时日志**
A: PM2: `pm2 logs heartbeat-server` | systemd: `journalctl -u heartbeat -f` | 直接运行: 控制台输出即为日志

**Q: 客户端收到 401 错误**
A: 检查客户端 `API_KEY` 是否与服务端 `.env` 中一致，注意大小写。
