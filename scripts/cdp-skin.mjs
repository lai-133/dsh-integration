// cdp-skin.mjs — 打开设置页，抓取原版「皮肤中心」section 的 DOM 结构与截图区域信息（供风格重构参考）。
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

  // 1) 点击设置按钮（footer 的 sidebar.settings 条目）
  console.log('1) 打开设置…')
  const clicked = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find(x => (x.title || '').includes('设置')) || btns.find(x => x.textContent.trim() === '设置')
    if (!b) return 'no-settings-btn:' + btns.map(x=>x.title||x.textContent.slice(0,10)).filter(Boolean).slice(-8).join('|')
    b.click(); return 'ok'
  })()`)
  console.log('   ', clicked)
  await sleep(3000)
  // 2) 找皮肤中心 section
  console.log('2) 皮肤中心 section 结构…')
  const struct = await evalJs(`(() => {
    const text = document.body.innerText
    if (!text.includes('皮肤中心')) return 'no-skin-center-text'
    // 找到含“皮肤中心”标题的元素，向上找 section 容器
    const all = [...document.querySelectorAll('*')]
    const titleEl = all.find(e => e.children.length === 0 && e.textContent.trim() === '皮肤中心')
    if (!titleEl) return 'no-title-el'
    let el = titleEl
    for (let i = 0; i < 6; i++) { el = el.parentElement; if (!el) break }
    const walk = (node, depth) => {
      if (depth > 3) return ''
      let out = '  '.repeat(depth) + node.tagName + (node.className && typeof node.className === 'string' ? '.' + node.className.split(' ').slice(0,2).join('.') : '')
      if (node.children.length === 0 && node.textContent.trim()) out += ' "' + node.textContent.trim().slice(0, 30) + '"'
      out += '\\n'
      for (const c of node.children) out += walk(c, depth + 1)
      return out
    }
    return walk(el, 0).slice(0, 3000)
  })()`)
  console.log(struct)
  ws.close()
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
