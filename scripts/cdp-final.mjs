// cdp-final.mjs — 综合验证：协作面板打开、皮肤中心背景设置、壁纸层、入口按钮。
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
    if (msg.method === 'Runtime.exceptionThrown') events.push(`[exception] ${(msg.params.exceptionDetails?.exception?.description ?? '').slice(0, 300)}`)
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') events.push(`[console.error] ${(msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 250)}`)
  })
  await new Promise((r) => ws.on('open', r))
  await send('Runtime.enable')
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  console.log('== 1) 侧边栏入口 ==')
  console.log(await evalJs(`(() => JSON.stringify([...document.querySelectorAll('button')].map(b=>b.title||'').filter(t=>t.includes('皮肤中心')||t.includes('协作'))))()`))
  console.log('== 2) 打开协作看板 ==')
  await evalJs(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('协作')); b?.click() })()`)
  await sleep(2000)
  console.log(await evalJs(`(() => { const t=document.body.innerText; return JSON.stringify({collabTitle: t.includes('协作看板'), subagentTitle: t.includes('子代理'), emptyHint: t.includes('还没有子代理'), dispatchBtn: t.includes('投递到共享队列')}) })()`))
  console.log('== 3) 切换皮肤中心 ==')
  await evalJs(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('皮肤中心')); b?.click() })()`)
  await sleep(2000)
  console.log(await evalJs(`(() => { const t=document.body.innerText; return JSON.stringify({collabClosed: !t.includes('协作看板'), skinTitle: t.includes('皮肤中心'), chooseBtn: t.includes('选择本地或壁纸引擎壁纸'), bgOcc: t.includes('背景遮挡'), blurEmpty: t.includes('空对话模糊'), blurContent: t.includes('有内容模糊'), skins: t.includes('皮肤')}) })()`))
  console.log('== 4) 壁纸层 ==')
  console.log(await evalJs(`(() => { const root=document.getElementById('dsh-studio-root'); const m=root?.querySelector('img, video'); return JSON.stringify({rootChildren: root?.children.length, media: m?m.tagName+' '+(m.src||'').slice(0,60):'none', translucency: !!document.getElementById('dsh-studio-translucency')}) })()`))
  console.log('== 5) 错误 ==')
  if (events.length === 0) console.log('（无）')
  events.slice(0, 8).forEach((e) => console.log(e))
  ws.close()
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
