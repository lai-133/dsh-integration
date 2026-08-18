// server.js — 管理自托管的 dsh web 服务进程（spawn / 端口探测 / URL 解析 / 健康检查 / 优雅关闭）。
'use strict'

const { spawn } = require('node:child_process')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const DSH_BIN = path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const URL_LINE = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/i

/** 启动前置检查：web profile 必须已初始化（npm run setup），否则给出明确指引。 */
function assertProfileReady() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const profilePkg = path.join(dshHome, 'profiles', 'web', 'package.json')
  if (!fs.existsSync(profilePkg)) {
    throw new Error(
      'web profile 尚未初始化：请在项目目录先运行 `npm run setup`（自动初始化 ~/.dsh、pnpm 并安装集成插件），然后重新启动。',
    )
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.setTimeout(500)
    socket.once('connect', () => { socket.destroy(); resolve(false) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(true))
  })
}

async function findFreePort(from, to) {
  for (let port = from; port <= to; port++) {
    if (await isPortFree(port)) return port
  }
  return 0 // 让 dsh 自己选
}

async function httpOk(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500) })
        req.on('error', () => resolve(false))
        req.setTimeout(1500, () => { req.destroy(); resolve(false) })
      })
      if (ok) return true
    } catch {
      /* retry */
    }
    await sleep(400)
  }
  return false
}

/** 解析可用的 Node 运行时：优先系统 node，回退 ELECTRON_RUN_AS_NODE。 */
function resolveNodeCommand() {
  if (process.env.DSH_DESKTOP_NODE) return { file: process.env.DSH_DESKTOP_NODE, env: {} }
  // 系统 node 在 PATH 上（由 spawn 解析）；找不到时回退到 electron-as-node。
  return { file: 'node', env: {} }
}

class DshServer {
  constructor({ preferredPort = 3081, onUrl, onLog, onExit }) {
    this.preferredPort = preferredPort
    this.onUrl = onUrl
    this.onLog = onLog
    this.onExit = onExit
    this.child = null
    this.url = null
    this.port = null
    this.stopping = false
  }

  status() {
    return {
      running: this.child !== null && this.child.exitCode === null,
      url: this.url,
      port: this.port,
      pid: this.child?.pid ?? null,
    }
  }

  async start() {
    if (this.child && this.child.exitCode === null) return this.status()
    this.stopping = false
    this.url = null
    assertProfileReady() // 未初始化时抛出明确指引，主进程会显示错误页

    const wanted = Number(process.env.DSH_DESKTOP_PORT || this.preferredPort)
    const port = await findFreePort(wanted, wanted + 15)

    const { file, env } = resolveNodeCommand()
    const args = [DSH_BIN, '--profile', 'web', '--port', String(port)]
    if (process.env.DSH_DESKTOP_DSH_HOME) env.DSH_HOME = process.env.DSH_DESKTOP_DSH_HOME
    this.log(`spawn: ${file} ${args.join(' ')}`)

    this.child = spawn(file, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      this.log(`[dsh] ${text.trimEnd()}`)
      const m = URL_LINE.exec(text)
      if (m && !this.url) {
        this.url = m[1]
        this.port = Number(new URL(this.url).port)
        this.log(`检测到 Web 服务: ${this.url}`)
        this.onUrl?.(this.url)
      }
    })
    this.child.stderr.on('data', (chunk) => this.log(`[dsh:err] ${chunk.toString().trimEnd()}`))
    this.child.on('exit', (code, signal) => {
      const wasRunning = !!this.url
      this.child = null
      if (!this.stopping) {
        this.log(`dsh 进程退出 code=${code} signal=${signal}`)
        this.onExit?.({ code, signal, wasRunning })
      }
    })

    // 等待 URL 行（最长 60s）
    const deadline = Date.now() + 60000
    while (!this.url && this.child && Date.now() < deadline) await sleep(200)
    if (!this.url) throw new Error('dsh web 未能在 60s 内输出服务地址，请查看日志')

    const ok = await httpOk(this.url)
    if (!ok) throw new Error(`dsh web 服务 ${this.url} 健康检查未通过`)
    return this.status()
  }

  async stop() {
    this.stopping = true
    const child = this.child
    if (!child) return
    this.log('正在关闭 dsh 进程…')
    child.kill()
    const deadline = Date.now() + 10000
    while (child.exitCode === null && Date.now() < deadline) await sleep(100)
    if (child.exitCode === null) child.kill('SIGKILL')
    this.child = null
    this.url = null
    this.port = null
  }

  async restart() {
    await this.stop()
    this.stopping = false
    return this.start()
  }

  log(line) {
    console.log(`[dsh-desktop] ${line}`)
    this.onLog?.(line)
  }
}

module.exports = { DshServer, findFreePort, httpOk }
