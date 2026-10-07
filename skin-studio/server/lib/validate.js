import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'

export const LIMITS = {
  skinBytes: 15 * 1024 * 1024,
  pluginBytes: 2 * 1024 * 1024,
  coverBytes: 2 * 1024 * 1024,
  zipEntries: 200,
  zipUncompressed: 40 * 1024 * 1024,
  titleLen: 64,
  authorLen: 32,
  descLen: 500,
}

const SKIN_INNER_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.avif',
  '.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus',
  '.mp4', '.webm', '.mov',
  '.json', '.css', '.js', '.mjs', '.html', '.htm', '.txt',
])

const COVER_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const PLUGIN_EXT = new Set(['.js', '.mjs', '.zip'])

const ZIP_MAGIC = Buffer.from([0x50, 0x4b]) // PK
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const GIF_MAGIC = Buffer.from([0x47, 0x49, 0x46])
const WEBP_RIFF = Buffer.from([0x52, 0x49, 0x46, 0x46])

export function sanitizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function sanitizeText(raw, max) {
  return String(raw || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max)
}

export function safeExt(name, allow) {
  const ext = path.extname(String(name || '')).toLowerCase()
  return allow.has(ext) ? ext : ''
}

function startsWith(buf, magic) {
  return Buffer.isBuffer(buf) && buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic)
}

