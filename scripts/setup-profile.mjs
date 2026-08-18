// setup-profile.mjs — 把四个开源集成装进 DSH 的 web profile（与网页端共享 DSH_HOME）。
//
// 全新机器零手工步骤：
//   0. 自动初始化 DSH_HOME 骨架（~/.dsh：profiles / sessions / storages）；
//   1. 自动准备 pnpm：PATH 已有 → 直接用；否则 corepack 生成 shim；
//      再不行 → npm 本地安装 pnpm 到 .tools 并写 shim（无需管理员权限）；
//   2. 确保 web profile 存在（按官方模板初始化）；
//   3. 在 profile 的 pnpm-workspace.yaml 里写入 minimumReleaseAgeExclude
//      （绕过 pnpm 11 对新鲜发布包的“发布年龄门禁”，避免装到旧版）；
//   4. 用官方 `dsh plugin --profile web add <spec>` 逐个安装：
//        dsh-better-sidebar   —— 服务化侧边栏工作台
//        @liustack/modlens    —— ModLens 视觉引擎
//        @linxin666/dsh-web-ui-all —— dsh-web-ui 全家桶（梁神模式/看板/Git 图谱/皮肤中心…）
//        dshmarket            —— DSH 插件市场（覆盖 awesome-dsh-plugin 精选清单的一键安装）
//   5. pnpm approve-builds 放行原生构建（node-pty 等）；bundles 校准。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { dshBin } from './setup-runtime.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const pnpmDir = join(root, '.tools', 'bin')
const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')

const PLUGINS = [
  ['dsh-better-sidebar', 'dsh-better-sidebar@0.12.3'],
  ['ModLens', '@liustack/modlens@3.18.1'],
  // 聚合包带 ssh2/cloudflared/cpu-features 三个重原生依赖：构建脚本易在无编译工具链
  // 或网络受限环境失败/崩溃，且其绑定均为可选件（插件自带降级），故跳过构建脚本直装。
  ['dsh-web-ui 全家桶', '@linxin666/dsh-web-ui-all@0.1.19', { ignoreScripts: true }],
  ['dshmarket（插件市场）', 'dshmarket@1.10.1'],
]

const PROFILE_PACKAGE_JSON = {
  name: 'dsh-profile-web',
  private: true,
  dependencies: {},
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
}

const PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

const MIN_RELEASE_AGE_EXCLUDE = [
  '@linxin666/*',
  '@liustack/*',
  'dsh-better-sidebar',
  'dshmarket',
]

/** 需要放行构建脚本的原生依赖（node-pty 终端、ssh2/cpu-features SSH、cloudflared 隧道）。
 *  必须提前写入 allowBuilds，否则 pnpm 11 会以 ERR_PNPM_IGNORED_BUILDS 返回非零，
 *  导致官方 `dsh plugin` 误报“pnpm failed”。 */
const ALLOW_BUILDS = {
  'node-pty': true,
  ssh2: true,
  'cpu-features': true,
  cloudflared: true,
}

function envWithPath() {
  return { ...process.env, DSH_HOME: dshHome, PATH: `${pnpmDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` }
}

function run(cmd, args, opts = {}) {
  const env = envWithPath()
  console.log(`\n>>> ${cmd} ${args.join(' ')}`)
  // node.exe 是真正的可执行文件可直接 spawn；pnpm/npm/corepack 是 .cmd shim，
  // Windows 上必须经 shell 解析，否则 spawn 报 ENOENT。
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || root,
    env,
    stdio: opts.quiet ? 'ignore' : 'inherit',
    shell: process.platform === 'win32' && cmd !== 'node',
  })
  if (r.error) throw r.error
  return r.status ?? 1
}

function onPath(cmd) {
  const r = spawnSync(cmd, ['--version'], { env: envWithPath(), stdio: 'ignore', shell: process.platform === 'win32' })
  return !r.error && r.status === 0
}

// ── 0. DSH_HOME 骨架 ────────────────────────────────────────
function ensureDshHome() {
  for (const sub of ['', 'profiles', 'sessions', 'storages']) {
    mkdirSync(join(dshHome, sub), { recursive: true })
  }
  console.log(`[setup-profile] DSH_HOME 已就绪: ${dshHome}`)
}

