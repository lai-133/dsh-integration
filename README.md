# dsh-desktop · 桌面版 DeepSeek Harness

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js ≥ 20](https://img.shields.io/badge/Node.js-%E2%89%A520-339933.svg)
![Electron](https://img.shields.io/badge/Electron-43-47848F.svg)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）装进一个原生桌面窗口：**Electron 壳 + 自托管 `dsh web` 服务**。网页端全部功能原样保留，并预集成四个开源项目，附带系统托盘、原生通知、插件精选画廊等桌面能力。

## ✨ 特性

- **网页端全部功能**：会话 / 子代理 / 工作流 / 计划模式 / 目标 / 技能 / 工具审批 / 设置 / 主题 / 插件管理……（就是完整的 `dsh web`）
- **系统托盘**：显示/隐藏窗口、重启 DSH 服务器、在浏览器中打开、插件精选、退出
- **原生通知**：页面内通知走系统通知中心；关窗隐藏到托盘时提示
- **外链外置**：所有外部链接自动交给系统浏览器
- **单实例锁**：重复启动只聚焦已有窗口
- **优雅关闭**：退出时干净停掉 dsh 服务进程
- **插件精选画廊**：内置 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 全量清单（1054 插件 / 14 分类），支持搜索、跳转 GitHub、复制链接

## 🧩 集成的开源项目

| 项目 | 说明 | 作者 / 许可证 |
|---|---|---|
| [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | 服务化侧边栏工作台：文件资源管理器 + CodeMirror 编辑器、内嵌浏览器、真实终端（node-pty）、Git 面板、子代理拓扑、后台任务；`ctx.betterSidebar` 服务开放给其他插件注册 Tab / 文件预览器 | [omdsh-dev](https://github.com/omdsh-dev) · MIT |
| [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) | DSH Web GUI 插件 + 皮肤全家桶：梁神模式 agent 预设、任务看板（含 cron 定时执行）、Git 图谱、右侧面板（预览/文件树/SCM）、移动端远程、SSH 运维、图像理解、鲸鱼娘宠物、实时吞吐、**皮肤中心 10 款皮肤** | [zhu1090093659](https://github.com/zhu1090093659) · Apache-2.0 |
| [ModLens](https://github.com/liustack/modlens) | 视觉引擎插件：给纯文本模型补上视觉，`modlens_read_image` 工具 + `(modlens vision)` 模型项 | [liustack](https://github.com/liustack) · MIT |
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | 社区精选插件清单（本应用的「插件精选」画廊数据来源） | [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin) · 清单文档 |
| [dshmarket](https://github.com/dsh-market/dsh-market) | DSH 可视化插件市场：设置页内浏览、一键安装/升级社区插件 | [dsh-market](https://github.com/dsh-market) · MIT |

> 桌面端与网页端（`dsh web`）**共享同一 `DSH_HOME`**：会话、存储、profile 完全连续。桌面端默认监听 `127.0.0.1:3081`（环境变量 `DSH_DESKTOP_PORT` 可改），端口被占用自动顺延。

> ⚠️ 本应用会为你的 web profile 安装上述第三方插件。**安装插件即以你的权限运行第三方代码**，安装前请自行审阅各仓库源码。

## 🏗️ 架构

```
dsh-desktop/
├── src/
│   ├── main/
│   │   ├── main.js        # Electron 主进程：窗口、托盘、菜单、IPC、生命周期、烟雾自检
│   │   ├── server.js      # dsh web 服务管理器：spawn、端口探测、URL 解析、健康检查、优雅关闭
│   │   ├── gallery.js     # 插件精选画廊窗口
│   │   ├── splash.html    # 启动页
│   │   ├── error.html     # 启动失败页
│   │   └── assets/        # 应用图标（默认图标随仓库分发；个性化图标放 assets/whale/，不入库）
│   ├── preload/preload.js # contextBridge：openExternal / serverStatus / restartServer / notify / galleryData
│   └── gallery/           # 画廊前端 + plugins.json（由 build-gallery.mjs 生成）
├── scripts/
│   ├── setup.mjs          # 一键安装编排
│   ├── setup-runtime.mjs  # 校验 DSH 运行时
│   ├── setup-profile.mjs  # 把集成插件装进 web profile（官方 dsh plugin 通道 + bundles 校准）
│   ├── build-gallery.mjs  # 解析 awesome-dsh-plugin README → plugins.json
│   ├── make-icon.mjs      # 从方形源图生成 PNG/ICO 图标
│   └── ask-zhipu.mjs      # 直连智谱 GLM-4V-Flash 的调试工具（Key 读自本机 modlens 配置）
├── start.cmd              # Windows 启动器（自动补装缺失依赖）
├── install.cmd            # Windows 一键安装
└── package.json           # Electron + @deepseek-ai/dsh 运行时
```

启动链路：

```
npm start
  └─ Electron 主进程
       ├─ DshServer.start() → node …/dsh/lib/bin.js --profile web --port 3081
       │                     （共享 $DSH_HOME/profiles/web：集成插件已挂载）
       ├─ 解析 "dsh web: http://127.0.0.1:3081" → 健康检查 → 窗口加载
       └─ 托盘 / 通知 / 外链外置 / 优雅关闭
```

## 📦 快速开始

前置：Node.js ≥ 20（需在 PATH 中）。Windows / macOS / Linux 均可。

```sh
npm install        # 安装 DSH 运行时（@deepseek-ai/dsh）+ Electron
npm run setup      # ① 把集成插件装进 web profile（dsh-better-sidebar / ModLens / dsh-web-ui / dshmarket）
                   # ② 生成插件精选画廊数据
npm start          # 启动桌面版
```

Windows 用户也可以直接双击 `install.cmd`（一键安装）与 `start.cmd`（启动，自动补装缺失依赖）。

`npm run setup` 做了什么：
1. 用 corepack 生成 `pnpm` shim（`dsh plugin` 依赖 pnpm）；
2. 若无 `~/.dsh/profiles/web` 则按官方模板初始化；
3. 在 profile 的 `pnpm-workspace.yaml` 写入 `minimumReleaseAgeExclude`（绕过 pnpm 11 发布年龄门禁）；
4. 逐个执行 `dsh plugin --profile web add`（官方通道，自动并入 `dsh.profile.bundles` 并挂载其 bundle patch）；
5. `pnpm approve-builds --all` 放行 node-pty 等原生构建脚本；
6. **bundles 校准**：pnpm 因 ssh2/cpu-features 原生构建返回非零时官方 reconcile 会被跳过，脚本按官方规则自行把声明了 `dsh.bundle.patch` 的依赖并入 bundles（ssh2 crypto 绑定为可选件，构建失败可忽略）。

## 🖥️ 使用指南

- **启动**：`npm start`（或 Windows 双击 `start.cmd`）
- **关闭窗口 ≠ 退出**：点 X 隐藏到托盘（首次会弹通知）；彻底退出用托盘右键 →「退出」
- **托盘菜单**：显示主窗口 / 插件精选 / 重启 DSH 服务器 / 在浏览器中打开 / 退出
- **插件精选**：应用菜单「插件 → 插件精选」
- **视觉引擎**：粘贴图片或让 agent 读图（`modlens_read_image`），由 ModLens 完成（约 5–10 秒/张，需配置视觉引擎，见下）

### 视觉引擎（ModLens）配置

ModLens 的 `openai` provider 是通用 OpenAI 兼容插座，国内直连可用（示例为免费的智谱 GLM-4V-Flash）：

```sh
modlens config set openai.baseUrl https://open.bigmodel.cn/api/paas/v4
modlens config set openai.apiKey  <你的key>
modlens config set openai.model   glm-4v-flash
modlens config set provider       openai
modlens doctor                    # 验证
```

- 免费版有限速（约每分钟几十次），日常识图够用；可升级 `glm-4.6v` 系列。
- 备选引擎：阿里云百炼 qwen-vl、硅基流动、本地 Ollama（`http://localhost:11434/v1` + `qwen2.5-vl`）。
- 详细文档见 [ModLens](https://github.com/liustack/modlens)。

### 端到端自检

```sh
$env:DSH_DESKTOP_SMOKE='1'; npm start   # PowerShell
```

页面加载完成后自动采集 DOM 证据（各集成插件的 client bundle、better-sidebar 挂载、插件错误数），打印 `[smoke] RESULT: PASS/FAIL` 后退出，可用于 CI。

## ❓ 常见问题

| 现象 | 处理 |
|---|---|
| 启动页一直转圈 | 首次启动需安装插件/构建 node-pty，较慢属正常；失败见错误页提示 |
| 找不到窗口 | 窗口隐藏到托盘了——点托盘图标恢复，或重新运行 `npm start`（单实例会聚焦已有窗口） |
| 提示 pnpm 未找到 | 执行 `corepack enable --install-directory .tools/bin` 重新生成 shim |
| 端口被占用 | 默认 3081 自动顺延；或设 `DSH_DESKTOP_PORT` |
| 与网页端 `dsh web` 同时运行 | 同一 DSH_HOME 双实例有会话文件并发写风险，建议同一时间只开一个 |
| 装到旧版插件 | profile 的 `pnpm-workspace.yaml` 已含 `minimumReleaseAgeExclude`；仍异常则在 `~/.dsh/profiles/web` 执行 `pnpm update @linxin666/dsh-web-ui-all` |

## 🛠️ 开发与贡献

```sh
npm install
npm run setup          # 准备 profile 与画廊数据
npm run gallery:build  # 重新生成插件画廊数据（需 third-party/awesome-dsh-plugin 克隆）
npm start              # 启动
```

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 🙏 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —— 本应用的服务内核（MIT）
- [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) by [omdsh-dev](https://github.com/omdsh-dev)（MIT）
- [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) by [zhu1090093659](https://github.com/zhu1090093659)（Apache-2.0）
- [ModLens](https://github.com/liustack/modlens) by [liustack](https://github.com/liustack)（MIT）
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) by [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin)
- [dshmarket](https://github.com/dsh-market/dsh-market) by [dsh-market](https://github.com/dsh-market)（MIT）

## 📄 License

MIT © [lai-133](https://github.com/lai-133)。集成插件遵循各自仓库许可证（dsh-better-sidebar MIT、dsh-web-ui Apache-2.0、ModLens MIT、dshmarket MIT）。
