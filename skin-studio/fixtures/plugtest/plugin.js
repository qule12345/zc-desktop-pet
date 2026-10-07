ZC.register({
  onLoad: function (api) {
    var self = this
    self.api = api
    self.t = 0
    self.pressed = false
    self.hover = false
    self.flash = 0
    self.shake = 0
    self.mode = (api.store && api.store.get('mode')) || 'ring'
    self.presses = Number((api.store && api.store.get('presses')) || 0) || 0
    self.parts = []
    self.toast = 0
    self.toastText = ''

    api.css([
      '.pet-draw{mix-blend-mode:multiply}',
      '.zc-fx-toast{position:absolute;left:50%;top:14%;transform:translateX(-50%);',
      'padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;',
      'color:#fff;background:rgba(224,122,61,.92);box-shadow:0 6px 16px rgba(0,0,0,.18);',
      'pointer-events:none;z-index:20;opacity:0;transition:opacity .18s ease}',
      '.zc-fx-toast.on{opacity:1}'
    ].join(''))

    self.toastEl = document.createElement('div')
    self.toastEl.className = 'zc-fx-toast'
    self.toastEl.setAttribute('data-zc-mod', '1')
    ;(api.root || document.body).appendChild(self.toastEl)

    function showToast(text) {
      self.toastText = text
      self.toast = 1.6
      if (self.toastEl) {
        self.toastEl.textContent = text
        self.toastEl.classList.add('on')
      }
      if (api.bubble && api.bubble.hint) {
        api.bubble.hint.textContent = text
      }
    }

    function spawn(n, power) {
      var i
      for (i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2
        var sp = (0.35 + Math.random() * 0.9) * (power || 1)
        self.parts.push({
          x: 0,
          y: 0,
          vx: Math.cos(a) * sp * 120,
          vy: Math.sin(a) * sp * 120 - 40,
          life: 0.45 + Math.random() * 0.55,
          age: 0,
          r: 3 + Math.random() * 5,
          hue: self.mode === 'spark' ? (20 + Math.random() * 40) : (28 + Math.random() * 18)
        })
      }
    }

    function save() {
      if (!api.store) return
      api.store.set('presses', self.presses)
      api.store.set('mode', self.mode)
    }

    api.on('press', function () {
      self.pressed = true
      self.presses += 1
      spawn(10, 1)
      showToast('按下 ×' + self.presses)
      save()
    })
    api.on('release', function () {
      self.pressed = false
      showToast('抬起')
    })
    api.on('hoverenter', function () {
      self.hover = true
      showToast('悬浮中')
    })
    api.on('hoverleave', function () {
      self.hover = false
    })
    api.on('burst', function () {
      self.flash = 1
      self.shake = 0.55
      spawn(36, 1.8)
      showToast('连点彩蛋！')
    })
    api.on('menuopen', function () { showToast('菜单已打开') })
    api.on('menuclose', function () { showToast('菜单已关闭') })

    if (api.menu && api.menu.button) {
      api.menu.button('触发闪光', function () {
        self.flash = 1
        self.shake = 0.4
        spawn(24, 1.4)
        showToast('菜单：闪光')
      })
      api.menu.button('切换粒子模式', function () {
        self.mode = self.mode === 'ring' ? 'spark' : 'ring'
        save()
        showToast(self.mode === 'spark' ? '模式：火花' : '模式：光环')
      })
      api.menu.button('重置计数', function () {
        self.presses = 0
        save()
        showToast('计数已清零')
      })
    }

    showToast('插件已就绪 · 试按 / 悬浮 / 连点')
  },

  onTick: function (dt) {
    this.t += dt
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.6)
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.8)
    if (this.toast > 0) {
      this.toast = Math.max(0, this.toast - dt)
      if (this.toast === 0 && this.toastEl) this.toastEl.classList.remove('on')
    }
    var next = []
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i]
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 220 * dt
      if (p.age < p.life) next.push(p)
    }
    this.parts = next
  },

  drawPet: function (ctx) {
    var w = ctx.canvas.width
    var h = ctx.canvas.height
    var cx = w / 2
    var cy = h * 0.48
    var shake = this.shake > 0 ? (Math.random() - 0.5) * 14 * this.shake : 0
    var breath = Math.sin(this.t * 3) * 0.03
    var r = Math.min(w, h) * (0.4 + breath + (this.pressed ? -0.03 : 0) + (this.hover ? 0.02 : 0))

    ctx.save()
    ctx.translate(cx + shake, cy + shake * 0.6)

    if (this.hover) {
      ctx.beginPath()
      ctx.arc(0, 0, r + 26, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(224,122,61,' + (0.12 + Math.sin(this.t * 6) * 0.05) + ')'
      ctx.fill()
    }

    if (this.mode === 'ring') {
      ctx.strokeStyle = this.pressed ? '#c45c26' : (this.hover ? '#e07a3d' : '#9a6b3c')
      ctx.lineWidth = this.pressed ? 10 : 7
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      var spokes = 10
      ctx.strokeStyle = this.pressed ? '#ff7a3a' : '#e07a3d'
      ctx.lineWidth = 4
      for (var s = 0; s < spokes; s++) {
        var a = (s / spokes) * Math.PI * 2 + this.t * 1.4
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * (r * 0.55), Math.sin(a) * (r * 0.55))
        ctx.lineTo(Math.cos(a) * (r * 1.05), Math.sin(a) * (r * 1.05))
        ctx.stroke()
      }
    }

    if (this.flash > 0) {
      ctx.beginPath()
      ctx.arc(0, 0, r + 22, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,210,90,' + (this.flash * 0.5) + ')'
      ctx.fill()
    }

    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i]
      var k = 1 - p.age / p.life
      ctx.beginPath()
      ctx.fillStyle = 'hsla(' + p.hue + ',85%,' + (48 + k * 20) + '%,' + (0.15 + k * 0.75) + ')'
      ctx.arc(p.x, p.y, p.r * k, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = this.pressed ? '#5c3317' : '#7a4a22'
    ctx.font = '700 ' + Math.round(Math.min(w, h) * 0.075) + 'px Outfit, "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('×' + this.presses, 0, r + Math.min(w, h) * 0.12)

    ctx.restore()
  },

  onUnload: function () {
    if (this.toastEl && this.toastEl.parentNode) this.toastEl.parentNode.removeChild(this.toastEl)
  }
})
