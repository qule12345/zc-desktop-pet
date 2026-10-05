;(function (global) {
  var hooks = {}
  var mods = []
  var loaded = []
  var tickId = 0
  var lastT = 0
  var host = null
  var paused = false
  // 切换皮肤时作废尚未执行完的插件加载，防止旧皮肤插件挂到新皮肤并叠加
  var loadSeq = 0

  function reportErr(where, err) {
    var msg = String((err && err.message) || err || 'unknown')
    try {
      if (typeof global.__zcOnModError === 'function') global.__zcOnModError(msg, where)
    } catch (_) {}
  }

  function on(name, fn) {
    if (typeof fn !== 'function') return function () {}
    if (!hooks[name]) hooks[name] = []
    hooks[name].push(fn)
    return function () { off(name, fn) }
  }
  function off(name, fn) {
    hooks[name] = (hooks[name] || []).filter(function (f) { return f !== fn })
  }
  function emit(name, payload) {
    var list = (hooks[name] || []).slice()
    var result = payload
    for (var i = 0; i < list.length; i++) {
      try {
        var r = list[i](result, host)
        if (r !== undefined) result = r
      } catch (err) { reportErr(name, err) }
    }
    // tick / draw 由 rAF 循环按正确参数调用；这里再调 onTick 会把 dt 传成 {t,dt} 对象，弄坏 flash 等状态
    if (name === 'tick') return result
    mods.forEach(function (m) {
      var fn = m && (m[name] || m['on' + name.charAt(0).toUpperCase() + name.slice(1)])
      if (typeof fn === 'function') {
        try { fn.call(m, result, host) } catch (err) { reportErr(name, err) }
      }
    })
    return result
  }

  function register(mod) {
    if (typeof mod === 'function') mod = { onLoad: mod }
    if (!mod || typeof mod !== 'object') return
    mods.push(mod)
    if (host && typeof mod.onLoad === 'function') {
      try { mod.onLoad(host) } catch (err) { reportErr('onLoad', err) }
    }
  }

  function stopTick() {
    if (tickId) { cancelAnimationFrame(tickId); tickId = 0 }
  }

  function sweepOwned() {
    try {
      document.querySelectorAll('[data-zc-mod]').forEach(function (el) { el.remove() })
    } catch (err) {}
  }

  function clearPetCanvas() {
    if (!host || !host.canvas) return
    try {
      var c = host.canvas
      var ctx = c.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, c.width, c.height)
      c.style.display = 'none'
    } catch (err) {}
  }

  function unload() {
    loadSeq += 1
    emit('unload')
    mods.forEach(function (m) {
      if (m && typeof m.onUnload === 'function') {
        try { m.onUnload(host) } catch (err) { reportErr('onUnload', err) }
      }
    })
    sweepOwned()
    clearPetCanvas()
    mods = []
    hooks = {}
    loaded.forEach(function (el) { try { el.remove() } catch (err) {} })
    loaded = []
    stopTick()
    host = null
    paused = false
    try { global.ZC = global.PetMod = { register: function () {}, on: on, off: off, emit: emit } } catch (err) {}
  }

  function loadStyleUrl(url) {
    return new Promise(function (resolve) {
      var el = document.createElement('link')
      el.rel = 'stylesheet'
      el.href = url
      el.setAttribute('data-zc-mod', '1')
      el.onload = function () { resolve(true) }
      el.onerror = function () {
        reportErr('load', '样式加载失败')
        resolve(false)
      }
      document.head.appendChild(el)
      loaded.push(el)
    })
  }

  function makeZcApi(seq) {
    return {
      register: function (mod) {
        if (seq !== loadSeq) return
        register(mod)
      },
      on: on,
      off: off,
      emit: emit,
    }
  }

  function apiFor(seq) {
    return makeZcApi(seq)
  }

  // fetch 源码后用 blob 脚本执行（CSP 允许 blob:，不允许 eval）
  // 用本次 seq 包一层 ZC，迟到的脚本 register 会被丢弃
  function loadPluginScript(url, seq) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.text()
    }).then(function (code) {
      if (seq !== loadSeq) return false
      var zcApi = makeZcApi(seq)
      global.ZC = global.PetMod = zcApi
      var wrapped = '(function(){var ZC=window.__zcModHost.apiFor(' + seq + ');var PetMod=ZC;\n'
        + String(code)
        + '\n})();\n//# sourceURL=' + String(url || 'plugin.js').replace(/\\/g, '/')
      return new Promise(function (resolve) {
        if (seq !== loadSeq) { resolve(false); return }
        var blob = new Blob([wrapped], { type: 'text/javascript' })
        var blobUrl = URL.createObjectURL(blob)
        var el = document.createElement('script')
        el.src = blobUrl
        el.setAttribute('data-zc-mod', '1')
        el.onload = function () {
          try { URL.revokeObjectURL(blobUrl) } catch (err) {}
          resolve(seq === loadSeq)
        }
        el.onerror = function () {
          try { URL.revokeObjectURL(blobUrl) } catch (err) {}
          reportErr('load', '插件执行失败')
          resolve(false)
        }
        document.head.appendChild(el)
        loaded.push(el)
      })
    }).catch(function (err) {
      reportErr('load', err && err.message ? err.message : '插件加载失败')
      return false
    })
  }

  function hasDraw() {
    for (var i = 0; i < mods.length; i++) {
      if (mods[i] && typeof mods[i].drawPet === 'function') return true
    }
    return false
  }

  function startTick() {
    stopTick()
    lastT = (global.performance && performance.now()) || Date.now()
    function loop(t) {
      tickId = requestAnimationFrame(loop)
      if (paused || (global.document && document.hidden)) return
      var now = t || ((global.performance && performance.now()) || Date.now())
      var dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      emit('tick', { t: now, dt: dt })
      if (!host) return
      var canvas = host.canvas
      if (canvas) {
        if (hasDraw()) {
          try {
            canvas.style.display = 'block'
            var ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height)
              mods.forEach(function (m) {
                if (m && typeof m.drawPet === 'function') {
                  try { m.drawPet(ctx, host) } catch (err) { reportErr('drawPet', err) }
                }
              })
            }
          } catch (err) { reportErr('draw', err) }
        } else if (canvas.style.display !== 'none') {
          try {
            var ctx2 = canvas.getContext('2d')
            if (ctx2) ctx2.clearRect(0, 0, canvas.width, canvas.height)
            canvas.style.display = 'none'
          } catch (err) {}
        }
      }
      mods.forEach(function (m) {
        if (m && typeof m.onTick === 'function') {
          try { m.onTick(dt, host) } catch (err) { reportErr('onTick', err) }
        }
        if (m && typeof m.drawBubble === 'function' && host.bubble && host.bubble.art) {
          try { m.drawBubble(host.bubble.art, host) } catch (err) { reportErr('drawBubble', err) }
        }
      })
    }
    tickId = requestAnimationFrame(loop)
  }

  function attach(api, seq) {
    host = api || {}
    host.on = on
    host.off = off
    host.emit = emit
    host.register = function (mod) {
      if (seq !== loadSeq) return
      register(mod)
    }
    host.pause = function (v) { paused = v !== false }
    host.version = host.version || 1
    startTick()
    emit('load')
    mods.forEach(function (m) {
      if (m && typeof m.onLoad === 'function') {
        try { m.onLoad(host) } catch (err) { reportErr('onLoad', err) }
      }
    })
  }

  function loadSkinMods(skin, api) {
    unload()
    var seq = loadSeq
    var zcApi = makeZcApi(seq)
    global.ZC = global.PetMod = zcApi
    attach(api, seq)
    if (seq !== loadSeq) return Promise.resolve()
    var styles = (skin && skin.styles) || []
    var i
    for (i = 0; i < styles.length; i++) {
      var styleUrl = styles[i] && (styles[i].url || styles[i])
      if (styleUrl) loadStyleUrl(styleUrl)
    }
    var list = (skin && skin.plugins) || []
    var chain = Promise.resolve()
    list.forEach(function (item) {
      var url = item && (item.url || item)
      if (!url) return
      chain = chain.then(function () {
        if (seq !== loadSeq) return false
        return loadPluginScript(url, seq)
      })
    })
    return chain.then(function () {
      if (seq !== loadSeq) return
      emit('ready')
    })
  }

  global.__zcModHost = {
    loadSkinMods: loadSkinMods,
    unload: unload,
    emit: emit,
    on: on,
    off: off,
    register: function (mod) { register(mod) },
    apiFor: apiFor,
    modCount: function () { return mods.length },
  }
})(window)