export function detectKind(buf, filename) {
  const ext = path.extname(String(filename || '')).toLowerCase()
  if (startsWith(buf, ZIP_MAGIC) || ext === '.skin' || ext === '.zip') return 'zip'
  if (startsWith(buf, PNG_MAGIC) || ext === '.png') return 'png'
  if (startsWith(buf, JPEG_MAGIC) || ext === '.jpg' || ext === '.jpeg') return 'jpeg'
  if (startsWith(buf, GIF_MAGIC) || ext === '.gif') return 'gif'
  if (startsWith(buf, WEBP_RIFF) && buf.length > 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (ext === '.js' || ext === '.mjs') {
    // reject if binary-looking
    const sample = buf.subarray(0, Math.min(buf.length, 4096))
    if (sample.includes(0)) return ''
    return 'js'
  }
  return ''
}

function badZipPath(entryName) {
  const n = String(entryName || '').replace(/\\/g, '/')
  if (!n || n.startsWith('/') || /^[a-zA-Z]:/.test(n)) return true
  if (n.split('/').some((p) => p === '..')) return true
  if (n.includes('\0')) return true
  return false
}

/** Inspect zip without trusting client; returns { ok, error, previewBuf, previewExt, manifest } */
export function inspectSkinZip(buf) {
  let zip
  try {
    zip = new AdmZip(buf)
  } catch {
    return { ok: false, error: '不是有效的 zip/.skin' }
  }
  const entries = zip.getEntries()
  if (!entries.length) return { ok: false, error: '皮肤包为空' }
  if (entries.length > LIMITS.zipEntries) return { ok: false, error: '皮肤包文件过多' }

  let totalUnc = 0
  let hasJson = false
  let manifest = null
  const names = []

  for (const e of entries) {
    if (e.isDirectory) continue
    const name = String(e.entryName || '').replace(/\\/g, '/')
    if (badZipPath(name)) return { ok: false, error: '皮肤包含非法路径' }
    const unc = e.header?.size ?? e.getData()?.length ?? 0
    totalUnc += unc
    if (totalUnc > LIMITS.zipUncompressed) return { ok: false, error: '解压体积过大（疑似 zip bomb）' }
    const ext = path.extname(name).toLowerCase()
    if (!SKIN_INNER_EXT.has(ext)) return { ok: false, error: '含不允许的文件类型: ' + ext }
    names.push(name)
    if (/(^|\/)skin\.json$/i.test(name)) {
      hasJson = true
      try {
        manifest = JSON.parse(e.getData().toString('utf8'))
      } catch {
        return { ok: false, error: 'skin.json 无效' }
      }
    }
  }
  if (!hasJson) return { ok: false, error: '缺少 skin.json' }
  if (!manifest || typeof manifest !== 'object') return { ok: false, error: 'skin.json 无效' }

  const idleName = String(manifest.img || 'idle.png').replace(/\\/g, '/')
  if (badZipPath(idleName)) return { ok: false, error: '立绘路径非法' }
  const idleExt = path.extname(idleName).toLowerCase()
  if (!COVER_EXT.has(idleExt) && idleExt !== '.svg') {
    // allow svg for preview skip raster
  }

  let previewBuf = null
  let previewExt = ''
  const idleEntry = entries.find((e) => !e.isDirectory && String(e.entryName).replace(/\\/g, '/') === idleName)
    || entries.find((e) => !e.isDirectory && /(^|\/)idle\.(png|jpe?g|webp|gif|svg)$/i.test(String(e.entryName)))

  if (idleEntry) {
    const ext = path.extname(idleEntry.entryName).toLowerCase() || '.png'
    // SVG 可含脚本，不做站点内嵌预览；仅栅格图作封面
    if (COVER_EXT.has(ext)) {
      previewBuf = idleEntry.getData()
      previewExt = ext
      if (previewBuf.length > LIMITS.coverBytes) {
        previewBuf = null
        previewExt = ''
      }
    }
  }

  const idHint = sanitizeId(manifest.id || '')
  return {
    ok: true,
    manifest,
    idHint,
    label: sanitizeText(manifest.label || manifest.brand || idHint, LIMITS.titleLen),
    previewBuf,
    previewExt,
    fileCount: names.length,
  }
}

export function inspectPluginFile(buf, filename) {
  const kind = detectKind(buf, filename)
  if (kind === 'js') {
    if (buf.length > LIMITS.pluginBytes) return { ok: false, error: '插件过大' }
    const text = buf.toString('utf8')
    // crude server-side red flags (not execution)
    const lower = text.toLowerCase()
    const flags = []
    if (/require\s*\(|process\.|child_process|fs\.|net\.|http\.|eval\s*\(|new\s+function/.test(lower)) {
      flags.push('含 Node/危险 API 字样（仅作提醒，服务端不会执行）')
    }
    if (/document\.cookie|localstorage|indexeddb|fetch\s*\(|xmlhttprequest|websocket/.test(lower)) {
      flags.push('可能访问浏览器存储或网络（预览时仅在本机沙箱外有风险）')
    }
    return { ok: true, kind: 'js', flags, ext: path.extname(filename).toLowerCase() || '.js' }
  }
  if (kind === 'zip') {
    let zip
    try { zip = new AdmZip(buf) } catch { return { ok: false, error: '插件 zip 无效' } }
    const entries = zip.getEntries().filter((e) => !e.isDirectory)
    if (!entries.length) return { ok: false, error: '插件包为空' }
    if (entries.length > 40) return { ok: false, error: '插件包文件过多' }
    let total = 0
    let jsCount = 0
    for (const e of entries) {
      const name = String(e.entryName || '').replace(/\\/g, '/')
      if (badZipPath(name)) return { ok: false, error: '插件包含非法路径' }
      total += e.header?.size ?? 0
      if (total > LIMITS.zipUncompressed / 4) return { ok: false, error: '插件包过大' }
      const ext = path.extname(name).toLowerCase()
      if (!['.js', '.mjs', '.css', '.json', '.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
        return { ok: false, error: '插件包含不允许类型: ' + ext }
      }
      if (ext === '.js' || ext === '.mjs') jsCount++
    }
    if (!jsCount) return { ok: false, error: '插件包内无 .js' }
    return { ok: true, kind: 'zip', flags: [], ext: '.zip' }
  }
  return { ok: false, error: '插件仅允许 .js / .mjs / .zip' }
}

export function assertCover(buf, filename) {
  const kind = detectKind(buf, filename)
  if (!['png', 'jpeg', 'gif', 'webp'].includes(kind)) return { ok: false, error: '封面仅支持 png/jpg/webp/gif' }
  if (buf.length > LIMITS.coverBytes) return { ok: false, error: '封面过大' }
  const ext = kind === 'jpeg' ? '.jpg' : '.' + kind
  return { ok: true, ext }
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

export { PLUGIN_EXT, COVER_EXT, SKIN_INNER_EXT }
