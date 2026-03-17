# Linux / Steam Deck 客户端文档

支持 Steam Deck 和一般 Linux 桌面。在 Gaming Mode（Gamescope）和 Desktop Mode（KDE Plasma X11）下均可运行，自动切换检测策略。

---

## 工作原理

每次心跳（默认 10 秒）依次尝试以下检测策略：

| 优先级 | 方法 | 适用场景 |
|--------|------|----------|
| 1 | 扫描 `/proc/<pid>/environ` 中的 `SteamAppId` 变量 | Gaming Mode，Steam 游戏运行中 |
| 2 | `xdotool getactivewindow`（依次尝试 `$DISPLAY`、`:0`、`:1`） | Desktop Mode，X11 |

**输入计数**：通过 `uiohook-napi` 的 X11 全局钩子统计键鼠次数（仅计数，不记录内容）。
**Gaming Mode 注意**：游戏输入经过 Gamescope（Wayland），绕过 X11 钩子，计数会为 0，这是正常行为。

---

## 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Linux x64（SteamOS 3.x / Ubuntu / Arch / Debian 等） |
| Node.js | 18.x 或以上 |
| xdotool | Desktop Mode 下需要（Gaming Mode 下不需要） |
| libxtst | `uiohook-napi` 的运行时依赖 |

---

## Steam Deck 安装指南

### 第一步：切换到 Desktop Mode

长按电源键 → 「切换到桌面」

### 第二步：安装 Node.js

SteamOS 使用 `pacman` 包管理器。打开 Konsole（终端）：

```bash
# SteamOS 默认文件系统是只读的，需要先解锁
sudo steamos-readonly disable

# 初始化 pacman 密钥（如果没做过）
sudo pacman-key --init
sudo pacman-key --populate archlinux

# 安装 Node.js 和工具
sudo pacman -S nodejs npm xdotool libxtst

# 全局安装 tsx（TypeScript 直接执行）
npm install -g tsx

# 恢复只读（推荐，避免系统更新问题）
sudo steamos-readonly enable
```

> **提示**：每次系统大版本更新后，`pacman` 安装的包可能会被重置，需要重新安装。如果不想重复操作，可以把 Node.js 安装到用户目录（使用 nvm 或 volta）：

```bash
# 使用 volta（推荐，不受系统更新影响）
curl https://get.volta.sh | bash
source ~/.bashrc
volta install node
volta install tsx@latest
```

### 第三步：安装客户端

```bash
cd ~/my-heartbeat/clients/linux
cp .env.example .env
# 编辑 .env
npm install
```

---

## Ubuntu / Debian 安装

```bash
# 安装 Node.js（使用 NodeSource 官方源）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装依赖
sudo apt install -y xdotool libxtst6

# 安装客户端
cd clients/linux
cp .env.example .env
npm install
npm install -g tsx
```

---

## Arch Linux / Manjaro 安装

```bash
sudo pacman -S nodejs npm xdotool libxtst
npm install -g tsx
cd clients/linux && cp .env.example .env && npm install
```

---

## 配置（.env）

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `DEVICE_ID` | ✅ | `linux-device` | 唯一标识，如 `steam-deck`、`linux-pc` |
| `DEVICE_NAME` | ✅ | `Linux Device` | 看板显示名称，如 `Steam Deck`、`Home Linux` |
| `SERVER_URL` | ✅ | `http://localhost:3000` | 服务端地址 |
| `API_KEY` | ✅ | — | 与服务端一致 |
| `HEARTBEAT_INTERVAL` | | `10` | 心跳间隔（秒） |
| `STEAM_LIBRARY_PATHS` | | `~/.local/share/Steam/steamapps` | 额外 Steam 库路径，逗号分隔（SD 卡扩展时需要） |
| `ANTHROPIC_API_KEY` | | — | 填写后启用 AI 截图功能 |
| `AI_MODEL` | | `claude-haiku-4-5-20251001` | AI 模型 |
| `AI_SCREENSHOT_EVERY` | | `6` | 每 N 次心跳截图一次 |

**.env 示例（Steam Deck）：**
```dotenv
DEVICE_ID=steam-deck
DEVICE_NAME=Steam Deck
SERVER_URL=https://heartbeat.yourdomain.com
API_KEY=a1b2c3d4e5f6...

# SD 卡游戏库
STEAM_LIBRARY_PATHS=/home/deck/.local/share/Steam/steamapps,/run/media/mmcblk0p1/steamapps
```

---

## 运行

### 手动运行（前台）

```bash
cd clients/linux
npm start
```

启动后，Gaming Mode 下会看到 Steam 游戏名出现在日志中，Desktop Mode 下会看到活跃窗口名称。

