// cdp-diag.mjs — 精确诊断：面板互斥 + 壁纸层媒体。
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const WebSocket = require('ws')

async function main() {
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) { console.log('未找到页面'); return }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id
    pending.set(mid, resolve)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id) }
  })
  await new Promise((r) => ws.on('open', r))
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const cfgRes = await (await fetch('http://127.0.0.1:3081/studio/api/wallpaper-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
  console.log('服务端配置:', JSON.stringify(cfgRes.value.config).slice(0, 300))

  // 当前面板状态（统计 fixed 面板容器）
  console.log('面板状态:', await evalJs(`(() => {
    const root = document.getElementById('dsh-studio-root')
    const fixed = root ? [...root.querySelectorAll('div')].filter(d => (d.style.position === 'fixed') && d.getBoundingClientRect().width > 200).map(d => d.getBoundingClientRect().width + 'x' + d.getBoundingClientRect().height) : []
    const media = root ? [...root.querySelectorAll('img, video')].map(m => m.tagName + ':' + (m.currentSrc || m.src || '').slice(0, 50)) : []
    return JSON.stringify({ fixedPanels: fixed, media })
  })()`))

  // 打开协作 → 检查（面板数 = width 360-500 的 fixed 容器）
  await evalJs(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('协作')); b?.click() })()`)
  await sleep(1500)
  console.log('开协作后:', await evalJs(`(() => {
    const root = document.getElementById('dsh-studio-root')
    const fixed = root ? [...root.querySelectorAll('div')].filter(d => { const r=d.getBoundingClientRect(); return d.style.position === 'fixed' && r.width > 360 && r.width < 500 }).length : 0
    return JSON.stringify({ panels: fixed, hasCollab: document.body.innerText.includes('协作看板'), hasSkin: document.body.innerText.includes('选择本地或壁纸引擎壁纸') })
  })()`))

  // 点皮肤中心 → 检查互斥
  await evalJs(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('皮肤中心')); b?.click() })()`)
  await sleep(1500)
  console.log('切皮肤中心后:', await evalJs(`(() => {
    const root = document.getElementById('dsh-studio-root')
    const fixed = root ? [...root.querySelectorAll('div')].filter(d => { const r=d.getBoundingClientRect(); return d.style.position === 'fixed' && r.width > 360 && r.width < 500 }).length : 0
    return JSON.stringify({ panels: fixed, hasCollab: document.body.innerText.includes('协作看板'), hasSkin: document.body.innerText.includes('选择本地或壁纸引擎壁纸') })
  })()`))
  ws.close()
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
