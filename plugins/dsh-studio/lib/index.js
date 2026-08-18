// dsh-studio 宿主半：为客户端提供
//   /studio/api/status|wallpapers|wallpaper-config|skins|skin-apply|relay-push|relay-list|subagents|followup|interrupt
//   /studio/media（Range 流式媒体）
// 全部路由带 loopback/trustedHosts 信任围栏；配置持久化到 $DSH_HOME/studio.json（原子写入）。
import { createRequire } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, statSync, createReadStream } from 'node:fs'
import { join, basename, dirname, extname, isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)

const name = 'studio'
const inject = ['webServer']

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
}

// ── 工具 ────────────────────────────────────────────────────
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function cfgFile() {
  return join(dshHome(), 'studio.json')
}

function readConfig() {
  const def = { source: '', wallpaperId: '', localPath: '', fit: 'cover', pos: 'center', scale: 1, blur: 8, enabled: false }
  try {
    return { ...def, ...JSON.parse(readFileSync(cfgFile(), 'utf8')) }
  } catch {
    return def
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch }
  mkdirSync(dirname(cfgFile()), { recursive: true })
  const tmp = cfgFile() + '.tmp'
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  renameSync(tmp, cfgFile())
  return next
}

/** 扫描 Steam 库中的 Wallpaper Engine 安装与 Workshop 内容目录。 */
function steamRoots() {
  const candidates = (process.env.STUDIO_WE_ROOTS ?? '')
    .split(';').map((s) => s.trim()).filter(Boolean)
  candidates.push(
    'D:\\SteamLibrary', 'D:\\Steam', 'D:\\SteamGames', 'E:\\SteamLibrary', 'E:\\Steam',
    'F:\\SteamLibrary', 'C:\\SteamLibrary', 'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam',
  )
  const out = []
  for (const root of candidates) {
    const we = join(root, 'steamapps', 'common', 'wallpaper_engine')
    const workshop = join(root, 'steamapps', 'workshop', 'content', '431960')
    if (existsSync(we) || existsSync(workshop)) {
      out.push({ root, we, workshop })
    }
  }
  return out
}

/** 本地壁纸目录：$DSH_HOME/studio-wallpapers 与用户图片目录（仅顶层图片）。 */
function localDirs() {
  return [join(dshHome(), 'studio-wallpapers'), join(homedir(), 'Pictures')]
}

async function listLocalWallpapers() {
  const out = []
  for (const dir of localDirs()) {
    if (!existsSync(dir)) continue
    let entries = []
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (!e.isFile()) continue
      const ext = extname(e.name).toLowerCase()
      if (!MIME[ext]) continue
      const abs = join(dir, e.name)
      out.push({ id: `local:${abs}`, title: e.name, type: ext.startsWith('.m') || ext === '.webm' || ext === '.mov' || ext === '.mkv' ? 'video' : 'image', file: abs, source: 'local' })
    }
  }
  return out
}

async function listWeWallpapers() {
  const out = []
  for (const root of steamRoots()) {
    if (!existsSync(root.workshop)) continue
    let items
    try { items = await readdir(root.workshop, { withFileTypes: true }) } catch { continue }
    for (const item of items) {
      if (!item.isDirectory()) continue
      const dir = join(root.workshop, item.name)
      const pj = join(dir, 'project.json')
      if (!existsSync(pj)) continue
      let meta
      try { meta = JSON.parse(readFileSync(pj, 'utf8')) } catch { continue }
      const type = String(meta.type ?? '').toLowerCase()
      const file = String(meta.file ?? '')
      const media = file && existsSync(join(dir, file)) ? join(dir, file) : ''
      const poster = ['preview.jpg', 'preview.png', 'screenshot.jpg'].map((n) => join(dir, n)).find((p) => existsSync(p))
      out.push({
        id: `we:${item.name}`,
        title: String(meta.title ?? item.name),
        type: type === 'video' ? 'video' : type === 'image' ? 'image' : 'scene',
        file: media,
        poster: poster || '',
        source: 'we',
        workshopId: item.name,
      })
    }
  }
  return out
}

