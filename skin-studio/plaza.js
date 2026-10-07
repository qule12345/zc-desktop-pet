;(function () {
  const $ = (id) => document.getElementById(id)
  const skinGrid = $('skinGrid')
  const pluginGrid = $('pluginGrid')
  const dialog = $('uploadDialog')
  const form = $('uploadForm')
  const fileInput = $('fileInput')
  const coverField = $('coverField')
  const coverInput = $('coverInput')
  const formNote = $('formNote')
  const statusEl = $('uploadStatus')

  let me = null
  let catalog = { skins: [], plugins: [] }
  let categories = { skin: ['官方', '角色', '主题', '特效', '其他'], plugin: ['官方', '绘制', '交互', '工具', '其他'] }
  let activeTab = 'skins'
  let activeCat = ''
  let searchQ = ''

  function fmtSize(n) {
    if (!n) return ''
    if (n < 1024) return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1024 / 1024).toFixed(1) + ' MB'
  }

  function setStatus(el, msg, kind) {
    el.textContent = msg || ''
    el.className = 'status' + (kind ? ' ' + kind : '')
  }

  function kind() {
    const r = form.querySelector('input[name="kind"]:checked')
    return r ? r.value : 'skin'
  }

  function fillCategories(sel, list, selected) {
    sel.textContent = ''
    list.forEach((c) => {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      if (c === selected) o.selected = true
      sel.appendChild(o)
    })
  }

  function syncKindUI() {
    const k = kind()
    coverField.hidden = k !== 'plugin'
    fileInput.accept = k === 'skin' ? '.skin,application/zip' : '.js,.mjs,.zip,text/javascript,application/zip'
    fillCategories($('uploadCategory'), categories[k === 'plugin' ? 'plugin' : 'skin'], '其他')
    formNote.textContent = k === 'skin'
      ? '需登录。皮肤校验 zip 与 skin.json。普通用户提交后待审核。'
      : '需登录。插件不会在线运行。普通用户提交后待审核。'
  }

  form.querySelectorAll('input[name="kind"]').forEach((el) => {
    el.addEventListener('change', syncKindUI)
  })

  function renderCats() {
    const bar = $('catBar')
    bar.textContent = ''
    const list = activeTab === 'plugins' ? categories.plugin : categories.skin
    const all = document.createElement('button')
    all.type = 'button'
    all.className = 'plaza-chip' + (activeCat === '' ? ' on' : '')
    all.textContent = '全部'
    all.addEventListener('click', () => { activeCat = ''; renderCats(); loadCatalog() })
    bar.appendChild(all)
    list.forEach((c) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'plaza-chip' + (activeCat === c ? ' on' : '')
      b.textContent = c
      b.addEventListener('click', () => { activeCat = c; renderCats(); loadCatalog() })
      bar.appendChild(b)
    })
  }

  function showTab(tab) {
    activeTab = tab
    document.querySelectorAll('.plaza-tab').forEach((b) => {
      const on = b.dataset.tab === tab
      b.classList.toggle('on', on)
      b.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    $('panelSkins').hidden = tab !== 'skins'
    $('panelPlugins').hidden = tab !== 'plugins'
    $('panelReview').hidden = tab !== 'review'
    if (tab === 'review') loadQueue()
    else {
      activeCat = ''
      renderCats()
      loadCatalog()
    }
  }

  document.querySelectorAll('.plaza-tab').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab))
  })

  $('openUpload').addEventListener('click', () => {
    if (!me) {
      openDialog($('authDialog'))
      setStatus($('authStatus'), '上传请先登录', 'err')
      return
    }
    setStatus(statusEl, '')
    if (me.name) form.author.value = me.name
    syncKindUI()
    openDialog(dialog)
  })

  function openDialog(d) {
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '')
  }
  function closeDialog(d) {
    if (d.open && typeof d.close === 'function') d.close()
    else d.removeAttribute('open')
  }

  function card(item) {
    const el = document.createElement('article')
    el.className = 'plaza-card'
    const preview = document.createElement('div')
    preview.className = 'plaza-card-preview'
    const imgUrl = item.previewUrl || item.coverUrl
    if (imgUrl) {
      const img = document.createElement('img')
      img.alt = item.title + ' 预览'
      img.loading = 'lazy'
      img.src = imgUrl
      img.onerror = () => {
        img.remove()
        const ph = document.createElement('span')
        ph.className = 'ph'
        ph.textContent = item.kind === 'plugin' ? '插件' : '皮肤'
        preview.appendChild(ph)
      }
      preview.appendChild(img)
    } else {
      const ph = document.createElement('span')
      ph.className = 'ph'
      ph.textContent = item.kind === 'plugin' ? '插件' : '无预览'
      preview.appendChild(ph)
    }
    if (item.status && item.status !== 'published') {
      const badge = document.createElement('span')
      badge.className = 'plaza-badge ' + item.status
      badge.textContent = item.status === 'pending' ? '待审核' : '未通过'
      preview.appendChild(badge)
    }

    const body = document.createElement('div')
    body.className = 'plaza-card-body'
    const h = document.createElement('h3')
    h.textContent = item.title || item.id
    const meta = document.createElement('p')
    meta.className = 'plaza-meta'
    meta.textContent = [item.category, item.author || '匿名', fmtSize(item.size)].filter(Boolean).join(' · ')
    const desc = document.createElement('p')
    desc.className = 'plaza-desc'
    desc.textContent = item.description || '暂无简介'
    body.appendChild(h)
    body.appendChild(meta)
    body.appendChild(desc)
    if (item.flags && item.flags.length) {
      const flags = document.createElement('p')
      flags.className = 'plaza-flags'
      flags.textContent = item.flags.join('；')
      body.appendChild(flags)
    }

    const actions = document.createElement('div')
    actions.className = 'plaza-card-actions'
    if (item.status === 'published' || item.mine || (me && me.role === 'admin')) {
      const dl = document.createElement('a')
      dl.className = 'primary'
      dl.href = item.downloadUrl
      dl.textContent = '下载'
      dl.setAttribute('download', '')
      actions.appendChild(dl)
    }
    const tip = document.createElement('a')
    tip.href = './index.html'
    tip.textContent = item.kind === 'skin' ? '去工坊' : '工坊调试'
    actions.appendChild(tip)
    body.appendChild(actions)

    el.appendChild(preview)
    el.appendChild(body)
    return el
  }

  function render() {
    skinGrid.textContent = ''
    pluginGrid.textContent = ''
    catalog.skins.forEach((s) => skinGrid.appendChild(card(s)))
    catalog.plugins.forEach((p) => pluginGrid.appendChild(card(p)))
    $('skinEmpty').hidden = catalog.skins.length > 0
    $('pluginEmpty').hidden = catalog.plugins.length > 0
    if (!catalog.skins.length) $('skinEmpty').textContent = searchQ || activeCat ? '没有符合条件的皮肤。' : '还没有公开皮肤。'
    if (!catalog.plugins.length) $('pluginEmpty').textContent = searchQ || activeCat ? '没有符合条件的插件。' : '还没有公开插件。'
  }

  async function loadCatalog() {
    const params = new URLSearchParams()
    if (searchQ) params.set('q', searchQ)
    if (activeCat) params.set('category', activeCat)
    const qs = params.toString()
    try {
      const r = await fetch('/api/catalog' + (qs ? '?' + qs : ''), { credentials: 'same-origin' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || '加载失败')
      if (j.categories) categories = j.categories
      catalog = { skins: j.skins || [], plugins: j.plugins || [] }
      renderCats()
      render()
    } catch (err) {
      $('skinEmpty').hidden = false
      $('skinEmpty').textContent = '无法连接广场接口。请确认 Node 服务已启动。'
    }
  }

  async function loadMe() {
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin' })
      const j = await r.json()
      me = j.user || null
      if (j.categories) categories = j.categories
    } catch { me = null }
    $('openAuth').hidden = !!me
    $('openAccount').hidden = !me
    $('openAccount').textContent = me ? (me.role === 'admin' ? me.name + ' · 管理' : me.name) : '账号'
    $('reviewTab').hidden = !(me && me.role === 'admin')
    if (me) $('myToken').value = me.token || ''
    $('accountMeta').textContent = me ? ('已登录：' + me.name + (me.role === 'admin' ? '（管理员，上传即公开）' : '（上传需审核）')) : ''
  }

  async function loadQueue() {
    const box = $('reviewQueue')
    box.textContent = ''
    try {
      const r = await fetch('/api/admin/queue', { credentials: 'same-origin' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || '无法读取队列')
      const list = j.pending || []
      $('reviewEmpty').hidden = list.length > 0
      list.forEach((item) => {
        const row = card(item)
        const actions = row.querySelector('.plaza-card-actions')
        const ok = document.createElement('button')
        ok.type = 'button'
        ok.textContent = '通过'
        ok.className = 'primary'
        ok.style.flex = '1'
        ok.addEventListener('click', () => review(item, 'approve'))
        const no = document.createElement('button')
        no.type = 'button'
        no.textContent = '驳回'
        no.addEventListener('click', () => review(item, 'reject'))
        actions.appendChild(ok)
        actions.appendChild(no)
        box.appendChild(row)
      })
    } catch (err) {
      $('reviewEmpty').hidden = false
      $('reviewEmpty').textContent = String((err && err.message) || err)
    }
  }

  async function review(item, action) {
    const r = await fetch('/api/admin/review', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: item.kind, id: item.id, action }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) {
      $('reviewEmpty').hidden = false
      $('reviewEmpty').textContent = j.error || '操作失败'
      return
    }
    loadQueue()
    loadCatalog()
  }

  $('openAuth').addEventListener('click', () => {
    setStatus($('authStatus'), '')
    openDialog($('authDialog'))
  })
  $('openAccount').addEventListener('click', () => {
    setStatus($('accountStatus'), '')
    if (me) $('myToken').value = me.token || ''
    openDialog($('accountDialog'))
  })
  $('closeAuth').addEventListener('click', () => closeDialog($('authDialog')))
  $('closeAccount').addEventListener('click', () => closeDialog($('accountDialog')))
  $('closeUpload').addEventListener('click', () => closeDialog(dialog))
  $('cancelUpload').addEventListener('click', () => closeDialog(dialog))
  ;[$('authDialog'), $('accountDialog'), dialog].forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d) closeDialog(d)
    })
  })

  async function authPost(url) {
    const name = $('authForm').name.value.trim()
    const password = $('authForm').password.value
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) {
      setStatus($('authStatus'), j.error || '失败', 'err')
      return
    }
    await loadMe()
    setStatus($('authStatus'), '已登录', 'ok')
    closeDialog($('authDialog'))
    loadCatalog()
  }
  $('doLogin').addEventListener('click', () => authPost('/api/auth/login'))
  $('doRegister').addEventListener('click', () => authPost('/api/auth/register'))

  $('doLogout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    me = null
    await loadMe()
    closeDialog($('accountDialog'))
    if (activeTab === 'review') showTab('skins')
    loadCatalog()
  })

  $('copyToken').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('myToken').value)
      setStatus($('accountStatus'), '已复制', 'ok')
    } catch {
      $('myToken').select()
      setStatus($('accountStatus'), '请手动复制', 'err')
    }
  })
  $('rotateToken').addEventListener('click', async () => {
    const r = await fetch('/api/me/token', { method: 'POST', credentials: 'same-origin' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) {
      setStatus($('accountStatus'), j.error || '更换失败', 'err')
      return
    }
    me.token = j.token
    $('myToken').value = j.token
    setStatus($('accountStatus'), '令牌已更换，旧令牌失效', 'ok')
  })

  let searchTimer = 0
  $('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      searchQ = $('searchInput').value.trim()
      loadCatalog()
    }, 220)
  })

  $('submitUpload').addEventListener('click', async () => {
    if (!me) {
      setStatus(statusEl, '请先登录', 'err')
      return
    }
    setStatus(statusEl, '上传中…')
    const k = kind()
    const title = form.title.value.trim()
    if (!title) { setStatus(statusEl, '请填写标题', 'err'); return }
    if (!fileInput.files || !fileInput.files[0]) { setStatus(statusEl, '请选择文件', 'err'); return }
    const fd = new FormData()
    fd.append('title', title)
    fd.append('author', form.author.value.trim() || me.name)
    fd.append('description', form.description.value.trim())
    fd.append('category', $('uploadCategory').value)
    fd.append('file', fileInput.files[0])
    if (k === 'plugin' && coverInput.files && coverInput.files[0]) {
      fd.append('cover', coverInput.files[0])
    }
    try {
      const r = await fetch(k === 'skin' ? '/api/upload/skin' : '/api/upload/plugin', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 401) {
        setStatus(statusEl, '请先登录', 'err')
        openDialog($('authDialog'))
        return
      }
      if (!r.ok || !j.ok) {
        setStatus(statusEl, j.error || ('上传失败 ' + r.status), 'err')
        return
      }
      setStatus(statusEl, j.notice || '上传成功', 'ok')
      form.reset()
      syncKindUI()
      await loadCatalog()
      setTimeout(() => { if (dialog.open) dialog.close() }, 800)
      showTab(k === 'plugin' ? 'plugins' : 'skins')
    } catch (err) {
      setStatus(statusEl, '网络错误：' + String((err && err.message) || err), 'err')
    }
  })

  syncKindUI()
  loadMe().then(() => {
    renderCats()
    loadCatalog()
  })
})()
