// dsh-studio 客户端半：侧边栏「皮肤中心」入口（壁纸选择/大小/位置/模糊 + 皮肤列表）与「协作」看板（子代理树 + ▼ 展开操作）。
// 纯 React.createElement，无构建步骤；样式走 DSH 设计令牌。
window.__ModuleLoader__.load({
  id: 'dsh-studio',
  factory: (require) => {
    // CommonJS 模拟：factory 不自动注入 module/exports，须自行创建（照抄官方插件模式）。
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { createElement: h, useState, useEffect, useSyncExternalStore } = React
    const { createRoot } = require('react-dom/client')

    const name = 'studio'
    const inject = ['slots', 'locale']
    // 侧边栏座位条目要求 locale（渲染器用它绑定 t 注入组件）；缺 locale 的条目会被静默丢弃。
    const NS = 'studio'
    const dict = {
      zh: {
        skinCenter: '皮肤中心',
        skinCenterHint: '皮肤中心（壁纸与皮肤）',
        collab: '协作',
        collabHint: '协作看板（子代理与任务投递）',
        wallpaper: '界面壁纸',
        chooseWallpaper: '选择本地或壁纸引擎壁纸',
      },
      en: {
        skinCenter: 'Skin Center',
        skinCenterHint: 'Skin Center (wallpaper & skins)',
        collab: 'Collab',
        collabHint: 'Collab board (subagents & task dispatch)',
        wallpaper: 'Wallpaper',
        chooseWallpaper: 'Choose local or Wallpaper Engine wallpaper',
      },
    }

    // ── 工具 ────────────────────────────────────────────────
    async function call(path, payload) {
      const res = await fetch(`/studio/api/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const parsed = await res.json().catch(() => null)
      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error?.message ?? `HTTP ${res.status}`)
      }
      return parsed.value
    }

    function mediaUrl(p) {
      return p ? `/studio/media?p=${encodeURIComponent(p)}` : ''
    }

    // ── 轻量 store ──────────────────────────────────────────
    const store = {
      version: 0,
      skinPanel: false,
      collabPanel: false,
      pickerOpen: false,
      config: null,
      wallpapers: [],
      skins: [],
      subagents: null,
      relay: [],
      toast: '',
    }
    const listeners = new Set()
    function setStore(patch) {
      Object.assign(store, patch)
      store.version += 1
      for (const fn of listeners) fn()
    }
    function subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }
    function useStore() {
      return useSyncExternalStore(subscribe, () => store)
    }

    function toast(msg) {
      setStore({ toast: msg })
      setTimeout(() => setStore({ toast: '' }), 3500)
    }

    // ── 表面半透明化（照抄皮肤机制：皮肤靠覆盖 --dsw-alias-bg-base 等 token 让背景透出）──
    // 默认主题的表面是纯色不透明，壁纸垫在下面看不见；启用壁纸时把表面 token
    // 改为跟随当前主题色值的半透明，壁纸即可从面板间透出。皮肤激活时其自身机制优先。
    // surfaceAlpha：表面不透明度（0.45=壁纸很透出，0.95=接近不透明），由壁纸面板滑块控制。
    function applyTranslucency(enabled, alpha) {
      const el = document.getElementById('dsh-studio-translucency')
      if (!enabled) {
        if (el) el.remove()
        return
      }
      if (el) el.remove()
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor)
      const base = m ? `${m[1]},${m[2]},${m[3]}` : '21,21,23'
      const a = Math.min(0.95, Math.max(0.45, alpha ?? 0.7))
      const style = document.createElement('style')
      style.id = 'dsh-studio-translucency'
      style.textContent = `:root{` +
        `--dsw-alias-bg-base:rgba(${base},${a});` +
        `--dsw-alias-bg-layer-1:rgba(${base},${Math.min(0.95, a + 0.08)});` +
        `--dsw-alias-bg-layer-2:rgba(${base},${Math.min(0.95, a + 0.12)});` +
        `--dsw-alias-bg-layer-3:rgba(${base},${Math.min(0.95, a + 0.16)});` +
        `--dsw-alias-bg-overlay:rgba(${base},${Math.min(0.95, a + 0.2)})}`
      document.head.appendChild(style)
    }

    function currentSessionId(ctx) {
      try {
        const bs = ctx.get('betterSidebar')
        return bs?.getSnapshot?.()?.sessionId ?? ''
      } catch {
        return ''
      }
    }

    // ── 数据加载 ────────────────────────────────────────────
    async function loadConfig() {
      try { setStore({ config: (await call('wallpaper-config')).config }) } catch { /* 忽略 */ }
    }
    async function loadWallpapers() {
      try { setStore({ wallpapers: (await call('wallpapers')).wallpapers }) } catch (error) { toast(`壁纸列表加载失败：${error.message}`) }
    }
    async function loadSkins() {
      try { setStore({ skins: (await call('skins')).skins }) } catch { /* 忽略 */ }
    }
    async function loadSubagents(ctx) {
      const sessionId = currentSessionId(ctx)
      try { setStore({ subagents: await call('subagents', { sessionId }) }) } catch (error) { setStore({ subagents: { error: error.message } }) }
    }
    async function loadRelay() {
      try { setStore({ relay: (await call('relay-list')).tasks ?? [] }) } catch { /* 未安装 */ }
    }

    // ── 壁纸背景层 ──────────────────────────────────────────
    // 注意：必须 z-index:-1 且背景透明。DSH 根节点是静态定位，正 z 索引的
    // fixed 层会盖住整个 UI；-1 让壁纸垫在界面之下（皮肤背景同样画在 body 上）。
    // ⚠️ 所有 hooks 必须无条件先调用（提前 return 会导致 hooks 数量变化 → React #310 崩溃）。
    function WallpaperLayer() {
      const s = useStore()
      const [videoFailed, setVideoFailed] = React.useState(false)
      const cfg = s.config
      useEffect(() => { setVideoFailed(false) }, [cfg?.localPath || cfg?.file || ''])
      if (!cfg || !cfg.enabled) return null
      const src = cfg.localPath || cfg.file || ''
      if (!src) return null
      const isVideo = cfg.type === 'video' || /\.(mp4|webm|mov|mkv)$/i.test(src)
      const poster = cfg.poster || ''
      // 注意：必须 z-index:-1 且背景透明。DSH 根节点是静态定位，正 z 索引的
      // fixed 层会盖住整个 UI；-1 让壁纸垫在界面之下（皮肤背景同样画在 body 上）。
      const style = {
        position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden',
        background: 'transparent',
      }
      const mediaStyle = {
        width: '100%', height: '100%',
        objectFit: cfg.fit === 'tile' ? 'none' : cfg.fit,
        objectPosition: cfg.pos,
        transform: `scale(${cfg.scale})`,
        filter: cfg.blur ? `blur(${cfg.blur}px)` : undefined,
      }
      // 视频加载/解码失败（如 HEVC）时回退封面图，绝不黑屏
      if (isVideo && !videoFailed) {
        return h('div', { style }, [
          h('video', {
            key: src, src, poster: poster || undefined,
            autoPlay: true, loop: true, muted: true, playsInline: true,
            preload: 'metadata',
            onError: () => setVideoFailed(true),
            style: mediaStyle,
          }),
        ])
      }
      const fallback = poster || src
      return h('div', { style }, [
        h('img', { key: fallback, src: fallback, style: mediaStyle, draggable: false }),
      ])
    }

    // ── 壁纸选择器 ──────────────────────────────────────────
    function WallpaperPicker({ onClose }) {
      const s = useStore()
      useEffect(() => { loadWallpapers() }, [])
      const groups = [
        { key: 'we', title: '壁纸引擎（Wallpaper Engine Workshop）', items: s.wallpapers.filter((w) => w.source === 'we') },
        { key: 'local', title: '本地（~/.dsh/studio-wallpapers 与 Pictures）', items: s.wallpapers.filter((w) => w.source === 'local') },
      ]
      async function pick(w) {
        await call('wallpaper-config', { action: 'set', config: { source: w.source, wallpaperId: w.id, localPath: w.file, file: w.file, type: w.type, poster: w.poster || '', enabled: true } })
        await loadConfig()
        onClose()
        toast(`壁纸已应用：${w.title}`)
      }
      return h('div', { style: panelInnerStyle() }, [
        h('div', { style: headerStyle('选择壁纸') }, [
          h('span', null, '选择壁纸'),
          h('button', { style: btnStyle(), onClick: onClose }, '关闭'),
        ]),
        h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', margin: '0 0 8px' } },
          'Wallpaper Engine 的图片/视频壁纸可直接用作界面背景；场景壁纸仅显示封面。'),
        ...groups.map((g) => h('div', { key: g.key, style: { marginBottom: 14 } }, [
          h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 6 } }, `${g.title}（${g.items.length}）`),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 } },
            g.items.length === 0
              ? h('div', { style: { gridColumn: '1 / -1', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', padding: 8 } }, '（无）')
              : g.items.map((w) => h('div', { key: w.id, style: { cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-2)' }, onClick: () => pick(w) }, [
                  h('div', { style: { height: 52, background: '#0b0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#8fa0cf', overflow: 'hidden' } },
                    w.poster || (w.type === 'image' && w.file)
                      ? h('img', { src: mediaUrl(w.poster || w.file), style: { width: '100%', height: '100%', objectFit: 'cover' } })
                      : (w.type === 'video' ? '▶ 视频' : w.type === 'scene' ? '场景' : '图片')),
                  h('div', { style: { padding: '4px 6px', fontSize: 11, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, w.title),
                ]))),
        ])),
      ])
    }

    // ── 皮肤中心面板 ────────────────────────────────────────
    function SkinCenterPanel({ ctx }) {
      const s = useStore()
      useEffect(() => { loadConfig(); loadSkins() }, [])
      const cfg = s.config ?? {}
      async function setCfg(patch) {
        const next = await call('wallpaper-config', { action: 'set', config: { ...cfg, ...patch } })
        setStore({ config: next.config })
      }
      const previewSrc = cfg.enabled && (cfg.localPath || cfg.file) ? mediaUrl(cfg.localPath || cfg.file) : ''
      const positions = ['left top', 'center top', 'right top', 'left center', 'center', 'right center', 'left bottom', 'center bottom', 'right bottom']
      return h('div', { style: panelOuterStyle() }, [
        h('div', { style: headerStyle('皮肤中心') }, [
          h('span', null, '皮肤中心'),
          h('button', { style: btnStyle(), onClick: () => setStore({ skinPanel: false }) }, '关闭'),
        ]),
        h('div', { style: panelInnerStyle() }, [
          // ── 壁纸卡片 ──
          h('div', { style: cardStyle() }, [
            h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 8 } }, '界面壁纸'),
            h('button', { style: { ...btnStyle(), width: '100%', padding: '8px 12px', fontWeight: 600, background: 'var(--dsw-alias-bg-layer-3)' }, onClick: () => setStore({ pickerOpen: true }) }, '选择本地或壁纸引擎壁纸'),
            previewSrc ? h('div', { style: { marginTop: 8, height: 110, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l2)', position: 'relative' } }, [
              h('img', { src: previewSrc, style: { width: '100%', height: '100%', objectFit: 'cover', filter: cfg.blur ? `blur(${cfg.blur}px)` : undefined } }),
              h('div', { style: { position: 'absolute', left: 6, bottom: 6, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 4, padding: '2px 6px' } },
                cfg.source === 'we' ? '壁纸引擎' : '本地'),
            ]) : h('div', { style: { marginTop: 8, padding: 14, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: 8, textAlign: 'center' } }, '未选择壁纸'),
            h('div', { style: rowStyle() }, [
              h('label', { style: labelStyle() }, '启用'),
              h('input', { type: 'checkbox', checked: !!cfg.enabled, onChange: (e) => setCfg({ enabled: e.target.checked }) }),
            ]),
            h('div', { style: rowStyle() }, [
              h('label', { style: labelStyle() }, `模糊度（0 关闭）: ${cfg.blur ?? 0}px`),
              h('input', { type: 'range', min: 0, max: 30, step: 1, value: cfg.blur ?? 0, style: { flex: 1 }, onChange: (e) => setCfg({ blur: Number(e.target.value) }) }),
            ]),
            h('div', { style: rowStyle() }, [
              h('label', { style: labelStyle() }, `壁纸透出: ${Math.round((1 - (cfg.surfaceAlpha ?? 0.7)) * 100)}%`),
              h('input', { type: 'range', min: 0.45, max: 0.95, step: 0.05, value: cfg.surfaceAlpha ?? 0.7, style: { flex: 1 }, onChange: (e) => setCfg({ surfaceAlpha: Number(e.target.value) }) }),
            ]),
            h('div', { style: rowStyle() }, [
              h('label', { style: labelStyle() }, '适配方式'),
              h('select', { value: cfg.fit ?? 'cover', style: selectStyle(), onChange: (e) => setCfg({ fit: e.target.value }) },
                ['cover', 'contain', 'fill', 'tile'].map((f) => h('option', { key: f, value: f }, { cover: '铺满（裁切）', contain: '完整显示', fill: '拉伸', tile: '平铺' }[f]))),
            ]),
            h('div', { style: rowStyle() }, [
              h('label', { style: labelStyle() }, '位置'),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 18px)', gap: 3 } },
                positions.map((p) => h('div', {
                  key: p,
                  style: {
                    width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
                    border: cfg.pos === p ? '2px solid var(--dsw-alias-accent)' : '1px solid var(--dsw-alias-border-l2)',
                    background: 'var(--dsw-alias-bg-layer-2)',
                  },
                  onClick: () => setCfg({ pos: p }),
                }))),
            ]),
            h('div', { style: rowStyle() }, [
              h('label', { style: labelStyle() }, `缩放: ${cfg.scale ?? 1}×`),
              h('input', { type: 'range', min: 0.5, max: 2, step: 0.1, value: cfg.scale ?? 1, style: { flex: 1 }, onChange: (e) => setCfg({ scale: Number(e.target.value) }) }),
            ]),
            h('div', { style: rowStyle() }, [
              h('button', { style: btnStyle(), onClick: async () => { await setCfg({ enabled: false, wallpaperId: '', localPath: '', file: '', source: '' }); toast('已清除壁纸') } }, '清除壁纸'),
              h('button', { style: btnStyle(), onClick: () => setCfg({ blur: 8, fit: 'cover', pos: 'center', scale: 1, surfaceAlpha: 0.7 }) }, '恢复默认'),
            ]),
            h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 8, lineHeight: 1.5 } },
              '背景遮挡、空对话/有内容模糊等皮肤中心设置仍然生效；此处补充壁纸的大小/位置/模糊控制。'),
          ]),
          // ── 皮肤卡片 ──
          h('div', { style: cardStyle() }, [
            h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 8 } }, '皮肤'),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 } },
              s.skins.length === 0
                ? h('div', { style: { gridColumn: '1 / -1', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', padding: 8 } }, '（未检测到已安装皮肤）')
                : s.skins.map((skin) => h('div', { key: skin.id, style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-2)' } }, [
                    h('div', { style: { height: 44, background: '#0b0f1a', overflow: 'hidden' } },
                      skin.preview ? h('img', { src: skin.preview, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : null),
                    h('div', { style: { padding: '4px 6px', fontSize: 11, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, skin.title),
                    h('button', {
                      style: { ...btnStyle(), width: 'calc(100% - 12px)', margin: '0 6px 6px' },
                      onClick: async () => {
                        try { await call('skin-apply', { target: skin.id }); toast(`已应用皮肤：${skin.title}`) }
                        catch (error) { toast(error.message) }
                      },
                    }, '应用'),
                  ]))),
            h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 8 } },
              '试穿等完整功能仍在 设置 → 皮肤中心。'),
          ]),
        ]),
        s.pickerOpen ? h(WallpaperPicker, { onClose: () => setStore({ pickerOpen: false }) }) : null,
      ])
    }

    // ── 协作看板面板 ────────────────────────────────────────
    function CollabPanel({ ctx }) {
      const s = useStore()
      const [relayTitle, setRelayTitle] = React.useState('')
      const [msgFor, setMsgFor] = React.useState(null)
      const [msgText, setMsgText] = React.useState('')
      const [relayFor, setRelayFor] = React.useState(null)
      const [relayDesc, setRelayDesc] = React.useState('')
      const sessionId = currentSessionId(ctx)
      useEffect(() => {
        loadSubagents(ctx); loadRelay()
        const timer = setInterval(() => loadSubagents(ctx), 5000)
        return () => clearInterval(timer)
      }, [sessionId])
      const subs = s.subagents
      const tree = subs?.tree ?? []
      async function pushRelay(title, description) {
        try { const r = await call('relay-push', { title, description }); toast(`已投递任务：${r.task.id}`); loadRelay() }
        catch (error) { toast(error.message) }
      }
      async function sendMsg(childId) {
        try { await call('followup', { parentSessionId: sessionId, childId, content: msgText }); toast('消息已发送'); setMsgFor(null); setMsgText('') }
        catch (error) { toast(error.message) }
      }
      async function interrupt(childId) {
        try { await call('interrupt', { targetSessionId: childId, parentSessionId: sessionId }); toast('已请求中断') }
        catch (error) { toast(error.message) }
      }
      const statusColor = { running: '#4ade80', waiting: '#facc15', settled: '#64748b', inactive: '#64748b', error: '#f87171' }
      return h('div', { style: panelOuterStyle() }, [
        h('div', { style: headerStyle('协作看板') }, [
          h('span', null, '协作看板'),
          h('button', { style: btnStyle(), onClick: () => setStore({ collabPanel: false }) }, '关闭'),
        ]),
        h('div', { style: panelInnerStyle() }, [
          h('div', { style: cardStyle() }, [
            h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 8 } }, '投递任务（跨会话任务队列）'),
            h('div', { style: { display: 'flex', gap: 6 } }, [
              h('input', { placeholder: '任务标题', value: relayTitle, onChange: (e) => setRelayTitle(e.target.value), style: inputStyle() }),
              h('button', { style: btnStyle(), onClick: () => { if (relayTitle.trim()) { pushRelay(relayTitle.trim()); setRelayTitle('') } } }, '投递'),
            ]),
            s.relay.length > 0 && h('div', { style: { marginTop: 8 } }, [
              h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, `队列（最近 ${s.relay.length}）`),
              ...s.relay.slice(0, 6).map((t) => h('div', { key: t.id, style: { fontSize: 11, color: 'var(--dsw-alias-label-primary)', borderBottom: '1px solid var(--dsw-alias-border-l1)', padding: '3px 0', display: 'flex', gap: 6, alignItems: 'center' } }, [
                h('span', { style: { color: t.status === 'done' ? '#4ade80' : t.status === 'claimed' ? '#facc15' : 'var(--dsw-alias-label-secondary)', fontSize: 10 } }, t.status),
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, t.title),
              ])),
            ]),
          ]),
          h('div', { style: cardStyle() }, [
            h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 8 } }, '子代理（当前会话）'),
            subs?.unavailable
              ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '子代理服务不可用')
              : subs?.needSession
                ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '请先打开一个会话')
                : subs?.error
                  ? h('div', { style: { fontSize: 12, color: '#f87171' } }, `加载失败：${subs.error}`)
                  : tree.length === 0
                    ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '当前会话还没有子代理。可在对话中让我并行派生多个子代理。')
                    : tree.map((node) => h(SubagentRow, {
                        key: node.id, node, statusColor, sessionId,
                        expanded: msgFor === node.id || relayFor === node.id,
                        onExpand: () => { setMsgFor(msgFor === node.id ? null : node.id); setRelayFor(null) },
                        onExpandRelay: () => { setRelayFor(relayFor === node.id ? null : node.id); setMsgFor(null) },
                        msgText, setMsgText, sendMsg, interrupt, relayDesc, setRelayDesc, pushRelay,
                      })),
          ]),
        ]),
      ])
    }

    function SubagentRow({ node, statusColor, sessionId, expanded, onExpand, onExpandRelay, msgText, setMsgText, sendMsg, interrupt, relayDesc, setRelayDesc, pushRelay }) {
      const status = node.running ? 'running' : node.inactive ? 'inactive' : node.status ?? 'waiting'
      return h('div', { style: { borderBottom: '1px solid var(--dsw-alias-border-l1)', padding: '4px 0' } }, [
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } }, [
          h('span', { onClick: onExpand, style: { width: 14, fontSize: 10, color: 'var(--dsw-alias-label-secondary)', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block' } }, '▶'),
          h('span', { style: { width: 8, height: 8, borderRadius: 4, background: statusColor[status] ?? '#64748b' } }),
          h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, node.label ?? node.id.slice(0, 12)),
          h('span', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)' } }, status),
          h('button', { title: '更多操作（投递/发消息/中断）', style: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }, onClick: onExpandRelay }, '⋮'),
        ]),
        expanded && h('div', { style: { padding: '6px 0 6px 20px', display: 'flex', flexDirection: 'column', gap: 6 } }, [
          h('div', { style: { display: 'flex', gap: 6 } }, [
            h('input', { placeholder: '消息内容', value: msgText, onChange: (e) => setMsgText(e.target.value), style: inputStyle() }),
            h('button', { style: btnStyle(), onClick: () => sendMsg(node.id) }, '发送'),
          ]),
          h('div', { style: { display: 'flex', gap: 6 } }, [
            h('button', { style: { ...btnStyle(), flex: 1 }, onClick: () => interrupt(node.id) }, '中断'),
            h('span', { style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)', alignSelf: 'center' } }, `会话 ${node.id.slice(0, 8)}`),
          ]),
        ]),
        relayFor === node.id && h('div', { style: { padding: '6px 0 6px 20px', display: 'flex', flexDirection: 'column', gap: 6 } }, [
          h('input', { placeholder: '任务描述（投递到共享队列，由任意子代理认领）', value: relayDesc, onChange: (e) => setRelayDesc(e.target.value), style: inputStyle() }),
          h('button', { style: btnStyle(), onClick: () => { pushRelay(`[${node.label ?? node.id.slice(0, 8)}] ${relayDesc || '待办'}`, relayDesc); setRelayDesc(''); setRelayFor(null) } }, '投递任务'),
        ]),
      ])
    }

    // ── 侧边栏入口 ──────────────────────────────────────────
    function SidebarButton({ emoji, label, active, onClick }) {
      return h('button', {
        title: label,
        onClick,
        style: {
          width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 15,
          background: active ? 'var(--dsw-alias-bg-layer-3)' : 'transparent',
          color: 'var(--dsw-alias-label-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      }, emoji)
    }

    // ── apply ────────────────────────────────────────────────
    function apply(ctx) {
      loadConfig()
      ctx.effect(() => ctx.locale.register(NS, dict), 'dsh-studio: locale 词典')
      // ui-sidebar 只渲染 sidebar.workspaces（单槽，ui-workspace 独占）/ sidebar.settings /
      // sidebar.footer.action（多条目）三个座位；皮肤中心与协作入口都放 footer.action，
      // 与检查更新、移动端远程控制同级。
      ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        locale: NS,
        id: 'studio-skin-center',
        order: 10,
      }, function SkinCenterEntry() {
        const s = useStore()
        return h(SidebarButton, { emoji: '🎨', label: '皮肤中心（壁纸与皮肤）', active: s.skinPanel, onClick: () => setStore({ skinPanel: !s.skinPanel }) })
      })), 'dsh-studio: 皮肤中心入口')

      ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        locale: NS,
        id: 'studio-collab',
        order: 20,
      }, function CollabEntry() {
        const s = useStore()
        return h(SidebarButton, { emoji: '🤝', label: '协作看板（子代理与任务投递）', active: s.collabPanel, onClick: () => setStore({ collabPanel: !s.collabPanel }) })
      })), 'dsh-studio: 协作入口')

      ctx.effect(() => {
        const rootEl = document.createElement('div')
        rootEl.id = 'dsh-studio-root'
        document.body.appendChild(rootEl)
        const root = createRoot(rootEl)
        const render = () => {
          const s = store
          applyTranslucency(!!s.config?.enabled, s.config?.surfaceAlpha)
          root.render(
            h('div', null, [
              h(WallpaperLayer, null),
              s.skinPanel ? h(SkinCenterPanel, { ctx }) : null,
              s.collabPanel ? h(CollabPanel, { ctx }) : null,
              s.toast ? h('div', { style: { position: 'fixed', bottom: 20, right: 20, zIndex: 2000, background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-primary)', borderRadius: 8, padding: '8px 14px', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.35)' } }, s.toast) : null,
            ]),
          )
        }
        const unsub = subscribe(render)
        render()
        return () => {
          unsub()
          root.unmount()
          document.getElementById('dsh-studio-translucency')?.remove()
          rootEl.remove()
        }
      }, 'dsh-studio: 面板与壁纸层')
    }

    // ── 样式辅助 ────────────────────────────────────────────
    function panelOuterStyle() {
      return {
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 420, maxWidth: '92vw', zIndex: 1500,
        background: 'var(--dsw-alias-bg-layer-1)', borderLeft: '1px solid var(--dsw-alias-border-l2)',
        boxShadow: '-8px 0 32px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column',
      }
    }
    function headerStyle(title) {
      return { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--dsw-alias-border-l1)', fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
    }
    function panelInnerStyle() {
      return { padding: 12, overflowY: 'auto', flex: 1 }
    }
    function cardStyle() {
      return { background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, padding: 12, marginBottom: 10 }
    }
    function rowStyle() {
      return { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }
    }
    function labelStyle() {
      return { fontSize: 12, color: 'var(--dsw-alias-label-primary)', minWidth: 96 }
    }
    function btnStyle() {
      return { background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }
    }
    function inputStyle() {
      return { flex: 1, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 8px', fontSize: 12, minWidth: 0 }
    }
    function selectStyle() {
      return { background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '3px 6px', fontSize: 12 }
    }

    return { apply, inject }
  },
})
