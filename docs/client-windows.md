# Windows 客户端文档

自动检测当前前台应用，统计键盘和鼠标操作次数（仅计数，不记录内容），每 10 秒向服务端发送一次心跳。

---

## 工作原理

- **前台应用检测**：通过 `active-win` 库（底层调用 Win32 API）获取当前活跃窗口的进程名和标题
- **输入计数**：通过 `uiohook-napi` 安装全局键盘/鼠标钩子，只计总次数，不记录任何按键内容、坐标或时序
- **心跳发送**：每 10 秒 POST 一次，服务端将连续心跳聚合为 session

---

## 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10 / 11（x64） |
| Node.js | 18.x 或以上（[下载](https://nodejs.org)） |
| 网络 | 能访问服务端 URL（VPS 公网或局域网） |

### 安装 Node.js

1. 访问 [nodejs.org](https://nodejs.org)，下载 LTS 版本安装包
2. 运行安装程序，全程默认选项即可
3. 验证：打开 PowerShell，运行 `node -v`，显示版本号即成功

---

## 安装

```powershell
cd clients\windows
copy .env.example .env          # 复制配置模板
# 用记事本或 VS Code 编辑 .env
npm install
```

> **注意**：`npm install` 会编译原生模块（`uiohook-napi`），需要约 1-3 分钟。如果报错，参见下方「常见问题」。

---

## 配置（.env）

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `DEVICE_ID` | ✅ | `windows-pc` | 设备唯一标识，小写连字符格式，如 `work-pc`、`home-pc` |
| `DEVICE_NAME` | ✅ | `Windows PC` | 看板中显示的设备名称，如 `Work PC`、`Gaming PC` |
| `SERVER_URL` | ✅ | `http://localhost:3000` | 服务端地址，不含末尾斜线 |
| `API_KEY` | ✅ | — | 与服务端 `.env` 中的 `API_KEY` 完全一致 |
| `HEARTBEAT_INTERVAL` | | `10` | 心跳间隔秒数，建议 5–30 |
| `ANTHROPIC_API_KEY` | | — | 填写后自动启用 AI 截图功能 |
| `AI_MODEL` | | `claude-haiku-4-5-20251001` | AI 模型，Haiku 最快最便宜 |
| `AI_SCREENSHOT_EVERY` | | `6` | 每 N 次心跳截一次图（6 次 × 10 秒 = 每分钟一次） |

**.env 示例：**
```dotenv
DEVICE_ID=work-pc
DEVICE_NAME=Work PC
SERVER_URL=https://heartbeat.yourdomain.com
API_KEY=a1b2c3d4e5f6...
HEARTBEAT_INTERVAL=10
```

---

## 运行

### 手动运行（前台）

```powershell
cd clients\windows
npm start
```

启动后会显示配置信息横幅，之后每次心跳会在控制台打印日志。按 `Ctrl+C` 停止。

### 开机自启（任务计划程序）

1. 打开「任务计划程序」（搜索 `taskschd.msc`）
2. 右键「任务计划程序库」→「创建基本任务」
3. **名称**：`My Heartbeat`
4. **触发器**：用户登录时
5. **操作**：启动程序
   - 程序：`C:\Users\你的用户名\AppData\Roaming\npm\tsx.cmd`
   - 参数：`src/index.ts`
   - 起始于：`C:\path\to\my-heartbeat\clients\windows`
6. 完成后，双击任务 → 「条件」→ 取消勾选「只在使用 AC 电源时运行」
7. 「设置」→ 勾选「如果任务已经运行，请执行以下规则」→「停止现有实例」

> **提示**：需要先全局安装 tsx：`npm install -g tsx`

### 最小化到托盘（可选）

Windows 自带的任务计划程序启动的进程没有窗口。如需在后台静默运行但能看到状态，可以改用 [nssm](https://nssm.cc/) 安装为 Windows 服务：

```powershell
# 安装 nssm，然后：
nssm install HeartbeatClient "C:\...\tsx.cmd" "src\index.ts"
nssm set HeartbeatClient AppDirectory "C:\path\to\clients\windows"
nssm start HeartbeatClient
```

---

## AI 功能

AI 功能在设置 `ANTHROPIC_API_KEY` 后自动激活。每隔 `AI_SCREENSHOT_EVERY × HEARTBEAT_INTERVAL` 秒截一次图，发给 Claude Haiku 生成结构化的画面描述，一并随心跳存入服务端的 `heartbeat_snapshots` 表，可作为工作日志使用。

### 安装 AI 依赖

```powershell
cd clients\windows
npm install @anthropic-ai/sdk screenshot-desktop
```

### 开启

在 `.env` 中添加：
```dotenv
ANTHROPIC_API_KEY=sk-ant-api03-...
AI_SCREENSHOT_EVERY=6             # 每分钟截图一次（10s × 6）
```

重启客户端即生效。启动横幅会显示 `AI: enabled`。

### 费用估算

使用 `claude-haiku-4-5-20251001` 模型，每张截图约 $0.001（0.1 分人民币）。每分钟一张，每天使用 8 小时 ≈ $0.48 / 月。

---

## 验证

1. 启动客户端
2. 等待约 40 秒（让一个 session 完成：30 秒超时 + 10 秒清理间隔）
3. 访问服务端 API 验证数据：
```bash
curl "http://localhost:3000/api/devices"
curl "http://localhost:3000/api/usage/summary?start=1700000000&end=1710000000"
```
4. 打开看板，选择对应设备和日期

---

## 常见问题

**Q: `npm install` 报错 `node-gyp` 相关错误**
A: 需要安装 Windows 构建工具。以管理员身份运行 PowerShell：
```powershell
npm install -g windows-build-tools
# 或安装 Visual Studio Community 并勾选 "C++ 桌面开发"
```

**Q: 启动后报错 `Cannot find module 'active-win'`**
A: 重新运行 `npm install`。如仍报错，尝试 `npm install active-win@7`。

**Q: 应用名称显示的是进程文件名（如 `chrome.exe`）而不是友好名称**
A: `active-win` 在某些情况下返回进程名。这不影响数据记录，同一进程总会映射到同一颜色。如需改善显示，可在 `src/window.ts` 中添加进程名映射表（参考 `clients/linux/src/window.ts` 的 `FRIENDLY_NAMES`）。

**Q: 心跳发送失败（网络错误）**
A: 控制台会打印 `[heartbeat] send failed:` 提示但不会退出。检查：
- `SERVER_URL` 是否正确
- VPN/防火墙是否允许访问服务端端口
- 服务端是否正在运行

**Q: 键鼠计数一直为 0**
A: `uiohook-napi` 需要在用户会话中运行（不能作为 SYSTEM 账户的服务）。确保客户端以当前登录用户身份运行，而非 Windows 服务形式。
