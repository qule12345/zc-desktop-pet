'use strict'

;(function () {
  var API = window.whaleAPI
  if (!API) {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">whaleAPI 不可用</p>'
    return
  }

  var state = {
    list: [],
    activeId: null,
    editingId: null,
    balances: {},
    models: {},
    modelsOpen: {},
  }

  var listEl = document.getElementById('list')
  var listCount = document.getElementById('listCount')
  var formTitle = document.getElementById('formTitle')
  var formMeta = document.getElementById('formMeta')
  var formHint = document.getElementById('formHint')
  var nameInput = document.getElementById('name')
  var noteInput = document.getElementById('note')
  var keyInput = document.getElementById('key')
  var urlInput = document.getElementById('url')
  var saveBtn = document.getElementById('save')
  var saveUseBtn = document.getElementById('saveUse')
  var resetBtn = document.getElementById('reset')
  var addNewBtn = document.getElementById('addNew')
  var refreshAllBtn = document.getElementById('refreshAll')
  var copyCandyBtn = document.getElementById('copyCandy')
  var copyPelicanBtn = document.getElementById('copyPelican')
  var toastEl = document.getElementById('toast')
  var toastTimer = null

  // 社区常用测智提示词（糖果：组合保证；鹈鹕：Simon Willison SVG 基准的中文常用版）
  var PROMPT_CANDY =
    '在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）\n' +
    '苹果味 桃子味 西瓜味\n' +
    '圆形 7 9 8\n' +
    '五角星形 7 6 4'
  var PROMPT_PELICAN =
    '创建一个HTML，内容是SVG绘制一个鹈鹕骑自行车的2D动画'

  function toast(msg) {
    toastEl.textContent = msg || ''
    toastEl.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { toastEl.classList.remove('show') }, 1600)
  }

  function setHint(text, kind) {
    formHint.textContent = text || ''
    formHint.className = 'hint' + (kind ? ' ' + kind : '')
  }

  function fillForm(p) {
    state.editingId = p ? p.id : null
    nameInput.value = p ? (p.name || '') : ''
    noteInput.value = p ? (p.note || '') : ''
    urlInput.value = p && p.callbackUrl ? p.callbackUrl : ''
    keyInput.value = ''
    keyInput.placeholder = p && p.hasApiKey
      ? ('已配置 ' + (p.keyHint || '') + '（填写则覆盖）')
      : 'sk-... / 任意 Key'
    formTitle.textContent = p ? '编辑 Key' : '添加 Key'
    formMeta.textContent = p ? ('修改：' + (p.name || p.id)) : '填写后点「添加」写入列表'
    saveBtn.textContent = p ? '保存修改' : '添加'
    saveUseBtn.textContent = p ? '保存并选用' : '添加并选用'
    setHint(p ? '当前是编辑模式：保存会改这条，不会新增' : '当前是新增模式：保存会多一条', '')
  }

  function fmtBalance(r) {
    if (!r) return { text: '—', kind: 'muted' }
    if (r.loading) return { text: '查询中…', kind: 'muted' }
    if (!r.ok) return { text: r.error ? String(r.error).slice(0, 28) : '失败', kind: 'err' }
    if (r.unlimited) return { text: '不限', kind: 'ok' }
    var n = Number(r.totalBalance)
    var cur = r.currency || ''
    if (!isFinite(n)) return { text: '—', kind: 'muted' }
    var prefix = cur === 'USD' ? '$' : cur === 'CNY' ? '¥' : (cur ? cur + ' ' : '')
    return { text: prefix + (Math.round(n * 10000) / 10000), kind: 'ok' }
  }

  function applyPayload(r) {
    if (!r || !r.ok) {
      listEl.innerHTML = '<div class="empty">加载失败</div>'
      listCount.textContent = '错误'
      return
    }
    state.list = Array.isArray(r.providers) ? r.providers : []
    state.activeId = r.activeProviderId || null
    render()
  }

  function load() {
    return API.listProviders().then(applyPayload).catch(function (err) {
      listEl.innerHTML = '<div class="empty">加载失败：' + String((err && err.message) || err) + '</div>'
      listCount.textContent = '错误'
    })
  }

  function btn(label, cls) {
    var el = document.createElement('button')
    el.type = 'button'
    el.className = 'btn-sm' + (cls ? ' ' + cls : '')
    el.textContent = label
    return el
  }

  function copyField(id, field, label) {
    return API.copyProviderField(id, field).then(function (r) {
      if (r && r.ok) toast('已复制' + (label || ''))
      else toast((r && r.error) || '复制失败')
    }).catch(function () { toast('复制失败') })
  }

  function copyText(text, label) {
    var t = String(text || '')
    if (!t) { toast('无内容可复制'); return Promise.resolve() }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () {
        toast('已复制' + (label || ''))
      }).catch(function () { toast('复制失败') })
    }
    toast('复制失败')
    return Promise.resolve()
  }

  function refreshBalance(id) {
    state.balances[id] = { loading: true }
    render()
    return API.probeProviderBalance(id).then(function (r) {
      state.balances[id] = r || { ok: false, error: '无结果' }
      render()
      return r
    }).catch(function (err) {
      state.balances[id] = { ok: false, error: String((err && err.message) || err) }
      render()
    })
  }

  function refreshAllBalances() {
    refreshAllBtn.disabled = true
    var jobs = state.list.map(function (p) { return refreshBalance(p.id) })
    Promise.all(jobs).finally(function () {
      refreshAllBtn.disabled = false
      toast('余额已刷新')
    })
  }

  function loadModels(id) {
    state.modelsOpen[id] = true
    state.models[id] = { loading: true }
    render()
    return API.listProviderModels(id).then(function (r) {
      state.models[id] = r || { ok: false, error: '无结果' }
      render()
    }).catch(function (err) {
      state.models[id] = { ok: false, error: String((err && err.message) || err) }
      render()
    })
  }

  function renderModelsBlock(p) {
    if (!state.modelsOpen[p.id]) return null
    var box = document.createElement('div')
    box.className = 'models'
    var hd = document.createElement('div')
    hd.className = 'models-hd'
    var info = document.createElement('span')
    var closeBtn = btn('收起')
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      state.modelsOpen[p.id] = false
      render()
    })
    hd.appendChild(info)
    hd.appendChild(closeBtn)
    box.appendChild(hd)

    var m = state.models[p.id]
    if (!m || m.loading) {
      info.textContent = '正在拉取模型列表…'
      return box
    }
    if (!m.ok) {
      info.textContent = m.error || '获取失败'
      var retry = btn('重试')
      retry.addEventListener('click', function (e) {
        e.stopPropagation()
        loadModels(p.id)
      })
      hd.appendChild(retry)
      return box
    }
    info.textContent = '支持 ' + (m.count || (m.models || []).length) + ' 个模型（点击复制）'
    var chips = document.createElement('div')
    chips.className = 'model-chips'
    ;(m.models || []).forEach(function (name) {
      var chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip'
      chip.title = '点击复制：' + name
      chip.textContent = name
      chip.addEventListener('click', function (e) {
        e.stopPropagation()
        copyText(name, '模型名')
      })
      chips.appendChild(chip)
    })
    box.appendChild(chips)
    return box
  }

  function render() {
    listEl.textContent = ''
    listCount.textContent = state.list.length + ' 条'
    if (!state.list.length) {
      var empty = document.createElement('div')
      empty.className = 'empty'
      empty.textContent = '还没有 Key。右侧添加一条，或点上方「添加 Key」。'
      listEl.appendChild(empty)
      return
    }

    state.list.forEach(function (p) {
      var card = document.createElement('div')
      card.className = 'card'
        + (p.active ? ' active' : '')
        + (state.editingId === p.id ? ' selected' : '')

      var top = document.createElement('div')
      top.className = 'card-top'

      var titleWrap = document.createElement('div')
      titleWrap.className = 'title-wrap'
      var nameRow = document.createElement('div')
      nameRow.className = 'name-row'
      var dot = document.createElement('span')
      dot.className = 'dot'
      var name = document.createElement('div')
      name.className = 'name'
      name.textContent = p.name || '未命名'
      nameRow.appendChild(dot)
      nameRow.appendChild(name)
      if (p.active) {
        var badge = document.createElement('span')
        badge.className = 'badge'
        badge.textContent = '使用中'
        nameRow.appendChild(badge)
      }
      titleWrap.appendChild(nameRow)
      var note = document.createElement('div')
      note.className = 'note'
      note.textContent = p.note ? ('备注：' + p.note) : '备注：—'
      titleWrap.appendChild(note)

      var bal = document.createElement('div')
      bal.className = 'balance'
      var balFmt = fmtBalance(state.balances[p.id])
      var balVal = document.createElement('div')
      balVal.className = 'balance-val ' + balFmt.kind
      balVal.textContent = balFmt.text
      var balLab = document.createElement('div')
      balLab.className = 'balance-lab'
      balLab.textContent = '余额'
      bal.appendChild(balVal)
      bal.appendChild(balLab)

      top.appendChild(titleWrap)
      top.appendChild(bal)

      var meta = document.createElement('div')
      meta.className = 'meta-grid'
      ;[
        ['站点', p.host || '—'],
        ['端点', p.siteLabel || p.callbackUrl || '官方'],
        ['Key', p.hasApiKey ? (p.keyHint || '已配置') : '未配置'],
      ].forEach(function (pair) {
        var k = document.createElement('div')
        k.className = 'k'
        k.textContent = pair[0]
        var v = document.createElement('div')
        v.className = 'v'
        v.title = pair[1]
        v.textContent = pair[1]
        meta.appendChild(k)
        meta.appendChild(v)
      })

      var acts = document.createElement('div')
      acts.className = 'acts'

      if (!p.active) {
        var useBtn = btn('选用', 'primary')
        useBtn.title = '设为桌宠当前使用的 Key'
        useBtn.addEventListener('click', function (e) {
          e.stopPropagation()
          useBtn.disabled = true
          API.activateProvider(p.id).then(function (r) {
            applyPayload(r)
            if (r && r.ok) {
              fillForm(p)
              toast('已选用「' + (p.name || '') + '」')
            } else toast((r && r.error) || '选用失败')
          }).catch(function () { toast('选用失败') })
        })
        acts.appendChild(useBtn)
      } else {
        var cur = btn('当前使用')
        cur.disabled = true
        acts.appendChild(cur)
      }

      var copyKeyBtn = btn('复制 Key')
      copyKeyBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        copyField(p.id, 'apiKey', ' Key')
      })
      var copySiteBtn = btn('复制端点')
      copySiteBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        copyField(p.id, 'callbackUrl', '端点')
      })
      var balBtn = btn('刷新余额')
      balBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        refreshBalance(p.id)
      })
      var modelBtn = btn('模型列表')
      modelBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        if (state.modelsOpen[p.id] && state.models[p.id] && !state.models[p.id].loading) {
          state.modelsOpen[p.id] = false
          render()
          return
        }
        loadModels(p.id)
      })
      var editBtn = btn('编辑')
      editBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        fillForm(p)
        render()
      })
      var delBtn = btn('删除', 'danger')
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        if (!confirm('删除「' + (p.name || '未命名') + '」？')) return
        API.deleteProvider(p.id).then(function (r) {
          applyPayload(r)
          if (state.editingId === p.id) fillForm(null)
          toast('已删除')
        }).catch(function () { toast('删除失败') })
      })

      acts.appendChild(copyKeyBtn)
      acts.appendChild(copySiteBtn)
      acts.appendChild(balBtn)
      acts.appendChild(modelBtn)
      acts.appendChild(editBtn)
      acts.appendChild(delBtn)

      card.appendChild(top)
      card.appendChild(meta)
      card.appendChild(acts)
      var modelsBlock = renderModelsBlock(p)
      if (modelsBlock) card.appendChild(modelsBlock)
      card.addEventListener('click', function () {
        fillForm(p)
        render()
      })
      listEl.appendChild(card)
    })
  }

  function save(activate) {
    var name = nameInput.value.trim()
    var note = noteInput.value.trim()
    var key = keyInput.value.trim()
    var url = urlInput.value.trim()
    var isNew = !state.editingId
    if (isNew && !name) {
      setHint('请填写名称', 'err')
      nameInput.focus()
      return
    }
    if (isNew && !key) {
      setHint('新建需要填写 Key', 'err')
      keyInput.focus()
      return
    }
    saveBtn.disabled = true
    saveUseBtn.disabled = true
    setHint(isNew ? '添加中…' : '保存中…', '')
    var payload = {
      name: name || undefined,
      note: note,
      callbackUrl: url,
      activate: !!activate,
    }
    // 只有明确处于编辑模式才带 id；否则一律新建
    if (!isNew) payload.id = state.editingId
    if (key) payload.apiKey = key
    API.upsertProvider(payload).then(function (r) {
      saveBtn.disabled = false
      saveUseBtn.disabled = false
      if (r && r.ok) {
        applyPayload(r)
        keyInput.value = ''
        if (isNew) {
          // 新增成功后回到空白表单，方便连续添加
          fillForm(null)
          setHint(activate ? '已添加并选用，可继续添加下一条' : '已添加，可继续添加下一条', 'ok')
          toast(activate ? '已添加并选用' : '已添加')
        } else {
          var cur = r.provider || null
          fillForm(cur)
          setHint(activate ? '已保存并选用' : '已保存修改', 'ok')
          toast(activate ? '已保存并选用' : '已保存修改')
        }
        if (r.provider && r.provider.id) refreshBalance(r.provider.id)
        render()
      } else {
        setHint((r && r.error) || '保存失败', 'err')
      }
    }).catch(function () {
      saveBtn.disabled = false
      saveUseBtn.disabled = false
      setHint('保存失败', 'err')
    })
  }

  saveBtn.addEventListener('click', function () { save(false) })
  saveUseBtn.addEventListener('click', function () { save(true) })
  resetBtn.addEventListener('click', function () {
    fillForm(null)
    render()
    nameInput.focus()
  })
  addNewBtn.addEventListener('click', function () {
    fillForm(null)
    render()
    nameInput.focus()
  })
  refreshAllBtn.addEventListener('click', refreshAllBalances)
  if (copyCandyBtn) {
    copyCandyBtn.addEventListener('click', function () {
      copyText(PROMPT_CANDY, '糖果测试').then(function () {
        toast('已复制糖果测试 · 参考答案 21')
      })
    })
  }
  if (copyPelicanBtn) {
    copyPelicanBtn.addEventListener('click', function () {
      copyText(PROMPT_PELICAN, '鹈鹕测试')
    })
  }

  if (API.onProvidersChanged) {
    API.onProvidersChanged(function () {
      var keepEdit = state.editingId
      load().then(function () {
        if (keepEdit) {
          var still = state.list.find(function (p) { return p && p.id === keepEdit })
          fillForm(still || null)
        } else {
          fillForm(null)
        }
        render()
      })
    })
  }

  // 默认进入「新增」模式，避免一打开就编辑现有 Key 造成覆盖
  fillForm(null)
  load().then(function () {
    fillForm(null)
    render()
    state.list.forEach(function (p) { refreshBalance(p.id) })
  })
})()
