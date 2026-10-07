import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const NAME_RE = /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,24}$/

export function createAuth({ dataDir, ensureDir }) {
  const USERS = path.join(dataDir, 'users.json')
  const SESS = path.join(dataDir, 'sessions.json')
  const SECRET_FILE = path.join(dataDir, '.session-secret')
  ensureDir(dataDir)

  if (!fs.existsSync(USERS)) fs.writeFileSync(USERS, JSON.stringify({ users: [] }, null, 2))
  if (!fs.existsSync(SESS)) fs.writeFileSync(SESS, JSON.stringify({ sessions: [] }, null, 2))
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 })
  }

  const secret = (process.env.SESSION_SECRET || fs.readFileSync(SECRET_FILE, 'utf8')).trim()

  function readUsers() {
    try {
      const j = JSON.parse(fs.readFileSync(USERS, 'utf8'))
      return Array.isArray(j.users) ? j.users : []
    } catch { return [] }
  }
  function writeUsers(users) {
    const tmp = USERS + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify({ users }, null, 2))
    fs.renameSync(tmp, USERS)
  }
  function readSessions() {
    try {
      const j = JSON.parse(fs.readFileSync(SESS, 'utf8'))
      return Array.isArray(j.sessions) ? j.sessions : []
    } catch { return [] }
  }
  function writeSessions(sessions) {
    const now = Date.now()
    const live = sessions.filter((s) => s.exp > now)
    const tmp = SESS + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify({ sessions: live }, null, 2))
    fs.renameSync(tmp, SESS)
    return live
  }

  function hashPass(password, salt) {
    const s = salt || crypto.randomBytes(16).toString('hex')
    const hash = crypto.scryptSync(String(password), s, 32).toString('hex')
    return { salt: s, hash }
  }
  function checkPass(password, salt, hash) {
    const got = crypto.scryptSync(String(password), salt, 32)
    const a = Buffer.from(hash, 'hex')
    if (a.length !== got.length) return false
    return crypto.timingSafeEqual(a, got)
  }

  function publicUser(u) {
    if (!u) return null
    return { id: u.id, name: u.name, role: u.role, token: u.token }
  }

  function findByName(name) {
    const n = String(name || '').trim().toLowerCase()
    return readUsers().find((u) => u.name.toLowerCase() === n)
  }

  function newToken() {
    return crypto.randomBytes(24).toString('hex')
  }

  function bootstrapAdmin() {
    const name = String(process.env.ADMIN_NAME || '').trim()
    const pass = String(process.env.ADMIN_PASS || '')
    if (!name || !pass) return
    if (!NAME_RE.test(name)) {
      console.warn('[auth] ADMIN_NAME 非法，跳过引导')
      return
    }
    const users = readUsers()
    const i = users.findIndex((u) => u.name.toLowerCase() === name.toLowerCase())
    const { salt, hash } = hashPass(pass)
    if (i >= 0) {
      users[i].passSalt = salt
      users[i].passHash = hash
      users[i].role = 'admin'
      if (!users[i].token) users[i].token = newToken()
    } else {
      users.push({
        id: 'u-' + crypto.randomBytes(4).toString('hex'),
        name,
        passSalt: salt,
        passHash: hash,
        role: 'admin',
        token: newToken(),
        createdAt: new Date().toISOString(),
      })
    }
    writeUsers(users)
    console.log('[auth] 管理员已就绪：' + name)
  }
  bootstrapAdmin()

  function register(name, password) {
    const nm = String(name || '').trim()
    if (!NAME_RE.test(nm)) return { ok: false, error: '用户名 2–24 字，中文/字母/数字/_-' }
    if (String(password || '').length < 8) return { ok: false, error: '密码至少 8 位' }
    if (findByName(nm)) return { ok: false, error: '用户名已存在' }
    const users = readUsers()
    const { salt, hash } = hashPass(password)
    const role = users.length === 0 ? 'admin' : 'user'
    const u = {
      id: 'u-' + crypto.randomBytes(4).toString('hex'),
      name: nm,
      passSalt: salt,
      passHash: hash,
      role,
      token: newToken(),
      createdAt: new Date().toISOString(),
    }
    users.push(u)
    writeUsers(users)
    return { ok: true, user: u }
  }

  function login(name, password) {
    const u = findByName(name)
    if (!u || !checkPass(password, u.passSalt, u.passHash)) {
      return { ok: false, error: '用户名或密码不对' }
    }
    return { ok: true, user: u }
  }

  function createSession(userId) {
    const sessions = readSessions()
    const id = crypto.randomBytes(24).toString('hex')
    const sig = crypto.createHmac('sha256', secret).update(id).digest('hex').slice(0, 24)
    const sid = id + '.' + sig
    const exp = Date.now() + 30 * 24 * 3600 * 1000
    sessions.push({ id: sid, userId, exp })
    writeSessions(sessions)
    return sid
  }

  function destroySession(sid) {
    writeSessions(readSessions().filter((s) => s.id !== sid))
  }

  function userFromSession(sid) {
    if (!sid || typeof sid !== 'string') return null
    const [id, sig] = sid.split('.')
    if (!id || !sig) return null
    const expect = crypto.createHmac('sha256', secret).update(id).digest('hex').slice(0, 24)
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
    } catch { return null }
    const sess = readSessions().find((s) => s.id === sid && s.exp > Date.now())
    if (!sess) return null
    return readUsers().find((u) => u.id === sess.userId) || null
  }

  function userFromToken(token) {
    const t = String(token || '').trim()
    if (!t || t.length < 16) return null
    return readUsers().find((u) => u.token && u.token === t) || null
  }

  function rotateToken(userId) {
    const users = readUsers()
    const u = users.find((x) => x.id === userId)
    if (!u) return null
    u.token = newToken()
    writeUsers(users)
    return u.token
  }

  function parseCookies(req) {
    const out = {}
    String(req.headers.cookie || '').split(';').forEach((p) => {
      const i = p.indexOf('=')
      if (i < 0) return
      const k = p.slice(0, i).trim()
      try { out[k] = decodeURIComponent(p.slice(i + 1).trim()) } catch { out[k] = p.slice(i + 1).trim() }
    })
    return out
  }

  function setCookie(res, sid, req) {
    const secure = req.secure || req.get('x-forwarded-proto') === 'https'
    const parts = [
      'zc_sess=' + encodeURIComponent(sid),
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=' + (30 * 24 * 3600),
    ]
    if (secure) parts.push('Secure')
    res.setHeader('Set-Cookie', parts.join('; '))
  }

  function clearCookie(res, req) {
    const secure = req.secure || req.get('x-forwarded-proto') === 'https'
    const parts = ['zc_sess=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
    if (secure) parts.push('Secure')
    res.setHeader('Set-Cookie', parts.join('; '))
  }

  function attachUser(req, _res, next) {
    const cookies = parseCookies(req)
    let u = userFromSession(cookies.zc_sess)
    if (!u) u = userFromToken(req.get('x-upload-token'))
    req.user = u || null
    next()
  }

  return {
    NAME_RE,
    publicUser,
    register,
    login,
    createSession,
    destroySession,
    rotateToken,
    setCookie,
    clearCookie,
    attachUser,
    parseCookies,
  }
}
