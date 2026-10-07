import express from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import {
  LIMITS, sanitizeId, sanitizeText, inspectSkinZip, inspectPluginFile,
  assertCover, ensureDir, detectKind,
} from './lib/validate.js'
import { CATEGORIES, normalizeCategory } from './lib/categories.js'
import { createAuth } from './lib/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(__dirname, 'data')
const SKIN_DIR = path.join(DATA, 'skins')
const PLUGIN_DIR = path.join(DATA, 'plugins')
const CATALOG = path.join(DATA, 'catalog.json')
const PORT = Number(process.env.PORT || 5177)
const MASTER_TOKEN = process.env.UPLOAD_TOKEN || ''

ensureDir(SKIN_DIR)
ensureDir(PLUGIN_DIR)
if (!fs.existsSync(CATALOG)) {
  fs.writeFileSync(CATALOG, JSON.stringify({ skins: [], plugins: [] }, null, 2))
}

const auth = createAuth({ dataDir: DATA, ensureDir })

function migrateItem(it, kind) {
  const x = Object.assign({}, it)
  if (!x.status) x.status = 'published'
  if (!x.category) x.category = x.author === 'ZC桌宠' ? '官方' : '其他'
  x.category = normalizeCategory(kind, x.category)
  if (!x.ownerId) x.ownerId = x.category === '官方' ? 'official' : ''
  return x
}

function readCatalog() {
  try {
    const j = JSON.parse(fs.readFileSync(CATALOG, 'utf8'))
    return {
      skins: (Array.isArray(j.skins) ? j.skins : []).map((s) => migrateItem(s, 'skin')),
      plugins: (Array.isArray(j.plugins) ? j.plugins : []).map((p) => migrateItem(p, 'plugin')),
    }
  } catch {
    return { skins: [], plugins: [] }
  }
}

function writeCatalog(cat) {
  const tmp = CATALOG + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cat, null, 2))
  fs.renameSync(tmp, CATALOG)
}

function underData(abs) {
  const resolved = path.resolve(abs)
  const root = path.resolve(DATA) + path.sep
  return resolved === path.resolve(DATA) || resolved.startsWith(root)
}

function matchesQuery(item, q) {
  if (!q) return true
  const hay = [item.title, item.author, item.description, item.category, item.id].join(' ').toLowerCase()
  return hay.includes(q)
}

function canSee(item, user) {
  const st = item.status || 'published'
  if (st === 'published') return true
  if (!user) return false
  if (user.role === 'admin') return true
  return item.ownerId && item.ownerId === user.id
}

function publicSkin(s) {
  return {
    id: s.id,
    title: s.title,
    author: s.author,
    description: s.description,
    category: s.category || '其他',
    status: s.status || 'published',
    createdAt: s.createdAt,
    size: s.size,
    previewUrl: s.preview ? `/api/file/skins/${encodeURIComponent(s.id)}/preview${s.previewExt || '.png'}` : '',
    downloadUrl: `/api/file/skins/${encodeURIComponent(s.id)}/pack.skin`,
    kind: 'skin',
    mine: false,
  }
}

function publicPlugin(p) {
  return {
    id: p.id,
    title: p.title,
    author: p.author,
    description: p.description,
    category: p.category || '其他',
    status: p.status || 'published',
    createdAt: p.createdAt,
    size: p.size,
    flags: p.flags || [],
    coverUrl: p.cover ? `/api/file/plugins/${encodeURIComponent(p.id)}/cover${p.coverExt || '.png'}` : '',
    downloadUrl: `/api/file/plugins/${encodeURIComponent(p.id)}/plugin${p.fileExt || '.js'}`,
    kind: 'plugin',
    mine: false,
  }
}

function decorate(item, user, fn) {
  const o = fn(item)
  o.mine = !!(user && item.ownerId && item.ownerId === user.id)
  return o
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.skinBytes, files: 3 },
})

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json({ limit: '32kb' }))

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; ')
  )
  next()
})

app.use(auth.attachUser)

const listLimit = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false })
const uploadLimit = rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false })
const authLimit = rateLimit({ windowMs: 15 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false })

function requireUser(req, res, next) {
  if (req.user) return next()
  if (MASTER_TOKEN && req.get('x-upload-token') === MASTER_TOKEN) {
    req.user = { id: 'master', name: 'token', role: 'admin', token: MASTER_TOKEN }
    return next()
  }
  return res.status(401).json({ ok: false, error: '请先登录' })
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next()
  return res.status(403).json({ ok: false, error: '需要管理员' })
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'zc-atelier',
    executesUserCode: false,
    auth: true,
    categories: CATEGORIES,
  })
})

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ ok: true, user: null })
  res.json({ ok: true, user: auth.publicUser(req.user), categories: CATEGORIES })
})

app.post('/api/auth/register', authLimit, (req, res) => {
  const r = auth.register(req.body?.name, req.body?.password)
  if (!r.ok) return res.status(400).json(r)
  const sid = auth.createSession(r.user.id)
  auth.setCookie(res, sid, req)
  res.json({ ok: true, user: auth.publicUser(r.user) })
})

