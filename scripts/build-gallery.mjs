// build-gallery.mjs — 从 awesome-dsh-plugin 仓库的 README.md 解析精选插件清单，
// 生成桌面端「插件精选」画廊数据 src/gallery/plugins.json。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const source = join(root, '..', 'third-party', 'awesome-dsh-plugin', 'README.md')
const outFile = join(root, 'src', 'gallery', 'plugins.json')

const BULLET = /^- \[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*-\s*(.+)$/

export function parseAwesomeList(text) {
  const start = text.indexOf('<!-- BEGIN PLUGINS -->')
  const end = text.indexOf('<!-- END PLUGINS -->')
  if (start < 0 || end < 0) throw new Error('awesome-dsh-plugin README 缺少 BEGIN/END PLUGINS 标记')
  const section = text.slice(start, end)
  const plugins = []
  let category = '其他'
  for (const raw of section.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('### ')) {
      category = line.slice(4).trim()
      continue
    }
    const m = BULLET.exec(line)
    if (!m) continue
    const [, repo, url, description] = m
    plugins.push({ category, repo: repo.trim(), url, description: description.trim() })
  }
  return plugins
}

if (isMain) {
  if (!existsSync(source)) {
    console.error(`[gallery] 找不到 ${source}，请先克隆 awesome-dsh-plugin 到 third-party/。`)
    process.exit(1)
  }
  const plugins = parseAwesomeList(readFileSync(source, 'utf8'))
  writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), count: plugins.length, plugins }, null, 2), 'utf8')
  console.log(`[gallery] 已生成 ${outFile}（${plugins.length} 个插件，${new Set(plugins.map((p) => p.category)).size} 个分类）`)
}
