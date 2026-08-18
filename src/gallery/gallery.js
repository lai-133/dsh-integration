// gallery.js — 渲染 awesome-dsh-plugin 精选插件清单。
'use strict'

const listEl = document.getElementById('list')
const searchEl = document.getElementById('search')
const countEl = document.getElementById('count')
let data = { plugins: [] }

function copy(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

function render(filter = '') {
  const q = filter.trim().toLowerCase()
  const plugins = q
    ? data.plugins.filter(
        (p) =>
          p.repo.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
    : data.plugins

  countEl.textContent = String(data.plugins.length)
  if (!plugins.length) {
    listEl.innerHTML = '<div class="empty">没有匹配的插件</div>'
    return
  }

  const byCategory = new Map()
  for (const p of plugins) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, [])
    byCategory.get(p.category).push(p)
  }

  let html = ''
  for (const [category, items] of byCategory) {
    html += `<section class="category"><h2>${category}（${items.length}）</h2><div class="grid">`
    for (const p of items) {
      html += `
        <div class="card">
          <div class="repo">${p.repo}</div>
          <div class="desc">${p.description}</div>
          <div class="actions">
            <button data-action="open" data-url="${p.url}">在 GitHub 打开</button>
            <button data-action="copy" data-url="${p.url}">复制链接</button>
          </div>
        </div>`
    }
    html += '</div></section>'
  }
  listEl.innerHTML = html
}

listEl.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-action]')
  if (!btn) return
  const { action, url } = btn.dataset
  if (action === 'open') window.dshDesktop.galleryOpenExternal(url)
  if (action === 'copy') copy(url)
})

document.querySelectorAll('a[data-url]').forEach((a) => {
  a.addEventListener('click', (event) => {
    event.preventDefault()
    window.dshDesktop.galleryOpenExternal(a.dataset.url)
  })
})

searchEl.addEventListener('input', () => render(searchEl.value))

window.dshDesktop.galleryData().then((d) => {
  data = d
  if (d.error) {
    listEl.innerHTML = `<div class="empty">画廊数据加载失败：${d.error}<br/>请先运行 <code>npm run gallery:build</code></div>`
    return
  }
  render()
})
