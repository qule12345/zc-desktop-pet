'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return null
  }
}

function extractSkinZip(skinFile, destDir) {
  ensureDir(destDir)
  // Windows 10+ / macOS / Linux 自带 tar，可解 zip（.skin 即 zip）
  execFileSync('tar', ['-xf', skinFile, '-C', destDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function skinAssetUrl(skinId, name) {
  if (!name) return null
  const parts = String(name).replace(/\\/g, '/').split('/').filter(Boolean)
  return 'skin://' + encodeURIComponent(skinId) + '/' + parts.map(encodeURIComponent).join('/')
}

function resolveAsset(dir, skinId, name) {
  if (!name) return null
  const full = path.join(dir, String(name))
  if (!fs.existsSync(full)) return null
  return skinAssetUrl(skinId, name)
}

function asList(raw) {
  if (raw == null || raw === '') return []
  return Array.isArray(raw) ? raw : [raw]
}

function collectFiles(dir, skinId, raw) {
  const out = []
  for (const item of asList(raw)) {
    const file = typeof item === 'string' ? item : item && (item.file || item.src || item.href || item.url)
    if (!file || /^(https?:|data:|blob:|skin:)/i.test(String(file))) {
      if (typeof item === 'string' && /^(https?:|skin:)/i.test(item)) out.push({ file: item, url: item, id: null })
      continue
    }
    const url = resolveAsset(dir, skinId, file)
    if (!url) continue
    out.push({
      file: String(file),
      url: url,
      id: item && typeof item === 'object' ? String(item.id || '') : '',
    })
  }
  return out
}

function existsIn(dir, name) {
  try {
    return fs.existsSync(path.join(dir, name))
  } catch (err) {
    return false
  }
}

function discoverPlugins(dir, skinId, m) {
  const listed = collectFiles(dir, skinId, [].concat(m.plugins || [], m.mods || [], m.scripts || [], m.script || []))
  const seen = new Set(listed.map((x) => x.file.replace(/\\/g, '/')))
  const add = (rel) => {
    const key = String(rel).replace(/\\/g, '/')
    if (seen.has(key) || !existsIn(dir, rel)) return
    const url = resolveAsset(dir, skinId, rel)
    if (!url) return
    seen.add(key)
    listed.push({ file: key, url: url, id: '' })
  }
  ;['plugin.js', 'mod.js', 'draw.js', 'bubble.js', 'pet.js'].forEach(add)
  try {
    const modsDir = path.join(dir, 'mods')
    if (fs.existsSync(modsDir) && fs.statSync(modsDir).isDirectory()) {
      for (const n of fs.readdirSync(modsDir)) {
        if (/\.(js|mjs)$/i.test(n)) add('mods/' + n)
      }
    }
  } catch (err) {}
  return listed
}

function discoverStyles(dir, skinId, m) {
  const listed = collectFiles(dir, skinId, [].concat(m.css || [], m.styles || [], m.style || []))
  const seen = new Set(listed.map((x) => x.file.replace(/\\/g, '/')))
  ;['skin.css', 'mod.css', 'bubble.css', 'pet.css'].forEach((rel) => {
    if (seen.has(rel) || !existsIn(dir, rel)) return
    const url = resolveAsset(dir, skinId, rel)
    if (url) listed.push({ file: rel, url: url, id: '' })
  })
  return listed
}

function markupOrFile(dir, skinId, value, fallbackFile) {
  if (typeof value === 'string' && value.trim().charAt(0) === '<') return { inline: value, url: null }
  const file = (typeof value === 'string' && value.trim()) ? value : fallbackFile
  return { inline: null, url: resolveAsset(dir, skinId, file) }
}

function publicSkin(manifest, dir, id) {
  const m = manifest && typeof manifest === 'object' ? manifest : {}
  const skinId = String(m.id || id || '').trim() || id

  // soundSets: [{ id, label, press?, release?, hover? }]
  let soundSets = []
  if (Array.isArray(m.soundSets)) {
    for (const raw of m.soundSets) {
      if (!raw || typeof raw !== 'object') continue
      const sid = String(raw.id || '').trim()
      if (!sid) continue
      const press = resolveAsset(dir, skinId, raw.press)
      const release = resolveAsset(dir, skinId, raw.release)
      const hover = resolveAsset(dir, skinId, raw.hover)
      if (!press && !release && !hover) continue
      soundSets.push({
        id: sid,
        label: String(raw.label || sid),
        press: press,
        release: release,
        hover: hover,
        oneshot: !release && !!press,
      })
    }
  }

  // 兼容旧字段：pressSound / releaseSound / hoverSound → 追加「哈气」
  const legacyPress = resolveAsset(dir, skinId, m.pressSound)
  const legacyRelease = resolveAsset(dir, skinId, m.releaseSound)
  const legacyHover = resolveAsset(dir, skinId, m.hoverSound)
  if ((legacyPress || legacyHover) && !soundSets.some((s) => s.id === 'special')) {
    soundSets.push({
      id: 'special',
      label: '哈气',
      press: legacyPress,
      release: legacyRelease,
      hover: legacyHover,
      oneshot: !legacyRelease && !!legacyPress,
    })
  }

  const bubbleSvg = markupOrFile(dir, skinId, m.bubbleSvg || m.bubble, 'bubble.svg')
  const bubbleHtml = markupOrFile(dir, skinId, m.bubbleHtml, 'bubble.html')
  const extra = {}
  const known = new Set([
    'id', 'label', 'brand', 'balanceTitle', 'stroke', 'text', 'hint', 'accent', 'accentRgb',
    'img', 'pressImg', 'pressSound', 'releaseSound', 'hoverSound', 'burstImg', 'gif',
    'burstClicks', 'burstSound', 'bubbles', 'soundSets', 'plugins', 'mods', 'scripts', 'script',
    'css', 'styles', 'style', 'bubbleSvg', 'bubble', 'bubbleHtml', 'data',
  ])
  for (const k of Object.keys(m)) {
    if (!known.has(k)) extra[k] = m[k]
  }

  return {
    id: skinId,
    label: String(m.label || skinId),
    brand: String(m.brand || m.label || skinId),
    balanceTitle: m.balanceTitle != null ? String(m.balanceTitle) : null,
    stroke: String(m.stroke || '#203170'),
    text: String(m.text || '#536ba9'),
    hint: String(m.hint || '#9fb0d9'),
    accent: String(m.accent || '#203170'),
    accentRgb: String(m.accentRgb || '32,49,112'),
    img: resolveAsset(dir, skinId, m.img || 'idle.png'),
    pressImg: resolveAsset(dir, skinId, m.pressImg),
    pressSound: legacyPress,
    releaseSound: legacyRelease,
    hoverSound: legacyHover,
    burstImg: resolveAsset(dir, skinId, m.burstImg),
    gif: resolveAsset(dir, skinId, m.gif),
    burstClicks: Number(m.burstClicks) > 0 ? Math.round(Number(m.burstClicks)) : 0,
    burstSound: resolveAsset(dir, skinId, m.burstSound),
    bubbles: Array.isArray(m.bubbles) ? m.bubbles : [],
    soundSets: soundSets,
    plugins: discoverPlugins(dir, skinId, m),
    styles: discoverStyles(dir, skinId, m),
    bubbleSvgInline: bubbleSvg.inline,
    bubbleSvgUrl: bubbleSvg.url,
    bubbleHtmlInline: bubbleHtml.inline,
    bubbleHtmlUrl: bubbleHtml.url,
    data: m.data && typeof m.data === 'object' ? m.data : {},
    extra: extra,
    dir: dir,
  }
}

function createSkinManager({ packsDir, userPacksDir, cacheDir }) {
  const packs = path.resolve(packsDir)
  const userPacks = userPacksDir ? path.resolve(userPacksDir) : null
  const cache = path.resolve(cacheDir)
  let catalog = []

  function readDirPacks(dir) {
    try {
      return fs
        .readdirSync(dir)
        .filter((n) => /\.skin$/i.test(n))
        .map((n) => path.join(dir, n))
    } catch (err) {
      return []
    }
  }

  function listPackFiles() {
    // 同 id 时用户目录覆盖内置
    const map = new Map()
    for (const file of readDirPacks(packs)) {
      map.set(path.basename(file, path.extname(file)).toLowerCase(), file)
    }
    if (userPacks) {
      ensureDir(userPacks)
      for (const file of readDirPacks(userPacks)) {
        map.set(path.basename(file, path.extname(file)).toLowerCase(), file)
      }
    }
    return Array.from(map.values())
  }

  function unpackOne(skinFile) {
    const base = path.basename(skinFile, path.extname(skinFile))
    const dest = path.join(cache, base)
    const marker = path.join(dest, '.pack-mtime')
    let mtime = 0
    try {
      mtime = fs.statSync(skinFile).mtimeMs
    } catch (err) {
      return null
    }
    const prev = readJson(marker)
    const need = !prev || prev.mtime !== mtime || !fs.existsSync(path.join(dest, 'skin.json'))
    if (need) {
      try {
        fs.rmSync(dest, { recursive: true, force: true })
      } catch (err) {}
      ensureDir(dest)
      extractSkinZip(skinFile, dest)
      fs.writeFileSync(marker, JSON.stringify({ mtime: mtime, src: skinFile }), 'utf8')
    }
    const manifest = readJson(path.join(dest, 'skin.json'))
    if (!manifest) return null
    const skin = publicSkin(manifest, dest, base)
    const hasLook = !!(skin.img || (skin.plugins && skin.plugins.length) || skin.bubbleSvgInline || skin.bubbleSvgUrl || skin.bubbleHtmlInline || skin.bubbleHtmlUrl)
    if (!hasLook) return null
    return skin
  }

  function refresh() {
    const out = []
    const files = listPackFiles()
    for (const file of files) {
      try {
        const skin = unpackOne(file)
        if (skin) out.push(skin)
      } catch (err) {
        console.error('[skins] unpack failed', file, err && err.message)
      }
    }
    // 稳定顺序：whale → orange → gpt → kele → maodie → 其它按 id
    const order = ['whale', 'orange', 'gpt', 'kele', 'maodie']
    out.sort((a, b) => {
      const ia = order.indexOf(a.id)
      const ib = order.indexOf(b.id)
      if (ia < 0 && ib < 0) return a.id.localeCompare(b.id)
      if (ia < 0) return 1
      if (ib < 0) return -1
      return ia - ib
    })
    catalog = out
    return catalog
  }

  function listSkins() {
    if (!catalog.length) refresh()
    return {
      ok: true,
      skins: catalog.map((s) => {
        const copy = Object.assign({}, s)
        delete copy.dir
        return copy
      }),
      defaultId: catalog.some((s) => s.id === 'gpt')
        ? 'gpt'
        : catalog[0]
          ? catalog[0].id
          : 'gpt',
    }
  }

  function getSkin(id) {
    if (!catalog.length) refresh()
    return catalog.find((s) => s.id === id) || null
  }

  function resolveSkinPath(skinId, rel) {
    const s = getSkin(skinId)
    if (!s || !s.dir) return null
    const root = path.resolve(s.dir)
    const full = path.resolve(root, String(rel || ''))
    const prefix = root.endsWith(path.sep) ? root : root + path.sep
    if (full !== root && !full.startsWith(prefix)) return null
    if (!fs.existsSync(full)) return null
    return full
  }

  function importSkinPack(srcPath) {
    if (!userPacks) return { ok: false, error: '未配置用户皮肤目录' }
    const src = path.resolve(String(srcPath || ''))
    if (!src || !fs.existsSync(src) || !/\.skin$/i.test(src)) {
      return { ok: false, error: '请选择 .skin 文件' }
    }
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'skin-import-'))
    try {
      extractSkinZip(src, tmp)
      const manifest = readJson(path.join(tmp, 'skin.json'))
      if (!manifest || typeof manifest !== 'object') {
        return { ok: false, error: '皮肤包缺少 skin.json' }
      }
      const id = String(manifest.id || path.basename(src, path.extname(src)) || '')
        .trim()
        .replace(/[^\w\-]+/g, '-')
        .replace(/^-+|-+$/g, '')
      if (!id) return { ok: false, error: '皮肤 id 无效' }
      const idleName = String(manifest.img || 'idle.png')
      const hasIdle = fs.existsSync(path.join(tmp, idleName))
      const hasMod =
        fs.existsSync(path.join(tmp, 'plugin.js')) ||
        fs.existsSync(path.join(tmp, 'mod.js')) ||
        fs.existsSync(path.join(tmp, 'draw.js')) ||
        fs.existsSync(path.join(tmp, 'bubble.svg')) ||
        fs.existsSync(path.join(tmp, 'bubble.html')) ||
        (Array.isArray(manifest.plugins) && manifest.plugins.length) ||
        (typeof manifest.bubbleSvg === 'string' && manifest.bubbleSvg.trim()) ||
        (typeof manifest.bubbleHtml === 'string' && manifest.bubbleHtml.trim())
      if (!hasIdle && !hasMod) {
        return { ok: false, error: '皮肤包需要立绘，或气泡外形 / 插件脚本' }
      }
      ensureDir(userPacks)
      const dest = path.join(userPacks, id + '.skin')
      fs.copyFileSync(src, dest)
      // 强制重解压
      try {
        fs.rmSync(path.join(cache, id), { recursive: true, force: true })
      } catch (err) {}
      refresh()
      const skin = getSkin(id)
      if (!skin) return { ok: false, error: '导入后加载失败' }
      return { ok: true, id: skin.id, label: skin.label, skins: listSkins() }
    } catch (err) {
      return { ok: false, error: '导入失败: ' + String((err && err.message) || err).slice(0, 160) }
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true })
      } catch (err) {}
    }
  }

  return {
    refresh,
    listSkins,
    getSkin,
    resolveSkinPath,
    importSkinPack,
    packsDir: packs,
    userPacksDir: userPacks,
    cacheDir: cache,
  }
}

module.exports = { createSkinManager, publicSkin }
