// restart.mjs — 可靠的桌面应用重启脚本（解决"杀不干净 + 单实例锁导致新实例秒退"问题）。
//   用法：node scripts/restart.mjs [--debug]
//   --debug：附带 Chromium 远程调试端口 9222（排查页面用）。
// 流程：写临时 PS 脚本按命令行精确杀进程 → 轮询等 3081 释放 → detached 启动 → 轮询等服务就绪。
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import http from 'node:http'
import { writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const debug = process.argv.includes('--debug')
const PORT = Number(process.env.DSH_DESKTOP_PORT || 3081)
const ELECTRON_CLI = join(root, 'node_modules', 'electron', 'cli.js')
const log = (...a) => console.log(`[restart]`, ...a)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' })
    s.setTimeout(500)
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('timeout', () => { s.destroy(); resolve(false) })
    s.once('error', () => resolve(false))
  })
}

async function waitPortFree(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await portBusy(port))) return true
    await sleep(500)
  }
  return false
}

async function waitPortUp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portBusy(port)) {
      try {
        const ok = await new Promise((resolve) => {
          const req = http.get(`http://127.0.0.1:${port}/`, (res) => { res.resume(); resolve(res.statusCode === 200) })
          req.on('error', () => resolve(false))
          req.setTimeout(1500, () => { req.destroy(); resolve(false) })
        })
        if (ok) return true
      } catch { /* retry */ }
    }
    await sleep(500)
  }
  return false
}

function killByCommandLine(ps1) {
  // 按命令行精确匹配，避免误杀其它 Electron 应用
  const script = `$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like '*dsh-desktop*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*dsh-desktop*' -and $_.CommandLine -like '*bin.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
`
  writeFileSync(ps1, script, 'utf8')
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8' })
  if (r.error) throw r.error
  log('已发送停止信号（等待进程退出与端口释放）')
}

async function main() {
  const ps1 = join(root, '.tools', 'restart-kill.ps1')
  try {
    killByCommandLine(ps1)
  } finally {
    rmSync(ps1, { force: true })
  }
  const freed = await waitPortFree(PORT, 30000)
  if (!freed) {
    log(`❌ 端口 ${PORT} 30 秒内未释放，请手动关闭后重试`)
    process.exit(1)
  }
  log(`✅ 端口 ${PORT} 已释放，启动应用${debug ? '（调试端口 9222）' : ''}…`)
  const args = [ELECTRON_CLI, '.', ...(debug ? ['--remote-debugging-port=9222'] : [])]
  const child = spawn(process.execPath, args, { cwd: root, detached: true, stdio: 'ignore', env: process.env })
  child.unref()
  const up = await waitPortUp(PORT, 90000)
  if (!up) {
    log(`❌ 应用 90 秒内未就绪（${PORT}）`)
    process.exit(1)
  }
  log(`✅ 应用已启动并响应: http://127.0.0.1:${PORT}`)
  // 顺带验证 studio host 路由
  try {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: PORT, path: '/studio/api/status', method: 'POST', headers: { 'content-type': 'application/json' } }, (r) => {
        let body = ''
        r.on('data', (c) => (body += c))
        r.on('end', () => resolve({ status: r.statusCode, body }))
      })
      req.on('error', reject)
      req.end('{}')
    })
    const parsed = JSON.parse(res.body)
    log(`studio host: HTTP ${res.status} ok=${parsed.ok} weRoots=${parsed.value?.weRoots?.length} subs=${parsed.value?.subs}`)
  } catch (error) {
    log(`studio host 检查失败: ${error.message}`)
  }
  if (debug) log('CDP: http://127.0.0.1:9222/json')
  log('完成。')
}

main().catch((e) => {
  console.error('[restart] 失败:', e)
  process.exit(1)
})
