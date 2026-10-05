// ============================================================================
// ZC桌宠 —— 核心逻辑（无 Electron 依赖，可独立单元测试）
// ----------------------------------------------------------------------------
// 职责：
//  1. userdata.json 读写（与 EXE 同目录；settings / pos 明文，
//     apiKey / platformToken 用 AES-256-GCM 加密存储）
//  2. 余额拉取（Bearer API_KEY）+ 今日已用（记账 / 中转日志）
//  3. 峰谷定价换算
//
// 加密说明：密钥由「内置 pepper + 本机标识（hostname|user|MAC）」经
// PBKDF2-SHA256 派生。属于「防明文直读」级别的混淆保护——拿到 EXE 与本机
// 访问权限的攻击者仍可逆向，但不至于把 API_KEY 明文躺在 userdata.json 里。
// ============================================================================
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')

const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25000

// 默认提供商 CNY 单价（每百万 token）：[空闲时段价, 高峰时段价]。
// 高峰时段：每日 9:00–12:00 和 14:00–18:00（北京时间）。
const PEAK_HOURS = [
  [9, 12],
  [14, 18],
]
const BASE_PRICE = { hit: [0.05, 0.1], miss: [1.5, 3.0], out: [4.5, 9.0] }
// deepseek-v4-pro 为 flash 的 3 倍价（官方 2026-08-17 生效）；vision-exp 与 flash 同价
const PRO_PRICE = { hit: [0.15, 0.3], miss: [4.5, 9.0], out: [13.5, 27.0] }
const PRICING = {
  'deepseek-v4-flash-vision-exp': BASE_PRICE,
  'deepseek-v4-flash': BASE_PRICE,
  'deepseek-v4-pro': PRO_PRICE,
  'deepseek-chat': BASE_PRICE,
  'deepseek-reasoner': BASE_PRICE,
  _default: BASE_PRICE,
}

function priceFor(model) {
  const m = String(model || '').toLowerCase()
  for (const key of Object.keys(PRICING)) {
    if (key === '_default') continue
    if (m.indexOf(key) !== -1) return PRICING[key]
  }
  return PRICING._default
}

// bucket time is an epoch second; derive the Beijing local hour to pick peak vs off-peak price.
function isPeakTime(timeSec) {
  if (!isFinite(Number(timeSec))) return false;
  const date = new Date(Number(timeSec) * 1000 + 8 * 3600 * 1000);
  const day = date.getUTCDay(); // 0=周日, 6=周六
  // 🆕 周末全天谷价（不判定为高峰）
  if (day === 0 || day === 6) return false;
  const hour = date.getUTCHours();
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 加密存储
// ---------------------------------------------------------------------------
const PEPPER = 'dsh-whale-widget::desktop::v1'

function machineFingerprint() {
  let mac = 'unknown'
  try {
    const ifaces = os.networkInterfaces()
    for (const name of Object.keys(ifaces)) {
      const list = ifaces[name] || []
      for (const item of list) {
        if (item && !item.internal && item.mac && item.mac !== '00:00:00:00:00:00') {
          mac = item.mac
          break
        }
      }
      if (mac !== 'unknown') break
    }
  } catch (err) {}
  return [os.hostname(), os.userInfo().username, mac].join('|')
}

function machineKey() {
  return crypto.createHash('sha256').update(PEPPER + '::' + machineFingerprint()).digest()
}

function encryptSecret(plain) {
  const salt = crypto.randomBytes(16)
  const key = crypto.pbkdf2Sync(machineKey(), salt, 100000, 32, 'sha256')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  }
}

function decryptSecret(obj) {
  try {
    if (!obj || obj.v !== 1) return null
    const key = crypto.pbkdf2Sync(machineKey(), Buffer.from(obj.salt, 'base64'), 100000, 32, 'sha256')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(obj.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(obj.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(obj.data, 'base64')), decipher.final()]).toString('utf8')
  } catch (err) {
    return null
  }
}

// ---------------------------------------------------------------------------
// 数据存储
// ---------------------------------------------------------------------------
function defaultData() {
  return {
    version: 3,
    settings: {
      scale: 1.5,
      sound: true,
      vol: 0.9,
      soundSet: 'duck',
      skin: 'gpt',
      usageMode: 'ledger',
      peakMode: 'default',
      bubbleOn: true,
      scrollGapOn: false,
      scrollGapPx: 17,
      hoverSoundOn: true,
      burstOn: true,
      autoStart: false,
      lowBalanceOn: true,
      lowBalanceThreshold: 10,
      callbackUrl: '',
    },
    pos: { hAnchor: 'right', vAnchor: 'bottom' },
    secrets: {},
    providers: [],
    activeProviderId: null,
    usage: {
      date: todayKey(),
      lastBalance: null,
      lastProviderId: null,
      todayUsage: 0,
      history: {},
      currency: null,   // 🆕 币种字段
    },
    winPos: null,
  }
}

function newProviderId() {
  return crypto.randomBytes(8).toString('hex')
}

function hostLabelFromUrl(u) {
  try {
    return new URL(u).hostname || ''
  } catch (err) {
    return ''
  }
}

