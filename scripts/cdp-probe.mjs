// cdp-probe.mjs — 通过 CDP 重载页面并捕获控制台错误，再检查 studio DOM 状态。
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const WebSocket = require('ws')

const CDP = 'http://127.0.0.1:9222'

async function main() {
  const targets = await (await fetch(`${CDP}/json`)).json()
  const page = targets.find((t) => t.type === 'page' && /127\.0\.0\.1:3081/.test(t.url))
  if (!page) { console.log('未找到页面'); return }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const events = []
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id
    pending.set(mid, resolve)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return }
    if (msg.method === 'Runtime.exceptionThrown') {
      events.push(`[exception] ${msg.params.exceptionDetails?.text} ${msg.params.exceptionDetails?.exception?.description ?? ''}`)
    }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)
      events.push(`[console.${msg.params.type}] ${args}`)
    }
    if (msg.method === 'Log.entryAdded') {
      events.push(`[log.${msg.params.entry.level}] ${(msg.params.entry.text || '').slice(0, 300)}`)
    }
  })
  await new Promise((r) => ws.on('open', r))
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  console.log('重载页面并收集错误（15 秒）…')
  await send('Page.reload', { ignoreCache: true })
  await new Promise((r) => setTimeout(r, 15000))

  const expr = `(() => {
    const root = document.getElementById('dsh-studio-root')
    const trans = document.getElementById('dsh-studio-translucency')
    const buttons = [...document.querySelectorAll('button')].map(b => (b.title || b.getAttribute('aria-label') || '').trim()).filter(Boolean)
    return JSON.stringify({
      hasStudioRoot: !!root,
      rootChildren: root ? root.children.length : 0,
      hasTranslucencyStyle: !!trans,
      buttonsWithStudio: buttons.filter(t => t.includes('皮肤') || t.includes('协作')),
      sidebarButtons: buttons.slice(0, 20),
      hasSkinCenterInText: document.body.innerText.includes('皮肤中心'),
    })
  })()`
  const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  console.log('=== DOM 状态 ===')
  console.log(JSON.stringify(JSON.parse(result.result.value), null, 2))
  console.log('=== 捕获的错误（studio/slots 相关，全部条数见末尾）===')
  const studioRelated = events.filter((e) => e.includes('dsh-studio') || e.includes('studio') || e.includes('slots') || e.includes('sidebar'))
  if (studioRelated.length === 0) console.log('（无 studio 相关错误）')
  studioRelated.forEach((e) => console.log(e))
  console.log(`=== 全部捕获条数: ${events.length} ===`)
  ws.close()
}

main().catch((e) => { console.error('probe 失败:', e.message); process.exit(1) })
