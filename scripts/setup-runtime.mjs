// setup-runtime.mjs — 校验 DSH 运行时已安装，并定位 dsh CLI 入口。
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
export const dshBin = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

export function assertRuntime() {
  if (!existsSync(dshBin)) {
    console.error('[dsh-desktop] DSH 运行时未安装：请先执行 `npm install`（安装 @deepseek-ai/dsh）。')
    process.exit(1)
  }
  return dshBin
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertRuntime()
  console.log('[dsh-desktop] DSH 运行时 OK:', dshBin)
}
