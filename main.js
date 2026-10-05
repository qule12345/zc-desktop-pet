// ============================================================================
// ZC桌宠 —— Electron 主进程
// ----------------------------------------------------------------------------
// 透明、无边框、置顶的桌面挂件窗口。
// 用户数据（userdata.json）存放在 EXE 同目录；API_KEY 经 AES-GCM
// 加密后写入（见 lib/core.js）。
// ============================================================================
'use strict'

const { app, BrowserWindow, ipcMain, screen, clipboard, protocol, net, Tray, Menu, nativeImage, dialog, Notification } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { createWhaleCore } = require('./lib/core.js')
const { createSkinManager } = require('./lib/skins.js')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'skin',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
      corsEnabled: true,
    },
  },
])

try {
  app.setAppUserModelId('com.qule12345.zcpet')
} catch (err) {}

const isDev = !app.isPackaged
// portable 单文件版：PORTABLE_EXECUTABLE_DIR 指向便携 EXE 所在目录；
// 安装版 / 开发态回退到 exe 目录 / 项目目录。
const exeDir =
  process.env.PORTABLE_EXECUTABLE_DIR ||
  (isDev ? app.getAppPath() : path.dirname(app.getPath('exe')))

const core = createWhaleCore({ dataFile: path.join(exeDir, 'userdata.json') })
let skinManager = null
let tray = null
let lowBalanceArmed = true
let isQuitting = false

// asar 里的文件 tar / 托盘图标读不了：优先走 app.asar.unpacked
function unpackedAppFile(...rel) {
  const appPath = app.getAppPath()
  if (appPath.endsWith('.asar')) {
    const unpacked = path.join(appPath + '.unpacked', ...rel)
    if (fs.existsSync(unpacked)) return unpacked
  }
  return path.join(appPath, ...rel)
}

function portableLauncherPath() {
  const file = process.env.PORTABLE_EXECUTABLE_FILE
  if (file && fs.existsSync(file)) return file
  const dir = process.env.PORTABLE_EXECUTABLE_DIR
  if (!dir) return null
  try {
    const exes = fs.readdirSync(dir).filter((n) => /\.exe$/i.test(n))
    if (exes.length === 1) return path.join(dir, exes[0])
    const prefer = exes.find((n) => /桌宠|ZC|DesktopPet/i.test(n))
    if (prefer) return path.join(dir, prefer)
  } catch (err) {}
  return null
}

function getSkinManager() {
  if (!skinManager) {
    skinManager = createSkinManager({
      packsDir: unpackedAppFile('renderer', 'assets', 'skins'),
      userPacksDir: path.join(app.getPath('userData'), 'skins'),
      cacheDir: path.join(app.getPath('userData'), 'skin-cache'),
    })
    try {
      skinManager.refresh()
    } catch (err) {
      console.error('[skins] refresh failed', err)
    }
  }
  return skinManager
}

function trayIcon() {
  const ico = unpackedAppFile('build', 'icon.ico')
  if (fs.existsSync(ico)) {
    const img = nativeImage.createFromPath(ico)
    if (!img.isEmpty()) return img
  }
  // 1x1 fallback
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  )
}

function showMainWindow() {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  try {
    if (!win.isVisible()) win.show()
    if (win.isMinimized()) win.restore()
    win.setAlwaysOnTop(true, 'screen-saver')
    win.showInactive()
  } catch (err) {}
}

function hideMainWindow() {
  if (win && !win.isDestroyed()) {
    try { win.hide() } catch (err) {}
  }
}

function toggleMainWindow() {
  if (!win || win.isDestroyed() || !win.isVisible()) showMainWindow()
  else hideMainWindow()
}

function applyAutoStart(enabled) {
  try {
    const on = !!enabled
    if (isDev) {
      app.setLoginItemSettings({
        openAtLogin: on,
        path: process.execPath,
        args: [app.getAppPath()],
      })
      return
    }
    // 便携包实际进程在 TEMP，登记用户双击的那份 EXE
    const portable = portableLauncherPath()
    if (portable) {
      app.setLoginItemSettings({
        openAtLogin: on,
        path: portable,
        args: [],
      })
      return
    }
    app.setLoginItemSettings({
      openAtLogin: on,
      openAsHidden: false,
    })
  } catch (err) {}
}

function syncAutoStartFromConfig() {
  const cfg = core.getConfig()
  applyAutoStart(!!cfg.autoStart)
}