// ── 1. pnpm 自动准备：PATH → corepack → npm 本地安装兜底 ─────
function ensurePnpm() {
  if (onPath('pnpm')) {
    console.log('[setup-profile] ✅ 检测到 pnpm（PATH）')
    return
  }
  mkdirSync(pnpmDir, { recursive: true })
  if (onPath('corepack')) {
    console.log('[setup-profile] 未找到 pnpm，通过 corepack 生成 shim…')
    if (run('corepack', ['enable', '--install-directory', pnpmDir], { quiet: true }) === 0) {
      console.log('[setup-profile] 预热 corepack pnpm（首次运行会下载 pnpm，约 1 分钟）…')
      run('corepack', ['pnpm', '--version'], { quiet: true })
      if (onPath('pnpm')) {
        console.log('[setup-profile] ✅ pnpm 已就绪（corepack shim）')
        return
      }
    }
    console.warn('[setup-profile] corepack 路径失败，改用本地 npm 安装 pnpm…')
  } else {
    console.log('[setup-profile] 未找到 corepack，改用本地 npm 安装 pnpm…')
  }
  // 兜底：把 pnpm 装进项目 .tools（无需管理员权限），并写 shim
  if (run('npm', ['install', '--prefix', join(root, '.tools'), 'pnpm@11'], { quiet: true }) !== 0) {
    throw new Error('无法自动准备 pnpm：请手动安装（npm install -g pnpm）后重试')
  }
  const pnpmCjs = join(root, '.tools', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  writeFileSync(join(pnpmDir, 'pnpm.cmd'), `@echo off\r\nnode "%~dp0..\\node_modules\\pnpm\\bin\\pnpm.cjs" %*\r\n`, 'utf8')
  writeFileSync(join(pnpmDir, 'pnpm.ps1'), `node "$PSScriptRoot\\..\\node_modules\\pnpm\\bin\\pnpm.cjs" $args\r\n`, 'utf8')
  writeFileSync(join(pnpmDir, 'pnpm'), `#!/bin/sh\nexec node "$(dirname "$0")/../node_modules/pnpm/bin/pnpm.cjs" "$@"\n`, 'utf8')
  if (!existsSync(pnpmCjs) || !onPath('pnpm')) throw new Error('pnpm 本地安装后仍不可用')
  console.log('[setup-profile] ✅ pnpm 已就绪（项目本地安装）')
}

// ── 2. profile 模板 ──────────────────────────────────────────
function ensureProfile() {
  mkdirSync(profileDir, { recursive: true })
  if (existsSync(join(profileDir, 'package.json'))) {
    console.log(`[setup-profile] 使用已有 profile: ${profileDir}`)
    return
  }
  console.log(`[setup-profile] 初始化 profile: ${profileDir}`)
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify(PROFILE_PACKAGE_JSON, null, 2) + '\n', 'utf8')
  writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), PROFILE_PNPM_WORKSPACE, 'utf8')
  writeFileSync(join(profileDir, 'cordis.yml'), '# dsh profile root — an empty entry list. The tree is composed as patches:\n# each bundle in package.json\'s dsh.profile.bundles, then cordis.patch.yml, then any\n# --patch overlays. Edit cordis.patch.yml, not this file.\n[]\n', 'utf8')
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries (id-targeted config\n# overrides, disables, and insert lists; `!!js` expressions allowed).\n[]\n', 'utf8')
}

function patchPnpmWorkspace() {
  const file = join(profileDir, 'pnpm-workspace.yaml')
  let text = existsSync(file) ? readFileSync(file, 'utf8') : PROFILE_PNPM_WORKSPACE
  if (!/nodeLinker:\s*hoisted/.test(text)) {
    // 保证聚合包子包可解析（dsh-web-ui 官方排障要求）
    text = text.replace(/^(packages:[\s\S]*?)\n(?=\S)/, '$1\nnodeLinker: hoisted\n')
  }
  if (!text.includes('minimumReleaseAgeExclude')) {
    const block = `\n# 绕过 pnpm 11 的发布年龄门禁：这些包发布较新，门禁会静默装回旧版。\nminimumReleaseAgeExclude:\n${MIN_RELEASE_AGE_EXCLUDE.map((p) => `  - '${p}'`).join('\n')}\n`
    text = text.trimEnd() + '\n' + block
  }
  if (!text.includes('allowBuilds')) {
    const block = `\n# 提前放行原生构建脚本，避免 pnpm 以 ERR_PNPM_IGNORED_BUILDS 返回非零\n# （官方 dsh plugin 会把非零误报为失败）。\nallowBuilds:\n${Object.keys(ALLOW_BUILDS).map((p) => `  ${p}: true`).join('\n')}\n`
    text = text.trimEnd() + '\n' + block
  }
  writeFileSync(file, text, 'utf8')
  console.log(`[setup-profile] pnpm-workspace.yaml 已更新: ${file}`)
}

