// gallery.js — 「插件精选」画廊窗口（数据来自 awesome-dsh-plugin 精选清单）。
'use strict'

const { BrowserWindow, ipcMain } = require('electron')
const { readFileSync, existsSync } = require('node:fs')
const path = require('node:path')

let galleryWindow = null
let cachedData = null

/** 应用图标：本地个性化图标（assets/whale/）优先，仓库默认图标兜底。 */
function appIcon(file) {
  const custom = path.join(__dirname, 'assets', 'whale', file)
  if (existsSync(custom)) return custom
  return path.join(__dirname, 'assets', file)
}

function galleryData() {
  if (cachedData) return cachedData
  const file = path.join(__dirname, '..', 'gallery', 'plugins.json')
  try {
    cachedData = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    cachedData = { error: String(error.message || error), count: 0, plugins: [] }
  }
  return cachedData
}

function openGallery({ onOpenExternal }) {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    galleryWindow.focus()
    return galleryWindow
  }
  galleryWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: '插件精选 · awesome-dsh-plugin',
    icon: appIcon('icon-256.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  galleryWindow.loadFile(path.join(__dirname, '..', 'gallery', 'index.html'))
  galleryWindow.on('closed', () => {
    galleryWindow = null
  })
  galleryWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) onOpenExternal(url)
    return { action: 'deny' }
  })
  return galleryWindow
}

function registerGalleryIpc({ onOpenExternal }) {
  ipcMain.handle('gallery:data', () => galleryData())
  ipcMain.handle('gallery:openExternal', (_event, url) => onOpenExternal(url))
}

module.exports = { openGallery, registerGalleryIpc, galleryData }
