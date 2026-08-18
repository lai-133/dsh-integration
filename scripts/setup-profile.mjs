// setup-profile.mjs — 把四个开源集成装进 DSH 的 web profile（与网页端共享 DSH_HOME）。
//
// 1. 确保 web profile 存在（缺省按官方模板初始化）。
// 2. 在 profile 的 pnpm-workspace.yaml 里写入 minimumReleaseAgeExclude
//    （绕过 pnpm 11 对新鲜发布包的“发布年龄门禁”，避免装到旧版）。
// 3. 用官方 `dsh plugin --profile web add <spec>` 逐个安装：
//      dsh-better-sidebar   —— 服务化侧边栏工作台
//      @liustack/modlens    —— ModLens 视觉引擎
//      @linxin666/dsh-web-ui-all —— dsh-web-ui 全家桶（梁神模式/看板/Git 图谱/皮肤中心…）
//      dshmarket            —— DSH 插件市场（覆盖 awesome-dsh-plugin 精选清单的一键安装）
// 4. 通过 pnpm approve-builds 放行原生构建（node-pty 等）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
  ['dsh-web-ui 全家桶', '@linxin666/dsh-web-ui-all@0.1.19'],
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

function run(cmd, args, opts = {}) {
  const env = { ...process.env, DSH_HOME: dshHome, PATH: `${pnpmDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` }
  console.log(`\n>>> ${cmd} ${args.join(' ')}`)
  // 仅 .cmd shim（pnpm）需要 shell；node 直接 spawn，避免 shell 拼接警告。
  const r = spawnSync(cmd, args, { cwd: opts.cwd || root, env, stdio: 'inherit', shell: process.platform === 'win32' && cmd.endsWith('.cmd') })
  if (r.error) throw r.error
  return r.status ?? 1
}

function ensureProfile() {
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
  writeFileSync(file, text, 'utf8')
  console.log(`[setup-profile] pnpm-workspace.yaml 已更新: ${file}`)
}

function installPlugins() {
  for (const [label, spec] of PLUGINS) {
    const name = spec.startsWith('@') ? `@${spec.split('@')[1]}` : spec.split('@')[0]
    const code = run('node', [dshBin, 'plugin', '--profile', 'web', 'add', spec])
    const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
    const landed = name in (pkg.dependencies ?? {})
    if (code === 0 && landed) {
      console.log(`[setup-profile] ✅ ${label} 已安装（${spec}）`)
    } else if (landed) {
      // 依赖已写入 package.json（pnpm 可能因原生构建脚本返回非零，但不影响安装结果）
      console.warn(`[setup-profile] ⚠️ ${label} 依赖已写入，但 pnpm 返回 ${code}（多为 ssh2/cpu-features 原生构建失败，可忽略）`)
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
  // node-pty / ssh2 / cloudflared / cpu-features 等原生依赖需要放行构建脚本。
  const r = run('pnpm', ['approve-builds', '--all'], { cwd: profileDir })
  if (r !== 0) {
    console.warn('[setup-profile] approve-builds 未执行成功，请手动在 profile 目录运行 `pnpm approve-builds --all`。')
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
  ensureProfile()
  patchPnpmWorkspace()
  installPlugins()
  approveBuilds()
  reconcileBundles()
  verify()
}
