// main.js — 桌面版 DeepSeek Harness 的 Electron 主进程。
// 自托管 dsh web 服务 + 原生窗口 + 托盘 + 系统集成。
'use strict'

const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  ipcMain,
  shell,
  nativeImage,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const { DshServer } = require('./server')
const { openGallery, registerGalleryIpc } = require('./gallery')

const ASSETS = path.join(__dirname, 'assets')
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js')
const SPLASH_HTML = path.join(__dirname, 'splash.html')
const ERROR_HTML = path.join(__dirname, 'error.html')

/** 解析应用图标：本地个性化图标（assets/whale/）优先，仓库默认图标兜底。 */
function appIcon(file) {
  const custom = path.join(ASSETS, 'whale', file)
  if (fs.existsSync(custom)) return custom
  return path.join(ASSETS, file)
}

let mainWindow = null
let tray = null
let server = null
let quitting = false
let startupError = null
let hideHintShown = false

// ── 单实例锁 ────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ── 服务管理 ────────────────────────────────────────────────
async function startServer() {
  try {
    await server.start()
    startupError = null
    loadMainWindow()
  } catch (error) {
    startupError = String(error?.message || error)
    console.error('[dsh-desktop] 服务启动失败:', startupError)
    loadErrorPage()
    if (Notification.isSupported()) {
      new Notification({ title: 'DeepSeek Harness 启动失败', body: startupError }).show()
    }
  }
}

// ── 窗口 ────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: 'DeepSeek Harness Desktop',
    icon: appIcon('icon-256.png'),
    show: false,
    backgroundColor: '#0b0f1a',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    if (server?.status().running) mainWindow.show()
  })
  mainWindow.on('close', (event) => {
    // 关闭窗口 = 隐藏到托盘（除非正在退出）
    if (!quitting) {
      event.preventDefault()
      mainWindow.hide()
      if (!hideHintShown) {
        hideHintShown = true
        if (Notification.isSupported()) {
          new Notification({
            title: 'DeepSeek Harness 仍在运行',
            body: '窗口已最小化到系统托盘。点击托盘图标，或双击桌面「DeepSeek Harness」快捷方式即可恢复。',
          }).show()
        }
      }
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() || ''
    if (url !== current && /^https?:\/\//.test(url) && !url.startsWith(server?.status().url || 'http://127.0.0.1:')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
  // 桌面通知：DSH 页面内的通知走系统通知中心
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications' || permission === 'fullscreen')
  })
}

// 串行化加载链：onUrl 与 startServer 都可能触发 loadMainWindow，避免并发 loadURL 互相中止。
let loadChain = Promise.resolve()
function loadMainWindow(attempt = 0) {
  if (!mainWindow) createMainWindow()
  const url = server?.status().url
  if (!url) return
  loadChain = loadChain.then(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const current = mainWindow.webContents.getURL()
    if (current.startsWith(url)) return
    try {
      await mainWindow.loadURL(url)
      await smokeCheck()
    } catch (error) {
      console.error(`[dsh-desktop] 加载 ${url} 失败（第 ${attempt + 1} 次）:`, error?.message || error)
      if (attempt < 8) setTimeout(() => loadMainWindow(attempt + 1), 1500)
    }
  })
  return loadChain
}

// DSH_DESKTOP_SMOKE=1 时：加载完成后采集 DOM 证据并退出（供端到端验证）。
async function smokeCheck() {
  if (process.env.DSH_DESKTOP_SMOKE !== '1') return
  try {
    await new Promise((resolve) => setTimeout(resolve, 15000)) // 等待 client 插件启动
    const result = await mainWindow.webContents.executeJavaScript(`(() => {
      const res = performance.getEntriesByType('resource').map(e => e.name)
      const has = (p) => res.some(u => u.includes(p))
      const text = document.body ? document.body.innerText : ''
      return {
        title: document.title,
        url: location.href,
        betterSidebarMounted: !!document.querySelector('[data-dsh-better-sidebar]'),
        betterSidebarBundle: has('dsh-better-sidebar/client.js'),
        modlensBundle: has('modlens/client.js'),
        dshWebUiBundle: has('dsh-web-ui-all/client.js'),
        dshmarketBundle: has('dshmarket/client.js'),
        taskBoardBundle: has('dsh-client-ui-task-board/client.js'),
        gitGraphBundle: has('dsh-client-ui-git-graph/client.js'),
        sshBundle: has('dsh-ssh/client.js'),
        skinCenterBundle: has('dsh-client-ui-skin-center/client.js'),
        petBundle: has('dsh-pet/client.js'),
        textHasTaskBoard: text.includes('任务看板'),
        textHasSkinCenter: text.includes('皮肤中心'),
        textHasSsh: text.includes('SSH'),
        pluginErrors: (window.__dshErrors || []).length,
        bootModules: Object.keys(window.__DSH_BOOT__ || {}).length,
        leafTexts: [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent && e.textContent.trim().length <= 24).map(e => e.textContent.trim()).filter(Boolean).slice(0, 120),
      }
    })()`)
    console.log('[smoke] 证据:', JSON.stringify(result, null, 2))
    const gate = result.betterSidebarMounted && result.betterSidebarBundle && result.modlensBundle && result.dshWebUiBundle && result.dshmarketBundle
    console.log(`[smoke] RESULT: ${gate ? 'PASS' : 'FAIL'}`)
    quitting = true
    app.exit(gate ? 0 : 1)
  } catch (error) {
    console.error('[smoke] 检查失败:', error)
    quitting = true
    app.exit(2)
  }
}