### systemd 用户服务（开机自启）

```bash
# 复制服务文件
cp heartbeat.service ~/.config/systemd/user/

# 编辑服务文件，确认 WorkingDirectory 路径正确
nano ~/.config/systemd/user/heartbeat.service

# 启用并启动
systemctl --user daemon-reload
systemctl --user enable --now heartbeat

# 查看状态和日志
systemctl --user status heartbeat
journalctl --user -u heartbeat -f
```

**heartbeat.service 关键配置说明：**

```ini
[Service]
WorkingDirectory=%h/my-heartbeat/clients/linux   # %h = 用户主目录
ExecStart=tsx src/index.ts                        # tsx 需要在 PATH 中
EnvironmentFile=%h/my-heartbeat/clients/linux/.env
Environment=DISPLAY=:0                            # Desktop Mode 需要
```

> **Steam Deck 注意**：Gaming Mode 下 systemd 用户服务可能不自动启动。建议在 Desktop Mode 下启用，或参考下方「Gaming Mode 自启方案」。

### Gaming Mode 自启（Steam 启动项）

在 Steam 中添加一个非游戏程序：

1. Steam → 游戏库 → 左下角「添加游戏」→「添加非 Steam 游戏」
2. 目标：`/home/deck/.npm-global/bin/tsx`（或 volta 路径：`/home/deck/.volta/bin/tsx`）
3. 启动选项：`/home/deck/my-heartbeat/clients/linux/src/index.ts`
4. 在 Steam 设置 → 开机启动时自动运行（不推荐，此方法不稳定）

更可靠的方案：在 `~/.bash_profile` 或 `~/.config/autostart/` 添加启动脚本：

```bash
# ~/.config/autostart/heartbeat.desktop
[Desktop Entry]
Type=Application
Name=Heartbeat Client
Exec=tsx /home/deck/my-heartbeat/clients/linux/src/index.ts
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
```

---

## AI 功能

```bash
# 安装可选依赖
npm install @anthropic-ai/sdk screenshot-desktop

# 在 .env 中添加
ANTHROPIC_API_KEY=sk-ant-...
```

> **Gaming Mode 截图**：`screenshot-desktop` 在 Gaming Mode 下可能无法正常截图（Gamescope 限制）。Desktop Mode 下工作正常。

---

## 验证

```bash
# 1. 启动客户端
npm start

# 2. 在 Gaming Mode 下启动一个游戏，30 秒后查看
curl "http://your-vps:3000/api/devices"
curl "http://your-vps:3000/api/usage/timeline?start=$(date -d 'today 00:00' +%s)&end=$(date -d 'tomorrow 00:00' +%s)"

# 3. 也可以在 Desktop Mode 下测试
# 打开一个应用，等 40 秒，然后切换到另一个应用
# 之前的 session 应该出现在 timeline 接口返回中
```

---

## 常见问题

**Q: Gaming Mode 下检测不到游戏**
A: 检查以下内容：
1. 游戏是否通过 Steam 启动（非 Steam 游戏也需要通过 Steam 添加）
2. 查看 `/proc` 中是否有 `SteamAppId` 变量：`grep -r SteamAppId /proc/*/environ 2>/dev/null`
3. 检查 `STEAM_LIBRARY_PATHS` 是否包含游戏所在的库（SD 卡需要额外配置）
4. 如果游戏安装在 SD 卡，格式需要是 ext4（Steam Deck 默认格式化为 ext4）

**Q: Desktop Mode 下 xdotool 找不到**
A: 运行 `which xdotool`，若无输出则执行 `sudo pacman -S xdotool`（SteamOS）或 `sudo apt install xdotool`（Ubuntu）

**Q: `npm install` 报错 `node-pre-gyp` 相关**
A: 尝试强制从源码编译：
```bash
npm install --build-from-source
# 如果报错，确保安装了编译工具：
sudo pacman -S base-devel python   # SteamOS
sudo apt install build-essential python3   # Ubuntu
```

**Q: systemd 服务启动失败（`tsx: command not found`）**
A: 在 service 文件中用 tsx 的完整路径：
```bash
which tsx   # 找到路径，如 /home/deck/.volta/bin/tsx
# 然后在 heartbeat.service 中改为完整路径：
ExecStart=/home/deck/.volta/bin/tsx src/index.ts
```

**Q: 客户端每次系统更新后需要重新安装**
A: 用 volta 管理 Node.js 可以避免这个问题（安装在用户目录，不受系统更新影响）：
```bash
curl https://get.volta.sh | bash && source ~/.bashrc
volta install node tsx
```
