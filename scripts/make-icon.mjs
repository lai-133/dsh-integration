// make-icon.mjs — 从一张方形源图生成应用图标：
//   node scripts/make-icon.mjs <源图> <输出目录>
// 默认：node scripts/make-icon.mjs head-final.png src/main/assets
// 生成 icon-{16,24,32,48,64,128,256}.png 与 icon.ico（PNG 压缩多尺寸 ICO）。
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require(join(dirname(dirname(fileURLToPath(import.meta.url))), 'node_modules', 'sharp'))

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const [srcArg, outArg] = process.argv.slice(2)
const src = resolve(srcArg || join(root, 'head-final.png'))
const outDir = resolve(outArg || join(root, 'src', 'main', 'assets'))
const sizes = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  mkdirSync(outDir, { recursive: true })
  const pngs = []
  for (const s of sizes) {
    const buf = await sharp(src).resize(s, s, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer()
    pngs.push({ size: s, buf })
  }
  for (const s of [16, 32, 256]) {
    writeFileSync(join(outDir, `icon-${s}.png`), pngs.find((p) => p.size === s).buf)
  }
  // 组装多尺寸 ICO（Vista+ PNG 压缩条目）
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size === 256 ? 0 : size, 0)
    e.writeUInt8(size === 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(buf.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += buf.length
  }
  writeFileSync(join(outDir, 'icon.ico'), Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]))
  console.log(`[make-icon] ${src} → ${outDir}（${sizes.length} 尺寸）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
