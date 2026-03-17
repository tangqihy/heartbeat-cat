# 前端看板文档

基于 Vue 3 + ECharts 的数据可视化看板，展示各设备的应用使用时长。

---

## 功能概览

- **日视图**：横向条形图（各应用时长）+ 甘特图时间线，支持按日导航和设备筛选
- **周视图**：按天的堆叠柱状图，展示一周内每天各应用占比
- **顶部导航**：视图切换（日/周）+ 设备选择器（全部/单台设备）
- **深色主题**：适合长时间查看的护眼配色

---

## 系统要求

| 项目 | 要求 |
|------|------|
| Node.js | 18.x 或以上 |
| 现代浏览器 | Chrome 90+ / Firefox 88+ / Safari 15+ / Edge 90+ |

---

## 开发模式

前端开发服务器会把 `/api/*` 自动代理到本地服务端（端口 3000）。

```bash
# 先确保服务端已在运行
cd server && npm run dev &

# 再启动前端开发服务器
cd web
npm install
npm run dev          # 默认启动在 http://localhost:5173
```

访问 `http://localhost:5173` 即可看到看板。修改 Vue 文件后浏览器自动热更新。

**代理配置（vite.config.ts 中已预配置）：**
```typescript
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true }
  }
}
```

---

## 生产构建

### 方式一：服务端一体化托管（推荐）

构建后，服务端自动检测并托管 `web/dist`，只需启动一个进程：

```bash
# 构建前端
cd web && npm run build

# 启动服务端（同时托管 API + 前端静态文件）
cd ../server && npm start
```

浏览器访问 `http://your-vps:3000`（或配置了 HTTPS 的域名）。

### 方式二：Nginx 单独托管前端

适合希望把前端和后端分离，或需要 CDN 加速的场景。

```bash
# 构建
cd web && npm run build
# 产物在 web/dist/ 目录
```

Nginx 配置：
```nginx
server {
    listen 80;
    server_name heartbeat.yourdomain.com;

    root /path/to/my-heartbeat/web/dist;
    index index.html;

    # API 转发到服务端
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SPA 路由支持（所有未匹配路径返回 index.html）
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 配置

前端通过 `/api` 路径访问后端，无需额外配置。如果后端部署在不同域名，修改 `vite.config.ts` 中的代理目标：

```typescript
proxy: {
  '/api': {
    target: 'https://heartbeat.yourdomain.com',  // 改为实际服务端地址
    changeOrigin: true,
  }
}
```

---

## 日视图使用说明

- **日期导航**：点击 `‹` / `›` 切换日期，不能跳转到未来
- **设备选择**：顶部右上角下拉，选择「全部设备」或单台设备
- **应用使用时长图**：横向条形图，按时长从多到少排列
  - 条形颜色基于应用名称哈希，同一应用在所有图表中颜色一致
  - 鼠标悬停显示精确时长
- **时间线图**：甘特图形式，每行一台设备，横轴为 0:00–24:00
  - 悬停显示应用名称、时间段、时长
  - 数据稀疏时（如 iOS 仅追踪部分应用）会有空白间隔

---

## 周视图使用说明

- **周导航**：点击 `‹` / `›` 切换周
- **堆叠柱状图**：每根柱代表一天，颜色按应用区分
  - 悬停显示当天各应用时长明细和合计
  - 图例可点击显示/隐藏特定应用
- **数据范围**：以周一为起点，显示周一至周日

---

## 应用颜色规则

颜色由应用名称的哈希值决定，从 20 种预设颜色中选取，保证同名应用颜色永远相同。可在 `web/src/utils/colors.ts` 中修改 `PALETTE` 数组来调整配色方案。

---

## 常见问题

**Q: 看板打开后显示「暂无数据」**
A: 确认服务端已启动，且至少有一台客户端发送过心跳数据。可先用 curl 手动发送测试心跳：
```bash
curl -X POST http://localhost:3000/api/heartbeat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test","device_name":"Test","app_name":"Test App","device_type":"windows"}'
```
然后等 30 秒（等 session 超时写库），刷新看板。

**Q: 时间线图上应用名称显示为进程名（如 `chrome.exe`）**
A: Windows 客户端的 `active-win` 有时返回进程文件名而非友好名称。可在 Windows 客户端的 `window.ts` 中添加进程名映射（参见 Linux 客户端的 `FRIENDLY_NAMES` 对象）。

**Q: 日视图的时区不对**
A: 时间轴以浏览器本地时区显示。如果服务端和客户端所在时区不同，只要客户端发送的 `timestamp` 字段是准确的 Unix 时间戳，显示就应该是正确的。

**Q: 生产构建后页面空白**
A: 检查 `web/dist/index.html` 是否存在，确认 `npm run build` 没有报错。常见原因是 TypeScript 类型错误阻止了构建（`vue-tsc` 会检查类型）。
