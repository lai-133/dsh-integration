// setup.mjs — 一键安装：runtime 校验 → pnpm/DSH_HOME 自动准备 → web profile 插件集成 → 画廊数据。
import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRuntime } from './setup-runtime.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

function step(name, script) {
  console.log(`\n════════ ${name} ════════`)
  const r = spawnSync('node', [join(root, 'scripts', script)], { cwd: root, stdio: 'inherit', shell: false })
  if (r.status !== 0) {
    console.error(`[setup] 步骤「${name}」失败（exit ${r.status}）`)
    process.exit(r.status ?? 1)
  }
}

if (isMain) {
  assertRuntime()
  step('DSH_HOME 骨架 + pnpm 自动准备 + web profile 插件集成（dsh-better-sidebar / ModLens / dsh-web-ui / dshmarket）', 'setup-profile.mjs')
  step('awesome-dsh-plugin 画廊数据', 'build-gallery.mjs')
  // 标记安装完成（start.cmd 据此自动补跑 setup）
  writeFileSync(
    join(root, '.setup-complete'),
    JSON.stringify({ completedAt: new Date().toISOString(), dshHome: process.env.DSH_HOME || '(default)' }, null, 2) + '\n',
    'utf8',
  )
  console.log('\n✅ 安装完成。运行 `npm start` 启动桌面版 DeepSeek Harness。')
}
