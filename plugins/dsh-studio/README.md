# dsh-studio · 工作台增强插件

dsh-desktop 自带的 DSH web 插件：侧边栏「皮肤中心」入口（本地 / Wallpaper Engine 壁纸）与「协作」看板（子代理与任务投递）。纯 JavaScript，无构建步骤。

## 安装

```sh
# 方式一：本仓库开发安装（file: 是复制，改代码后需重新 add 刷新）
dsh plugin --profile web add file:<本目录绝对路径>

# 方式二：作为仓库插件被 setup-profile.mjs 自动安装
npm run setup
```

安装后重启 `dsh web`（或刷新页面加载客户端）。

## 功能

### 皮肤中心（侧边栏 🎨）

- **选择本地或壁纸引擎壁纸**：扫描所有 Steam 库的 `steamapps/workshop/content/431960`（Wallpaper Engine Workshop），列出图片 / 视频 / 场景三类壁纸（场景仅显示封面）；本地目录为 `~/.dsh/studio-wallpapers` 与 `~/Pictures` 顶层图片。
- **大小 / 位置 / 模糊控制**：适配方式（铺满 / 完整显示 / 拉伸 / 平铺）、九宫格位置、缩放 0.5–2×、模糊度 0–30px（默认 8px，防止工作区看不清）。
- **皮肤列表**：列出 dsh-skins 已安装的皮肤，一键应用（`dsh skin use <id>`）；试穿等完整功能仍在 设置 → 皮肤中心。
- 配置持久化在 `~/.dsh/studio.json`（原子写入）。

### 协作看板（侧边栏 🤝）

- **子代理树**：当前会话的子代理实时列表（5 秒刷新），状态色点（运行中 / 等待 / 结束）。
- **▼ 展开更多操作**：每行点击箭头展开「发送消息」（`subagents.followup`，以用户身份投递）、「中断」（`subagents.interrupt`）；`⋮` 菜单投递任务到共享队列。
- **投递任务**：写入 [dsh-task-relay](https://github.com/LeslieWylie/dsh-task-relay) 的共享队列（`~/.dsh/task-relay/queue.json`），任意会话 / 子代理可认领。未安装 task-relay 时提示安装命令。

## 架构

| 半 | 文件 | 说明 |
|---|---|---|
| Host | `lib/index.js` | `/studio/api/*` 路由（status / wallpapers / wallpaper-config / skins / skin-apply / relay-push / relay-list / subagents / followup / interrupt）、`/studio/media` Range 媒体流、loopback 信任围栏、配置持久化 |
| Client | `lib/client.js` | `__ModuleLoader__` 注册（factory 内自建 `module/exports`），`sidebar.remote` 与 `sidebar.workspaces` 座位注入、壁纸背景层、面板与提示 |

## 配置项

- 环境变量 `STUDIO_WE_ROOTS`：额外的 Steam 库根目录（分号分隔），默认探测常见路径。

## 开发说明

- `file:` 安装是**复制**而非链接：改代码后需重新 `dsh plugin add file:<目录>` 再重启/刷新。
- 客户端 bundle 改动只需刷新页面；宿主改动需重启 `dsh web`。
- 信任围栏：仅允许 loopback / `webRuntime.trustedHosts` 的 Host 访问 `/studio/*`；媒体路径限定在 WE Workshop、dsh-skins 与本地壁纸目录内。

## License

MIT
