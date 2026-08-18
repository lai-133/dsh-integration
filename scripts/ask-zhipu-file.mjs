// ask-zhipu-file.mjs — 直接调智谱 GLM-4V-Flash，问单个裁剪图一个问题，返回纯文本。
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function loadKey() {
  if (process.env.ZHIPU_KEY) return process.env.ZHIPU_KEY
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.modlens', 'config.json'), 'utf8'))
    return cfg.providers?.openai?.apiKey
  } catch {
    return null
  }
}

const KEY = loadKey()
if (!KEY) {
  console.error('未找到智谱 Key：请设置 ZHIPU_KEY 环境变量或先运行 modlens config set openai.apiKey')
  process.exit(1)
}
const IMG = process.argv[2]
const PROMPT = process.argv[3]

const b64 = readFileSync(IMG).toString('base64')
const body = {
  model: 'glm-4v-flash',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
      ],
    },
  ],
}

const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
if (!res.ok) {
  console.error('HTTP', res.status, await res.text())
  process.exit(1)
}
const json = await res.json()
console.log(json.choices?.[0]?.message?.content ?? JSON.stringify(json, null, 2))
