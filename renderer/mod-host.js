;(function (global) {
  var hooks = {}
  var mods = []
  var loaded = []
  var tickId = 0
  var lastT = 0
  var host = null
  var paused = false

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
    if (!host) return
    try {
      document.querySelectorAll('[data-zc-mod]').forEach(function (el) { el.remove() })
    } catch (err) {}
  }

  function unload() {
    emit('unload')
    mods.forEach(function (m) {
      if (m && typeof m.onUnload === 'function') {
        try { m.onUnload(host) } catch (err) { reportErr('onUnload', err) }
      }
    })
    sweepOwned()
    mods = []
    hooks = {}
    loaded.forEach(function (el) { try { el.remove() } catch (err) {} })
    loaded = []
    stopTick()
    host = null
    paused = false
  }

  function loadUrl(url, tag, rel) {
    return new Promise(function (resolve) {
      var el = document.createElement(tag)
      if (tag === 'link') { el.rel = rel || 'stylesheet'; el.href = url }
      else el.src = url
      el.setAttribute('data-zc-mod', '1')
      el.onload = function () { resolve(true) }
      el.onerror = function () {
        reportErr('load', '资源加载失败')
        resolve(false)
      }
      document.head.appendChild(el)
      loaded.push(el)
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
      if (canvas && hasDraw()) {
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

  function attach(api) {
    host = api || {}
    host.on = on
    host.off = off
    host.emit = emit
    host.register = register
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
    global.ZC = global.PetMod = { register: register, on: on, off: off, emit: emit }
    attach(api)
    var styles = (skin && skin.styles) || []
    var i
    for (i = 0; i < styles.length; i++) loadUrl(styles[i].url || styles[i], 'link')
    var list = (skin && skin.plugins) || []
    var chain = Promise.resolve()
    list.forEach(function (item) {
      var url = item && (item.url || item)
      if (!url) return
      chain = chain.then(function () { return loadUrl(url, 'script') })
    })
    return chain.then(function () { emit('ready') })
  }

  global.__zcModHost = {
    loadSkinMods: loadSkinMods,
    unload: unload,
    emit: emit,
    on: on,
    off: off,
    register: register,
  }
})(window)
