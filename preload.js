// ============================================================================
// ZC桌宠 —— preload（contextBridge）
// 渲染层只能通过 window.whaleAPI 与主进程通信，拿不到 Node / Electron 能力。
// ============================================================================
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('whaleAPI', {
  getConfig: () => ipcRenderer.invoke('whale:getConfig'),
  saveConfig: (cfg) => ipcRenderer.invoke('whale:saveConfig', cfg),
  setApiKey: (key) => ipcRenderer.invoke('whale:setApiKey', key),
  setPlatformToken: (token) => ipcRenderer.invoke('whale:setPlatformToken', token),
  setCallbackUrl: (url) => ipcRenderer.invoke('whale:setCallbackUrl', url),
  listProviders: () => ipcRenderer.invoke('whale:listProviders'),
  upsertProvider: (input) => ipcRenderer.invoke('whale:upsertProvider', input),
  deleteProvider: (id) => ipcRenderer.invoke('whale:deleteProvider', id),
  activateProvider: (id) => ipcRenderer.invoke('whale:activateProvider', id),
  testProvider: (id) => ipcRenderer.invoke('whale:testProvider', id),
  probeProviderBalance: (id) => ipcRenderer.invoke('whale:probeProviderBalance', id),
  listProviderModels: (id) => ipcRenderer.invoke('whale:listProviderModels', id),
  copyProviderField: (id, field) => ipcRenderer.invoke('whale:copyProviderField', id, field),
  listSkins: () => ipcRenderer.invoke('whale:listSkins'),
  importSkin: () => ipcRenderer.invoke('whale:importSkin'),
  openKeysManager: () => ipcRenderer.invoke('whale:openKeysManager'),
  showBurst: (opts) => ipcRenderer.invoke('whale:showBurst', opts || {}),
  closeBurst: () => ipcRenderer.invoke('whale:closeBurst'),
  showWindow: () => ipcRenderer.invoke('whale:showWindow'),
  hideWindow: () => ipcRenderer.invoke('whale:hideWindow'),
  onProvidersChanged: (cb) => {
    const handler = () => {
      try { cb() } catch (err) {}
    }
    ipcRenderer.on('whale:providersChanged', handler)
    return () => ipcRenderer.removeListener('whale:providersChanged', handler)
  },
  onSkinsChanged: (cb) => {
    const handler = () => {
      try { cb() } catch (err) {}
    }
    ipcRenderer.on('whale:skinsChanged', handler)
    return () => ipcRenderer.removeListener('whale:skinsChanged', handler)
  },
  onLowBalance: (cb) => {
    const handler = (_e, payload) => {
      try { cb(payload) } catch (err) {}
    }
    ipcRenderer.on('whale:lowBalance', handler)
    return () => ipcRenderer.removeListener('whale:lowBalance', handler)
  },
  onConfigHint: (cb) => {
    const handler = (_e, payload) => {
      try { cb(payload) } catch (err) {}
    }
    ipcRenderer.on('whale:configHint', handler)
    return () => ipcRenderer.removeListener('whale:configHint', handler)
  },
  fetchBalance: () => ipcRenderer.invoke('whale:fetchBalance'),
  fetchLastTurn: () => ipcRenderer.invoke('whale:fetchLastTurn'),
  moveWindow: (dx, dy) => ipcRenderer.invoke('whale:moveWindow', dx, dy),
  dragEnd: () => ipcRenderer.invoke('whale:dragEnd'),
  quit: () => ipcRenderer.invoke('whale:quit'),
  setIgnore: (ignore) => ipcRenderer.send('whale:setIgnore', ignore),
})
