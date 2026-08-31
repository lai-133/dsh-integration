# Changelog

本项目的所有显著变更都会记录在此文件。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.2.1] - 2026-08-31

### 修复

- **托盘「重启 DSH 服务器」不生效**：服务进程实际已重启，但端口不变时窗口加载链的同 URL 短路导致页面从不刷新，界面停留在旧状态（新插件/配置看似未生效）。重启后强制重新加载窗口（`loadURL(..., { cache: 'reload' })` 绕过缓存）。

### 改进

- 端到端自检（`DSH_DESKTOP_SMOKE=1`）新增 dsh-whale-widget 挂载证据（`.dshwv-root` / `.dshwv-status`）并纳入 PASS 门槛。

## [1.2.0] - 2026-08-31

### 变更

- **移除旧桌宠 dsh-pet**：`setup-profile.mjs` 在 profile patch 层禁用 `pet`（幂等），旧鲸鱼娘宠物不再加载。
- **工作状态气泡迁移至 dsh-whale-widget 定制 fork**（`third-party/DeepSeek-Balance-Whale-Widget`，v0.2.10-dsh.1，`file:` 集成入库）：宿主监听官方会话事件流投影状态（准备开始 / 等待模型响应 / 正在思考 / 正在使用 xxx / 处理工具结果 / 整理回复中 / 完成啦 / 执行失败 / 达到输出上限 / 执行意外中断），新增 `GET /dsh-whale/status.json`；客户端 1s 轮询在鲸鱼头顶显示气泡，菜单新增「工作状态」开关。

### 清理

- 删除测试残留：`head-final.png`、`plugins/dsh-studio/`（已下线插件）、本机 `shot1/`（3.2GB 截图）与顶层测试文件；`~/.dsh/cordis.patch.yml` 移除 `ui-skin-whale-song` 残留。

## [1.1.0] - 2026-08-31

### 新增

- **集成 dsh-whale-widget**（余额鲸鱼挂件）：DeepSeek API 余额（60s 刷新）、今日已用（记账 / 实时令牌双模式，峰谷定价）、每轮对话消耗统计；拖拽吸附、随机台词、音效。

## [0.1.1] - 2026-08-17

### 改进（全新机器零手工步骤）

- **自动初始化 DSH_HOME**：`npm run setup` 自动创建 `~/.dsh` 骨架（profiles / sessions / storages），不再需要先手动运行官方 `dsh` 命令。
- **自动准备 pnpm**：三层降级（PATH 已有 → corepack shim → 项目内 `.tools` 本地 npm 安装），无需手动安装 pnpm、无需管理员权限。
- **预置 allowBuilds**：node-pty / ssh2 / cpu-features / cloudflared 提前写入 profile 的 `pnpm-workspace.yaml`，规避 pnpm 11 `ERR_PNPM_IGNORED_BUILDS` 返回非零导致官方 `dsh plugin` 误报失败。
- **dsh-web-ui 聚合包跳过构建脚本安装**（`--ignore-scripts`）：其 ssh2/cloudflared/cpu-features 原生绑定均为可选件、插件自带降级，安装更快且在任何网络/工具链环境下都确定成功。
- **安装重试与兜底**：单插件失败自动重试；仍失败则 `--ignore-scripts` 直装，依赖落盘后由 bundles 校准挂载。
- **start.cmd 自动补跑 setup**：检测 `.setup-complete` 标记，首次启动自动完成初始化。
- **启动前置检查**：web profile 未初始化时应用显示明确指引（不再无提示失败）。

## [0.1.0] - 2026-08-17

### 新增

- **桌面壳**：Electron 主进程（窗口 / 托盘 / 应用菜单 / IPC / 单实例锁 / 优雅关闭）。
- **自托管服务**：`DshServer` 管理 `dsh --profile web` 子进程（端口探测 / URL 解析 / 健康检查 / 重启）。
- **集成插件**（经官方 `dsh plugin` 通道装进共享 web profile）：
  - dsh-better-sidebar 0.12.3（侧边栏工作台）
  - dsh-web-ui 全家桶 0.1.19（任务看板 / Git 图谱 / SSH / 皮肤中心等）
  - ModLens 3.18.1（视觉引擎）
  - dshmarket 1.10.1（插件市场）
- **插件精选画廊**：awesome-dsh-plugin 全量清单（1054 插件 / 14 分类）的浏览窗口。
- **桌面原生能力**：系统托盘、原生通知（含隐藏到托盘提示）、外链外置、关闭驻留托盘。
- **端到端自检**：`DSH_DESKTOP_SMOKE=1` 下自动采集 DOM 证据并退出。
- **Windows 便捷脚本**：`install.cmd` / `start.cmd`。
- **图标管线**：`scripts/make-icon.mjs` 从方形源图生成 PNG/ICO；个性化图标放 `assets/whale/`（不入库）。

### 修复

- 服务启动期间窗口加载竞态（加载链串行化 + 失败重试）。
- pnpm 原生构建失败导致 `dsh.profile.bundles` 未 reconcile（脚本自行校准）。

### 说明

- 需 Node.js ≥ 20 在 PATH 中；未做免 Node 打包。
- 桌面端与网页端共享 `DSH_HOME`，建议同一时间只运行一个实例。
