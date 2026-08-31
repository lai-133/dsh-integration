// cdp-collab.mjs — 点击 🤝 协作入口，检查面板是否打开、捕获错误。
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const WebSocket = require('ws')

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
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
      events.push(`[exception] ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? ''}`.slice(0, 400))
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      events.push(`[console.error] ${(msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`)
    }
  })
  await new Promise((r) => ws.on('open', r))
  await send('Runtime.enable')
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  console.log('点击 🤝 协作入口…')
  const clicked = await evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.title || '').includes('协作'))
    if (!b) return 'no-btn'
    b.click(); return 'ok'
  })()`)
  console.log('  点击:', clicked)
  await sleep(2500)
  const state = await evalJs(`(() => {
    const root = document.getElementById('dsh-studio-root')
    const text = document.body.innerText
    return JSON.stringify({
      rootChildren: root ? root.children.length : 0,
      hasCollabTitle: text.includes('协作看板'),
      hasSubagentTitle: text.includes('子代理'),
      hasEmptyHint: text.includes('还没有子代理'),
    })
  })()`)
  console.log('  面板状态:', state)
  console.log('=== 捕获错误 ===')
  if (events.length === 0) console.log('（无）')
  events.slice(0, 10).forEach((e) => console.log(e))
  ws.close()
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