function installPlugins() {
  for (const entry of PLUGINS) {
    const [label, spec, flags] = entry
    const name = spec.startsWith('@') ? `@${spec.split('@')[1]}` : spec.split('@')[0]
    const addArgs = flags?.ignoreScripts ? [spec, '--ignore-scripts'] : [spec]
    let code = run('node', [dshBin, 'plugin', '--profile', 'web', 'add', ...addArgs])
    let landed = name in (JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')).dependencies ?? {})
    if (code !== 0 && !landed) {
      // 网络/解析抖动：先收敛依赖树，再重试一次
      console.warn(`[setup-profile] ${label} 首次安装返回 ${code}，重试…`)
      run('pnpm', ['install'], { cwd: profileDir, quiet: true })
      code = run('node', [dshBin, 'plugin', '--profile', 'web', 'add', ...addArgs])
      landed = name in (JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')).dependencies ?? {})
    }
    if (code !== 0 && !landed) {
      // 最后兜底：跳过构建脚本直装（原生件缺失时插件自带降级），依赖落盘后由 bundles 校准挂载
      console.warn(`[setup-profile] ${label} 构建脚本异常，改用 --ignore-scripts 安装（原生特性降级）…`)
      code = run('pnpm', ['add', spec, '--ignore-scripts'], { cwd: profileDir })
      landed = name in (JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')).dependencies ?? {})
    }
    if (code === 0 && landed) {
      console.log(`[setup-profile] ✅ ${label} 已安装（${spec}）`)
    } else if (landed) {
      // 依赖已写入 package.json（构建脚本失败不影响安装结果）
      console.warn(`[setup-profile] ⚠️ ${label} 依赖已写入，但 pnpm 返回 ${code}（多为原生构建失败，可忽略）`)
    } else {
      console.error(`[setup-profile] ❌ 安装 ${label} 失败（exit ${code}）`)
      process.exitCode = 1
    }
  }
}

function reconcileBundles() {
  // `dsh plugin add` 在 pnpm 退出码为 0 时才 reconcile dsh.profile.bundles；
  // 原生依赖（ssh2/cpu-features）构建失败会让 pnpm 返回非零，导致插件装了却没挂载。
  // 这里按官方同款规则自行校准：依赖里凡声明了 dsh.bundle.patch 的包都并入 bundles。
  const file = join(profileDir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  const bundles = pkg.dsh?.profile?.bundles ?? []
  const base = bundles.filter((b) => b.startsWith('@deepseek-ai/'))
  const plugins = []
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (base.includes(dep) || plugins.includes(dep)) continue
    const dir = join(profileDir, 'node_modules', ...dep.split('/'))
    if (!existsSync(join(dir, 'package.json'))) continue
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (manifest.dsh?.bundle?.patch) plugins.push(dep)
  }
  const next = [...base, ...plugins]
  const changed = JSON.stringify(next) !== JSON.stringify(bundles)
  if (changed) {
    pkg.dsh = { ...pkg.dsh, profile: { ...(pkg.dsh?.profile ?? {}), bundles: next } }
    writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }
  console.log(`[setup-profile] bundles 校准：${JSON.stringify(next)}${changed ? '（已更新）' : '（无变化）'}`)
}

function approveBuilds() {
  // 安全网：allowBuilds 已预置，此处只为捕获未知原生依赖；失败不影响安装结果。
  try {
    const r = run('pnpm', ['approve-builds', '--all'], { cwd: profileDir })
    if (r !== 0) {
      console.warn('[setup-profile] approve-builds 返回非零（通常无害，原生依赖已在 allowBuilds 预置）。')
    }
  } catch (error) {
    console.warn(`[setup-profile] approve-builds 未能执行（${error.message}，可忽略）。`)
  }
}

function verify() {
  const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  console.log('\n[setup-profile] 最终 dsh.profile.bundles:', JSON.stringify(pkg.dsh?.profile?.bundles, null, 2))
  console.log('[setup-profile] dependencies:', JSON.stringify(pkg.dependencies ?? {}, null, 2))
}

if (isMain) {
  if (!existsSync(dshBin)) {
    console.error('[setup-profile] 请先运行 `npm install` 安装 DSH 运行时。')
    process.exit(1)
  }
  ensureDshHome()
  ensurePnpm()
  ensureProfile()
  patchPnpmWorkspace()
  installPlugins()
  approveBuilds()
  reconcileBundles()
  verify()
}
