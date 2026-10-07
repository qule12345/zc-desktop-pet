;(function () {
  const $ = (id) => document.getElementById(id)
  const files = {
    idle: null, press: null, gif: null, burst: null, bubbleArt: null,
    tapPress: null, tapRelease: null, tapHover: null, burstSound: null,
    plugins: [], modCss: null,
  }
  const SOUND_SLOTS = { tapPress: 1, tapRelease: 1, tapHover: 1, burstSound: 1 }
  const urls = {}
  let sfxCache = null
  const finePointer = window.matchMedia('(pointer: fine) and (min-width: 1101px)').matches
  if (!finePointer) document.body.classList.add('touch')

  const IMG_EXT = /\.(png|jpe?g|jfif|pjpeg|pjp|webp|gif|bmp|dib|svg|avif|ico|apng)$/i
  const VID_EXT = /\.(mp4|webm|mov|m4v)$/i
  const AUD_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/i
  const MEDIA_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|mp4|webm|mov|m4v|mpeg|mpga|aiff|aif|caf)$/i
  const SKIN_EXT = /\.(skin|zip)$/i
  const MIME_EXT = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
    'image/bmp': '.bmp', 'image/svg+xml': '.svg', 'image/avif': '.avif', 'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico', 'image/apng': '.png',
    'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
    'audio/ogg': '.ogg', 'audio/flac': '.flac', 'audio/aac': '.aac', 'audio/mp4': '.m4a',
    'audio/webm': '.weba', 'audio/opus': '.opus',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  }
  const defaultBubbles = [
    { w: 8, style: 'B', wrap: false, kind: 'pick', text: '在线...\n嘿。' },
    { w: 8, style: 'A', wrap: true, kind: 'pick', text: '这是一句长台词。\n一行一条，随机抽出。' },
    { w: 1, style: 'B', wrap: false, kind: 'text', text: '我的皮肤在线... ' },
  ]

  function hexRgb(hex) {
    const h = String(hex || '').replace('#', '')
    if (h.length !== 6) return '61,90,128'
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',')
  }
  function rgbHex(r, g, b) {
    return '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0')).join('')
  }
  function mix(hex, t, toward) {
    const h = hex.replace('#', '')
    const a = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    const b = toward === 'white' ? [255, 255, 255] : [28, 25, 21]
    return rgbHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
  }

  function bindColor(colorId, hexId) {
    const c = $(colorId)
    const t = $(hexId)
    c.addEventListener('input', () => { t.value = c.value; preview() })
    t.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(t.value)) c.value = t.value
      preview()
    })
  }
  bindColor('stroke', 'strokeHex')
  bindColor('text', 'textHex')
  bindColor('hint', 'hintHex')
  bindColor('accent', 'accentHex')

  function setStatus(msg, kind) {
    const el = $('status')
    el.textContent = msg || ''
    el.className = 'status' + (kind ? ' ' + kind : '')
  }

  function extOf(name, fallback) {
    const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/)
    return m ? m[0] : fallback
  }
  function extFromFile(file, fallback) {
    const n = extOf(file && file.name, '')
    if (n) return n
    return MIME_EXT[(file && file.type) || ''] || fallback
  }
  function looksSkin(file) {
    return SKIN_EXT.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
  }
  function looksImage(file) {
    return /^image\//.test(file.type) || IMG_EXT.test(file.name)
  }
  function looksMedia(file) {
    return /^(audio|video)\//.test(file.type) || MEDIA_EXT.test(file.name)
  }
  function isVideoFile(file) {
    const name = (file && file.name) || ''
    const type = (file && file.type) || (file && file.blob && file.blob.type) || ''
    return /^video\//.test(type) || VID_EXT.test(name)
  }

  function slotPreview(slot, blob, name) {
    const box = document.querySelector('.drop[data-slot="' + slot + '"]')
    if (!box) return
    box.querySelectorAll('img,video,audio,.drop-play').forEach((n) => n.remove())
    const hint = box.querySelector('.hint')
    if (!blob) {
      if (hint) {
        hint.style.display = ''
        hint.textContent = slot === 'idle' ? '图' : (slot === 'modCss' ? 'skin.css / 任意 css' : (SOUND_SLOTS[slot] ? '音 / 视频' : '可选'))
      }
      return
    }
    if (urls[slot]) URL.revokeObjectURL(urls[slot])
    urls[slot] = URL.createObjectURL(blob)
    const video = VID_EXT.test(name || '') || (blob.type && blob.type.indexOf('video/') === 0)
    const audio = !video && (AUD_EXT.test(name || '') || (blob.type && blob.type.indexOf('audio/') === 0))
    if (slot === 'modCss') {
      if (hint) {
        hint.style.display = ''
        hint.textContent = name || '已选 CSS'
      }
      return
    }
    if (audio) {
      if (hint) {
        hint.style.display = ''
        hint.textContent = name || '音频'
      }
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'drop-play'
      btn.textContent = '试听'
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        playUrl(urls[slot])
      })
      box.appendChild(btn)
      return
    }
    const el = document.createElement(video ? 'video' : 'img')
    if (video) { el.muted = true; el.loop = true; el.playsInline = true; el.autoplay = true }
    el.src = urls[slot]
    box.prepend(el)
    if (hint) hint.style.display = 'none'
  }

  async function readSlotFile(file) {
    return { blob: file, name: file.name, buf: new Uint8Array(await file.arrayBuffer()) }
  }

  async function setIdleFromFile(file) {
    files.idle = await readSlotFile(file)
    slotPreview('idle', files.idle.blob, files.idle.name)
    extractPalette(files.idle.blob)
    preview()
  }

  async function putSlot(slot, file) {
    if (slot === 'plugins') {
      files.plugins.push(await readSlotFile(file))
      previewPlugins()
      scheduleDraftSave()
      return
    }
    files[slot] = await readSlotFile(file)
    slotPreview(slot, files[slot].blob, files[slot].name)
    if (slot === 'idle') extractPalette(files[slot].blob)
    if (slot === 'bubbleArt' || slot === 'modCss') scheduleLiveMods()
    preview()
    scheduleDraftSave()
  }

  function previewPlugins() {
    const box = document.querySelector('.drop[data-slot="plugins"]')
    const hint = box && box.querySelector('.hint')
    if (hint) {
      hint.style.display = ''
      hint.textContent = files.plugins.length ? files.plugins.length + ' 个脚本' : '拖入或点选，可多选'
    }
    const list = $('pluginList')
    if (!list) return
    list.textContent = ''
    files.plugins.forEach((rec, i) => {
      const li = document.createElement('li')
      const name = document.createElement('span')
      name.textContent = rec.name || ('script-' + (i + 1) + '.js')
      const del = document.createElement('button')
      del.type = 'button'
      del.textContent = '去掉'
      del.addEventListener('click', () => {
        files.plugins.splice(i, 1)
        previewPlugins()
      })
      li.appendChild(name)
      li.appendChild(del)
      list.appendChild(li)
    })
    scheduleLiveMods()
  }

  function guessSlot(file) {
    const n = String(file.name || '').toLowerCase()
    if (looksMedia(file)) {
      if (/burst|combo|连点/.test(n)) return 'burstSound'
      if (/hover|float|over|悬停/.test(n)) return 'tapHover'
      if (/release|lift|抬起|ya2/.test(n)) return 'tapRelease'
      return 'tapPress'
    }
    if (/\.(js|mjs)$/i.test(n) || file.type === 'text/javascript') return 'plugins'
    if (/\.css$/i.test(n) || file.type === 'text/css') return 'modCss'
    if (/\.(svg|html|xml)$/i.test(n)) return 'bubbleArt'
    if (!looksImage(file)) return null
    if (/\.gif$/i.test(n) || /(?:^|[_\-\s])(gif|rua|bubble)(?:[_\-\s.]|$)/.test(n)) return 'gif'
    if (/(?:^|[_\-\s])(press|down|click|push)(?:[_\-\s.]|$)/.test(n)) return 'press'
    if (/(?:^|[_\-\s])(burst|combo|egg)(?:[_\-\s.]|$)/.test(n)) return 'burst'
    return 'idle'
  }

  async function ingestFiles(list) {
    const arr = Array.from(list || []).filter(Boolean)
    if (!arr.length) return
    for (const f of arr) {
      if (looksSkin(f)) {
        try { await importSkin(f) } catch (err) { setStatus(String((err && err.message) || err), 'err') }
        continue
      }
      const slot = guessSlot(f)
      if (!slot) { setStatus('暂不识别：' + (f.name || f.type), 'err'); continue }
      if (slot === 'idle') await setIdleFromFile(f)
      else await putSlot(slot, f)
    }
    preview()
    scheduleLiveMods()
  }

  document.querySelectorAll('.drop[data-slot]').forEach((box) => {
    const slot = box.getAttribute('data-slot')
    const input = box.querySelector('input[type="file"]')
    input.addEventListener('change', async () => {
      const list = Array.from((input.files || []))
      input.value = ''
      if (!list.length) return
      if (slot === 'plugins') {
        files.plugins = []
        for (const one of list) files.plugins.push(await readSlotFile(one))
        previewPlugins()
      } else if (slot === 'idle') await setIdleFromFile(list[0])
      else await putSlot(slot, list[0])
      preview()
    })
    ;['dragenter', 'dragover'].forEach((ev) => {
      box.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation() })
    })
    box.addEventListener('drop', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const list = e.dataTransfer && e.dataTransfer.files
      if (!list || !list.length) return
      if (slot === 'plugins') {
        for (const one of Array.from(list)) files.plugins.push(await readSlotFile(one))
        previewPlugins()
      } else if (slot === 'idle') await setIdleFromFile(list[0])
      else await putSlot(slot, list[0])
      preview()
    })
  })

  function extractPalette(blob) {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = 48
      c.height = 48
      const ctx = c.getContext('2d', { willReadFrequently: true })
      try { ctx.drawImage(img, 0, 0, 48, 48) } catch (_) { return }
      let data
      try { data = ctx.getImageData(0, 0, 48, 48).data } catch (_) { return }
      const buckets = new Map()
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 40) continue
        const r = data[i] >> 4 << 4
        const g = data[i + 1] >> 4 << 4
        const b = data[i + 2] >> 4 << 4
        const key = r + ',' + g + ',' + b
        const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
        cur.n++
        cur.r += data[i]
        cur.g += data[i + 1]
        cur.b += data[i + 2]
        buckets.set(key, cur)
      }
      const ranked = Array.from(buckets.values()).sort((a, b) => b.n - a.n).slice(0, 6)
        .map((x) => rgbHex(x.r / x.n, x.g / x.n, x.b / x.n))
      const root = $('swatches')
      root.textContent = ''
      ranked.forEach((hex, i) => {
        const s = document.createElement('button')
        s.type = 'button'
        s.className = 'swatch'
        s.style.background = hex
        s.title = hex
        s.addEventListener('click', () => applyPalette(hex, i))
        root.appendChild(s)
      })
      if (ranked[0]) applyPalette(ranked[0], 0)
    }
    img.onerror = () => {}
    img.src = URL.createObjectURL(blob)
  }

  function applyPalette(hex) {
    $('accent').value = $('accentHex').value = hex
    $('stroke').value = $('strokeHex').value = mix(hex, 0.35, 'black')
    $('text').value = $('textHex').value = mix(hex, 0.15, 'black')
    $('hint').value = $('hintHex').value = mix(hex, 0.45, 'white')
    preview()
  }

  function renderBubbles(list) {
    const root = $('bubbles')
    root.textContent = ''
    list.forEach((item) => root.appendChild(bubbleRow(item)))
  }

  function bubbleRow(item) {
    const wrap = document.createElement('div')
    wrap.className = 'bubble-item'
    wrap.innerHTML =
      '<div class="bubble-head">' +
      '<input type="number" min="1" class="w" style="width:56px" title="权重">' +
      '<select class="style"><option value="A">说明</option><option value="B">强调</option></select>' +
      '<select class="kind"><option value="pick">随机多句</option><option value="text">单句</option><option value="gif">动图</option></select>' +
      '<label><input type="checkbox" class="wrap"> 换行</label>' +
      '<button type="button" class="ghost del">去掉</button>' +
      '</div><textarea class="lines" placeholder="一行一条"></textarea>'
    wrap.querySelector('.w').value = item.w || 1
    wrap.querySelector('.style').value = item.style || 'A'
    wrap.querySelector('.kind').value = item.kind || (item.gif ? 'gif' : item.pick ? 'pick' : 'text')
    wrap.querySelector('.wrap').checked = !!item.wrap
    wrap.querySelector('.lines').value = item.text || (item.pick ? item.pick.join('\n') : '')
    wrap.querySelector('.del').addEventListener('click', () => wrap.remove())
    return wrap
  }

  $('addBubble').addEventListener('click', () => {
    $('bubbles').appendChild(bubbleRow({ w: 4, style: 'A', wrap: true, kind: 'pick', text: '' }))
  })

  function collectBubbles() {
    const out = []
    $('bubbles').querySelectorAll('.bubble-item').forEach((row) => {
      const w = Math.max(1, Math.round(Number(row.querySelector('.w').value) || 1))
      const style = row.querySelector('.style').value || 'A'
      const kind = row.querySelector('.kind').value
      const wrap = row.querySelector('.wrap').checked
      const raw = row.querySelector('.lines').value
      if (kind === 'gif') { out.push({ w: w, gif: true }); return }
      const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      if (kind === 'text') out.push({ w: w, style: style, wrap: wrap, text: lines.join(' ') || '……' })
      else out.push({ w: w, style: style, wrap: wrap, pick: lines.length ? lines : ['……'] })
    })
    return out
  }

  function skinId() {
    return String($('id').value || 'skin').trim().toLowerCase().replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '') || 'skin'
  }

  const DEFAULT_BUBBLE_SVG = '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
    '<path class="bshape" fill="#fff" stroke-width="18" stroke-linejoin="round" d="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z"/>' +
    '<ellipse cx="352" cy="561" rx="37.5" ry="26" fill="#fff" stroke-width="18"/>' +
    '<ellipse cx="442" cy="646" rx="24.5" ry="18" fill="#fff" stroke-width="18"/>' +
    '</svg>'
  let liveBlobs = []
  let liveTimer = 0
  let studioHost = null
  let bubbleSimOn = true
  let stageMenuOpen = false
  let hoverSoundSimOn = true
  let burstEffectSimOn = true
  let sfxUrlCache = null
  let activeAudio = null
  let draftTimer = 0
  let draftReady = false
  const DRAFT_META = 'zc-workshop-draft-meta'
  const DRAFT_DB = 'zc-workshop'
  const DRAFT_STORE = 'draft'

  window.__zcOnModError = function (msg, where) {
    setStatus('插件错误 · ' + (where || '?') + '：' + msg, 'err')
  }

  function playUrl(url) {
    if (!url) return
    try {
      if (activeAudio) {
        try { activeAudio.pause() } catch (err) {}
      }
      activeAudio = new Audio(url)
      activeAudio.play().catch(function () {})
    } catch (err) {}
  }

  async function ensureSfxUrls() {
    if (sfxUrlCache) return sfxUrlCache
    const sfx = await loadSfx()
    const out = {}
    Object.keys(sfx).forEach((k) => {
      out[k] = URL.createObjectURL(new Blob([sfx[k]], { type: 'audio/mpeg' }))
    })
    sfxUrlCache = out
    return out
  }

  function currentSoundSetId() {
    const sel = $('stageSoundSelect')
    return (sel && sel.value) || 'duck'
  }

  async function playStudioSound(kind) {
    const set = currentSoundSetId()
    if (set === 'none') return
    if (set === 'custom') {
      const slot = kind === 'press' ? 'tapPress' : (kind === 'release' ? 'tapRelease' : (kind === 'hover' ? 'tapHover' : 'burstSound'))
      if (files[slot] && urls[slot]) playUrl(urls[slot])
      return
    }
    try {
      const map = await ensureSfxUrls()
      const table = {
        duck: { press: 'ya1.mp3', release: 'ya2.mp3', hover: 'ya1.mp3', burst: 'ya2.mp3' },
        fx1: { press: 'd1.mp3', release: 'd2.mp3', hover: 'd1.mp3', burst: 'd2.mp3' },
      }
      const key = table[set] && table[set][kind]
      if (key && map[key]) playUrl(map[key])
    } catch (err) {}
  }

  function playPress() { playStudioSound('press') }
  function playRelease() { playStudioSound('release') }
  function playHover() { if (hoverSoundSimOn) playStudioSound('hover') }
  function playBurstSfx() {
    if (files.burstSound && urls.burstSound) playUrl(urls.burstSound)
    else playStudioSound('burst')
  }

  function idbReq(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  function idbTxDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('aborted'))
    })
  }
  function openDraftDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DRAFT_DB, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  async function idbPut(key, value) {
    const db = await openDraftDb()
    const tx = db.transaction(DRAFT_STORE, 'readwrite')
    tx.objectStore(DRAFT_STORE).put(value, key)
    await idbTxDone(tx)
    db.close()
  }
  async function idbGet(key) {
    const db = await openDraftDb()
    const tx = db.transaction(DRAFT_STORE, 'readonly')
    const val = await idbReq(tx.objectStore(DRAFT_STORE).get(key))
    await idbTxDone(tx)
    db.close()
    return val
  }
  async function idbDel(key) {
    const db = await openDraftDb()
    const tx = db.transaction(DRAFT_STORE, 'readwrite')
    tx.objectStore(DRAFT_STORE).delete(key)
    await idbTxDone(tx)
    db.close()
  }

  function scheduleDraftSave() {
    if (!draftReady) return
    clearTimeout(draftTimer)
    draftTimer = setTimeout(function () { saveDraft().catch(function () {}) }, 800)
  }

  function collectFormMeta() {
    return {
      id: $('id').value,
      label: $('label').value,
      brand: $('brand').value,
      balanceTitle: $('balanceTitle').value,
      burstClicks: $('burstClicks').value,
      bubbleMarkup: $('bubbleMarkup').value,
      customSoundLabel: $('customSoundLabel').value,
      packSounds: $('packSounds').value,
      stroke: $('strokeHex').value,
      text: $('textHex').value,
      hint: $('hintHex').value,
      accent: $('accentHex').value,
      pluginInline: $('pluginInline').value,
      pluginData: $('pluginData').value,
      bubbles: collectBubbles(),
      bubbleSimOn: bubbleSimOn,
      hoverSoundSimOn: hoverSoundSimOn,
      burstEffectSimOn: burstEffectSimOn,
      soundSet: currentSoundSetId(),
    }
  }

  async function saveDraft() {
    const meta = collectFormMeta()
    localStorage.setItem(DRAFT_META, JSON.stringify(meta))
    const payload = { files: {}, names: {} }
    const keys = Object.keys(files)
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (k === 'plugins') {
        payload.plugins = []
        for (let j = 0; j < files.plugins.length; j++) {
          const rec = files.plugins[j]
          payload.plugins.push({ name: rec.name, buf: rec.buf })
        }
        continue
      }
      if (!files[k]) continue
      payload.files[k] = files[k].buf
      payload.names[k] = files[k].name
    }
    await idbPut('bin', payload)
  }

  async function restoreDraft() {
    const raw = localStorage.getItem(DRAFT_META)
    if (!raw) return false
    let meta
    try { meta = JSON.parse(raw) } catch (err) { return false }
    const bin = await idbGet('bin')
    applyFormMeta(meta)
    if (bin && bin.files) {
      const keys = Object.keys(bin.files)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const buf = new Uint8Array(bin.files[k])
        const name = (bin.names && bin.names[k]) || k
        const blob = new Blob([buf])
        files[k] = { blob: blob, name: name, buf: buf }
        slotPreview(k, blob, name)
        if (k === 'idle') extractPalette(blob)
      }
    }
    if (bin && Array.isArray(bin.plugins)) {
      files.plugins = bin.plugins.map((p) => {
        const buf = new Uint8Array(p.buf)
        return { blob: new Blob([buf]), name: p.name, buf: buf }
      })
      previewPlugins()
    }
    if (meta.bubbles) {
      renderBubbles(meta.bubbles.map((b) => ({
        w: b.w || 1,
        style: b.style || 'A',
        wrap: !!b.wrap,
        kind: b.gif ? 'gif' : (b.pick ? 'pick' : (b.kind || 'text')),
        text: b.gif ? '' : (Array.isArray(b.pick) ? b.pick.join('\n') : (b.text || '')),
      })))
    }
    bubbleSimOn = meta.bubbleSimOn !== false
    hoverSoundSimOn = meta.hoverSoundSimOn !== false
    burstEffectSimOn = meta.burstEffectSimOn !== false
    applyPreviewBubble()
    preview()
    scheduleLiveMods()
    if (meta.soundSet && $('stageSoundSelect')) {
      rebuildStageSoundSelect()
      const ids = Array.from($('stageSoundSelect').options).map((o) => o.value)
      if (ids.indexOf(meta.soundSet) >= 0) $('stageSoundSelect').value = meta.soundSet
    }
    setStatus('已恢复上次草稿', 'ok')
    return true
  }

  function applyFormMeta(meta) {
    if (!meta) return
    ;['id', 'label', 'brand', 'balanceTitle', 'burstClicks', 'bubbleMarkup', 'customSoundLabel', 'pluginInline', 'pluginData'].forEach((k) => {
      if ($(k) && meta[k] != null) $(k).value = meta[k]
    })
    if ($('packSounds') && meta.packSounds) $('packSounds').value = meta.packSounds
    ;['stroke', 'text', 'hint', 'accent'].forEach((k) => {
      if (meta[k]) {
        $(k).value = $(k + 'Hex').value = meta[k]
      }
    })
  }

  async function clearDraft() {
    localStorage.removeItem(DRAFT_META)
    try { await idbDel('bin') } catch (err) {}
  }

  async function resetProject(confirmAsk) {
    if (confirmAsk && !window.confirm('清空当前编辑，开始新建？未导出的内容会丢失。')) return
    Object.keys(files).forEach((k) => {
      if (k === 'plugins') files.plugins = []
      else files[k] = null
      if (k !== 'plugins') slotPreview(k, null)
    })
    previewPlugins()
    $('id').value = 'mypet'
    $('label').value = '我的皮肤'
    $('brand').value = 'ZC桌宠'
    $('balanceTitle').value = ''
    $('burstClicks').value = '0'
    $('bubbleMarkup').value = ''
    $('customSoundLabel').value = '自定义'
    $('packSounds').value = 'yes'
    $('stroke').value = $('strokeHex').value = '#203170'
    $('text').value = $('textHex').value = '#536ba9'
    $('hint').value = $('hintHex').value = '#9fb0d9'
    $('accent').value = $('accentHex').value = '#3d5a80'
    $('pluginInline').value = ''
    $('pluginData').value = ''
    bubbleSimOn = true
    hoverSoundSimOn = true
    burstEffectSimOn = true
    renderBubbles(defaultBubbles)
    applyPreviewBubble()
    preview()
    scheduleLiveMods()
    await clearDraft()
    setStatus('已新建空白皮肤', 'ok')
  }

  async function loadExampleSkin() {
    async function fetchAsFile(url, name, type) {
      const res = await fetch(url)
      if (!res.ok) throw new Error('示例素材缺失：' + name)
      const buf = new Uint8Array(await res.arrayBuffer())
      return { blob: new Blob([buf], { type: type }), name: name, buf: buf }
    }
    setStatus('正在载入示例…')
    await resetProject(false)
    $('id').value = 'plugtest'
    $('label').value = '插件测试皮'
    $('brand').value = 'ZC桌宠'
    $('balanceTitle').value = '插件测试 · 余额'
    $('burstClicks').value = '8'
    $('customSoundLabel').value = '插件测试音'
    $('stroke').value = $('strokeHex').value = '#5c3317'
    $('text').value = $('textHex').value = '#7a4a22'
    $('hint').value = $('hintHex').value = '#c4a574'
    $('accent').value = $('accentHex').value = '#e07a3d'
    $('pluginData').value = '{\n  "skin": "plugtest",\n  "note": "press/hover/burst/menu effects"\n}'
    const idle = await fetchAsFile('./fixtures/plugtest/idle.svg', 'idle.svg', 'image/svg+xml')
    const press = await fetchAsFile('./fixtures/plugtest/press.svg', 'press.svg', 'image/svg+xml')
    const burst = await fetchAsFile('./fixtures/plugtest/burst.svg', 'burst.svg', 'image/svg+xml')
    const bubble = await fetchAsFile('./fixtures/plugtest/bubble.svg', 'bubble.svg', 'image/svg+xml')
    const plugin = await fetchAsFile('./fixtures/plugtest/plugin.js', 'plugin.js', 'text/javascript')
    const css = await fetchAsFile('./fixtures/plugtest/skin.css', 'skin.css', 'text/css')
    const ya1 = await fetchAsFile('./sfx/ya1.mp3', 'press.mp3', 'audio/mpeg')
    const ya2 = await fetchAsFile('./sfx/ya2.mp3', 'release.mp3', 'audio/mpeg')
    const d1 = await fetchAsFile('./sfx/d1.mp3', 'hover.mp3', 'audio/mpeg')
    const d2 = await fetchAsFile('./sfx/d2.mp3', 'burst.mp3', 'audio/mpeg')
    files.idle = idle; slotPreview('idle', idle.blob, idle.name); extractPalette(idle.blob)
    files.press = press; slotPreview('press', press.blob, press.name)
    files.burst = burst; slotPreview('burst', burst.blob, burst.name)
    files.bubbleArt = bubble; slotPreview('bubbleArt', bubble.blob, bubble.name)
    files.modCss = css; slotPreview('modCss', css.blob, css.name)
    files.tapPress = ya1; slotPreview('tapPress', ya1.blob, ya1.name)
    files.tapRelease = ya2; slotPreview('tapRelease', ya2.blob, ya2.name)
    files.tapHover = d1; slotPreview('tapHover', d1.blob, d1.name)
    files.burstSound = d2; slotPreview('burstSound', d2.blob, d2.name)
    files.plugins = [plugin]
    previewPlugins()
    renderBubbles([
      { w: 8, style: 'B', wrap: false, kind: 'pick', text: '插件皮在线\n点我试试圈' },
      { w: 8, style: 'A', wrap: true, kind: 'pick', text: '这是插件测试皮肤。\n舞台上应该有一圈呼吸环。' },
      { w: 1, style: 'B', wrap: false, kind: 'text', text: 'plugtest 已加载' },
      { w: 4, style: 'A', wrap: true, kind: 'pick', text: '连点会全屏爆一下' },
    ])
    applyPreviewBubble()
    preview()
    scheduleLiveMods()
    scheduleDraftSave()
    setStatus('已载入示例「插件测试皮」', 'ok')
  }

  function exportChecklist() {
    const tips = []
    if (!files.idle) tips.push('建议补待机立绘')
    if (!files.press) tips.push('可补按压图')
    if (!files.burst && Number($('burstClicks').value) > 0) tips.push('设了连点次数但无彩蛋图')
    if (!files.tapPress && !files.tapRelease && $('packSounds').value === 'no') tips.push('未打包通用音效也无自定义音')
    const raw = ($('pluginData').value || '').trim()
    if (raw) {
      try { JSON.parse(raw) } catch (err) { tips.push('附加 JSON 非法') }
    }
    if (!files.plugins.length && !($('pluginInline').value || '').trim() && files.modCss) tips.push('只有 CSS 没有脚本')
    return tips
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
    return (n / (1024 * 1024)).toFixed(2) + ' MB'
  }

  function syncStageMenuEmpty() {
    const mods = $('stageMenuMods')
    const empty = $('stageMenuEmpty')
    if (!mods || !empty) return
    const has = !!mods.querySelector('[data-zc-mod]')
    empty.hidden = has
  }

  function rebuildStageSoundSelect() {
    const sel = $('stageSoundSelect')
    if (!sel) return
    const keep = sel.value
    sel.textContent = ''
    function opt(value, label) {
      const o = document.createElement('option')
      o.value = value
      o.textContent = label
      return o
    }
    if ($('packSounds') && $('packSounds').value === 'yes') {
      sel.appendChild(opt('duck', '小黄鸭'))
      sel.appendChild(opt('fx1', '音效1'))
    }
    if (files.tapPress || files.tapRelease || files.tapHover) {
      sel.appendChild(opt('custom', ($('customSoundLabel') && $('customSoundLabel').value.trim()) || '自定义'))
    }
    if (!sel.options.length) sel.appendChild(opt('none', '暂无音效'))
    const ids = Array.from(sel.options).map((o) => o.value)
    sel.value = ids.indexOf(keep) >= 0 ? keep : ids[0]
  }

  function positionStageMenu() {
    const menu = $('stageMenu')
    const btn = $('stageMenuBtn')
    if (!menu || !btn) return
    try {
      const b = btn.getBoundingClientRect()
      const pad = 8
      const wantW = Math.min(248, window.innerWidth - pad * 2)
      const availAbove = Math.max(0, b.top - pad)
      const availBelow = Math.max(0, window.innerHeight - b.bottom - pad)
      const openUp = availAbove >= 180 || availAbove >= availBelow
      const room = openUp ? availAbove : availBelow
      menu.style.maxHeight = Math.max(140, Math.min(room, Math.floor(window.innerHeight * 0.7), 420)) + 'px'
      let right = Math.round(window.innerWidth - b.right)
      if (right + wantW > window.innerWidth - pad) right = Math.max(pad, window.innerWidth - pad - wantW)
      if (right < pad) right = pad
      menu.style.right = right + 'px'
      menu.style.left = 'auto'
      if (openUp) {
        menu.style.bottom = (window.innerHeight - b.top + 6) + 'px'
        menu.style.top = 'auto'
        menu.style.transformOrigin = 'bottom right'
      } else {
        menu.style.top = (b.bottom + 6) + 'px'
        menu.style.bottom = 'auto'
        menu.style.transformOrigin = 'top right'
      }
    } catch (err) {}
  }

  function setStageMenuOpen(open) {
    stageMenuOpen = !!open
    const menu = $('stageMenu')
    const btn = $('stageMenuBtn')
    if (menu) {
      menu.classList.toggle('stage-menu-open', stageMenuOpen)
      menu.hidden = !stageMenuOpen
      menu.setAttribute('aria-hidden', stageMenuOpen ? 'false' : 'true')
      if (stageMenuOpen) menu.removeAttribute('inert')
      else menu.setAttribute('inert', '')
    }
    if (btn) btn.setAttribute('aria-expanded', stageMenuOpen ? 'true' : 'false')
    if (stageMenuOpen) {
      rebuildStageSoundSelect()
      positionStageMenu()
      if ($('stageBubbleToggle')) $('stageBubbleToggle').checked = bubbleSimOn
      if ($('stageHoverToggle')) $('stageHoverToggle').checked = hoverSoundSimOn
      if ($('stageBurstToggle')) $('stageBurstToggle').checked = burstEffectSimOn
      modEmit('menuopen')
    } else {
      modEmit('menuclose')
    }
  }

  function toggleStageMenu(e) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setStageMenuOpen(!stageMenuOpen)
  }

  function wrapBubbleMarkup(raw) {
    const t = String(raw || '').trim()
    if (!t) return DEFAULT_BUBBLE_SVG
    if (/<svg[\s>]/i.test(t)) return t
    if (/^<(path|g|ellipse|circle|rect|polygon)\b/i.test(t)) {
      return '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' + t + '</svg>'
    }
    return t
  }

  function applyPreviewBubble() {
    const art = $('bubbleArt')
    if (!art) return
    const markup = ($('bubbleMarkup') && $('bubbleMarkup').value || '').trim()
    if (markup) { art.innerHTML = wrapBubbleMarkup(markup); return }
    if (files.bubbleArt) {
      const name = files.bubbleArt.name || ''
      if (/\.svg$/i.test(name) || (files.bubbleArt.blob && files.bubbleArt.blob.type.indexOf('svg') >= 0)) {
        art.innerHTML = wrapBubbleMarkup(new TextDecoder().decode(files.bubbleArt.buf))
        return
      }
    }
    art.innerHTML = DEFAULT_BUBBLE_SVG
  }

  function modEmit(name, payload) {
    try {
      if (window.__zcModHost && window.__zcModHost.emit) return window.__zcModHost.emit(name, payload)
    } catch (err) {}
    return payload
  }

  function revokeLive() {
    liveBlobs.forEach((u) => { try { URL.revokeObjectURL(u) } catch (err) {} })
    liveBlobs = []
  }

  function blobUrl(buf, type) {
    const u = URL.createObjectURL(new Blob([buf], { type: type || 'text/javascript' }))
    liveBlobs.push(u)
    return u
  }

  function buildStudioHost(data) {
    const canvas = $('previewCanvas')
    const pet = $('previewPet')
    const r = canvas.getBoundingClientRect()
    const w = Math.max(64, Math.round(r.width || 256))
    if (canvas.width !== w) { canvas.width = w; canvas.height = w }
    const pointer = { x: 0, y: 0, over: false, down: false }
    studioHost = {
      version: 1,
      skin: { id: skinId(), label: $('label').value, data: data },
      skinId: skinId(),
      root: $('stage'),
      body: $('stage'),
      img: pet,
      canvas: canvas,
      bubble: {
        box: $('previewBubble'),
        art: $('bubbleArt'),
        text: $('previewBubble').querySelector('.speech-text'),
        gif: null,
        label: $('pbA'),
        amount: $('pbB'),
        hint: $('pbC'),
      },
      menu: {
        box: $('stageMenuMain') || $('stageMenu'),
        add: function (el) {
          if (el && el.setAttribute) el.setAttribute('data-zc-mod', '1')
          const box = $('stageMenuMods') || $('stageMenuMain')
          if (box) box.appendChild(el)
          syncStageMenuEmpty()
          return el
        },
        button: function (label, fn) {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'stage-menu-nav'
          b.setAttribute('data-zc-mod', '1')
          b.textContent = label
          if (typeof fn === 'function') b.addEventListener('click', fn)
          const box = $('stageMenuMods') || $('stageMenuMain')
          if (box) box.appendChild(b)
          syncStageMenuEmpty()
          return b
        },
      },
      whale: new Proxy({}, { get: function () { return function () { return Promise.resolve(null) } } }),
      data: data || {},
      extra: {},
      pointer: function () { return pointer },
      rect: function () { return $('stage').getBoundingClientRect() },
      asset: function (name) {
        const n = String(name || '').toLowerCase()
        if (/press/.test(n)) return urls.press || urls.idle || ''
        if (/burst/.test(n)) return urls.burst || urls.idle || ''
        if (/gif/.test(n)) return urls.gif || ''
        return urls.idle || ''
      },
      store: {
        get: function (k) {
          const key = String(k || '').slice(0, 64)
          if (!key) return null
          try { return JSON.parse(localStorage.getItem('zcstudio:' + skinId() + ':' + key)) } catch (err) { return null }
        },
        set: function (k, v) {
          const key = String(k || '').slice(0, 64)
          if (!key) return
          try {
            const raw = JSON.stringify(v)
            if (raw.length > 8192) return
            localStorage.setItem('zcstudio:' + skinId() + ':' + key, raw)
          } catch (err) {}
        },
      },
      css: function (text) {
        // 仅注入样式文本，禁止嵌 </style> 逃逸；长度封顶
        let css = String(text || '').replace(/<\/style/gi, '<\\/style').slice(0, 100000)
        const st = document.createElement('style')
        st.setAttribute('data-zc-mod', '1')
        st.textContent = css
        document.head.appendChild(st)
        return st
      },
      setPose: function (pressed) {
        pet.classList.toggle('press', !!pressed)
        preview()
      },
      setImg: function (src) { pet.src = src || ''; pet.style.display = src ? 'block' : 'none' },
      setScale: function () {},
      getScale: function () { return 1 },
      showBubble: function () { bubbleSimOn = true; preview(); modEmit('bubbleopen') },
      hideBubble: function () { bubbleSimOn = false; preview(); modEmit('bubbleclose') },
      playPress: function () { playPress() },
      playRelease: function () { playRelease() },
    }
    studioHost._pointer = pointer
    return studioHost
  }

  async function liveMods() {
    const inline = ($('pluginInline') && $('pluginInline').value || '').trim()
    const hasMod = files.plugins.length || inline || files.modCss
    $('stage').classList.toggle('has-mod', !!hasMod)
    if (!window.__zcModHost) return
    if (!hasMod) {
      window.__zcModHost.unload()
      $('previewCanvas').style.display = 'none'
      syncStageMenuEmpty()
      return
    }
    revokeLive()
    applyPreviewBubble()
    let data = {}
    const raw = ($('pluginData') && $('pluginData').value || '').trim()
    if (raw) {
      try { data = JSON.parse(raw) } catch (err) { data = {} }
    }
    const plugins = files.plugins.map((rec) => ({ url: blobUrl(rec.buf, 'text/javascript') }))
    if (inline) plugins.push({ url: blobUrl(new TextEncoder().encode(inline), 'text/javascript') })
    const styles = []
    if (files.modCss) styles.push({ url: blobUrl(files.modCss.buf, 'text/css') })
    await window.__zcModHost.loadSkinMods({ plugins: plugins, styles: styles, data: data }, buildStudioHost(data))
    syncStageMenuEmpty()
  }

  function scheduleLiveMods() {
    clearTimeout(liveTimer)
    liveTimer = setTimeout(function () {
      liveMods().catch(function (err) {
        setStatus('插件预览失败：' + String((err && err.message) || err), 'err')
      })
    }, 220)
  }

  function preview() {
    const pet = $('previewPet')
    const src = urls.press && pet.classList.contains('press') ? urls.press : urls.idle
    pet.src = src || ''
    pet.style.display = src ? 'block' : 'none'
    pet.alt = ($('label').value.trim() || '桌宠') + '预览'
    const hasLook = !!(urls.idle || files.plugins.length || ($('pluginInline') && $('pluginInline').value.trim()) || ($('bubbleMarkup') && $('bubbleMarkup').value.trim()) || files.bubbleArt)
    $('stage').classList.toggle('has-pet', hasLook)
    const stroke = $('strokeHex').value || '#203170'
    document.documentElement.style.setProperty('--stroke', stroke)
    const text = $('textHex').value || '#536ba9'
    const hint = $('hintHex').value || '#9fb0d9'
    const accent = $('accentHex').value || '#3d5a80'
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-rgb', hexRgb(accent))
    document.documentElement.style.setProperty('--hint', hint)
    $('pbA').textContent = $('balanceTitle').value.trim() || (($('brand').value.trim() || 'ZC桌宠') + ' 余额')
    $('pbA').style.color = text
    $('pbB').style.color = accent || text
    $('pbC').style.color = hint
    if ($('previewBubble')) $('previewBubble').style.opacity = bubbleSimOn && hasLook ? '' : '0'
    if ($('stageBubbleToggle')) $('stageBubbleToggle').checked = bubbleSimOn
    if (!hasLook && stageMenuOpen) setStageMenuOpen(false)
    rebuildStageSoundSelect()
    $('caption').textContent = hasLook
      ? ($('label').value.trim() || '未命名') + '  ·  舞台可预览插件'
      : '拖入立绘或脚本 · 舞台会模拟按下 / 悬浮 / 连点'
    scheduleDraftSave()
  }

  const stage = $('stage')
  stage.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && (e.target.closest('#stageMenuBtn') || e.target.closest('#stageMenu'))) return
    $('previewPet').classList.add('press')
    if (studioHost && studioHost._pointer) { studioHost._pointer.down = true; studioHost._pointer.x = e.clientX; studioHost._pointer.y = e.clientY }
    preview()
    playPress()
    modEmit('press')
  })
  window.addEventListener('pointerup', () => {
    if (!$('previewPet').classList.contains('press')) return
    $('previewPet').classList.remove('press')
    if (studioHost && studioHost._pointer) studioHost._pointer.down = false
    preview()
    playRelease()
    modEmit('release')
  })
  stage.addEventListener('pointermove', (e) => {
    if (studioHost && studioHost._pointer) { studioHost._pointer.x = e.clientX; studioHost._pointer.y = e.clientY }
  })
  stage.addEventListener('pointerenter', () => {
    if (studioHost && studioHost._pointer) studioHost._pointer.over = true
    playHover()
    modEmit('hoverenter')
  })
  stage.addEventListener('pointerleave', () => {
    if (studioHost && studioHost._pointer) studioHost._pointer.over = false
    modEmit('hoverleave')
  })
  ;['id', 'label', 'brand', 'balanceTitle', 'burstClicks'].forEach((id) => $(id).addEventListener('input', preview))

  function preventDrag(e) {
    e.preventDefault()
  }
  ;['dragenter', 'dragover'].forEach((ev) => {
    stage.addEventListener(ev, (e) => { preventDrag(e); stage.classList.add('drag') })
    document.addEventListener(ev, preventDrag)
  })
  stage.addEventListener('dragleave', () => stage.classList.remove('drag'))
  stage.addEventListener('drop', async (e) => {
    e.preventDefault()
    stage.classList.remove('drag')
    await ingestFiles(e.dataTransfer && e.dataTransfer.files)
  })

  document.querySelectorAll('.chapters button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chapters button').forEach((b) => {
        const on = b === btn
        b.classList.toggle('on', on)
        b.setAttribute('aria-selected', on ? 'true' : 'false')
      })
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.getAttribute('data-ch') === btn.getAttribute('data-ch')))
    })
  })

  function tickClock() {
    const d = new Date()
    $('clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  }
  tickClock()
  setInterval(tickClock, 30000)

  if (finePointer) {
    const cur = $('cursor')
    if (cur) cur.hidden = false
    let x = 0, y = 0, tx = 0, ty = 0
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX
      ty = e.clientY
      const overStage = !!(e.target.closest && e.target.closest('#stage'))
      const typing = !!(e.target.closest && e.target.closest('input, textarea, select, button, .drop, .dock, .stage-menu, .stage-menu-btn, a, label'))
      const hideNative = overStage && !typing
      document.body.classList.toggle('cursor-stage', hideNative)
      if (cur) {
        cur.hidden = !hideNative
        cur.classList.toggle('hot', hideNative)
        cur.style.opacity = hideNative ? '1' : '0'
      }
    })
    function restoreCursor() {
      document.body.classList.remove('cursor-stage')
      if (cur) { cur.hidden = true; cur.style.opacity = '0' }
    }
    window.addEventListener('pointerleave', restoreCursor)
    window.addEventListener('blur', restoreCursor)
    function follow() {
      x += (tx - x) * 0.22
      y += (ty - y) * 0.22
      if (cur) {
        cur.style.left = x + 'px'
        cur.style.top = y + 'px'
      }
      requestAnimationFrame(follow)
    }
    follow()
    document.querySelectorAll('.magnetic').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect()
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.18
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.22
        btn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'
      })
      btn.addEventListener('pointerleave', () => { btn.style.transform = '' })
    })
  }

  window.addEventListener('paste', async (e) => {
    const items = e.clipboardData && e.clipboardData.items
    if (!items) return
    const found = []
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f) found.push(f)
      }
    }
    if (found.length) {
      e.preventDefault()
      await ingestFiles(found)
    scheduleLiveMods()
    }
  })

  async function loadSfx() {
    if (sfxCache) return sfxCache
    const names = ['ya1.mp3', 'ya2.mp3', 'd1.mp3', 'd2.mp3']
    const out = {}
    for (const n of names) {
      const res = await fetch('./sfx/' + n)
      if (!res.ok) throw new Error('请用本地服务打开本页以打包音效')
      out[n] = new Uint8Array(await res.arrayBuffer())
    }
    sfxCache = out
    return out
  }

  function packName(slot, rec, fallbackExt) {
    const ext = extFromFile({ name: rec.name, type: rec.blob && rec.blob.type }, fallbackExt)
    const bases = {
      idle: 'idle', press: 'press', burst: 'burst', gif: 'gif',
      tapPress: 'menu-press', tapRelease: 'menu-release', tapHover: 'menu-hover', burstSound: 'burst-sfx',
      bubbleArt: 'bubble', modCss: 'skin',
    }
    return (bases[slot] || slot) + ext
  }

  function zipNorm(name) {
    return String(name || '').replace(/\\/g, '/').replace(/^\.\//, '')
  }
  function zipBase(name) {
    return zipNorm(name).split('/').pop()
  }
  function mimeForName(name) {
    const ext = zipBase(name).toLowerCase()
    if (/\.(png)$/.test(ext)) return 'image/png'
    if (/\.(jpe?g|jfif|pjpeg)$/.test(ext)) return 'image/jpeg'
    if (/\.(webp|gif|bmp|svg|avif|ico)$/.test(ext)) {
      if (/\.svg$/.test(ext)) return 'image/svg+xml'
      if (/\.gif$/.test(ext)) return 'image/gif'
      if (/\.webp$/.test(ext)) return 'image/webp'
      if (/\.bmp$/.test(ext)) return 'image/bmp'
      if (/\.avif$/.test(ext)) return 'image/avif'
      return 'image/x-icon'
    }
    if (/\.mp3$/.test(ext)) return 'audio/mpeg'
    if (/\.wav$/.test(ext)) return 'audio/wav'
    if (/\.(ogg|oga)$/.test(ext)) return 'audio/ogg'
    if (/\.(m4a|aac)$/.test(ext)) return 'audio/mp4'
    if (/\.flac$/.test(ext)) return 'audio/flac'
    if (/\.(webm|weba)$/.test(ext)) return /\.weba$/.test(ext) ? 'audio/webm' : 'video/webm'
    if (/\.(mp4|m4v)$/.test(ext)) return 'video/mp4'
    if (/\.mov$/.test(ext)) return 'video/quicktime'
    if (/\.css$/.test(ext)) return 'text/css'
    if (/\.(js|mjs)$/.test(ext)) return 'text/javascript'
    return ''
  }
  function zipKey(map, name) {
    if (!name) return null
    const want = zipNorm(name)
    if (map[want]) return want
    const wantLow = want.toLowerCase()
    const keys = Object.keys(map)
    const hit = keys.find((k) => zipNorm(k).toLowerCase() === wantLow)
    if (hit) return hit
    const base = zipBase(want).toLowerCase()
    return keys.find((k) => zipBase(k).toLowerCase() === base) || null
  }
  function zipByPrefix(map, prefix, extRe) {
    const p = String(prefix || '').toLowerCase()
    if (!p) return null
    return Object.keys(map).find((k) => {
      const base = zipBase(k)
      if (extRe && !extRe.test(base) && !extRe.test(k)) return false
      const low = base.toLowerCase()
      const stem = low.replace(/\.[^.]+$/, '')
      return stem === p || stem.indexOf(p + '-') === 0 || stem.indexOf(p + '_') === 0
    }) || null
  }
  function zipByHint(map, re, extRe) {
    return Object.keys(map).find((k) => {
      const base = zipBase(k)
      if (extRe && !extRe.test(base)) return false
      return re.test(base)
    }) || null
  }

  async function exportSkin() {
    try {
      if (!files.idle && !files.plugins.length && !($('bubbleMarkup').value || '').trim() && !files.bubbleArt && !($('pluginInline').value || '').trim()) {
        setStatus('还需要立绘、气泡外形或插件脚本', 'err')
        return
      }
      const tips = exportChecklist()
      if (tips.some((t) => /JSON 非法/.test(t))) {
        setStatus(tips.join(' · '), 'err')
        return
      }
      const id = skinId()
      $('id').value = id
      const pack = []
      const manifest = {
        id: id,
        label: $('label').value.trim() || id,
        brand: $('brand').value.trim() || $('label').value.trim() || id,
        stroke: $('strokeHex').value,
        text: $('textHex').value,
        hint: $('hintHex').value,
        accent: $('accentHex').value,
        accentRgb: hexRgb($('accentHex').value),
        bubbles: collectBubbles(),
      }
      if (files.idle) {
        const idleName = packName('idle', files.idle, '.png')
        pack.push({ name: idleName, data: files.idle.buf })
        manifest.img = idleName
      }
      const bt = $('balanceTitle').value.trim()
      if (bt) manifest.balanceTitle = bt
      if (files.press) {
        const n = packName('press', files.press, '.png')
        manifest.pressImg = n
        pack.push({ name: n, data: files.press.buf })
      }
      if (files.gif) {
        const n = packName('gif', files.gif, '.gif')
        manifest.gif = n
        pack.push({ name: n, data: files.gif.buf })
      }
      const clicks = Math.max(0, Math.round(Number($('burstClicks').value) || 0))
      if (files.burst) {
        const n = packName('burst', files.burst, '.png')
        manifest.burstImg = n
        manifest.burstClicks = clicks > 0 ? clicks : 10
        pack.push({ name: n, data: files.burst.buf })
      } else if (clicks > 0) manifest.burstClicks = clicks

      const markup = ($('bubbleMarkup').value || '').trim()
      if (markup) {
        const asHtml = /<html[\s>]|<div[\s>]|<style[\s>]/i.test(markup) && !/<svg[\s>]/i.test(markup)
        const name = asHtml ? 'bubble.html' : 'bubble.svg'
        pack.push({ name: name, data: new TextEncoder().encode(markup) })
        if (asHtml) manifest.bubbleHtml = name
        else manifest.bubbleSvg = name
      } else if (files.bubbleArt) {
        const n = packName('bubbleArt', files.bubbleArt, extOf(files.bubbleArt.name, '.svg'))
        pack.push({ name: n, data: files.bubbleArt.buf })
        if (/\.html?$/i.test(n)) manifest.bubbleHtml = n
        else manifest.bubbleSvg = n
      }
      if (files.plugins.length) {
        const names = []
        files.plugins.forEach((rec, i) => {
          const n = 'mods/' + String(rec.name || ('plugin-' + (i + 1) + '.js')).replace(/[^\w.\-]+/g, '_')
          pack.push({ name: n, data: rec.buf })
          names.push(n)
        })
        manifest.plugins = names
      }
      const inline = ($('pluginInline').value || '').trim()
      if (inline) {
        pack.push({ name: 'mods/atelier-inline.js', data: new TextEncoder().encode(inline) })
        manifest.plugins = (manifest.plugins || []).concat(['mods/atelier-inline.js'])
      }
      if (files.modCss) {
        const n = packName('modCss', files.modCss, '.css')
        pack.push({ name: n, data: files.modCss.buf })
        manifest.css = [n]
      }
      const rawData = ($('pluginData').value || '').trim()
      if (rawData) {
        try {
          manifest.data = JSON.parse(rawData)
        } catch (err) {
          setStatus('附加数据不是合法 JSON', 'err')
          return
        }
      }

      const soundSets = []
      if ($('packSounds').value === 'yes') {
        const sfx = await loadSfx()
        pack.push({ name: 'ya1.mp3', data: sfx['ya1.mp3'] }, { name: 'ya2.mp3', data: sfx['ya2.mp3'] }, { name: 'd1.mp3', data: sfx['d1.mp3'] }, { name: 'd2.mp3', data: sfx['d2.mp3'] })
        soundSets.push({ id: 'duck', label: '小黄鸭', press: 'ya1.mp3', release: 'ya2.mp3' })
        soundSets.push({ id: 'fx1', label: '音效1', press: 'd1.mp3', release: 'd2.mp3' })
      }
      function addMedia(slot, fallbackExt) {
        const rec = files[slot]
        if (!rec) return null
        const n = packName(slot, rec, isVideoFile(rec) ? '.mp4' : fallbackExt)
        pack.push({ name: n, data: rec.buf })
        return n
      }
      if (files.tapPress || files.tapRelease || files.tapHover) {
        const custom = { id: 'custom', label: ($('customSoundLabel').value.trim() || '自定义') }
        const p = addMedia('tapPress', '.mp3')
        const r = addMedia('tapRelease', '.mp3')
        const h = addMedia('tapHover', '.mp3')
        if (p) custom.press = p
        if (r) custom.release = r
        if (h) custom.hover = h
        soundSets.push(custom)
      }
      const burstSfx = addMedia('burstSound', '.mp3')
      if (burstSfx) manifest.burstSound = burstSfx
      if (soundSets.length) manifest.soundSets = soundSets
      pack.unshift({ name: 'skin.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) })
      const blob = new Blob([SkinZip.zipStore(pack)], { type: 'application/zip' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = id + '.skin'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      const tipText = tips.length ? ' · ' + tips.join('；') : ''
      setStatus('已写下 ' + id + '.skin（' + formatBytes(blob.size) + '）' + tipText, tips.length ? '' : 'ok')
      scheduleDraftSave()
    } catch (err) {
      setStatus(String((err && err.message) || err), 'err')
    }
  }

  async function importSkin(file) {
    const map = await SkinZip.unzip(new Uint8Array(await file.arrayBuffer()))
    const jsonKey = zipKey(map, 'skin.json')
    if (!jsonKey) throw new Error('包内没有 skin.json')
    const m = JSON.parse(new TextDecoder().decode(map[jsonKey]))
    $('id').value = m.id || file.name.replace(/\.(skin|zip)$/i, '')
    $('label').value = m.label || m.id || ''
    $('brand').value = m.brand || m.label || ''
    $('balanceTitle').value = m.balanceTitle || ''
    $('stroke').value = $('strokeHex').value = m.stroke || '#203170'
    $('text').value = $('textHex').value = m.text || '#536ba9'
    $('hint').value = $('hintHex').value = m.hint || '#9fb0d9'
    $('accent').value = $('accentHex').value = m.accent || '#3d5a80'
    $('burstClicks').value = String(m.burstClicks || 0)
    const taken = {}
    async function take(key, slot, fallbackName, prefix, extRe) {
      if (files[slot] && slot !== 'plugins') return
      let name = zipKey(map, (key && m[key]) || fallbackName)
      if (!name && prefix) name = zipByPrefix(map, prefix, extRe)
      if (!name || !map[name] || taken[name + ':' + slot]) return
      taken[name + ':' + slot] = 1
      const data = map[name]
      const fname = zipBase(name)
      const blob = new Blob([data], { type: mimeForName(fname) })
      files[slot] = { blob: blob, name: fname, buf: data }
      slotPreview(slot, blob, fname)
      if (slot === 'idle') extractPalette(blob)
    }
    async function takeName(slot, rawName) {
      if (!rawName || (files[slot] && slot !== 'plugins')) return
      await take(null, slot, rawName, null, null)
    }
    Object.keys(files).forEach((k) => {
      if (k === 'plugins') { files.plugins = []; previewPlugins(); return }
      files[k] = null
      slotPreview(k, null)
    })
    await take('img', 'idle', 'idle.png', 'idle', IMG_EXT)
    await take('pressImg', 'press', 'press.png', 'press', IMG_EXT)
    await take('gif', 'gif', 'rua.gif', 'gif', IMG_EXT)
    await take('burstImg', 'burst', 'burst.png', 'burst', IMG_EXT)
    const sets = Array.isArray(m.soundSets) ? m.soundSets.filter(Boolean) : []
    const hasBundled = sets.some((s) => s.id === 'duck' || s.id === 'fx1') ||
      !!(zipKey(map, 'ya1.mp3') && zipKey(map, 'ya2.mp3'))
    $('packSounds').value = hasBundled ? 'yes' : 'no'
    const customSets = sets.filter((s) => s.id !== 'duck' && s.id !== 'fx1')
    const preferred = customSets.find((s) => s.id === 'custom') || customSets[0] || null
    $('customSoundLabel').value = (preferred && preferred.label) || '自定义'
    for (const set of customSets) {
      await takeName('tapPress', set.press)
      await takeName('tapRelease', set.release)
      await takeName('tapHover', set.hover)
      await takeName('burstSound', set.burst)
    }
    await takeName('tapPress', m.pressSound)
    await takeName('tapRelease', m.releaseSound)
    await takeName('tapHover', m.hoverSound)
    await takeName('burstSound', m.burstSound)
    await take(null, 'tapPress', null, 'menu-press', MEDIA_EXT)
    await take(null, 'tapRelease', null, 'menu-release', MEDIA_EXT)
    await take(null, 'tapHover', null, 'menu-hover', MEDIA_EXT)
    await take(null, 'tapHover', null, 'hover', MEDIA_EXT)
    await take(null, 'burstSound', null, 'burst-sfx', MEDIA_EXT)
    await take(null, 'burstSound', null, 'burst', MEDIA_EXT)
    const bundled = /^(ya1|ya2|d1|d2)\./i
    const hints = [
      ['burstSound', /burst|combo|连点|egg/i],
      ['tapHover', /hover|float|over|悬停/i],
      ['tapRelease', /release|抬起|ya2|up[-_.]/i],
      ['tapPress', /press|down|click|push|special|哈气|ya1/i],
    ]
    for (let i = 0; i < hints.length; i++) {
      const slot = hints[i][0]
      const re = hints[i][1]
      if (files[slot]) continue
      const hit = zipByHint(map, re, MEDIA_EXT)
      if (hit && !bundled.test(zipBase(hit))) await takeName(slot, hit)
    }
    if (!files.tapPress || !files.tapRelease || !files.tapHover || !files.burstSound) {
      for (const key of Object.keys(map)) {
        const base = zipBase(key)
        if (!MEDIA_EXT.test(base) || bundled.test(base)) continue
        if (!files.tapHover && /hover|float|悬停/i.test(base)) await takeName('tapHover', key)
        else if (!files.tapRelease && /release|抬起/i.test(base)) await takeName('tapRelease', key)
        else if (!files.burstSound && /burst|combo/i.test(base)) await takeName('burstSound', key)
        else if (!files.tapPress) await takeName('tapPress', key)
      }
    }
    const bubbleFile = m.bubbleSvg || m.bubbleHtml || m.bubble
    if (typeof bubbleFile === 'string' && bubbleFile.trim().charAt(0) === '<') {
      $('bubbleMarkup').value = bubbleFile
    } else {
      const bkey = zipKey(map, bubbleFile) || zipKey(map, 'bubble.svg') || zipKey(map, 'bubble.html')
      if (bkey && map[bkey]) {
        const txt = new TextDecoder().decode(map[bkey])
        $('bubbleMarkup').value = txt
        files.bubbleArt = { blob: new Blob([map[bkey]]), name: bkey.split('/').pop(), buf: map[bkey] }
        slotPreview('bubbleArt', files.bubbleArt.blob, files.bubbleArt.name)
      } else $('bubbleMarkup').value = ''
    }
    files.plugins = []
    $('pluginInline').value = ''
    const plugNames = [].concat(m.plugins || m.mods || m.scripts || []).map((x) => typeof x === 'string' ? x : (x && (x.file || x.src)))
    const fromList = plugNames.filter(Boolean)
    const jsKeys = fromList.length
      ? fromList.map((n) => zipKey(map, n)).filter(Boolean)
      : Object.keys(map).filter((k) => /\.(js|mjs)$/i.test(k))
    for (const name of jsKeys) {
      if (!map[name]) continue
      if (/(^|\/)atelier-inline\.js$/i.test(name)) {
        $('pluginInline').value = new TextDecoder().decode(map[name])
        continue
      }
      files.plugins.push({ blob: new Blob([map[name]]), name: name.split('/').pop(), buf: map[name] })
    }
    previewPlugins()
    const cssName = [].concat(m.css || m.styles || []).map((x) => typeof x === 'string' ? x : (x && (x.file || x.src)))[0]
    await take(null, 'modCss', cssName || 'skin.css', 'skin', /\.css$/i)
    if (m.data && typeof m.data === 'object') $('pluginData').value = JSON.stringify(m.data, null, 2)
    else $('pluginData').value = ''
    const list = Array.isArray(m.bubbles) ? m.bubbles.map((b) => ({
      w: b.w || 1,
      style: b.style || 'A',
      wrap: !!b.wrap,
      kind: b.gif ? 'gif' : (b.pick ? 'pick' : 'text'),
      text: b.gif ? '' : (Array.isArray(b.pick) ? b.pick.join('\n') : (b.text || '')),
    })) : defaultBubbles
    renderBubbles(list)
    applyPreviewBubble()
    preview()
    scheduleLiveMods()
    scheduleDraftSave()
    setStatus('已打开「' + (m.label || m.id) + '」', 'ok')
  }

  $('btnExport').addEventListener('click', exportSkin)
  $('btnImport').addEventListener('click', () => $('importFile').click())
  $('importFile').addEventListener('change', async () => {
    const f = $('importFile').files && $('importFile').files[0]
    $('importFile').value = ''
    if (!f) return
    try { await importSkin(f) } catch (err) { setStatus(String((err && err.message) || err), 'err') }
  })
  if ($('clearPlugins')) {
    $('clearPlugins').addEventListener('click', () => {
      files.plugins = []
      previewPlugins()
    })
  }
  ;['pluginInline', 'pluginData', 'bubbleMarkup'].forEach((id) => {
    if ($(id)) $(id).addEventListener('input', () => { preview(); if (id === 'bubbleMarkup') applyPreviewBubble(); scheduleLiveMods() })
  })
  if ($('simBurst')) {
    let burstTimer = null
    let burstAudio = null
    function hideStudioBurst() {
      const ov = $('burstOverlay')
      if (ov) ov.hidden = true
      if (burstTimer) { clearTimeout(burstTimer); burstTimer = null }
      if (burstAudio) {
        try { burstAudio.pause() } catch (err) {}
        burstAudio = null
      }
    }
    function showStudioBurst() {
      if (!burstEffectSimOn) {
        modEmit('burst')
        return
      }
      stage.classList.remove('sim-burst')
      void stage.offsetWidth
      stage.classList.add('sim-burst')
      setTimeout(() => stage.classList.remove('sim-burst'), 600)
      const src = urls.burst || urls.idle || ''
      const ov = $('burstOverlay')
      const img = $('burstPreview')
      if (ov && img) {
        if (src) img.src = src
        else img.removeAttribute('src')
        ov.hidden = false
      }
      if (files.burstSound && files.burstSound.blob) {
        try {
          burstAudio = new Audio(URL.createObjectURL(files.burstSound.blob))
          burstAudio.play().catch(function () {})
        } catch (err) {}
      } else {
        playBurstSfx()
      }
      if (burstTimer) clearTimeout(burstTimer)
      burstTimer = setTimeout(hideStudioBurst, 1600)
      modEmit('burst')
    }
    $('simBurst').addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      showStudioBurst()
    })
    if ($('burstOverlay')) {
      $('burstOverlay').addEventListener('click', hideStudioBurst)
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideStudioBurst()
      })
    }
  }

  if ($('btnNew')) $('btnNew').addEventListener('click', () => { resetProject(true) })
  if ($('btnExample')) {
    $('btnExample').addEventListener('click', () => {
      loadExampleSkin().catch((err) => setStatus(String((err && err.message) || err), 'err'))
    })
  }

  if ($('stageMenuBtn')) {
    $('stageMenuBtn').addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      toggleStageMenu()
    })
  }
  if ($('stageMenu')) {
    $('stageMenu').addEventListener('pointerdown', (e) => e.stopPropagation())
    $('stageMenu').addEventListener('click', (e) => e.stopPropagation())
  }
  if ($('stageBubbleToggle')) {
    $('stageBubbleToggle').addEventListener('change', () => {
      bubbleSimOn = !!$('stageBubbleToggle').checked
      preview()
      modEmit(bubbleSimOn ? 'bubbleopen' : 'bubbleclose')
    })
  }
  if ($('stageHoverToggle')) {
    $('stageHoverToggle').addEventListener('change', () => {
      hoverSoundSimOn = !!$('stageHoverToggle').checked
      scheduleDraftSave()
    })
  }
  if ($('stageBurstToggle')) {
    $('stageBurstToggle').addEventListener('change', () => {
      burstEffectSimOn = !!$('stageBurstToggle').checked
      scheduleDraftSave()
    })
  }
  if ($('stageSoundSelect')) {
    $('stageSoundSelect').addEventListener('change', () => {
      playStudioSound('press')
      scheduleDraftSave()
    })
  }
  ;['packSounds', 'customSoundLabel'].forEach((id) => {
    if ($(id)) $(id).addEventListener('change', () => { rebuildStageSoundSelect(); scheduleDraftSave() })
    if ($(id)) $(id).addEventListener('input', () => { rebuildStageSoundSelect(); scheduleDraftSave() })
  })
  document.addEventListener('pointerdown', (e) => {
    if (!stageMenuOpen) return
    const t = e.target
    if (t && t.closest && (t.closest('#stageMenu') || t.closest('#stageMenuBtn'))) return
    setStageMenuOpen(false)
  })
  window.addEventListener('resize', () => { if (stageMenuOpen) positionStageMenu() })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stageMenuOpen) setStageMenuOpen(false)
  })

  rebuildStageSoundSelect()
  syncStageMenuEmpty()
  renderBubbles(defaultBubbles)
  applyPreviewBubble()
  preview()
  scheduleLiveMods()
  restoreDraft()
    .catch(function () {})
    .then(function () { draftReady = true })
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      exportSkin()
    }
  })
  setTimeout(() => { const v = $('veil'); if (v) v.remove() }, 1100)
})()
