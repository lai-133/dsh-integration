# 贡献指南

感谢你愿意为 dsh-desktop 贡献代码。请先读这份指南，再提交 PR。

## 开发环境

- Node.js ≥ 20（需在 PATH 中）
- 本机已安装 DSH（`dsh` 可用）或可经 `npm install` 安装 `@deepseek-ai/dsh`
- pnpm：由 `npm run setup` 通过 corepack 自动生成（`.tools/bin/`）

## 本地开发

```sh
npm install          # 安装运行时与 Electron
npm run setup        # 准备 web profile（集成插件）+ 生成画廊数据
npm start            # 启动应用
```

改完代码后建议跑一次端到端自检：

```sh
$env:DSH_DESKTOP_SMOKE='1'; npm start   # 打印 [smoke] RESULT: PASS/FAIL 后退出
```

## 代码约定

- Electron 主进程 / preload 均为 **CommonJS 纯 JavaScript**（无 TypeScript、无打包步骤）。
- 新增主进程模块放在 `src/main/`，渲染层脚本放 `src/preload/`、`src/gallery/`。
- 修改图标：把方形源图放入本地目录后运行 `node scripts/make-icon.mjs <源图> <输出目录>`。
- 修改「插件精选」数据源逻辑：`scripts/build-gallery.mjs`（解析 awesome-dsh-plugin 的 README）。
- 提交信息遵循 Conventional Commits：`feat: ...` / `fix: ...` / `docs: ...` / `chore: ...`。

## 安全红线（重要）

- **严禁提交任何密钥 / token / 凭据**。API Key 只存在于用户主目录（`~/.modlens/config.json`、`~/.dsh`），不属于本仓库。
- `src/main/assets/whale/`、`head-final.png`、`third-party/`、`node_modules/`、`.tools/` 已在 `.gitignore` 中，请勿强行加入。
- 涉及网络请求的新代码请保持 loopback 默认绑定，不要引入新的外部依赖而不声明。

## 提交 PR

1. fork 本仓库并创建分支（`feat/*` 或 `fix/*`）；
2. 本地验证（含 smoke 自检）；
3. 提交并推送，发起 PR 说明改动动机与验证方式。

## 报告问题

- Bug / 需求请开 Issue，附上：操作系统、Node 版本、复现步骤、主进程日志（如可用）。