app.post('/api/auth/login', authLimit, (req, res) => {
  const r = auth.login(req.body?.name, req.body?.password)
  if (!r.ok) return res.status(400).json(r)
  const sid = auth.createSession(r.user.id)
  auth.setCookie(res, sid, req)
  res.json({ ok: true, user: auth.publicUser(r.user) })
})

app.post('/api/auth/logout', (req, res) => {
  const sid = auth.parseCookies(req).zc_sess
  if (sid) auth.destroySession(sid)
  auth.clearCookie(res, req)
  res.json({ ok: true })
})

app.post('/api/me/token', requireUser, (req, res) => {
  if (req.user.id === 'master') return res.json({ ok: true, token: MASTER_TOKEN })
  const token = auth.rotateToken(req.user.id)
  res.json({ ok: true, token })
})

app.get('/api/catalog', listLimit, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase()
  const catFilter = String(req.query.category || '').trim()
  const cat = readCatalog()
  const user = req.user
  const skins = cat.skins
    .filter((s) => canSee(s, user))
    .filter((s) => !catFilter || s.category === catFilter)
    .filter((s) => matchesQuery(s, q))
    .map((s) => decorate(s, user, publicSkin))
  const plugins = cat.plugins
    .filter((p) => canSee(p, user))
    .filter((p) => !catFilter || p.category === catFilter)
    .filter((p) => matchesQuery(p, q))
    .map((p) => decorate(p, user, publicPlugin))
  res.json({ ok: true, skins, plugins, categories: CATEGORIES })
})

app.get('/api/admin/queue', requireUser, requireAdmin, (req, res) => {
  const cat = readCatalog()
  const pending = [
    ...cat.skins.filter((s) => s.status === 'pending').map((s) => decorate(s, req.user, publicSkin)),
    ...cat.plugins.filter((p) => p.status === 'pending').map((p) => decorate(p, req.user, publicPlugin)),
  ]
  res.json({ ok: true, pending })
})

app.post('/api/admin/review', requireUser, requireAdmin, (req, res) => {
  const kind = req.body?.kind === 'plugin' ? 'plugins' : req.body?.kind === 'skin' ? 'skins' : ''
  const id = sanitizeId(req.body?.id)
  const action = req.body?.action
  if (!kind || !id || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ ok: false, error: '参数无效' })
  }
  const cat = readCatalog()
  const list = cat[kind]
  const item = list.find((x) => x.id === id)
  if (!item) return res.status(404).json({ ok: false, error: '条目不存在' })
  item.status = action === 'approve' ? 'published' : 'rejected'
  item.reviewedAt = new Date().toISOString()
  item.reviewNote = sanitizeText(req.body?.note || '', 200)
  writeCatalog(cat)
  res.json({ ok: true, id, status: item.status })
})

app.get('/api/file/:kind/:id/:name', listLimit, (req, res) => {
  const kind = req.params.kind === 'skins' ? 'skins' : req.params.kind === 'plugins' ? 'plugins' : ''
  const id = sanitizeId(req.params.id)
  const name = path.basename(String(req.params.name || ''))
  if (!kind || !id || !name) return res.status(400).end()
  if (!/^(pack\.skin|preview\.[a-z0-9]+|plugin\.[a-z0-9]+|cover\.[a-z0-9]+)$/i.test(name)) {
    return res.status(400).end()
  }
  const cat = readCatalog()
  const item = (kind === 'skins' ? cat.skins : cat.plugins).find((x) => x.id === id)
  if (!item || !canSee(item, req.user)) return res.status(404).end()

  const abs = path.join(DATA, kind, id, name)
  if (!underData(abs) || !fs.existsSync(abs)) return res.status(404).end()

  const ext = path.extname(name).toLowerCase()
  const isDownload = name.startsWith('pack.') || name.startsWith('plugin.')
  if (isDownload) {
    res.setHeader('Content-Disposition', `attachment; filename="${id}${ext}"`)
    if (ext === '.js' || ext === '.mjs') res.type('text/plain')
    else if (ext === '.skin' || ext === '.zip') res.type('application/zip')
  } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    res.type(ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/' + ext.slice(1))
  } else if (ext === '.svg') {
    res.setHeader('Content-Disposition', `attachment; filename="${id}-preview.svg"`)
    res.type('image/svg+xml')
  }
  res.sendFile(abs)
})

function uniqueId(cat, id) {
  let next = id
  while (cat.skins.some((s) => s.id === next) || cat.plugins.some((p) => p.id === next)) {
    next = id + '-' + crypto.randomBytes(2).toString('hex')
  }
  return next
}

