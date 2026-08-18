// cdp-click.mjs — 通过 CDP 点击侧边栏 🎨 皮肤中心按钮，验证面板打开与壁纸配置渲染。
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
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
    return r.result?.value
  }
  // 点击 🎨 按钮
  const clicked = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.title || '').includes('皮肤中心'))
    if (!btn) return 'no-button'
    btn.click()
    return 'clicked'
  })()`)
  console.log('点击:', clicked)
  await new Promise((r) => setTimeout(r, 2500))
  const state = await evalJs(`(() => {
    const root = document.getElementById('dsh-studio-root')
    const panels = root ? root.querySelectorAll('[style*="position: fixed"]').length : 0
    const text = document.body.innerText
    return JSON.stringify({
      rootChildren: root ? root.children.length : 0,
      hasChooseWallpaper: text.includes('选择本地或壁纸引擎壁纸'),
      hasBlurSlider: text.includes('模糊度'),
      hasFitSelect: text.includes('适配方式'),
      hasSkinList: text.includes('皮肤'),
    })
  })()`)
  console.log('面板状态:', state)
  ws.close()
}

main().catch((e) => { console.error(e.message); process.exit(1) })