function loadSplash() {
  if (!mainWindow) createMainWindow()
  mainWindow.loadFile(SPLASH_HTML)
  mainWindow.show()
}

function loadErrorPage() {
  if (!mainWindow) createMainWindow()
  mainWindow.loadFile(ERROR_HTML, { query: { message: startupError || '' } })
  mainWindow.show()
}

// ── 托盘 ────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(appIcon('icon-32.png'))
  tray = new Tray(icon)
  tray.setToolTip('DeepSeek Harness Desktop')
  rebuildTrayMenu()
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function rebuildTrayMenu() {
  const status = server?.status() ?? {}
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showMainWindow() },
      { label: '插件精选（awesome-dsh-plugin）', click: () => openGallery({ onOpenExternal: (u) => shell.openExternal(u) }) },
      { type: 'separator' },
      { label: `服务器: ${status.running ? `运行中 (${status.port})` : '已停止'}`, enabled: false },
      { label: '重启 DSH 服务器', click: () => restartServer() },
      { label: '在浏览器中打开', enabled: !!status.url, click: () => status.url && shell.openExternal(status.url) },
      { type: 'separator' },
      { label: '退出', click: () => { quitting = true; app.quit() } },
    ]),
  )
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow()
    loadSplash()
    startServer()
    return
  }
  mainWindow.show()
  mainWindow.focus()
}

async function restartServer() {
  if (server?.status().running) {
    const mainUrl = server.status().url
    try {
      await server.restart()
      loadMainWindow()
    } catch (error) {
      startupError = String(error?.message || error)
      loadErrorPage()
    }
    rebuildTrayMenu()
  } else {
    startServer()
  }
}

// ── 应用菜单 ────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'DeepSeek Harness',
      submenu: [
        { label: '关于', click: () => dialog.showMessageBox({ type: 'info', title: 'DeepSeek Harness Desktop', message: '桌面版 DeepSeek Harness\n\n自托管 dsh web + Electron 原生壳\n集成：dsh-better-sidebar · dsh-web-ui · ModLens · awesome-dsh-plugin' }) },
        { type: 'separator' },
        { label: '退出', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4', click: () => { quitting = true; app.quit() } },
      ],
    },
    {
      label: '服务器',
      submenu: [
        { label: '重启 DSH 服务器', click: () => restartServer() },
        { label: '在浏览器中打开', click: () => { const u = server?.status().url; if (u) shell.openExternal(u) } },
      ],
    },
    {
      label: '插件',
      submenu: [
        { label: '插件精选（awesome-dsh-plugin）', click: () => openGallery({ onOpenExternal: (u) => shell.openExternal(u) }) },
        { label: '插件市场（dshmarket）', click: () => { const u = server?.status().url; if (u) shell.openExternal(`${u}/settings`) } },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC ─────────────────────────────────────────────────────
function registerIpc() {
  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
  })
  ipcMain.handle('server:status', () => server?.status() ?? { running: false })
  ipcMain.handle('server:restart', async () => {
    await restartServer()
    return server?.status() ?? { running: false }
  })
  ipcMain.handle('server:url', () => server?.status().url ?? null)
  ipcMain.handle('notify', (_e, { title, body }) => {
    if (Notification.isSupported()) new Notification({ title: String(title || ''), body: String(body || '') }).show()
  })
  registerGalleryIpc({ onOpenExternal: (u) => shell.openExternal(u) })
}

// ── 生命周期 ────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Windows：任务栏分组与图标关联（配合 BrowserWindow icon 使用鲸鱼娘头像）
  if (process.platform === 'win32') app.setAppUserModelId('com.dsh.desktop')
  server = new DshServer({
    onUrl: () => loadMainWindow(),
    onExit: ({ wasRunning }) => {
      if (wasRunning && !quitting) {
        loadErrorPage()
      }
      rebuildTrayMenu()
    },
  })

  registerIpc()
  createTray()
  buildMenu()
  createMainWindow()
  loadSplash()
  startServer()

  app.on('activate', () => showMainWindow())
})

app.on('window-all-closed', () => {
  // 保持托盘驻留，不退出
  if (process.platform === 'darwin') app.dock?.show()
})

app.on('before-quit', async (event) => {
  if (!quitting) return
  if (server) {
    event.preventDefault()
    await server.stop()
    app.exit(0)
  }
})
