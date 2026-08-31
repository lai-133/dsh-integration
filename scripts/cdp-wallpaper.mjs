// cdp-wallpaper.mjs — 模拟：打开皮肤中心 → 打开壁纸选择器 → 点选一张壁纸 → 验证配置与图层变化。
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

  console.log('1) 打开皮肤中心面板…')
  await evalJs(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('皮肤中心')); if(b){b.click();return 'ok'} return 'no-btn' })()`)
  await sleep(1500)
  console.log('2) 打开壁纸选择器…')
  const picker = await evalJs(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('选择本地或壁纸引擎壁纸')); if(b){b.click();return 'ok'} return 'no-btn' })()`)
  console.log('   picker:', picker)
  await sleep(1500)
  console.log('3) 点选第一张壁纸（非当前）…')
  const clickResult = await evalJs(`(() => {
    const items = [...document.querySelectorAll('#dsh-studio-root [style*="cursor: pointer"]')]
    if (items.length < 2) return 'few:' + items.length
    const idx = items.length > 2 ? 2 : 1
    const title = items[idx]?.innerText?.slice(0, 30)
    items[idx].click()
    return 'clicked:' + title
  })()`)
  console.log('   ', clickResult)
  await sleep(3000)
  console.log('4) 读取服务端配置…')
  const cfg = await (await fetch('http://127.0.0.1:3081/studio/api/wallpaper-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
  console.log('   config:', JSON.stringify({ enabled: cfg.value.config.enabled, title: cfg.value.config.wallpaperId, file: (cfg.value.config.file || '').slice(0, 60) }))
  console.log('5) 检查图层 DOM…')
  const layer = await evalJs(`(() => {
    const root = document.getElementById('dsh-studio-root')
    const media = root ? root.querySelector('img, video') : null
    return JSON.stringify({ hasMedia: !!media, tag: media?.tagName, src: media ? media.src.slice(0, 80) : '' })
  })()`)
  console.log('   ', layer)
  ws.close()
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