// ── 信任围栏 ────────────────────────────────────────────────
function trusted(ctx, req) {
  const host = String(req.headers.host ?? '').toLowerCase()
  if (host.startsWith('127.0.0.1') || host.startsWith('localhost')) return true
  const extra = ctx.get('webRuntime')?.trustedHosts ?? []
  return extra.some((t) => host === String(t).toLowerCase() || host.startsWith(`${String(t).toLowerCase()}:`))
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function ok(res, value) {
  sendJson(res, 200, { ok: true, value })
}

function fail(res, status, code, message) {
  sendJson(res, status, { ok: false, error: { code, message } })
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolvePromise(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/** 允许访问的媒体路径：WE Workshop 壁纸、dsh-skins 皮肤、本地壁纸目录。 */
function isAllowedMedia(abs) {
  if (!isAbsolute(abs)) return false
  const p = resolve(abs)
  for (const root of steamRoots()) {
    if (p.startsWith(resolve(root.workshop) + '\\') || p.startsWith(resolve(root.workshop) + '/')) return true
  }
  let skinRoot = ''
  try { skinRoot = dirname(require.resolve('@linxin666/dsh-skins/package.json')) } catch { /* 未安装 */ }
  if (skinRoot && (p.startsWith(resolve(skinRoot) + '\\') || p.startsWith(resolve(skinRoot) + '/'))) return true
  for (const dir of localDirs()) {
    if (p.startsWith(resolve(dir) + '\\') || p.startsWith(resolve(dir) + '/')) return true
  }
  return false
}

/** Range 支持的媒体响应。 */
function serveMedia(req, res, abs) {
  let stat
  try { stat = statSync(abs) } catch { return fail(res, 404, 'not-found', '文件不存在') }
  const ext = extname(abs).toLowerCase()
  const type = MIME[ext] ?? 'application/octet-stream'
  const range = req.headers.range
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    if (m) {
      const start = m[1] ? Number(m[1]) : 0
      const end = m[2] ? Number(m[2]) : stat.size - 1
      if (start <= end && end < stat.size) {
        res.writeHead(206, {
          'content-type': type,
          'content-range': `bytes ${start}-${end}/${stat.size}`,
          'accept-ranges': 'bytes',
          'content-length': end - start + 1,
          'cache-control': 'no-cache',
        })
        if (req.method === 'HEAD') return res.end()
        const stream = createReadStream(abs, { start, end })
        stream.on('error', () => res.destroy())
        stream.pipe(res)
        return
      }
    }
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': stat.size, 'cache-control': 'no-cache' })
  if (req.method === 'HEAD') return res.end()
  const stream = createReadStream(abs)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

// ── 子代理操作 ──────────────────────────────────────────────
async function apiSubagents(ctx, payload) {
  const subs = ctx.get('subagents')
  if (!subs) return { needSession: false, unavailable: true }
  const sessionId = String(payload?.sessionId ?? '')
  if (!sessionId) return { unavailable: false, needSession: true }
  try {
    const tree = await subs.listDescendants(sessionId)
    return { tree }
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
}

async function apiFollowup(ctx, payload) {
  const subs = ctx.get('subagents')
  if (!subs) return { error: 'subagents 服务不可用' }
  const { parentSessionId, childId, content } = payload ?? {}
  if (!parentSessionId || !childId || !content) return { error: '缺少参数' }
  try {
    const messageId = await subs.followup(parentSessionId, childId, String(content), { source: 'studio-ui' })
    return { messageId }
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
}

async function apiInterrupt(ctx, payload) {
  const subs = ctx.get('subagents')
  if (!subs) return { error: 'subagents 服务不可用' }
  const { targetSessionId, parentSessionId } = payload ?? {}
  if (!targetSessionId) return { error: '缺少 targetSessionId' }
  try {
    await subs.interrupt(targetSessionId, { kind: 'user', parentSessionId: parentSessionId || undefined })
    return { interrupted: true }
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
}

// ── 任务接力（dsh-task-relay 队列）──────────────────────────
function relayFile() {
  return join(dshHome(), 'task-relay', 'queue.json')
}

/** task-relay 是否可用：队列文件存在，或 dsh-task-relay 包已安装（可初始化）。 */
function relayAvailable() {
  if (existsSync(relayFile())) return true
  try {
    require.resolve('dsh-task-relay/package.json')
    return true
  } catch {
    return false
  }
}

function ensureRelay() {
  if (!existsSync(relayFile())) writeRelay([])
}

function readRelay() {
  try { return JSON.parse(readFileSync(relayFile(), 'utf8')) } catch { return [] }
}

function writeRelay(queue) {
  mkdirSync(dirname(relayFile()), { recursive: true })
  const tmp = relayFile() + '.tmp'
  writeFileSync(tmp, JSON.stringify(queue, null, 2), 'utf8')
  renameSync(tmp, relayFile())
}

function apiRelayPush(payload) {
  if (!relayAvailable()) {
    return { error: '未检测到 dsh-task-relay。请先安装：dsh plugin --profile web add github:LeslieWylie/dsh-task-relay' }
  }
  ensureRelay()
  const { title, description = '', priority = 'normal', tags = [] } = payload ?? {}
  if (!title) return { error: '缺少标题' }
  const queue = readRelay()
  const task = {
    id: `T${Date.now()}-${queue.length + 1}`,
    title: String(title),
    description: String(description),
    priority: String(priority),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    status: 'open',
    createdAt: new Date().toISOString(),
  }
  queue.push(task)
  writeRelay(queue)
  return { task }
}

function apiRelayList() {
  if (!existsSync(relayFile())) return { tasks: [], error: 'task-relay 队列不存在' }
  const queue = readRelay()
  return { tasks: queue.slice(-50).reverse() }
}

// ── 皮肤 ────────────────────────────────────────────────────
async function apiSkins() {
  let skinRoot = ''
  try {
    skinRoot = dirname(require.resolve('@linxin666/dsh-skins/package.json'))
  } catch { /* 未安装 */ }
  if (!skinRoot || !existsSync(join(skinRoot, 'skins'))) return { skins: [], error: 'dsh-skins 未安装' }
  const skins = []
  const entries = await readdir(join(skinRoot, 'skins'), { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const dir = join(skinRoot, 'skins', e.name)
    let info = {}
    try { info = JSON.parse(readFileSync(join(dir, 'skin.json'), 'utf8')) } catch { /* 无元数据 */ }
    const preview = ['preview.jpg', 'preview.png', 'thumb.jpg', 'thumb.png'].map((n) => join(dir, n)).find((p) => existsSync(p))
    skins.push({
      id: e.name,
      title: info.title ?? info.name ?? e.name,
      tagline: info.tagline ?? '',
      preview: preview ? `/studio/media?p=${encodeURIComponent(preview)}` : '',
    })
  }
  return { skins }
}

function apiSkinApply(payload) {
  const target = String(payload?.target ?? '')
  if (!target) return { error: '缺少皮肤 id' }
  return new Promise((resolvePromise) => {
    spawn('dsh', ['skin', 'use', target], {
      env: { ...process.env, DSH_HOME: dshHome() },
      stdio: 'ignore',
      shell: process.platform === 'win32',
    }).on('error', (err) => resolvePromise({ error: `无法执行 dsh 命令：${err.message}（请确认 dsh 在 PATH 中）` }))
      .on('exit', (code) => resolvePromise(code === 0 ? { applied: target } : { error: `dsh skin use 退出码 ${code}` }))
  })
}

// ── 路由入口 ────────────────────────────────────────────────
async function handleStudio(ctx, req, res) {
  if (!trusted(ctx, req)) return fail(res, 403, 'forbidden', '不受信任的 Host')
  const u = new URL(req.url, 'http://localhost')
  const path = u.pathname
  if (path === '/studio/media' && (req.method === 'GET' || req.method === 'HEAD')) {
    const p = u.searchParams.get('p') ?? ''
    if (!isAllowedMedia(p)) return fail(res, 403, 'forbidden', '路径不在允许范围')
    return serveMedia(req, res, p)
  }
  if (!path.startsWith('/studio/api/') || req.method !== 'POST') {
    return fail(res, 404, 'not-found', '未知路由')
  }
  let payload
  try { payload = await readBody(req) } catch { return fail(res, 400, 'bad-json', 'JSON 解析失败') }
  try {
    switch (path.slice('/studio/api/'.length)) {
      case 'status': {
        const roots = steamRoots()
        const relay = existsSync(relayFile())
        const subs = !!ctx.get('subagents')
        return ok(res, { weRoots: roots, relay, subs })
      }
      case 'wallpapers': {
        const we = await listWeWallpapers()
        const local = await listLocalWallpapers()
        return ok(res, { wallpapers: [...we, ...local] })
      }
      case 'wallpaper-config': {
        const action = payload?.action ?? 'get'
        if (action === 'set') return ok(res, { config: writeConfig(payload.config ?? {}) })
        return ok(res, { config: readConfig() })
      }
      case 'skins':
        return ok(res, await apiSkins())
      case 'skin-apply':
        return ok(res, await apiSkinApply(payload))
      case 'relay-push':
        return ok(res, apiRelayPush(payload))
      case 'relay-list':
        return ok(res, apiRelayList())
      case 'subagents':
        return ok(res, await apiSubagents(ctx, payload))
      case 'followup':
        return ok(res, await apiFollowup(ctx, payload))
      case 'interrupt':
        return ok(res, await apiInterrupt(ctx, payload))
      default:
        return fail(res, 404, 'not-found', '未知接口')
    }
  } catch (error) {
    return fail(res, 500, 'internal', String(error?.message ?? error))
  }
}

function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/studio',
    handler: (req, res) => {
      handleStudio(ctx, req, res).catch((error) => {
        try { fail(res, 500, 'internal', String(error?.message ?? error)) } catch { res.destroy() }
      })
    },
  }), 'dsh-studio: /studio 路由')
}

export { apply, inject, name }
