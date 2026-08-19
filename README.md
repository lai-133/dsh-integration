# dsh-desktop · 桌面版 DeepSeek Harness

<div align="center">
  <b>简体中文</b> · <a href="./README.en.md">English</a>
</div>

<p align="center">
  <img src="docs/banner.png" alt="dsh-desktop 推广横幅" width="100%" />
</p>

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
| [dsh-task-relay](https://github.com/LeslieWylie/dsh-task-relay) | 跨会话/子代理共享任务队列 + 交接摘要（协作看板的任务投递底座） | [LeslieWylie](https://github.com/LeslieWylie) · MIT |
| [dsh-studio](plugins/dsh-studio/README.md) | 本仓库自研工作台增强：侧边栏「皮肤中心」入口（本地 / 壁纸引擎壁纸、大小/位置/模糊）+「协作」看板（子代理树、投递任务、发送消息、中断） | 本仓库 · MIT |

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
│   │   └── assets/        # 应用图标；放入 assets/whale/（不入库）可覆盖为个人图标
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
npm run setup      # 自动完成：① 初始化 ~/.dsh（DSH_HOME）骨架
                   # ② 自动准备 pnpm（PATH 已有则直接用；否则 corepack 生成 shim；再不行就本地 npm 安装）
                   # ③ 把集成插件装进 web profile（dsh-better-sidebar / ModLens / dsh-web-ui / dshmarket）
                   # ④ 生成插件精选画廊数据
npm start          # 启动桌面版
```

**无需手动安装 pnpm，也无需先运行官方 `dsh` 命令初始化**——`npm run setup` 会全部自动完成。Windows 用户直接双击 `start.cmd` 最省事：缺依赖自动 `npm install`，未完成 setup 自动补跑，然后启动。

### 📦 离线 / 免 GitHub 分发（国内用户）

安装过程**不依赖 GitHub**（依赖的是 npm 源与 Electron 二进制，均已内置 npmmirror 国内镜像）。无法登录 GitHub 的朋友可以这样拿：

1. 把项目文件夹打成 ZIP（排除 `node_modules/`、`.tools/`、`third-party/`、`.git/`）直接发给对方；
2. 对方安装 **Node.js ≥ 20**（国内可从 https://npmmirror.com/mirrors/node/ 下载 LTS MSI）；
3. 解压 ZIP → 双击 `start.cmd` → 全自动完成 npm 安装、环境初始化、插件安装，然后启动。

> 想改回官方源：删除 `.npmrc`，或删掉 `start.cmd` 中两行 `set ELECTRON_MIRROR / set npm_config_registry`。

`npm run setup` 详细步骤：
1. 自动创建 `~/.dsh` 骨架（profiles / sessions / storages）；
2. 自动准备 pnpm（三层降级：PATH 已有 → corepack shim → 项目内 `.tools` 本地安装，全程无需管理员权限）；
3. 若无 `~/.dsh/profiles/web` 则按官方模板初始化；
4. 在 profile 的 `pnpm-workspace.yaml` 写入 `minimumReleaseAgeExclude`（绕过 pnpm 11 发布年龄门禁）与 `allowBuilds`（node-pty / ssh2 / cpu-features / cloudflared，规避 `ERR_PNPM_IGNORED_BUILDS` 非零退出）；
5. 逐个执行 `dsh plugin --profile web add`（官方通道，自动并入 `dsh.profile.bundles` 并挂载其 bundle patch；单插件失败自动重试）；
6. dsh-web-ui 聚合包以 `--ignore-scripts` 安装（其 ssh2 / cloudflared / cpu-features 原生绑定均为可选件，缺失时插件自带降级，确保任何网络/工具链环境都安装成功）；
7. **bundles 校准**：pnpm 因原生构建返回非零时官方 reconcile 会被跳过，脚本按官方规则自行把声明了 `dsh.bundle.patch` 的依赖并入 bundles。

## 🖥️ 使用指南

- **启动**：`npm start`（或 Windows 双击 `start.cmd`）
- **关闭窗口 ≠ 退出**：点 X 隐藏到托盘（首次会弹通知）；彻底退出用托盘右键 →「退出」
- **托盘菜单**：显示主窗口 / 插件精选 / 重启 DSH 服务器 / 在浏览器中打开 / 退出
- **插件精选**：应用菜单「插件 → 插件精选」
- **皮肤中心**：侧边栏 🎨 入口（与检查更新同级）——选择本地或 Wallpaper Engine 壁纸作为界面背景，可调大小/位置/模糊；皮肤一键应用
- **协作看板**：侧边栏 🤝 入口——当前会话子代理实时列表，▼ 展开发送消息 / 中断 / 投递任务到共享队列
- **自定义图标**：把自制的 `icon-{16,32,256}.png` 与 `icon.ico` 放进 `src/main/assets/whale/`，应用启动时自动优先使用（该目录不入库）
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
| 提示 profile 未初始化 | 运行 `npm run setup`（自动初始化 ~/.dsh 并安装插件），或双击 `start.cmd` 自动补跑 |
| 找不到窗口 | 窗口隐藏到托盘了——点托盘图标恢复，或重新运行 `npm start`（单实例会聚焦已有窗口） |
| setup 未能自动准备 pnpm | 极少见：手动执行 `npm install -g pnpm` 后重跑 `npm run setup` |
| 端口被占用 | 默认 3081 自动顺延；或设 `DSH_DESKTOP_PORT` |
| 与网页端 `dsh web` 同时运行 | 同一 DSH_HOME 双实例有会话文件并发写风险，建议同一时间只开一个 |
| SSH 加密加速 / cloudflared 隧道不可用 | dsh-web-ui 聚合包默认跳过原生构建脚本（可选件）。需要完整原生能力时，在 `~/.dsh/profiles/web` 执行 `pnpm rebuild ssh2 cloudflared cpu-features`（需可用的编译/下载环境） |
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

## 📜 License

本项目采用 [MIT License](./LICENSE)，© 2026 Azusa。集成的插件遵循各自仓库的许可证（dsh-better-sidebar MIT、dsh-web-ui Apache-2.0、ModLens MIT、dshmarket MIT）。应用图标源自作者自备的角色设定图。