function rebuildTrayMenu() {
  if (!tray) return
  const cfg = core.getConfig()
  const hidden = !win || win.isDestroyed() || !win.isVisible()
  const menu = Menu.buildFromTemplate([
    {
      label: hidden ? '显示桌宠' : '隐藏桌宠',
      click: () => toggleMainWindow(),
    },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: !!cfg.autoStart,
      click: (item) => {
        core.saveConfig({ autoStart: !!item.checked })
        applyAutoStart(!!item.checked)
        rebuildTrayMenu()
        broadcastConfigHint()
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        closeBurstOverlay()
        if (keysWin && !keysWin.isDestroyed()) {
          try { keysWin.close() } catch (err) {}
        }
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
}

function createTray() {
  if (tray) return
  tray = new Tray(trayIcon())
  tray.setToolTip('ZC桌宠')
  tray.on('double-click', () => showMainWindow())
  tray.on('click', () => {
    // Windows: 单击也唤出，方便发现
    if (process.platform === 'win32') showMainWindow()
  })
  rebuildTrayMenu()
}

function broadcastSkinsChanged() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w || w.isDestroyed()) continue
    try { w.webContents.send('whale:skinsChanged') } catch (err) {}
  }
}

function broadcastConfigHint() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w || w.isDestroyed()) continue
    try { w.webContents.send('whale:configHint', core.getConfig()) } catch (err) {}
  }
}

function maybeNotifyLowBalance(payload) {
  const cfg = core.getConfig()
  if (!cfg.lowBalanceOn || !payload || !payload.ok || payload.unlimited) return
  const bal = Number(payload.totalBalance)
  const th = Number(cfg.lowBalanceThreshold)
  const threshold = isFinite(th) ? th : 10
  if (!isFinite(bal)) return
  if (bal >= threshold) {
    lowBalanceArmed = true
    return
  }
  if (!lowBalanceArmed) return
  lowBalanceArmed = false
  const currency = String(payload.currency || 'CNY')
  const text =
    '当前余额 ' +
    (currency === 'USD' ? '$' : '¥') +
    bal.toFixed(2) +
    '，已低于阈值 ' +
    threshold
  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title: '余额不足',
        body: text,
        silent: false,
      })
      n.on('click', () => showMainWindow())
      n.show()
    }
  } catch (err) {}
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('whale:lowBalance', {
        balance: bal,
        threshold: threshold,
        currency: currency,
        message: text,
      })
    } catch (err) {}
  }
}

async function importSkinFromDialog() {
  const parent = win && !win.isDestroyed() ? win : null
  const picked = await dialog.showOpenDialog(parent || undefined, {
    title: '导入皮肤包',
    filters: [{ name: 'Skin Pack', extensions: ['skin'] }],
    properties: ['openFile'],
  })
  if (picked.canceled || !picked.filePaths || !picked.filePaths[0]) {
    return { ok: false, cancelled: true }
  }
  const r = getSkinManager().importSkinPack(picked.filePaths[0])
  if (r && r.ok) broadcastSkinsChanged()
  return r
}

let win = null
let keysWin = null
let burstWin = null
let burstCloseTimer = null
let dragState = null
let pendingMove = null
let moveTimer = null

const WINDOW_W = 560
const WINDOW_H = 840
const KEYS_W = 980
const KEYS_H = 700

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function closeBurstOverlay() {
  if (burstCloseTimer) {
    clearTimeout(burstCloseTimer)
    burstCloseTimer = null
  }
  if (burstWin && !burstWin.isDestroyed()) {
    try { burstWin.close() } catch (err) {}
  }
  burstWin = null
  return { ok: true }
}