function todayKey() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function createWhaleCore({ dataFile }) {
  const file = path.resolve(dataFile)

  function readData() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch (err) {
      return null
    }
  }

  function writeData(obj) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8')
      return true
    } catch (err) {
      return false
    }
  }

  let data = Object.assign(defaultData(), readData() || {})
  if (!data.settings) data.settings = defaultData().settings
  if (!data.secrets) data.secrets = {}
  if (!data.usage) data.usage = defaultData().usage
  if (!data.pos) data.pos = defaultData().pos
  if (!Array.isArray(data.providers)) data.providers = []

  // 提前声明：providers 迁移/切换时会清缓存
  let balanceCache = null
  let balanceInFlight = null

  function save() {
    if (!writeData(data)) {
      // 写失败（例如 EXE 目录只读）时回退到用户目录，保证功能可用
      try {
        const fallback = path.join(os.homedir(), '.dsh-whale-widget-userdata.json')
        fs.writeFileSync(fallback, JSON.stringify(data, null, 2), 'utf8')
      } catch (err) {}
    }
  }

  // ------------------------- settings -------------------------
  function normalizeUsageMode(m) {
    return m === 'token' ? 'token' : 'ledger'
  }

  function normalizeSkin(id) {
    const s = String(id || '').trim()
    if (!s) return 'gpt'
    // 皮肤包动态加载，这里只做非空持久化；无效 id 由渲染层回落
    return s.slice(0, 64)
  }

  function normalizeCallbackUrl(u) {
    const s = String(u || '').trim()
    if (!s) return ''
    try {
      const parsed = new URL(s)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
      return s.replace(/\/+$/, '')
    } catch (err) {
      return ''
    }
  }

  function findProvider(id) {
    return data.providers.find((p) => p && p.id === id) || null
  }

  function publicProvider(p) {
    const cb = normalizeCallbackUrl(p.callbackUrl)
    const keyPlain = p.apiKey ? decryptSecret(p.apiKey) : null
    let keyHint = ''
    if (keyPlain) {
      const bare = String(keyPlain).replace(/^Bearer\s+/i, '')
      keyHint = bare.length <= 8 ? '••••' : bare.slice(0, 4) + '…' + bare.slice(-4)
    }
    return {
      id: p.id,
      name: String(p.name || '未命名'),
      note: typeof p.note === 'string' ? p.note : '',
      callbackUrl: cb,
      host: cb ? hostLabelFromUrl(cb) : 'api.deepseek.com',
      siteLabel: cb || 'https://api.deepseek.com（官方）',
      hasApiKey: !!p.apiKey,
      keyHint,
      active: p.id === data.activeProviderId,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : null,
    }
  }

  // 切换 Key / 改凭证后余额不可与上次观测对比，清空基线；今日已用保留
  function resetLedgerBaseline() {
    if (!data.usage) data.usage = defaultData().usage
    data.usage.lastBalance = null
    data.usage.lastProviderId = data.activeProviderId || null
  }

  function applyActiveProvider() {
    const p = findProvider(data.activeProviderId)
    if (!p) return
    if (p.apiKey) data.secrets.apiKey = p.apiKey
    else delete data.secrets.apiKey
    data.settings.callbackUrl = normalizeCallbackUrl(p.callbackUrl)
    balanceCache = null
  }

  function ensureActiveProviderShell() {
    let p = findProvider(data.activeProviderId)
    if (p) return p
    const id = newProviderId()
    const now = Date.now()
    p = {
      id,
      name: '默认',
      callbackUrl: normalizeCallbackUrl(data.settings.callbackUrl),
      apiKey: data.secrets.apiKey || null,
      createdAt: now,
      updatedAt: now,
    }
    data.providers.push(p)
    data.activeProviderId = id
    return p
  }

  function migrateProviders() {
    if (data.providers.length > 0) {
      if (!findProvider(data.activeProviderId)) {
        data.activeProviderId = data.providers[0].id
        applyActiveProvider()
        save()
      }
      return
    }
    const hasKey = !!data.secrets.apiKey
    const cb = normalizeCallbackUrl(data.settings.callbackUrl)
    if (!hasKey && !cb) {
      data.activeProviderId = null
      return
    }
    const id = newProviderId()
    const now = Date.now()
    const host = cb ? hostLabelFromUrl(cb) : ''
    data.providers.push({
      id,
      name: host || (cb ? '中转' : '官方'),
      callbackUrl: cb,
      apiKey: data.secrets.apiKey || null,
      createdAt: now,
      updatedAt: now,
    })
    data.activeProviderId = id
    data.version = 3
    save()
  }

  migrateProviders()

  function listProviders() {
    migrateProviders()
    return {
      ok: true,
      activeProviderId: data.activeProviderId || null,
      providers: data.providers.map(publicProvider),
    }
  }

  function upsertProvider(input) {
    if (!input || typeof input !== 'object') return { ok: false, error: '参数无效' }
    const name = String(input.name || '').trim().slice(0, 40)
    const note = input.note != null ? String(input.note).trim().slice(0, 80) : null
    const callbackUrl = normalizeCallbackUrl(input.callbackUrl)
    const keyRaw = input.apiKey != null ? String(input.apiKey).trim() : null
    const activate = input.activate === true
    const now = Date.now()

    let p = input.id ? findProvider(String(input.id)) : null
    if (input.id && !p) return { ok: false, error: '条目不存在' }

    let credChanged = false
    if (!p) {
      if (!name) return { ok: false, error: '请填写名称' }
      if (!keyRaw) return { ok: false, error: '请填写 API Key' }
      p = {
        id: newProviderId(),
        name,
        note: note || '',
        callbackUrl,
        apiKey: encryptSecret(keyRaw),
        createdAt: now,
        updatedAt: now,
      }
      data.providers.push(p)
      credChanged = true
    } else {
      if (name) p.name = name
      if (note != null) p.note = note
      if (typeof input.callbackUrl === 'string') {
        if (callbackUrl !== normalizeCallbackUrl(p.callbackUrl)) credChanged = true
        p.callbackUrl = callbackUrl
      }
      if (keyRaw) {
        credChanged = true
        p.apiKey = encryptSecret(keyRaw)
      }
      p.updatedAt = now
    }

    // 仅在明确选用、或尚无任何启用项时切换当前 Key；普通「添加/保存」不覆盖当前选用
    const prevActive = data.activeProviderId
    if (activate || !data.activeProviderId) {
      data.activeProviderId = p.id
      applyActiveProvider()
      if (prevActive !== p.id || credChanged) resetLedgerBaseline()
    } else if (p.id === data.activeProviderId) {
      // 编辑的正是当前启用项：同步 key/端点到运行态
      applyActiveProvider()
      if (credChanged) resetLedgerBaseline()
    }
    save()
    return { ok: true, provider: publicProvider(p), ...listProviders() }
  }

  function deleteProvider(id) {
    const pid = String(id || '')
    const idx = data.providers.findIndex((p) => p && p.id === pid)
    if (idx < 0) return { ok: false, error: '条目不存在' }
    const wasActive = data.activeProviderId === pid
    data.providers.splice(idx, 1)
    if (wasActive) {
      data.activeProviderId = data.providers[0] ? data.providers[0].id : null
      if (data.activeProviderId) {
        applyActiveProvider()
        resetLedgerBaseline()
      } else {
        delete data.secrets.apiKey
        data.settings.callbackUrl = ''
        balanceCache = null
        resetLedgerBaseline()
      }
    }
    save()
    return { ok: true, ...listProviders() }
  }

  function activateProvider(id) {
    const p = findProvider(String(id || ''))
    if (!p) return { ok: false, error: '条目不存在' }
    const switched = data.activeProviderId !== p.id
    data.activeProviderId = p.id
    applyActiveProvider()
    if (switched) resetLedgerBaseline()
    save()
    return { ok: true, provider: publicProvider(p), ...listProviders() }
  }

  function getConfig() {
    const s = data.settings
    const listed = listProviders()
    return {
      scale: typeof s.scale === 'number' ? s.scale : 1.5,
      sound: s.sound !== false,
      vol: typeof s.vol === 'number' ? s.vol : 0.9,
      soundSet: typeof s.soundSet === 'string' && s.soundSet ? String(s.soundSet).slice(0, 64) : 'duck',
      skin: normalizeSkin(s.skin),
      usageMode: 'ledger',
      peakMode: 'default',
      bubbleOn: s.bubbleOn !== false,
      scrollGapOn: s.scrollGapOn === true,
      scrollGapPx: typeof s.scrollGapPx === 'number' ? Math.round(s.scrollGapPx) : 17,
      hoverSoundOn: s.hoverSoundOn !== false,
      burstOn: s.burstOn !== false,
      autoStart: s.autoStart === true,
      lowBalanceOn: s.lowBalanceOn !== false,
      lowBalanceThreshold:
        typeof s.lowBalanceThreshold === 'number' && isFinite(s.lowBalanceThreshold)
          ? Math.max(0, Number(s.lowBalanceThreshold))
          : 10,
      callbackUrl: typeof s.callbackUrl === 'string' ? s.callbackUrl : '',
      pos: {
        hAnchor: data.pos && (data.pos.hAnchor === 'left' || data.pos.hAnchor === 'right') ? data.pos.hAnchor : 'right',
        vAnchor: data.pos && (data.pos.vAnchor === 'top' || data.pos.vAnchor === 'bottom') ? data.pos.vAnchor : 'bottom',
      },
      hasApiKey: !!data.secrets.apiKey,
      hasPlatformToken: !!data.secrets.platformToken,
      hasCallbackUrl: !!normalizeCallbackUrl(s.callbackUrl),
      activeProviderId: listed.activeProviderId,
      providers: listed.providers,
    }
  }

  function saveConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'bad config' }
    const s = data.settings
    if (typeof cfg.scale === 'number' && isFinite(cfg.scale)) s.scale = cfg.scale
    if (typeof cfg.sound === 'boolean') s.sound = cfg.sound
    if (typeof cfg.vol === 'number' && isFinite(cfg.vol)) s.vol = cfg.vol
    if (typeof cfg.soundSet === 'string') s.soundSet = String(cfg.soundSet).trim().slice(0, 64) || 'duck'
    if (typeof cfg.skin === 'string') s.skin = normalizeSkin(cfg.skin)
    // 用量固定为记账，不再接受前端切换
    s.usageMode = 'ledger'
    s.peakMode = 'default'
    if (typeof cfg.bubbleOn === 'boolean') s.bubbleOn = cfg.bubbleOn
    if (typeof cfg.scrollGapOn === 'boolean') s.scrollGapOn = cfg.scrollGapOn
    if (typeof cfg.scrollGapPx === 'number') s.scrollGapPx = Math.round(cfg.scrollGapPx) > 0 ? Math.round(cfg.scrollGapPx) : 0
    if (typeof cfg.hoverSoundOn === 'boolean') s.hoverSoundOn = cfg.hoverSoundOn
    if (typeof cfg.burstOn === 'boolean') s.burstOn = cfg.burstOn
    if (typeof cfg.autoStart === 'boolean') s.autoStart = cfg.autoStart
    if (typeof cfg.lowBalanceOn === 'boolean') s.lowBalanceOn = cfg.lowBalanceOn
    if (typeof cfg.lowBalanceThreshold === 'number' && isFinite(cfg.lowBalanceThreshold)) {
      s.lowBalanceThreshold = Math.max(0, Number(cfg.lowBalanceThreshold))
    }
    if (typeof cfg.callbackUrl === 'string') {
      const next = normalizeCallbackUrl(cfg.callbackUrl)
      if (next !== normalizeCallbackUrl(s.callbackUrl)) {
        balanceCache = null
        resetLedgerBaseline()
      }
      s.callbackUrl = next
      const p = ensureActiveProviderShell()
      p.callbackUrl = next
      p.updatedAt = Date.now()
    }
    if (cfg.pos && typeof cfg.pos === 'object') {
      const h = cfg.pos.hAnchor
      const v = cfg.pos.vAnchor
      if (h === 'left' || h === 'right' || h === null) data.pos.hAnchor = h === null ? 'right' : h
      if (v === 'top' || v === 'bottom') data.pos.vAnchor = v
    }
    save()
    return { ok: true }
  }

  function setApiKey(key) {
    const k = String(key || '').trim()
    if (!k) {
      delete data.secrets.apiKey
    } else {
      data.secrets.apiKey = encryptSecret(k)
    }
    const p = ensureActiveProviderShell()
    p.apiKey = data.secrets.apiKey || null
    p.updatedAt = Date.now()
    balanceCache = null
    resetLedgerBaseline()
    save()
    return { ok: true, hasApiKey: !!data.secrets.apiKey }
  }

  function setPlatformToken(token) {
    const t = String(token || '').trim()
    if (!t) {
      delete data.secrets.platformToken
    } else {
      data.secrets.platformToken = encryptSecret(t)
    }
    balanceCache = null
    save()
    return { ok: true, hasPlatformToken: !!data.secrets.platformToken }
  }

  function setCallbackUrl(url) {
    const next = normalizeCallbackUrl(url)
    const changed = next !== normalizeCallbackUrl(data.settings.callbackUrl)
    if (changed) balanceCache = null
    data.settings.callbackUrl = next
    const p = ensureActiveProviderShell()
    p.callbackUrl = next
    if (!p.name || p.name === '默认') {
      const host = next ? hostLabelFromUrl(next) : ''
      if (host) p.name = host
    }
    p.updatedAt = Date.now()
    if (changed) resetLedgerBaseline()
    save()
    return { ok: true, callbackUrl: next, hasCallbackUrl: !!next }
  }

  // ------------------------- window pos -------------------------
  function getWinPos() {
    return data.winPos && typeof data.winPos.x === 'number' && typeof data.winPos.y === 'number'
      ? { x: data.winPos.x, y: data.winPos.y }
      : null
  }
  function setWinPos(pos) {
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      data.winPos = { x: Math.round(pos.x), y: Math.round(pos.y) }
      save()
    }
  }

  // ------------------------- balance -------------------------
  function pickBalanceInfo(infos) {
    if (!Array.isArray(infos) || infos.length === 0) return null
    const num = (x) => (x && x.total_balance !== undefined ? Number(x.total_balance) : NaN)
    return (
      infos.find((x) => x && x.currency === 'CNY' && num(x) > 0) ||
      infos.find((x) => num(x) > 0) ||
      infos.find((x) => x && x.currency === 'CNY') ||
      infos[0]
    )
  }

  function quotaToMoney(q) {
    const n = Number(q)
    if (!isFinite(n)) return null
    // one-api / new-api：1 USD = 500000 quota；大数按额度换算
    if (Math.abs(n) >= 1000) {
      return { totalBalance: Math.round((n / 500000) * 10000) / 10000, currency: 'USD' }
    }
    return { totalBalance: n, currency: 'USD' }
  }

  function asMoney(val, currency) {
    const n = Number(val)
    if (!isFinite(n)) return null
    return { totalBalance: n, currency: String(currency || 'CNY') }
  }

  // 兼容常见余额字段：官方 / one-api / new-api / OpenAI credit / 扁平字段
  function parseBalanceJson(json) {
    if (json == null) return null
    if (typeof json === 'number' && isFinite(json)) return asMoney(json, 'CNY')
    if (typeof json !== 'object') return null

    // 默认官方余额字段
    if (Array.isArray(json.balance_infos)) {
      const info = pickBalanceInfo(json.balance_infos)
      if (info && info.total_balance !== undefined) {
        return asMoney(info.total_balance, info.currency || 'CNY')
      }
    }

    const dataObj = json.data && typeof json.data === 'object' && !Array.isArray(json.data) ? json.data : null
    if (dataObj) {
      // new-api / one-api：token_usage 里的 total_* 是额度点数（500000 = 1 USD），不是美元
      const isTokenUsage =
        dataObj.object === 'token_usage' ||
        (dataObj.total_granted != null && dataObj.total_used != null && dataObj.total_available != null)

      if (dataObj.unlimited_quota === true) {
        return {
          totalBalance: 0,
          currency: 'USD',
          unlimited: true,
        }
      }
      if (isTokenUsage && dataObj.total_available != null) {
        return quotaToMoney(dataObj.total_available)
      }
      if (dataObj.remain_quota != null) return quotaToMoney(dataObj.remain_quota)
      // OpenAI credit_grants 风格：total_available 已是货币金额
      if (dataObj.total_available != null) return asMoney(dataObj.total_available, dataObj.currency || 'USD')
      if (dataObj.quota != null) return quotaToMoney(dataObj.quota)
      if (dataObj.total_balance != null) return asMoney(dataObj.total_balance, dataObj.currency || 'CNY')
      if (dataObj.balance != null) return asMoney(dataObj.balance, dataObj.currency || 'CNY')
      if (dataObj.credit != null) return asMoney(dataObj.credit, dataObj.currency || 'USD')
    }

    // OpenAI credit_grants 风格
    if (json.total_available != null) return asMoney(json.total_available, 'USD')
    if (json.total_paid_available != null) return asMoney(json.total_paid_available, 'USD')

    const flatKeys = [
      'total_balance', 'totalBalance', 'balance', 'remain_quota', 'remaining',
      'credit', 'credits', 'amount', 'available', 'quota', 'money', 'wallet',
    ]
    for (const key of flatKeys) {
      if (json[key] == null || typeof json[key] === 'object') continue
      if (key === 'remain_quota' || key === 'quota') {
        const q = quotaToMoney(json[key])
        if (q) return q
      } else {
        const m = asMoney(json[key], json.currency || json.unit || 'CNY')
        if (m) return m
      }
    }

    // 嵌套一层 result / payload / biz_data
    for (const wrap of ['result', 'payload', 'biz_data', 'balance']) {
      if (json[wrap] && typeof json[wrap] === 'object') {
        const nested = parseBalanceJson(json[wrap])
        if (nested) return nested
      }
    }
    return null
  }

  function resolveBalanceUrls(callbackUrl) {
    const custom = normalizeCallbackUrl(callbackUrl != null ? callbackUrl : data.settings.callbackUrl)
    if (!custom) return [BALANCE_URL]
    const urls = []
    try {
      const u = new URL(custom)
      const origin = u.origin
      const path = (u.pathname || '/').replace(/\/+$/, '') || '/'
      const looksLikeApiRoot = path === '/' || /^\/v\d+$/i.test(path)
      if (looksLikeApiRoot) {
        // 用户常填聊天 Base（如 https://host/v1），自动补常见余额路径
        // new-api：/api/usage/token/ 末尾斜杠才能认 Bearer Key
        urls.push(origin + '/api/usage/token/')
        urls.push(origin + '/api/usage/token')
        urls.push(origin + '/api/user/self')
        urls.push(origin + '/user/balance')
        urls.push(origin + '/v1/dashboard/billing/credit_grants')
      }
      urls.push(custom)
      if (!looksLikeApiRoot) {
        urls.push(origin + '/api/usage/token/')
        urls.push(origin + '/api/usage/token')
        urls.push(origin + '/api/user/self')
      }
    } catch (err) {
      urls.push(custom)
    }
    return Array.from(new Set(urls))
  }

  function relayOriginFromCallback(callbackUrl) {
    const custom = normalizeCallbackUrl(callbackUrl != null ? callbackUrl : data.settings.callbackUrl)
    if (!custom) return null
    try {
      return new URL(custom).origin
    } catch (err) {
      return null
    }
  }

  function dayBoundsSec() {
    const now = new Date()
    const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
    return { start: start, end: start + 86400 }
  }

  function parseLogOther(other) {
    if (!other) return {}
    if (typeof other === 'object') return other
    if (typeof other === 'string') {
      try {
        const o = JSON.parse(other)
        return o && typeof o === 'object' ? o : {}
      } catch (err) {
        return {}
      }
    }
    return {}
  }

  // new-api：GET /api/log/token + Bearer Key → 聚合当日消耗（含 cache_tokens）
  async function fetchRelayLogTodayUsage(callbackUrl, apiKey) {
    const origin = relayOriginFromCallback(callbackUrl)
    const key = String(apiKey || '').trim()
    if (!origin || !key) return null
    const { start, end } = dayBoundsSec()
    const headerSets = buildAuthHeaders(key)
    let lastErr = null
    for (let hi = 0; hi < headerSets.length; hi++) {
      try {
        let quotaSum = 0
        let promptSum = 0
        let completionSum = 0
        let cacheSum = 0
        let rows = 0
        let reachedOlder = false
        for (let page = 0; page < 20 && !reachedOlder; page++) {
          const url = origin + '/api/log/token?p=' + page + '&page_size=100'
          const res = await fetch(url, {
            headers: Object.assign({ Accept: 'application/json' }, headerSets[hi]),
            signal: AbortSignal.timeout(20000),
          })
          if (!res.ok) {
            const err = new Error('HTTP ' + res.status)
            err.status = res.status
            throw err
          }
          const json = await res.json()
          const list = Array.isArray(json)
            ? json
            : Array.isArray(json.data)
              ? json.data
              : Array.isArray(json.items)
                ? json.items
                : []
          if (list.length === 0) break
          for (const item of list) {
            if (!item || typeof item !== 'object') continue
            const ts = Number(item.created_at || item.createdAt || item.created || 0)
            // 日志通常新→旧；整页都早于今日则可停
            if (isFinite(ts) && ts > 0 && ts < start) {
              reachedOlder = true
              continue
            }
            if (isFinite(ts) && ts > 0 && ts >= end) continue
            // type: 2 = 消耗（new-api）；无 type 时也计入
            const typ = item.type
            if (typ != null && Number(typ) !== 2) continue
            const q = Number(item.quota)
            if (isFinite(q) && q > 0) quotaSum += q
            const pt = Number(item.prompt_tokens)
            const ct = Number(item.completion_tokens)
            if (isFinite(pt)) promptSum += pt
            if (isFinite(ct)) completionSum += ct
            const other = parseLogOther(item.other)
            const cache = Number(other.cache_tokens != null ? other.cache_tokens : other.cached_tokens)
            if (isFinite(cache) && cache > 0) cacheSum += cache
            rows += 1
          }
          // 有的站忽略分页一次吐全量
          if (list.length < 100) break
        }
        const money = {
          totalBalance: Math.round((quotaSum / 500000) * 1e6) / 1e6,
          currency: 'USD',
        }
        return {
          ok: true,
          amount: money.totalBalance,
          currency: money.currency,
          tokens: promptSum + completionSum,
          promptTokens: promptSum,
          completionTokens: completionSum,
          cacheTokens: cacheSum,
          rows: rows,
          quotaPoints: quotaSum,
        }
      } catch (err) {
        lastErr = err
        if (err && (err.status === 401 || err.status === 403)) continue
        break
      }
    }
    return lastErr
      ? { ok: false, error: String((lastErr && lastErr.message) || lastErr).slice(0, 160) }
      : null
  }

  function resolveProbeUrls(callbackUrl) {
    const custom = normalizeCallbackUrl(callbackUrl)
    const urls = []
    if (!custom) {
      urls.push('https://api.deepseek.com/models')
      urls.push(BALANCE_URL)
      return urls
    }
    try {
      const u = new URL(custom)
      const origin = u.origin
      const path = (u.pathname || '/').replace(/\/+$/, '') || '/'
      if (/^\/v\d+$/i.test(path)) {
        urls.push(custom + '/models')
        urls.push(origin + path + '/models')
      } else if (path === '/') {
        urls.push(origin + '/v1/models')
        urls.push(origin + '/models')
      } else {
        urls.push(custom.replace(/\/+$/, '') + '/models')
        urls.push(origin + '/v1/models')
        urls.push(origin + '/models')
      }
      urls.push(origin + '/api/usage/token/')
      urls.push(origin + '/api/usage/token')
    } catch (err) {
      urls.push(custom + '/models')
    }
    return Array.from(new Set(urls))
  }

  function buildAuthHeaders(key) {
    const k = String(key || '').trim()
    const bare = k.replace(/^Bearer\s+/i, '')
    return [
      { Authorization: 'Bearer ' + bare },
      { Authorization: k },
      { 'x-api-key': bare },
      { 'api-key': bare },
    ]
  }

  async function fetchBalanceOnce(url, headers) {
    const res = await fetch(url, {
      headers: Object.assign({ Accept: 'application/json' }, headers),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status)
      err.status = res.status
      throw err
    }
    const ctype = String(res.headers.get('content-type') || '')
    let body
    try {
      body = await res.json()
    } catch (err) {
      const e = new Error(ctype.indexOf('html') !== -1 ? '返回了网页而非 JSON（回调地址可能不是余额接口）' : '余额接口返回不是合法 JSON')
      e.code = 'PARSE'
      throw e
    }
    const parsed = parseBalanceJson(body)
    if (!parsed) {
      const e = new Error('无法识别余额字段（支持官方 / one-api / token_usage）')
      e.code = 'SHAPE'
      throw e
    }
    return {
      ok: true,
      totalBalance: parsed.totalBalance,
      currency: parsed.currency || 'CNY',
      unlimited: !!parsed.unlimited,
      updatedAt: new Date().toISOString(),
      sourceUrl: url,
    }
  }

  async function fetchBalanceWith(key, callbackUrl) {
    if (!key) {
      return { ok: false, code: 'NO_KEY', error: '未配置 API Key（菜单 → Key 管理）' }
    }
    const urls = resolveBalanceUrls(callbackUrl)
    const headerSets = buildAuthHeaders(key)
    let lastErr = null
    for (let ui = 0; ui < urls.length; ui++) {
      for (let hi = 0; hi < headerSets.length; hi++) {
        try {
          return await fetchBalanceOnce(urls[ui], headerSets[hi])
        } catch (err) {
          lastErr = err
          if (err && err.code === 'PARSE') {
            // HTML/非 JSON：换下一个 URL
            break
          }
          if (err && err.code === 'SHAPE') {
            // 能连上但字段不对：换 URL
            break
          }
          if (err && (err.status === 401 || err.status === 403)) continue
          if (err && err.status === 404) break
          if (err && err.status && err.status < 500) break
        }
      }
    }
    const transient = !(lastErr && lastErr.status && lastErr.status >= 400 && lastErr.status < 500)
    return {
      ok: false,
      code: (lastErr && lastErr.code) || 'HTTP',
      transient: transient,
      error: '余额接口请求失败: ' + String((lastErr && lastErr.message) || lastErr).slice(0, 200),
    }
  }

  async function fetchBalance() {
    const key = data.secrets.apiKey ? decryptSecret(data.secrets.apiKey) : null
    return fetchBalanceWith(key, data.settings.callbackUrl)
  }

  async function probeOnce(url, headers) {
    const res = await fetch(url, {
      headers: Object.assign({ Accept: 'application/json' }, headers),
      signal: AbortSignal.timeout(12000),
    })
    return { status: res.status, ok: res.ok, url }
  }

  async function testProvider(id) {
    const p = findProvider(String(id || ''))
    if (!p) return { ok: false, error: '条目不存在' }
    const key = p.apiKey ? decryptSecret(p.apiKey) : null
    if (!key) return { ok: false, code: 'NO_KEY', error: '未配置 API Key' }
    const urls = resolveProbeUrls(p.callbackUrl)
    const headerSets = buildAuthHeaders(key)
    let lastErr = null
    let sawAuthFail = false
    for (let ui = 0; ui < urls.length; ui++) {
      for (let hi = 0; hi < headerSets.length; hi++) {
        try {
          const r = await probeOnce(urls[ui], headerSets[hi])
          if (r.status === 401 || r.status === 403) {
            sawAuthFail = true
            lastErr = new Error('HTTP ' + r.status)
            lastErr.status = r.status
            continue
          }
          if (r.status === 404) {
            lastErr = new Error('HTTP 404')
            lastErr.status = 404
            break
          }
          if (r.ok || (r.status >= 200 && r.status < 500)) {
            return {
              ok: true,
              status: r.status,
              url: r.url,
              message: r.ok ? '连通正常' : '已连通（HTTP ' + r.status + '）',
            }
          }
          lastErr = new Error('HTTP ' + r.status)
          lastErr.status = r.status
        } catch (err) {
          lastErr = err
        }
      }
    }
    if (sawAuthFail) {
      return { ok: false, code: 'AUTH', error: '能连通，但 Key 被拒绝（401/403）' }
    }
    return {
      ok: false,
      code: 'HTTP',
      error: '连通失败: ' + String((lastErr && lastErr.message) || lastErr || 'unknown').slice(0, 160),
    }
  }

  async function probeProviderBalance(id) {
    const p = findProvider(String(id || ''))
    if (!p) return { ok: false, error: '条目不存在' }
    const key = p.apiKey ? decryptSecret(p.apiKey) : null
    const result = await fetchBalanceWith(key, p.callbackUrl)
    if (result.ok) {
      return {
        ok: true,
        totalBalance: result.totalBalance,
        currency: result.currency,
        unlimited: !!result.unlimited,
        sourceUrl: result.sourceUrl,
        providerId: p.id,
        name: p.name,
      }
    }
    return Object.assign({ providerId: p.id, name: p.name }, result)
  }

  function parseModelsPayload(body) {
    const names = []
    const push = (v) => {
      if (v == null) return
      if (typeof v === 'string') {
        const s = v.trim()
        if (s) names.push(s)
        return
      }
      if (typeof v === 'object') {
        const id = v.id || v.model || v.name || v.model_name
        if (id) push(id)
      }
    }
    if (!body) return names
    if (Array.isArray(body)) {
      body.forEach(push)
      return names
    }
    if (typeof body !== 'object') return names
    if (Array.isArray(body.data)) body.data.forEach(push)
    else if (body.data && Array.isArray(body.data.data)) body.data.data.forEach(push)
    else if (Array.isArray(body.models)) body.models.forEach(push)
    else if (body.data && Array.isArray(body.data.models)) body.data.models.forEach(push)
    return Array.from(new Set(names))
  }

  async function listProviderModels(id) {
    const p = findProvider(String(id || ''))
    if (!p) return { ok: false, error: '条目不存在' }
    const key = p.apiKey ? decryptSecret(p.apiKey) : null
    if (!key) return { ok: false, code: 'NO_KEY', error: '未配置 API Key' }
    const urls = resolveProbeUrls(p.callbackUrl).filter((u) => /\/models(\?|$)/i.test(u) || u.endsWith('/models'))
    const fallback = resolveProbeUrls(p.callbackUrl)
    const tryUrls = urls.length ? urls : fallback
    const headerSets = buildAuthHeaders(key)
    let lastErr = null
    for (let ui = 0; ui < tryUrls.length; ui++) {
      for (let hi = 0; hi < headerSets.length; hi++) {
        try {
          const res = await fetch(tryUrls[ui], {
            headers: Object.assign({ Accept: 'application/json' }, headerSets[hi]),
            signal: AbortSignal.timeout(15000),
          })
          if (res.status === 401 || res.status === 403) {
            lastErr = new Error('HTTP ' + res.status)
            lastErr.status = res.status
            continue
          }
          if (res.status === 404) {
            lastErr = new Error('HTTP 404')
            break
          }
          if (!res.ok) {
            lastErr = new Error('HTTP ' + res.status)
            lastErr.status = res.status
            continue
          }
          let body
          try {
            body = await res.json()
          } catch (err) {
            lastErr = new Error('模型接口返回不是 JSON')
            break
          }
          const models = parseModelsPayload(body)
          if (!models.length) {
            lastErr = new Error('未解析到模型列表')
            break
          }
          return {
            ok: true,
            providerId: p.id,
            name: p.name,
            url: tryUrls[ui],
            models,
            count: models.length,
          }
        } catch (err) {
          lastErr = err
        }
      }
    }
    return {
      ok: false,
      providerId: p.id,
      name: p.name,
      error: '获取模型失败: ' + String((lastErr && lastErr.message) || lastErr || 'unknown').slice(0, 160),
    }
  }

  function getProviderCopyText(id, field) {
    const p = findProvider(String(id || ''))
    if (!p) return { ok: false, error: '条目不存在' }
    const f = String(field || '')
    if (f === 'apiKey') {
      const key = p.apiKey ? decryptSecret(p.apiKey) : null
      if (!key) return { ok: false, error: '未配置 API Key' }
      return { ok: true, field: f, text: String(key).replace(/^Bearer\s+/i, '') }
    }
    if (f === 'callbackUrl' || f === 'endpoint' || f === 'site') {
      const cb = normalizeCallbackUrl(p.callbackUrl)
      return { ok: true, field: f, text: cb || 'https://api.deepseek.com' }
    }
    if (f === 'name') return { ok: true, field: f, text: String(p.name || '') }
    if (f === 'note') return { ok: true, field: f, text: String(p.note || '') }
    if (f === 'host') {
      const cb = normalizeCallbackUrl(p.callbackUrl)
      return { ok: true, field: f, text: cb ? hostLabelFromUrl(cb) : 'api.deepseek.com' }
    }
    return { ok: false, error: '不支持的字段' }
  }

  async function fetchUsage() {
    const token = data.secrets.platformToken ? decryptSecret(data.secrets.platformToken) : null
    if (!token) return { error: 'no platform token' }
    try {
      const now = new Date()
      const tz = -now.getTimezoneOffset() * 60
      const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
      const end = start + 86400
      const url = 'https://platform.deepseek.com/api/v0/usage/by_api_key/amount?start=' + start + '&end=' + end + '&tz=' + tz
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + String(token).replace(/^Bearer\s+/i, '') },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return { error: 'http ' + res.status }
      const json = await res.json()
      const u = computeTodayUsage(json)
      if (u && isFinite(u.amount)) return { amount: u.amount, tokens: u.tokens }
      return { error: 'no usage' }
    } catch (err) {
      return { error: String((err && err.message) || err) }
    }
  }

  function computeTodayUsage(d) {
    let dd = d
    if (dd && dd.data && dd.data.biz_data && Array.isArray(dd.data.biz_data.series)) dd = dd.data.biz_data
    else if (dd && dd.data && Array.isArray(dd.data.series)) dd = dd.data
    const series = Array.isArray(dd.series) ? dd.series : null
    if (!series || series.length === 0) return null
    let cost = 0
    let tokens = 0
    let found = false
    for (const s of series) {
      if (!s || typeof s !== 'object') continue
      const p = priceFor(s.model)
      const buckets = Array.isArray(s.buckets) ? s.buckets : []
      for (const b of buckets) {
        const u = b && b.usage
        if (!u || typeof u !== 'object') continue
        const hit = Number(u.PROMPT_CACHE_HIT_TOKEN) || 0
        const miss = Number(u.PROMPT_CACHE_MISS_TOKEN) || 0
        const out = Number(u.RESPONSE_TOKEN) || 0
        if (hit + miss + out === 0) continue
        found = true
        tokens += hit + miss + out
        const pi = isPeakTime(b.time) ? 1 : 0
        cost += (hit / 1e6) * p.hit[pi] + (miss / 1e6) * p.miss[pi] + (out / 1e6) * p.out[pi]
      }
    }
    return found ? { amount: cost, tokens: tokens } : null
  }

  // ================================================================
  // 记账模式：用余额下降差值累计当天用量（跨天归档）
  // 切换 Key / 端点后 lastBalance 会清空，首笔观测只建基线，不记消耗
  // ================================================================
  function recordLedgerUsage(currentBalance, currency) {
    const t = todayKey()
    const u = data.usage
    const pid = data.activeProviderId || null

    // 如果币种发生了变化，把当前今日已用按旧币种归档，然后重置
    if (u.currency && u.currency !== currency) {
      if (typeof u.todayUsage === 'number' && u.todayUsage > 0) {
        u.history = u.history || {}
        const key = u.date + '_' + u.currency
        u.history[key] = (u.history[key] || 0) + u.todayUsage
      }
      u.todayUsage = 0
      u.lastBalance = currentBalance
      u.lastProviderId = pid
      u.currency = currency
      save()
      return u
    }

    // 跨天逻辑（币种不变）
    if (u.date !== t) {
      if (u.date && typeof u.todayUsage === 'number') {
        u.history = u.history || {}
        const key = u.date + (u.currency ? '_' + u.currency : '')
        u.history[key] = (u.history[key] || 0) + u.todayUsage
      }
      u.date = t
      u.lastBalance = currentBalance
      u.lastProviderId = pid
      u.todayUsage = 0
      u.currency = currency
    } else if (u.lastProviderId !== pid || typeof u.lastBalance !== 'number') {
      // Key 切换 / 尚无基线：只锚定当前余额，不把落差记成消耗
      u.lastBalance = currentBalance
      u.lastProviderId = pid
      if (!u.currency) u.currency = currency
    } else {
      // 同一天、同一 Key，正常累加差值
      const prev = u.lastBalance
      if (typeof currentBalance === 'number' && currentBalance < prev) {
        const drop = prev - currentBalance
        // 上次误把额度点数当美元时，纠正后会出现天文数字“下降”——忽略，不记入今日已用
        const looksLikeUnitFix = prev >= 10000 && currentBalance > 0 && drop / prev > 0.9
        if (!looksLikeUnitFix) {
          u.todayUsage = (typeof u.todayUsage === 'number' ? u.todayUsage : 0) + drop
        }
      }
      u.lastBalance = currentBalance
      u.lastProviderId = pid
      if (!u.currency) u.currency = currency
    }

    // 清理历史记录（最多保留 30 条）
    const keys = Object.keys(u.history || {}).sort()
    while (keys.length > 30) {
      delete u.history[keys.shift()]
    }

    save()
    return u
  }

  async function getBalancePayload() {
    const payload = await fetchBalance()
    if (!payload.ok) return payload
    const full = { ...payload }
    full.isPeak = isPeakTime(Math.floor(Date.now() / 1000))
    // 不限额度：不做差值记账
    if (payload.unlimited) {
      full.todayUsage = null
      full.usageMode = 'unlimited'
      return full
    }

    const currency = String(payload.currency || 'CNY')
    // 始终维护记账基线（日志失败时回落）
    data.settings.usageMode = 'ledger'
    const led = recordLedgerUsage(Number(payload.totalBalance), currency)

    // 中转站：优先用 /api/log/token 聚合今日消耗（含 cache_tokens）
    const usingCustom = !!normalizeCallbackUrl(data.settings.callbackUrl)
    if (usingCustom) {
      const key = data.secrets.apiKey ? decryptSecret(data.secrets.apiKey) : null
      const relay = await fetchRelayLogTodayUsage(data.settings.callbackUrl, key)
      if (relay && relay.ok) {
        full.todayUsage = relay.amount
        full.usageMode = 'relay-log'
        full.todayTokens = relay.tokens
        full.todayCacheTokens = relay.cacheTokens
        full.todayLogRows = relay.rows
        return full
      }
    }

    full.todayUsage = led.todayUsage
    full.usageMode = 'ledger'
    return full
  }

  function getBalance() {
    const now = Date.now()
    if (balanceCache && now - balanceCache.at < BALANCE_TTL_MS) {
      return Promise.resolve(balanceCache.payload)
    }
    if (balanceInFlight) return balanceInFlight
    balanceInFlight = getBalancePayload()
      .then((payload) => {
        if (payload.ok) {
          balanceCache = { at: now, payload }
          return payload
        }
        if (payload.transient && balanceCache) {
          return { ...balanceCache.payload, stale: true, error: payload.error }
        }
        return payload
      })
      .catch((err) => ({
        ok: false,
        code: 'ERROR',
        error: '余额服务异常: ' + String((err && err.message) || err).slice(0, 200),
      }))
      .finally(() => {
        balanceInFlight = null
      })
    return balanceInFlight
  }

  function fetchLastTurn() {
    // 桌面版没有 DSH 会话事件，永远返回空轮次
    return Promise.resolve({ ok: true, seq: 0, turn: null, amount: null, tokens: null, ts: null })
  }

  return {
    getConfig,
    saveConfig,
    setApiKey,
    setPlatformToken,
    setCallbackUrl,
    listProviders,
    upsertProvider,
    deleteProvider,
    activateProvider,
    testProvider,
    probeProviderBalance,
    listProviderModels,
    getProviderCopyText,
    getWinPos,
    setWinPos,
    getBalance,
    fetchLastTurn,
    // 测试/调试用
    _data: () => data,
    _machineFingerprint: machineFingerprint,
  }
}

module.exports = { createWhaleCore, priceFor, isPeakTime, encryptSecret, decryptSecret, machineFingerprint }