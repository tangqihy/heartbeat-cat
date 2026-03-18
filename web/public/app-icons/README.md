# 应用图标目录

请在此目录放置常用应用的图标文件，以及**默认图标**（未配置的应用会使用默认图标）。

## 命名规则

- 文件名 = **键名 + 扩展名**，例如：`chrome.png`、`default.png`
- 支持格式：**.png**、**.svg**（推荐 32×32 或 64×64，正方形）
- **前端会请求 `{键名}.png`**，请至少提供 **`default.png`** 作为未配置应用的默认图标（若只有 .svg 可改名为 .png 或自行转换）

## 键名与应用对应关系

以下键名会被前端用来匹配应用名称（不区分大小写）。请按需放置对应文件，例如 `chrome.png`、`code.png` 等。

### 浏览器
| 键名 | 匹配的应用名示例 |
|------|------------------|
| chrome | Chrome, Google Chrome |
| edge | Microsoft Edge, Edge |
| firefox | Firefox |
| safari | Safari |
| opera | Opera |
| brave | Brave |

### 编辑器 / IDE
| 键名 | 匹配的应用名示例 |
|------|------------------|
| code | Code, Visual Studio Code, VS Code |
| cursor | Cursor |
| visual-studio | Visual Studio |
| intellij-idea | IntelliJ IDEA |
| webstorm | WebStorm |
| pycharm | PyCharm |
| phpstorm | PhpStorm |
| android-studio | Android Studio |
| xcode | Xcode |
| vim | Vim |
| notepad | Notepad, Notepad++ |
| sublime-text | Sublime Text |

### 系统 / 资源管理
| 键名 | 匹配的应用名示例 |
|------|------------------|
| explorer | Windows Explorer, Explorer, File Explorer |
| finder | Finder |
| screen-locked | Screen Locked, Lock Screen |

### 终端
| 键名 | 匹配的应用名示例 |
|------|------------------|
| terminal | Windows Terminal, Terminal |
| powershell | PowerShell |
| cmd | Command Prompt, Cmd |
| wsl | WSL |
| iterm | iTerm |
| hyper | Hyper |

### 通讯 / 协作
| 键名 | 匹配的应用名示例 |
|------|------------------|
| slack | Slack |
| discord | Discord |
| wechat | 微信, WeChat |
| teams | Teams, Microsoft Teams |
| zoom | Zoom |
| telegram | Telegram |
| skype | Skype |
| outlook | Outlook |
| mail | Mail |
| thunderbird | Thunderbird |

### Office
| 键名 | 匹配的应用名示例 |
|------|------------------|
| excel | Excel, Microsoft Excel |
| word | Word, Microsoft Word |
| powerpoint | PowerPoint, Microsoft PowerPoint |
| onenote | OneNote |

### 开发 / 工具
| 键名 | 匹配的应用名示例 |
|------|------------------|
| git | Git |
| github | GitHub |
| gitlab | GitLab |
| docker | Docker |
| postman | Postman |
| insomnia | Insomnia |
| figma | Figma |
| adobe-xd | Adobe XD |
| photoshop | Photoshop |
| illustrator | Illustrator |

### 系统设置
| 键名 | 匹配的应用名示例 |
|------|------------------|
| settings | Settings, System Settings |
| control-panel | Control Panel |
| task-manager | Task Manager |
| windows-security | Windows Security |

---

**示例：** 若只放三个文件：

- `default.png`（必选）
- `chrome.png`
- `code.png`

则 Chrome、VS Code 会显示对应图标，其余应用均显示 `default.png`。