function resolveBurstImgFile(raw) {
  const imgUrl = raw ? String(raw) : ''
  if (!imgUrl) return null
  if (imgUrl.startsWith('skin://')) {
    try {
      const u = new URL(imgUrl)
      const id = decodeURIComponent(u.hostname || '')
      const rel = decodeURIComponent(String(u.pathname || '/').replace(/^\//, ''))
      return getSkinManager().resolveSkinPath(id, rel)
    } catch (err) {
      return null
    }
  }
  if (imgUrl.startsWith('file:')) {
    try {
      return path.normalize(decodeURIComponent(new URL(imgUrl).pathname.replace(/^\//, '')))
    } catch (err) {
      return null
    }
  }
  // 相对 renderer 的本地路径
  if (imgUrl.startsWith('./') || imgUrl.startsWith('../') || /^[A-Za-z]:[\\/]/.test(imgUrl) || imgUrl.startsWith('/')) {
    const abs = path.isAbsolute(imgUrl)
      ? imgUrl
      : path.join(app.getAppPath(), 'renderer', imgUrl.replace(/^\.\//, ''))
    return fs.existsSync(abs) ? abs : null
  }
  return null
}

function fileToDataUrl(file) {
  try {
    const buf = fs.readFileSync(file)
    const ext = path.extname(file).toLowerCase()
    const mime =
      ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : ext === '.gif' ? 'image/gif'
            : ext === '.webp' ? 'image/webp'
              : 'application/octet-stream'
    return 'data:' + mime + ';base64,' + buf.toString('base64')
  } catch (err) {
    return ''
  }
}

function showBurstOverlay(opts) {
  const durationMs = Math.max(400, Math.min(8000, Number((opts && opts.ms) || 1600)))
  const file = resolveBurstImgFile(opts && opts.img)
  const dataUrl = file ? fileToDataUrl(file) : ''
  closeBurstOverlay()

  let bounds
  try {
    const disp = win && !win.isDestroyed()
      ? screen.getDisplayMatching(win.getBounds())
      : screen.getPrimaryDisplay()
    bounds = disp.bounds
  } catch (err) {
    bounds = { x: 0, y: 0, width: 1280, height: 720 }
  }

  burstWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  try {
    burstWin.setAlwaysOnTop(true, 'screen-saver')
    burstWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    burstWin.setSkipTaskbar(true)
  } catch (err) {}

  burstWin.once('ready-to-show', () => {
    if (burstWin && !burstWin.isDestroyed()) burstWin.showInactive()
  })
  burstWin.on('closed', () => {
    burstWin = null
    if (burstCloseTimer) {
      clearTimeout(burstCloseTimer)
      burstCloseTimer = null
    }
  })

  const burstPath = path.join(app.getAppPath(), 'renderer', 'burst.html')
  burstWin.loadFile(burstPath)

  // file:// 页面不能跨目录读本地图；skin:// 在独立窗口也不稳 → 主进程读成 data URL 再注入
  if (dataUrl) {
    burstWin.webContents.once('did-finish-load', () => {
      if (!burstWin || burstWin.isDestroyed()) return
      const payload = JSON.stringify(dataUrl)
      burstWin.webContents
        .executeJavaScript(
          '(function(){var el=document.getElementById("img");if(el)el.src=' + payload + '})()'
        )
        .catch(function () {})
    })
  }

  burstCloseTimer = setTimeout(() => {
    burstCloseTimer = null
    closeBurstOverlay()
  }, durationMs)

  return { ok: true }
}

function broadcastProvidersChanged() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w || w.isDestroyed()) continue
    try {
      w.webContents.send('whale:providersChanged')
    } catch (err) {}
  }
}

function openKeysManager() {
  if (keysWin && !keysWin.isDestroyed()) {
    if (keysWin.isMinimized()) keysWin.restore()
    keysWin.show()
    keysWin.focus()
    try { keysWin.webContents.send('whale:providersChanged') } catch (err) {}
    return { ok: true, reused: true }
  }

  keysWin = new BrowserWindow({
    width: KEYS_W,
    height: KEYS_H,
    minWidth: 760,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: 'Key 列表',
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  try {
    const wa = screen.getPrimaryDisplay().workArea
    const x = Math.round(wa.x + (wa.width - KEYS_W) / 2)
    const y = Math.round(wa.y + (wa.height - KEYS_H) / 2)
    keysWin.setBounds({ x, y, width: KEYS_W, height: KEYS_H })
  } catch (err) {}

  keysWin.once('ready-to-show', () => {
    if (keysWin && !keysWin.isDestroyed()) keysWin.show()
  })
  keysWin.on('closed', () => {
    keysWin = null
  })
  keysWin.loadFile(path.join(app.getAppPath(), 'renderer', 'keys.html'))
  return { ok: true, reused: false }
}

// Windows 透明（分层）窗口在 setPosition 时存在尺寸漂移的已知问题：
// 每次移动窗口都会“长大”几像素（连续拖动时肉眼可见地抽搐+放大）。
// 因此移动一律用 setBounds 显式钉住宽高；拖动位移用 16ms 帧合并节流。
function moveWindowTo(x, y) {
  if (!win) return
  try {
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: WINDOW_W, height: WINDOW_H })
  } catch (err) {}
}

function applyPendingMove() {
  if (!pendingMove) return
  const dx = pendingMove.dx
  const dy = pendingMove.dy
  pendingMove = null
  if (!win || !dragState) return
  moveWindowTo(dragState.baseX + dx, dragState.baseY + dy)
}

function createWindow() {
  win = new BrowserWindow({
    width: WINDOW_W,
    height: WINDOW_H,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setSkipTaskbar(true)

  // 恢复上次窗口位置（限制在工作区内；用 setBounds 钉住尺寸防漂移）
  const pos = core.getWinPos()
  if (pos) {
    try {
      const wa = screen.getPrimaryDisplay().workArea
      const x = clamp(pos.x, wa.x, wa.x + wa.width - WINDOW_W)
      const y = clamp(pos.y, wa.y, wa.y + wa.height - WINDOW_H)
      moveWindowTo(x, y)
    } catch (err) {}
  }

  win.on('close', (e) => {
    try {
      const [x, y] = win.getPosition()
      core.setWinPos({ x, y })
    } catch (err) {}
    // 有托盘时点关闭改为隐藏，真正退出走托盘/菜单「退出」
    if (!isQuitting && tray) {
      e.preventDefault()
      hideMainWindow()
      rebuildTrayMenu()
    }
  })

  win.on('show', () => rebuildTrayMenu())
  win.on('hide', () => rebuildTrayMenu())

  win.loadFile(path.join(app.getAppPath(), 'renderer', 'index.html'))

  // 冒烟测试：node_modules/.bin/electron . --smoke —— 启动 5 秒后自动退出
  if (process.argv.includes('--smoke')) {
    win.webContents.on('console-message', (e, level, message) => {
      console.log('[renderer:' + level + ']', message)
    })
    setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(
          '({ api: !!window.whaleAPI, widget: !!window.__dshWhaleWidget, root: !!document.querySelector(".dshwv-root"), img: !!document.querySelector(".dshwv-img"), apiKeyInput: !!document.querySelector(".dshwv-secret") })'
        )
        console.log('SMOKE RENDERER: ' + JSON.stringify(r))
      } catch (err) {
        console.log('SMOKE RENDERER ERROR: ' + err.message)
      }
      console.log('SMOKE OK: window created, size=' + JSON.stringify(win.getSize()) + ' pos=' + JSON.stringify(win.getPosition()))
      app.quit()
    }, 5000)
  }
}

function animateWindowTo(tx, ty) {
  if (!win) return
  const [x, y] = win.getPosition()
  const steps = 8
  let i = 0
  const timer = setInterval(() => {
    i++
    const t = i / steps
    const ease = 1 - Math.pow(1 - t, 3)
    moveWindowTo(x + (tx - x) * ease, y + (ty - y) * ease)
    if (i >= steps) clearInterval(timer)
  }, 18)
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('whale:getConfig', () => core.getConfig())
ipcMain.handle('whale:listSkins', () => getSkinManager().listSkins())
ipcMain.handle('whale:importSkin', () => importSkinFromDialog())
ipcMain.handle('whale:saveConfig', (e, cfg) => {
  const r = core.saveConfig(cfg)
  if (cfg && typeof cfg.autoStart === 'boolean') {
    applyAutoStart(!!cfg.autoStart)
    rebuildTrayMenu()
  }
  if (cfg && (typeof cfg.lowBalanceOn === 'boolean' || typeof cfg.lowBalanceThreshold === 'number')) {
    lowBalanceArmed = true
  }
  return r
})
ipcMain.handle('whale:setApiKey', (e, key) => {
  const r = core.setApiKey(String(key || ''))
  broadcastProvidersChanged()
  return r
})
ipcMain.handle('whale:setPlatformToken', (e, token) => core.setPlatformToken(String(token || '')))
ipcMain.handle('whale:setCallbackUrl', (e, url) => {
  const r = core.setCallbackUrl(String(url || ''))
  broadcastProvidersChanged()
  return r
})
ipcMain.handle('whale:listProviders', () => core.listProviders())
ipcMain.handle('whale:upsertProvider', (e, input) => {
  const r = core.upsertProvider(input || {})
  broadcastProvidersChanged()
  return r
})
ipcMain.handle('whale:deleteProvider', (e, id) => {
  const r = core.deleteProvider(String(id || ''))
  broadcastProvidersChanged()
  return r
})
ipcMain.handle('whale:activateProvider', (e, id) => {
  const r = core.activateProvider(String(id || ''))
  broadcastProvidersChanged()
  return r
})
ipcMain.handle('whale:testProvider', (e, id) => core.testProvider(String(id || '')))
ipcMain.handle('whale:probeProviderBalance', (e, id) => core.probeProviderBalance(String(id || '')))
ipcMain.handle('whale:listProviderModels', (e, id) => core.listProviderModels(String(id || '')))
ipcMain.handle('whale:copyProviderField', (e, id, field) => {
  const r = core.getProviderCopyText(String(id || ''), String(field || ''))
  if (r && r.ok && r.text != null) {
    try { clipboard.writeText(String(r.text)) } catch (err) {
      return { ok: false, error: '写入剪贴板失败' }
    }
  }
  return r
})
ipcMain.handle('whale:fetchBalance', async () => {
  const payload = await core.getBalance()
  maybeNotifyLowBalance(payload)
  return payload
})
ipcMain.handle('whale:fetchLastTurn', () => core.fetchLastTurn())
ipcMain.handle('whale:openKeysManager', () => openKeysManager())
ipcMain.handle('whale:showBurst', (e, opts) => showBurstOverlay(opts || {}))
ipcMain.handle('whale:closeBurst', () => closeBurstOverlay())
ipcMain.handle('whale:showWindow', () => {
  showMainWindow()
  rebuildTrayMenu()
  return { ok: true }
})
ipcMain.handle('whale:hideWindow', () => {
  hideMainWindow()
  rebuildTrayMenu()
  return { ok: true }
})
ipcMain.handle('whale:quit', () => {
  isQuitting = true
  closeBurstOverlay()
  if (keysWin && !keysWin.isDestroyed()) {
    try { keysWin.close() } catch (err) {}
  }
  app.quit()
})

// 鼠标穿透：透明区域忽略鼠标事件（forward 保留 mousemove 供渲染层检测悬停）
ipcMain.on('whale:setIgnore', (e, ignore) => {
  if (win) {
    try {
      win.setIgnoreMouseEvents(!!ignore, { forward: true })
    } catch (err) {}
  }
})

// 拖拽窗口：渲染层上报相对起点位移，主进程按 16ms 帧合并节流移动窗口
ipcMain.handle('whale:moveWindow', (e, dx, dy) => {
  if (!win) return null
  const px = Number(dx)
  const py = Number(dy)
  if (!isFinite(px) || !isFinite(py)) return null
  pendingMove = { dx: px, dy: py }
  if (!dragState) {
    try {
      const [wx, wy] = win.getPosition()
      dragState = { baseX: wx, baseY: wy }
    } catch (err) {
      return null
    }
  }
  if (!moveTimer) {
    moveTimer = setInterval(applyPendingMove, 16)
  }
  return null
})

// 拖拽结束：四分之一屏边缘吸附 + 限制在工作区内
ipcMain.handle('whale:dragEnd', () => {
  if (!win) return { h: null, v: null }
  if (moveTimer) {
    clearInterval(moveTimer)
    moveTimer = null
  }
  applyPendingMove() // 应用最后一次位移，保证吸附计算基于最终位置
  dragState = null
  try {
    const [wx, wy] = win.getPosition()
    const [ww, wh] = win.getSize()
    const bounds = win.getBounds()
    const disp = screen.getDisplayMatching(bounds)
    const wa = disp.workArea
    const centerX = wx + ww / 2
    const centerY = wy + wh / 2
    let hSnap = null
    let vSnap = null
    if (centerX < wa.x + wa.width / 4) hSnap = 'left'
    else if (centerX > wa.x + (wa.width * 3) / 4) hSnap = 'right'
    if (centerY < wa.y + wa.height / 4) vSnap = 'top'
    else if (centerY > wa.y + (wa.height * 3) / 4) vSnap = 'bottom'
    let tx = clamp(wx, wa.x, wa.x + wa.width - ww)
    let ty = clamp(wy, wa.y, wa.y + wa.height - wh)
    if (hSnap === 'left') tx = wa.x
    else if (hSnap === 'right') tx = wa.x + wa.width - ww
    if (vSnap === 'top') ty = wa.y
    else if (vSnap === 'bottom') ty = wa.y + wa.height - wh
    animateWindowTo(tx, ty)
    core.setWinPos({ x: tx, y: ty })
    return { h: hSnap, v: vSnap }
  } catch (err) {
    return { h: null, v: null }
  }
})

// ---------------------------------------------------------------------------
// 应用生命周期
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
    rebuildTrayMenu()
    if (keysWin && !keysWin.isDestroyed()) {
      if (keysWin.isMinimized()) keysWin.restore()
      keysWin.focus()
    }
  })

  app.whenReady().then(() => {
    getSkinManager()
    syncAutoStartFromConfig()
    protocol.handle('skin', (request) => {
      try {
        const u = new URL(request.url)
        const id = decodeURIComponent(u.hostname || '')
        const rel = decodeURIComponent(String(u.pathname || '/').replace(/^\//, ''))
        const file = getSkinManager().resolveSkinPath(id, rel)
        if (!file) return new Response('not found', { status: 404 })
        return net.fetch(pathToFileURL(file).href)
      } catch (err) {
        return new Response('error', { status: 500 })
      }
    })
    createWindow()
    createTray()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showMainWindow()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit()
  })
}
