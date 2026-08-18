// preload.js — 暴露最小化的桌面集成 API 给渲染进程。
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  /** 在系统浏览器中打开外部链接 */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  /** 查询 DSH 服务状态：{ running, url, port, pid } */
  serverStatus: () => ipcRenderer.invoke('server:status'),
  /** 重启 DSH 服务器 */
  restartServer: () => ipcRenderer.invoke('server:restart'),
  /** 当前 Web 服务 URL */
  getServerUrl: () => ipcRenderer.invoke('server:url'),
  /** 发送系统通知 */
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  /** 插件精选画廊数据（来自 awesome-dsh-plugin） */
  galleryData: () => ipcRenderer.invoke('gallery:data'),
  /** 画廊内打开外部链接 */
  galleryOpenExternal: (url) => ipcRenderer.invoke('gallery:openExternal', url),
})