app.post(
  '/api/upload/skin',
  uploadLimit,
  requireUser,
  upload.single('file'),
  (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: '请选择 .skin 文件' })
      const buf = req.file.buffer
      if (buf.length > LIMITS.skinBytes) return res.status(400).json({ ok: false, error: '文件过大' })
      if (detectKind(buf, req.file.originalname) !== 'zip') {
        return res.status(400).json({ ok: false, error: '皮肤必须是 zip/.skin' })
      }
      const inspected = inspectSkinZip(buf)
      if (!inspected.ok) return res.status(400).json({ ok: false, error: inspected.error })

      const title = sanitizeText(req.body.title || inspected.label, LIMITS.titleLen) || inspected.label || '未命名皮肤'
      const author = sanitizeText(req.body.author || req.user.name, LIMITS.authorLen) || req.user.name
      const description = sanitizeText(req.body.description || '', LIMITS.descLen)
      const category = normalizeCategory('skin', req.body.category)
      let id = sanitizeId(req.body.id || inspected.idHint || title)
      if (!id) id = 'skin-' + crypto.randomBytes(4).toString('hex')

      const cat = readCatalog()
      id = uniqueId(cat, id)
      const dir = path.join(SKIN_DIR, id)
      ensureDir(dir)
      fs.writeFileSync(path.join(dir, 'pack.skin'), buf)
      let previewExt = ''
      if (inspected.previewBuf && inspected.previewExt) {
        previewExt = inspected.previewExt
        fs.writeFileSync(path.join(dir, 'preview' + previewExt), inspected.previewBuf)
      }

      const autoPub = req.user.role === 'admin'
      const item = {
        id,
        title,
        author,
        description,
        category,
        status: autoPub ? 'published' : 'pending',
        ownerId: req.user.id,
        createdAt: new Date().toISOString(),
        size: buf.length,
        preview: !!previewExt,
        previewExt,
        file: 'pack.skin',
      }
      cat.skins.unshift(item)
      writeCatalog(cat)
      res.json({
        ok: true,
        item: decorate(item, req.user, publicSkin),
        notice: autoPub ? '' : '已提交，等待管理员审核后才会出现在广场。',
      })
    } catch (err) {
      console.error('[upload/skin]', err)
      res.status(500).json({ ok: false, error: '上传失败' })
    }
  }
)

app.post(
  '/api/upload/plugin',
  uploadLimit,
  requireUser,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const file = req.files?.file?.[0]
      if (!file) return res.status(400).json({ ok: false, error: '请选择插件 .js / .zip' })
      const buf = file.buffer
      if (buf.length > LIMITS.pluginBytes) return res.status(400).json({ ok: false, error: '插件过大' })

      const inspected = inspectPluginFile(buf, file.originalname)
      if (!inspected.ok) return res.status(400).json({ ok: false, error: inspected.error })

      const title = sanitizeText(req.body.title || path.basename(file.originalname, path.extname(file.originalname)), LIMITS.titleLen) || '未命名插件'
      const author = sanitizeText(req.body.author || req.user.name, LIMITS.authorLen) || req.user.name
      const description = sanitizeText(req.body.description || '', LIMITS.descLen)
      const category = normalizeCategory('plugin', req.body.category)
      let id = sanitizeId(req.body.id || title)
      if (!id) id = 'plug-' + crypto.randomBytes(4).toString('hex')

      const cat = readCatalog()
      id = uniqueId(cat, id)
      const dir = path.join(PLUGIN_DIR, id)
      ensureDir(dir)
      const fileExt = inspected.ext || '.js'
      fs.writeFileSync(path.join(dir, 'plugin' + fileExt), buf)

      let coverExt = ''
      const cover = req.files?.cover?.[0]
      if (cover) {
        const c = assertCover(cover.buffer, cover.originalname)
        if (!c.ok) return res.status(400).json({ ok: false, error: c.error })
        coverExt = c.ext
        fs.writeFileSync(path.join(dir, 'cover' + coverExt), cover.buffer)
      }

      const autoPub = req.user.role === 'admin'
      const item = {
        id,
        title,
        author,
        description,
        category,
        status: autoPub ? 'published' : 'pending',
        ownerId: req.user.id,
        createdAt: new Date().toISOString(),
        size: buf.length,
        cover: !!coverExt,
        coverExt,
        fileExt,
        flags: inspected.flags || [],
      }
      cat.plugins.unshift(item)
      writeCatalog(cat)
      res.json({
        ok: true,
        item: decorate(item, req.user, publicPlugin),
        notice: autoPub
          ? '服务端不会执行插件代码。'
          : '已提交审核。服务端不会执行插件代码；通过后才会出现在插件库。',
      })
    } catch (err) {
      console.error('[upload/plugin]', err)
      res.status(500).json({ ok: false, error: '上传失败' })
    }
  }
)

app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'not found' }))

app.use(express.static(ROOT, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}server${path.sep}data${path.sep}`)) {
      res.statusCode = 404
    }
  },
}))

app.get('/', (_req, res) => res.redirect('/plaza.html'))

app.listen(PORT, () => {
  console.log(`ZC工坊 + 成品广场 http://127.0.0.1:${PORT}`)
  console.log('登录/注册已启用。上传需登录；普通用户提交后待审核。')
  if (process.env.ADMIN_NAME) console.log('管理员账号来自 ADMIN_NAME')
  else console.log('未设 ADMIN_NAME：第一个注册的用户会成为管理员')
  if (MASTER_TOKEN) console.log('主上传令牌 UPLOAD_TOKEN 仍可用')
})
