(function () {
if (window.__dshWhaleWidget) return
window.__dshWhaleWidget = true
// 桌面版：渲染层只能通过 preload 暴露的 window.whaleAPI 与主进程通信
if (!window.whaleAPI) return
var API = window.whaleAPI
function modEmit(name, payload) {
  try {
    if (window.__zcModHost && window.__zcModHost.emit) return window.__zcModHost.emit(name, payload)
  } catch (err) {}
  return payload
}

var MIN_SCALE = 0.6
var MAX_SCALE = 2.5
var STEP = 0.1
var CLICK_SQ = 9
var REFRESH_MS = 60000
var CHANGE_MS = 900
var ANIM_MS = 700
var BUBBLE_MS = 5000
var FETCH_TIMEOUT_MS = 25000
var SKINS = {}
var skinId = 'gpt'
var IMG_URL = ''
var GIF_URL = './assets/rua.gif'
var DEFAULT_SKIN_ID = 'gpt'

var css = [
  // 桌面版：挂件尺寸只随 scale 变化（不依赖窗口视口），避免 Windows 透明窗口
  // 移动时尺寸微抖导致挂件抽搐/放大；1.5 倍 = 280px
  '.dshwv-root{position:fixed;right:0;bottom:0;--dshw-scale:1;--dshw-base:clamp(150px,calc(186.667px * var(--dshw-scale)),540px);--dshw-stroke:#203170;--dshw-text:#536ba9;--dshw-hint:#9fb0d9;--dshw-accent:#203170;--dshw-accent-rgb:32,49,112;width:var(--dshw-base);height:var(--dshw-base);pointer-events:none;user-select:none;-webkit-user-select:none;z-index:9999;font-family:inherit;transition:left .16s ease,top .16s ease,transform .3s ease}',
  '.dshwv-root.dshwv-left{transform:scaleX(-1)}',
  '.dshwv-root.dshwv-dragging{cursor:grabbing;transition:none}',
  '.dshwv-body{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}',
  '.dshwv-body.dshwv-shake{animation:dshwv-shake .55s linear}',
  '@keyframes dshwv-shake{0%,100%{transform:translate(0,0)}8%{transform:translate(-7px,4px)}16%{transform:translate(8px,-3px)}24%{transform:translate(-6px,-5px)}32%{transform:translate(7px,3px)}40%{transform:translate(-4px,6px)}48%{transform:translate(6px,-4px)}56%{transform:translate(-7px,2px)}64%{transform:translate(5px,5px)}72%{transform:translate(-3px,-6px)}80%{transform:translate(4px,3px)}88%{transform:translate(-5px,-2px)}}',
  '.dshwv-img{position:absolute;right:0;bottom:0;width:59.45%;height:59.45%;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none}',
  '.dshwv-pet-canvas{position:absolute;right:0;bottom:0;width:59.45%;height:59.45%;display:none;pointer-events:none}',
  '.dshwv-bubble{position:absolute;left:0;top:0;width:100%;aspect-ratio:1026/700;pointer-events:none;z-index:1;--dshw-u:calc(var(--dshw-base) / 1026)}',
  '.dshwv-bubble-art{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
  '.dshwv-bubble-art svg,.dshwv-bubble svg{display:block;width:100%;height:100%;pointer-events:none}',
  '.dshwv-bubble svg path,.dshwv-bubble svg ellipse{pointer-events:none;cursor:pointer;stroke:var(--dshw-stroke)}',
  '.dshwv-bubble.dshwv-bubble-open svg path,.dshwv-bubble.dshwv-bubble-open svg ellipse{pointer-events:visiblePainted}',
  '.dshwv-bubble .dshwv-bshape,.dshwv-bubble .dshwv-b1,.dshwv-bubble .dshwv-b2{opacity:0;transform:scale(.7);transform-box:fill-box;transform-origin:50% 50%;transition:opacity .2s ease,transform .2s ease}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-bshape,.dshwv-bubble.dshwv-bubble-open .dshwv-b1,.dshwv-bubble.dshwv-bubble-open .dshwv-b2{opacity:1;transform:none}',
  '.dshwv-gif{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);max-width:calc(var(--dshw-u) * 560);max-height:calc(var(--dshw-u) * 400);display:none;opacity:0;transition:opacity .2s ease;pointer-events:none;-webkit-user-drag:none;user-select:none;object-fit:contain}',
  '.dshwv-root.dshwv-left .dshwv-gif{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-gif{opacity:1}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-b2{transition-delay:0s}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-b1{transition-delay:.13s}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-bshape{transition-delay:.26s}',
  '.dshwv-bubble .dshwv-bshape{transition-delay:.1s}',
  '.dshwv-bubble .dshwv-b1{transition-delay:.2s}',
  '.dshwv-bubble .dshwv-b2{transition-delay:.3s}',
  '.dshwv-text{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);text-align:center;color:var(--dshw-text);line-height:1.15;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .16s ease,transform .3s ease,color .2s ease}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-text{opacity:1;transition:opacity .16s ease .36s,transform .3s ease,color .2s ease}',
  '.dshwv-root.dshwv-left .dshwv-text{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-label{font-size:calc(var(--dshw-u) * 66);font-weight:600;letter-spacing:.06em}',
  '.dshwv-amount{font-size:calc(var(--dshw-u) * 128);font-weight:800;line-height:1.05}',
  '.dshwv-period{font-size:calc(var(--dshw-u) * 104);font-weight:800;line-height:1.05}',
  '.dshwv-wrap{white-space:normal;max-width:calc(var(--dshw-u) * 560);line-height:1.2}',
  '.dshwv-hint{font-size:calc(var(--dshw-u) * 56);color:var(--dshw-hint);letter-spacing:.02em;margin-top:calc(var(--dshw-u) * 9);min-height:calc(var(--dshw-u) * 64);line-height:1.15}',
  '.dshwv-menu-btn{position:absolute;top:calc(40.55% + 4px);right:4px;width:28px;height:28px;border:none;border-radius:8px;background:rgba(var(--dshw-accent-rgb),.88);cursor:pointer;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3.5px;padding:0;z-index:2;opacity:0;box-shadow:0 2px 8px rgba(0,0,0,.18);transition:opacity .15s ease,background .2s ease,transform .15s ease}',
  '.dshwv-menu-btn.dshwv-menu-btn-visible{opacity:1}',
  '.dshwv-menu-btn span{display:block;width:13px;height:2px;background:#fff;border-radius:1px}',
  '.dshwv-menu-btn:hover{background:var(--dshw-accent);transform:scale(1.05)}',
  '.dshwv-menu{position:fixed;width:248px;max-height:min(70vh,520px);overflow-x:hidden;overflow-y:auto;background:rgba(255,255,255,.96);border:1px solid rgba(var(--dshw-accent-rgb),.22);border-radius:14px;padding:12px 12px 10px;opacity:0;transform:scale(.94) translateY(-6px);transform-origin:top right;transition:opacity .18s ease,transform .22s cubic-bezier(.34,1.56,.64,1),width .18s ease,max-height .18s ease,padding .18s ease;pointer-events:none;z-index:10000;box-shadow:0 10px 28px rgba(0,0,0,.16),0 2px 6px rgba(0,0,0,.06);color-scheme:light;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}',
  '.dshwv-menu.dshwv-menu-open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto}',
  '.dshwv-menu.dshwv-menu-keys{width:min(400px,calc(100vw - 16px));max-height:min(78vh,620px);padding:12px;overflow:hidden;display:flex;flex-direction:column}',
  '.dshwv-menu-page{display:none}',
  '.dshwv-menu-page.dshwv-menu-page-on{display:block}',
  '.dshwv-menu.dshwv-menu-keys .dshwv-menu-page-on{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;max-height:100%;overflow:hidden}',
  '.dshwv-menu-head{display:flex;align-items:center;gap:8px;margin:0 0 6px;flex:0 0 auto}',
  '.dshwv-menu-back{border:1px solid rgba(var(--dshw-accent-rgb),.28);border-radius:8px;background:rgba(var(--dshw-accent-rgb),.08);color:var(--dshw-accent);font-size:14px;font-weight:700;width:28px;height:28px;padding:0;cursor:pointer;flex:0 0 auto;line-height:1}',
  '.dshwv-menu-back:hover{background:rgba(var(--dshw-accent-rgb),.16)}',
  '.dshwv-menu-head .dshwv-menu-title{margin:0;flex:1}',
  '.dshwv-menu-title{font-size:13px;font-weight:700;color:var(--dshw-accent);letter-spacing:.02em;margin:0 2px 8px;line-height:1.2}',
  '.dshwv-menu-section{font-size:10px;font-weight:600;color:var(--dshw-hint);letter-spacing:.08em;text-transform:uppercase;margin:8px 2px 4px;flex:0 0 auto}',
  '.dshwv-menu-section:first-of-type{margin-top:2px}',
  '.dshwv-menu-nav{margin:2px 0 0;width:100%;padding:8px 10px;border:1px solid rgba(var(--dshw-accent-rgb),.28);border-radius:8px;background:rgba(var(--dshw-accent-rgb),.07);color:var(--dshw-accent);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left}',
  '.dshwv-menu-nav:hover{background:rgba(var(--dshw-accent-rgb),.14)}',
  '.dshwv-menu-nav-main{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0}',
  '.dshwv-menu-nav-label{font-size:12px;font-weight:700}',
  '.dshwv-menu-nav-sub{font-size:10px;font-weight:500;color:var(--dshw-hint);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dshwv-menu-nav-arrow{font-size:14px;opacity:.55;flex:0 0 auto}',
  '.dshwv-menu-row{display:flex;align-items:center;gap:8px;margin:6px 0;color:var(--dshw-accent);font-size:12px;white-space:nowrap}',
  '.dshwv-menu-row.dshwv-menu-stack{flex-direction:column;align-items:stretch;gap:4px;white-space:normal;margin:4px 0}',
  '.dshwv-menu-lab{flex:0 0 36px;font-size:12px;font-weight:600;color:var(--dshw-accent);opacity:.88}',
  '.dshwv-toggle-row .dshwv-menu-lab{flex:0 0 auto;min-width:36px}',
  '.dshwv-menu-stack .dshwv-menu-lab{flex:none;font-size:11px;opacity:.75}',
  '.dshwv-menu-stack-ctrl{display:flex;align-items:center;gap:6px}',
  '.dshwv-range{flex:1;min-width:0;accent-color:var(--dshw-accent);height:18px}',
  '.dshwv-number{width:40px;border:1px solid rgba(var(--dshw-accent-rgb),.28);border-radius:7px;padding:3px 4px;font-size:12px;color:var(--dshw-accent);background:#fff;box-sizing:border-box;text-align:center}',
  '.dshwv-number:disabled{opacity:.4;background:rgba(var(--dshw-accent-rgb),.06);cursor:not-allowed}',
  '.dshwv-sound{flex:1;border:1px solid rgba(var(--dshw-accent-rgb),.28);border-radius:7px;background:rgba(var(--dshw-accent-rgb),.06);color:var(--dshw-accent);font-size:12px;padding:5px 6px;cursor:pointer;outline:none}',
  '.dshwv-sound:hover,.dshwv-sound:focus{background:rgba(var(--dshw-accent-rgb),.12);border-color:rgba(var(--dshw-accent-rgb),.45)}',
  '.dshwv-check{width:16px;height:16px;accent-color:var(--dshw-accent);cursor:pointer;flex:0 0 auto}',
  '.dshwv-toggle-row{justify-content:space-between}',
  '.dshwv-menu-sep{height:1px;background:rgba(var(--dshw-accent-rgb),.14);margin:8px 0}',
  '.dshwv-volpct{width:36px;text-align:right;color:var(--dshw-accent);font-size:11px;font-variant-numeric:tabular-nums;opacity:.8}',
  '.dshwv-secret{flex:1;min-width:0;border:1px solid rgba(var(--dshw-accent-rgb),.28);border-radius:7px;padding:6px 8px;font-size:12px;color:var(--dshw-accent);background:#fff;box-sizing:border-box;outline:none}',
  '.dshwv-secret:focus{border-color:rgba(var(--dshw-accent-rgb),.55);box-shadow:0 0 0 3px rgba(var(--dshw-accent-rgb),.12)}',
  '.dshwv-secret::placeholder{color:var(--dshw-hint)}',
  '.dshwv-ta{width:100%;min-height:34px;max-height:56px;resize:vertical;border:1px solid rgba(var(--dshw-accent-rgb),.28);border-radius:7px;padding:6px 8px;font-size:12px;color:var(--dshw-accent);background:#fff;box-sizing:border-box;outline:none;font-family:inherit}',
  '.dshwv-ta:focus{border-color:rgba(var(--dshw-accent-rgb),.55);box-shadow:0 0 0 3px rgba(var(--dshw-accent-rgb),.12)}',
  '.dshwv-btn{border:1px solid rgba(var(--dshw-accent-rgb),.32);border-radius:7px;background:rgba(var(--dshw-accent-rgb),.1);color:var(--dshw-accent);font-size:12px;font-weight:600;padding:6px 10px;cursor:pointer;flex:0 0 auto}',
  '.dshwv-btn:hover{background:rgba(var(--dshw-accent-rgb),.18)}',
  '.dshwv-btn:disabled{opacity:.55;cursor:not-allowed}',
  '.dshwv-btn.danger{color:#e0433f;border-color:rgba(224,67,63,.35);background:rgba(224,67,63,.06)}',
  '.dshwv-btn.danger:hover{background:rgba(224,67,63,.12)}',
  '.dshwv-btn.primary{background:var(--dshw-accent);border-color:var(--dshw-accent);color:#fff}',
  '.dshwv-btn.primary:hover{filter:brightness(1.06)}',
  '.dshwv-btn-row{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px;flex:0 0 auto}',
  '.dshwv-prov-list{display:flex;flex-direction:column;gap:6px;margin:2px 0 8px;flex:1 1 auto;min-height:64px;max-height:none;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch}',
  '.dshwv-prov{border:1px solid rgba(var(--dshw-accent-rgb),.18);border-radius:9px;padding:7px 8px;background:rgba(var(--dshw-accent-rgb),.04);cursor:pointer;flex:0 0 auto}',
  '.dshwv-prov:hover{background:rgba(var(--dshw-accent-rgb),.08)}',
  '.dshwv-prov.active{border-color:rgba(var(--dshw-accent-rgb),.45);background:rgba(var(--dshw-accent-rgb),.1)}',
  '.dshwv-prov-top{display:flex;align-items:center;justify-content:space-between;gap:8px}',
  '.dshwv-prov-name{font-size:12px;font-weight:700;color:var(--dshw-accent)}',
  '.dshwv-prov-badge{font-size:10px;font-weight:700;color:#1f9d57;background:rgba(31,157,87,.12);border-radius:999px;padding:2px 7px;flex:0 0 auto}',
  '.dshwv-prov-meta{font-size:10px;color:var(--dshw-hint);margin-top:2px;line-height:1.3;word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  '.dshwv-prov-bal{font-size:11px;font-weight:700;color:var(--dshw-accent);margin-top:3px}',
  '.dshwv-prov-bal.err{color:#e0433f;font-weight:650}',
  '.dshwv-prov-acts{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}',
  '.dshwv-prov-acts .dshwv-btn{padding:4px 8px;font-size:11px}',
  '.dshwv-keys-form{flex:0 0 auto;border-top:1px solid rgba(var(--dshw-accent-rgb),.12);padding-top:6px;margin-top:2px;max-height:48%;overflow-x:hidden;overflow-y:auto}',
  '.dshwv-keys-add{margin-left:auto;flex:0 0 auto;padding:5px 10px;font-size:12px}',
  '.dshwv-keys-hint{font-size:11px;color:var(--dshw-hint);min-height:16px;margin:4px 2px 0;line-height:1.3;flex:0 0 auto}',
  '.dshwv-keys-hint.ok{color:#1f9d57}',
  '.dshwv-keys-hint.err{color:#e0433f}',
  '.dshwv-import{border:1px solid rgba(var(--dshw-accent-rgb),.28);border-radius:8px;background:rgba(var(--dshw-accent-rgb),.07);color:var(--dshw-accent);font-size:11px;font-weight:600;padding:4px 8px;cursor:pointer;flex:0 0 auto;white-space:nowrap}',
  '.dshwv-import:hover{background:rgba(var(--dshw-accent-rgb),.14)}',
  '.dshwv-num{width:52px;border:1px solid rgba(var(--dshw-accent-rgb),.22);border-radius:6px;padding:3px 6px;font-size:12px;color:var(--dshw-accent);background:#fff;outline:none}',
  '.dshwv-quit{margin:2px 0 0;width:100%;padding:7px 0;border:1px solid rgba(224,67,63,.35);border-radius:8px;background:rgba(224,67,63,.05);color:#e0433f;font-size:12px;font-weight:600;cursor:pointer}',
  '.dshwv-quit:hover{background:rgba(224,67,63,.12)}'
].join('\n')

var styleEl = document.createElement('style')
styleEl.textContent = css
document.head.appendChild(styleEl)

var root = document.createElement('div')
root.className = 'dshwv-root'

var img = document.createElement('img')
img.className = 'dshwv-img'
img.src = IMG_URL
img.alt = '余额'
img.draggable = false
var petCanvas = document.createElement('canvas')
petCanvas.className = 'dshwv-pet-canvas'
petCanvas.width = 512
petCanvas.height = 512

var menuBtn = document.createElement('button')
menuBtn.type = 'button'
menuBtn.className = 'dshwv-menu-btn'
menuBtn.title = '菜单'
menuBtn.innerHTML = '<span></span><span></span><span></span>'
menuBtn.addEventListener('pointerdown', function (e) {
  // 先取消穿透，避免 click 被桌面吃掉
  try { e.stopPropagation(); e.preventDefault() } catch (err) {}
  if (API.setIgnore) API.setIgnore(false)
  menuBtn.classList.add('dshwv-menu-btn-visible')
  toggleMenu()
})
menuBtn.addEventListener('click', function (e) {
  // pointerdown 已处理；阻止残留 click 再次 toggle
  try { e.stopPropagation(); e.preventDefault() } catch (err) {}
})

var menuBox = document.createElement('div')
menuBox.className = 'dshwv-menu'
function menuLabel(text) {
  var s = document.createElement('span')
  s.className = 'dshwv-menu-lab'
  s.textContent = text
  return s
}
function menuRow() {
  var r = document.createElement('div')
  r.className = 'dshwv-menu-row'
  return r
}
function menuSection(text) {
  var s = document.createElement('div')
  s.className = 'dshwv-menu-section'
  s.textContent = text
  return s
}
function menuTitle(text) {
  var s = document.createElement('div')
  s.className = 'dshwv-menu-title'
  s.textContent = text
  return s
}
var menuTitleEl = menuTitle('设置')
var scaleInput = document.createElement('input')
scaleInput.type = 'range'
scaleInput.min = String(MIN_SCALE)
scaleInput.max = String(MAX_SCALE)
scaleInput.step = '0.1'
scaleInput.className = 'dshwv-range'
scaleInput.value = '1.5'
var scaleNumber = document.createElement('input')
scaleNumber.type = 'number'
scaleNumber.min = '1'
scaleNumber.max = '20'
scaleNumber.step = '1'
scaleNumber.className = 'dshwv-number'
scaleNumber.value = '10'
scaleInput.addEventListener('pointerdown', function () { root.style.transition = 'none' })
scaleInput.addEventListener('input', function () { setScale(scaleInput.value) })
scaleInput.addEventListener('change', function () { root.style.transition = '' })
scaleNumber.addEventListener('focus', function () { root.style.transition = 'none' })
scaleNumber.addEventListener('blur', function () { root.style.transition = '' })
scaleNumber.addEventListener('input', function () {
  var v = Math.round(Number(scaleNumber.value))
  var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19
  setScale(s)
})
scaleNumber.addEventListener('change', function () {
  var v = Math.round(Number(scaleNumber.value))
  var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19
  setScale(s)
  root.style.transition = ''
})
var soundSelect = document.createElement('select')
soundSelect.className = 'dshwv-sound'
function soundOpt(value, label) {
  var o = document.createElement('option')
  o.value = value
  o.textContent = label
  return o
}
soundSelect.addEventListener('change', function () { setSoundSet(soundSelect.value) })
var skinSelect = document.createElement('select')
skinSelect.className = 'dshwv-sound'
skinSelect.addEventListener('change', function () { setSkin(skinSelect.value) })
function rebuildSkinSelect() {
  var keep = skinSelect.value || skinId
  skinSelect.textContent = ''
  Object.keys(SKINS).forEach(function (id) {
    skinSelect.appendChild(soundOpt(id, SKINS[id].label || id))
  })
  if (SKINS[keep]) skinSelect.value = keep
  else if (SKINS[DEFAULT_SKIN_ID]) skinSelect.value = DEFAULT_SKIN_ID
  else if (skinSelect.options.length) skinSelect.selectedIndex = 0
}
function currentSkinSoundSets() {
  var s = SKINS[skinId] || {}
  return Array.isArray(s.soundSets) ? s.soundSets : []
}
function rebuildSoundSelect() {
  var sets = currentSkinSoundSets()
  var keep = soundSet
  soundSelect.textContent = ''
  if (!sets.length) {
    // 皮肤未带音效包时的兜底（旧缓存）
    soundSelect.appendChild(soundOpt('duck', '小黄鸭'))
    soundSelect.appendChild(soundOpt('fx1', '音效1'))
  } else {
    sets.forEach(function (set) {
      soundSelect.appendChild(soundOpt(set.id, set.label || set.id))
    })
  }
  var ids = []
  for (var i = 0; i < soundSelect.options.length; i++) ids.push(soundSelect.options[i].value)
  if (ids.indexOf(keep) >= 0) soundSelect.value = keep
  else if (ids.length) {
    soundSet = ids[0]
    soundSelect.value = soundSet
  }
  // 有 hover 的套装才显示悬浮音开关意义更大，但仍保留开关
  applySoundSet()
}
var bubbleToggle = document.createElement('input')
bubbleToggle.type = 'checkbox'
bubbleToggle.className = 'dshwv-check'
bubbleToggle.checked = true
bubbleToggle.title = '开启/关闭思考气泡'
bubbleToggle.addEventListener('change', function () { setBubbleOn(bubbleToggle.checked) })
var hoverSoundToggle = document.createElement('input')
hoverSoundToggle.type = 'checkbox'
hoverSoundToggle.className = 'dshwv-check'
hoverSoundToggle.checked = true
hoverSoundToggle.title = '开启/关闭鼠标悬浮音效'
hoverSoundToggle.addEventListener('change', function () { setHoverSoundOn(hoverSoundToggle.checked) })
var burstToggle = document.createElement('input')
burstToggle.type = 'checkbox'
burstToggle.className = 'dshwv-check'
burstToggle.checked = true
burstToggle.title = '开启/关闭连点彩蛋（如耄耋抓痕）'
burstToggle.addEventListener('change', function () { setBurstOn(burstToggle.checked) })
var row0 = menuRow()
row0.appendChild(menuLabel('皮肤'))
row0.appendChild(skinSelect)
var importSkinBtn = document.createElement('button')
importSkinBtn.type = 'button'
importSkinBtn.className = 'dshwv-import'
importSkinBtn.textContent = '导入'
importSkinBtn.title = '导入 .skin 皮肤包'
importSkinBtn.addEventListener('click', function (e) {
  try { e.stopPropagation(); e.preventDefault() } catch (err) {}
  if (!API.importSkin) return
  importSkinBtn.disabled = true
  API.importSkin().then(function (r) {
    importSkinBtn.disabled = false
    if (!r || r.cancelled) return
    if (!r.ok) {
      var prevTitle = menuTitleEl.textContent
      menuTitleEl.textContent = r.error || '导入失败'
      setTimeout(function () { menuTitleEl.textContent = prevTitle }, 2400)
      return
    }
    if (r.skins) applySkinsCatalog(r.skins)
    else if (API.listSkins) {
      API.listSkins().then(applySkinsCatalog).catch(function () {})
    }
    if (r.id && SKINS[r.id]) setSkin(r.id)
    rebuildSkinSelect()
  }).catch(function () { importSkinBtn.disabled = false })
})
row0.appendChild(importSkinBtn)
var row1 = menuRow()
row1.appendChild(menuLabel('大小'))
row1.appendChild(scaleInput)
row1.appendChild(scaleNumber)
var row2 = menuRow()
row2.appendChild(menuLabel('音效'))
row2.appendChild(soundSelect)
var volInput = document.createElement('input')
volInput.type = 'range'
volInput.min = '0'
volInput.max = '1'
volInput.step = '0.05'
volInput.className = 'dshwv-range'
volInput.value = '0.9'
var volPct = document.createElement('span')
volPct.className = 'dshwv-volpct'
volPct.textContent = '90%'
volInput.addEventListener('input', function () { setVol(volInput.value) })
var row3 = menuRow()
row3.appendChild(menuLabel('音量'))
row3.appendChild(volInput)
row3.appendChild(volPct)
var row6 = menuRow()
row6.className = 'dshwv-menu-row dshwv-toggle-row'
row6.appendChild(menuLabel('气泡'))
row6.appendChild(bubbleToggle)
var rowHover = menuRow()
rowHover.className = 'dshwv-menu-row dshwv-toggle-row'
rowHover.appendChild(menuLabel('悬浮音'))
rowHover.appendChild(hoverSoundToggle)
var rowBurst = menuRow()
rowBurst.className = 'dshwv-menu-row dshwv-toggle-row'
rowBurst.appendChild(menuLabel('连点效果'))
rowBurst.appendChild(burstToggle)
var autoStartToggle = document.createElement('input')
autoStartToggle.type = 'checkbox'
autoStartToggle.className = 'dshwv-check'
autoStartToggle.checked = false
autoStartToggle.title = '开机时自动启动桌宠'
autoStartToggle.addEventListener('change', function () { setAutoStart(autoStartToggle.checked) })
var rowAuto = menuRow()
rowAuto.className = 'dshwv-menu-row dshwv-toggle-row'
rowAuto.appendChild(menuLabel('开机自启'))
rowAuto.appendChild(autoStartToggle)
var lowBalanceToggle = document.createElement('input')
lowBalanceToggle.type = 'checkbox'
lowBalanceToggle.className = 'dshwv-check'
lowBalanceToggle.checked = true
lowBalanceToggle.title = '余额低于阈值时系统通知 + 气泡提醒'
lowBalanceToggle.addEventListener('change', function () { setLowBalanceOn(lowBalanceToggle.checked) })
var lowBalanceInput = document.createElement('input')
lowBalanceInput.type = 'number'
lowBalanceInput.min = '0'
lowBalanceInput.step = '1'
lowBalanceInput.className = 'dshwv-num'
lowBalanceInput.value = '10'
lowBalanceInput.title = '低余额阈值'
lowBalanceInput.addEventListener('change', function () { setLowBalanceThreshold(lowBalanceInput.value) })
var rowLow = menuRow()
rowLow.className = 'dshwv-menu-row dshwv-toggle-row'
rowLow.appendChild(menuLabel('低余额'))
var lowWrap = document.createElement('span')
lowWrap.style.cssText = 'display:flex;align-items:center;gap:8px'
lowWrap.appendChild(lowBalanceToggle)
lowWrap.appendChild(lowBalanceInput)
rowLow.appendChild(lowWrap)
var menuSep1 = document.createElement('div')
menuSep1.className = 'dshwv-menu-sep'
var providersState = { list: [], activeId: null, editingId: null, balances: {} }
var menuPage = 'main'
var PROMPT_CANDY =
  '在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）\n' +
  '苹果味 桃子味 西瓜味\n' +
  '圆形 7 9 8\n' +
  '五角星形 7 6 4'
var PROMPT_PELICAN = '创建一个HTML，内容是SVG绘制一个鹈鹕骑自行车的2D动画'
function updateKeysNavSub() {
  if (!keysNavSub) return
  var active = providersState.list.find(function (p) { return p && p.active }) || null
  if (active) {
    keysNavSub.textContent = (active.name || '未命名') + (active.host ? ' · ' + active.host : '')
  } else {
    keysNavSub.textContent = providersState.list.length ? '未启用' : '尚未添加'
  }
}
function applyProvidersPayload(r) {
  if (!r || !r.ok) return
  providersState.list = Array.isArray(r.providers) ? r.providers : []
  providersState.activeId = r.activeProviderId || null
  updateKeysNavSub()
  if (menuPage === 'keys') renderProvList()
}
function loadProviders() {
  if (!API.listProviders) return Promise.resolve()
  return API.listProviders().then(applyProvidersPayload).catch(function () {})
}
function setKeysHint(text, kind) {
  if (!keysHintEl) return
  keysHintEl.textContent = text || ''
  keysHintEl.className = 'dshwv-keys-hint' + (kind ? ' ' + kind : '')
}
function copyPromptText(text, okMsg) {
  var t = String(text || '')
  if (!t) { setKeysHint('无内容', 'err'); return }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(function () {
      setKeysHint(okMsg || '已复制', 'ok')
    }).catch(function () { setKeysHint('复制失败', 'err') })
    return
  }
  setKeysHint('复制失败', 'err')
}
function fmtProvBalance(r) {
  if (!r) return { text: '余额 —', kind: '' }
  if (r.loading) return { text: '查询中…', kind: '' }
  if (!r.ok) return { text: r.error ? String(r.error).slice(0, 24) : '余额失败', kind: 'err' }
  if (r.unlimited) return { text: '余额 不限', kind: '' }
  var n = Number(r.totalBalance)
  var cur = r.currency || ''
  if (!isFinite(n)) return { text: '余额 —', kind: '' }
  var prefix = cur === 'USD' ? '$' : cur === 'CNY' ? '¥' : (cur ? cur + ' ' : '')
  return { text: '余额 ' + prefix + (Math.round(n * 10000) / 10000), kind: '' }
}
function fillProviderForm(p) {
  providersState.editingId = p ? p.id : null
  if (provNameInput) provNameInput.value = p ? (p.name || '') : ''
  if (provNoteInput) provNoteInput.value = p ? (p.note || '') : ''
  if (provUrlInput) provUrlInput.value = p && p.callbackUrl ? p.callbackUrl : ''
  if (provKeyInput) {
    provKeyInput.value = ''
    provKeyInput.placeholder = p && p.hasApiKey
      ? ('已配置 ' + (p.keyHint || '') + '（填写则覆盖）')
      : 'sk-... / 任意 Key'
  }
  if (provSaveBtn) {
    provSaveBtn.textContent = p ? '保存修改' : '添加'
    provSaveBtn.classList.toggle('primary', !p)
  }
  if (provSaveUseBtn) {
    provSaveUseBtn.textContent = p ? '保存并选用' : '添加并选用'
    provSaveUseBtn.classList.toggle('primary', !p)
  }
  if (keysFormSection) keysFormSection.textContent = p ? '编辑 Key' : '添加 Key'
  setKeysHint(p ? '编辑：' + (p.name || p.id) : '填写下方表单后点「添加」', '')
  renderProvList()
}
function startAddProvider() {
  fillProviderForm(null)
  try {
    if (keysFormWrap) keysFormWrap.scrollTop = 0
    if (provNameInput) provNameInput.focus()
  } catch (err) {}
}
function refreshProvBalance(id) {
  if (!API.probeProviderBalance) return
  providersState.balances[id] = { loading: true }
  renderProvList()
  API.probeProviderBalance(id).then(function (r) {
    providersState.balances[id] = r || { ok: false, error: '无结果' }
    renderProvList()
  }).catch(function (err) {
    providersState.balances[id] = { ok: false, error: String((err && err.message) || err) }
    renderProvList()
  })
}
function renderProvList() {
  if (!provListEl) return
  provListEl.textContent = ''
  if (!providersState.list.length) {
    var empty = document.createElement('div')
    empty.className = 'dshwv-prov-meta'
    empty.textContent = '还没有 Key，点右上角「添加 Key」。'
    provListEl.appendChild(empty)
    return
  }
  providersState.list.forEach(function (p) {
    var card = document.createElement('div')
    card.className = 'dshwv-prov' + (p.active ? ' active' : '')
    var top = document.createElement('div')
    top.className = 'dshwv-prov-top'
    var left = document.createElement('div')
    left.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0;flex:1'
    var nameEl = document.createElement('div')
    nameEl.className = 'dshwv-prov-name'
    nameEl.textContent = p.name || '未命名'
    left.appendChild(nameEl)
    if (p.active) {
      var badge = document.createElement('span')
      badge.className = 'dshwv-prov-badge'
      badge.textContent = '使用中'
      left.appendChild(badge)
    }
    top.appendChild(left)
    card.appendChild(top)
    var meta = document.createElement('div')
    meta.className = 'dshwv-prov-meta'
    meta.textContent = (p.note ? p.note + ' · ' : '') + (p.host || p.siteLabel || '官方')
    card.appendChild(meta)
    var bal = document.createElement('div')
    var bf = fmtProvBalance(providersState.balances[p.id])
    bal.className = 'dshwv-prov-bal' + (bf.kind ? ' ' + bf.kind : '')
    bal.textContent = bf.text
    card.appendChild(bal)
    var acts = document.createElement('div')
    acts.className = 'dshwv-prov-acts'
    function smallBtn(label, cls) {
      var b = document.createElement('button')
      b.type = 'button'
      b.className = 'dshwv-btn' + (cls ? ' ' + cls : '')
      b.textContent = label
      return b
    }
    if (!p.active) {
      var useBtn = smallBtn('选用')
      useBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        API.activateProvider(p.id).then(function (r) {
          applyProvidersPayload(r)
          if (r && r.ok) {
            setKeysHint('已选用「' + (p.name || '') + '」', 'ok')
            refresh(true)
          } else setKeysHint((r && r.error) || '选用失败', 'err')
        }).catch(function () { setKeysHint('选用失败', 'err') })
      })
      acts.appendChild(useBtn)
    }
    var copyKeyBtn = smallBtn('复制 Key')
    copyKeyBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      if (!API.copyProviderField) { setKeysHint('复制不可用', 'err'); return }
      API.copyProviderField(p.id, 'apiKey').then(function (r) {
        if (r && r.ok) setKeysHint('已复制 Key', 'ok')
        else setKeysHint((r && r.error) || '复制失败', 'err')
      }).catch(function () { setKeysHint('复制失败', 'err') })
    })
    var copyUrlBtn = smallBtn('复制端点')
    copyUrlBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      if (!API.copyProviderField) { setKeysHint('复制不可用', 'err'); return }
      API.copyProviderField(p.id, 'callbackUrl').then(function (r) {
        if (r && r.ok) setKeysHint('已复制端点', 'ok')
        else setKeysHint((r && r.error) || '复制失败', 'err')
      }).catch(function () { setKeysHint('复制失败', 'err') })
    })
    var balBtn = smallBtn('余额')
    balBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      refreshProvBalance(p.id)
    })
    var editBtn = smallBtn('编辑')
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      fillProviderForm(p)
    })
    var delBtn = smallBtn('删除', 'danger')
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      if (!confirm('删除「' + (p.name || '未命名') + '」？')) return
      API.deleteProvider(p.id).then(function (r) {
        applyProvidersPayload(r)
        if (providersState.editingId === p.id) fillProviderForm(null)
        setKeysHint('已删除', 'ok')
        refresh(false)
      }).catch(function () { setKeysHint('删除失败', 'err') })
    })
    acts.appendChild(copyKeyBtn)
    acts.appendChild(copyUrlBtn)
    acts.appendChild(balBtn)
    acts.appendChild(editBtn)
    acts.appendChild(delBtn)
    card.appendChild(acts)
    card.addEventListener('click', function () { fillProviderForm(p) })
    provListEl.appendChild(card)
  })
}
function saveProvider(activate) {
  var name = provNameInput.value.trim()
  var note = provNoteInput.value.trim()
  var key = provKeyInput.value.trim()
  var url = provUrlInput.value.trim()
  var isNew = !providersState.editingId
  if (isNew && !name) { setKeysHint('请填写名称', 'err'); return }
  if (isNew && !key) { setKeysHint('新建需要填写 Key', 'err'); return }
  provSaveBtn.disabled = true
  provSaveUseBtn.disabled = true
  setKeysHint(isNew ? '添加中…' : '保存中…', '')
  var payload = { name: name || undefined, note: note, callbackUrl: url, activate: !!activate }
  if (!isNew) payload.id = providersState.editingId
  if (key) payload.apiKey = key
  API.upsertProvider(payload).then(function (r) {
    provSaveBtn.disabled = false
    provSaveUseBtn.disabled = false
    if (r && r.ok) {
      applyProvidersPayload(r)
      provKeyInput.value = ''
      if (isNew) {
        fillProviderForm(null)
        setKeysHint(activate ? '已添加并选用' : '已添加', 'ok')
      } else {
        fillProviderForm(r.provider || null)
        setKeysHint(activate ? '已保存并选用' : '已保存', 'ok')
      }
      if (r.provider && r.provider.id) refreshProvBalance(r.provider.id)
      refresh(!!activate)
    } else {
      setKeysHint((r && r.error) || '保存失败', 'err')
    }
  }).catch(function () {
    provSaveBtn.disabled = false
    provSaveUseBtn.disabled = false
    setKeysHint('保存失败', 'err')
  })
}
function setMenuPage(page) {
  menuPage = page === 'keys' ? 'keys' : 'main'
  menuBox.classList.toggle('dshwv-menu-keys', menuPage === 'keys')
  if (menuPageMain) menuPageMain.classList.toggle('dshwv-menu-page-on', menuPage === 'main')
  if (menuPageKeys) menuPageKeys.classList.toggle('dshwv-menu-page-on', menuPage === 'keys')
  if (menuPage !== 'keys') {
    try { menuBox.style.maxHeight = '' } catch (err) {}
  }
  if (menuPage === 'keys') {
    loadProviders().then(function () {
      renderProvList()
      providersState.list.forEach(function (p) {
        if (p && p.id && !providersState.balances[p.id]) refreshProvBalance(p.id)
      })
    })
    positionMenu()
  }
}
var menuSep2 = document.createElement('div')
menuSep2.className = 'dshwv-menu-sep'
var keysNavBtn = document.createElement('button')
keysNavBtn.type = 'button'
keysNavBtn.className = 'dshwv-menu-nav'
keysNavBtn.title = '打开 Key 列表'
var keysNavMain = document.createElement('div')
keysNavMain.className = 'dshwv-menu-nav-main'
var keysNavLabel = document.createElement('div')
keysNavLabel.className = 'dshwv-menu-nav-label'
keysNavLabel.textContent = 'Key 列表'
var keysNavSub = document.createElement('div')
keysNavSub.className = 'dshwv-menu-nav-sub'
keysNavSub.textContent = '加载中…'
var keysNavArrow = document.createElement('span')
keysNavArrow.className = 'dshwv-menu-nav-arrow'
keysNavArrow.textContent = '›'
keysNavMain.appendChild(keysNavLabel)
keysNavMain.appendChild(keysNavSub)
keysNavBtn.appendChild(keysNavMain)
keysNavBtn.appendChild(keysNavArrow)
var rowKeysNav = menuRow()
rowKeysNav.appendChild(keysNavBtn)
var quitBtn = document.createElement('button')
quitBtn.type = 'button'
quitBtn.className = 'dshwv-quit'
quitBtn.textContent = '退出'
quitBtn.title = '退出 ZC桌宠'
quitBtn.addEventListener('click', function () { API.quit() })
var row9 = menuRow()
row9.appendChild(quitBtn)

var menuPageMain = document.createElement('div')
menuPageMain.className = 'dshwv-menu-page dshwv-menu-page-on'
menuPageMain.appendChild(menuTitleEl)
menuPageMain.appendChild(menuSection('外观'))
menuPageMain.appendChild(row0)
menuPageMain.appendChild(row1)
menuPageMain.appendChild(row2)
menuPageMain.appendChild(row3)
menuPageMain.appendChild(row6)
menuPageMain.appendChild(rowHover)
menuPageMain.appendChild(rowBurst)
menuPageMain.appendChild(rowAuto)
menuPageMain.appendChild(rowLow)
menuPageMain.appendChild(menuSep1)
menuPageMain.appendChild(rowKeysNav)
menuPageMain.appendChild(menuSep2)
menuPageMain.appendChild(row9)

var menuPageKeys = document.createElement('div')
menuPageKeys.className = 'dshwv-menu-page'
var keysHead = document.createElement('div')
keysHead.className = 'dshwv-menu-head'
var keysBackBtn = document.createElement('button')
keysBackBtn.type = 'button'
keysBackBtn.className = 'dshwv-menu-back'
keysBackBtn.textContent = '‹'
keysBackBtn.title = '返回设置'
keysBackBtn.addEventListener('click', function (e) {
  try { e.stopPropagation(); e.preventDefault() } catch (err) {}
  setMenuPage('main')
  positionMenu()
})
var keysTitleEl = menuTitle('Key 列表')
var keysAddBtn = document.createElement('button')
keysAddBtn.type = 'button'
keysAddBtn.className = 'dshwv-btn primary dshwv-keys-add'
keysAddBtn.textContent = '添加 Key'
keysAddBtn.title = '新建一条 Key'
keysAddBtn.addEventListener('click', function (e) {
  try { e.stopPropagation(); e.preventDefault() } catch (err) {}
  startAddProvider()
})
keysHead.appendChild(keysBackBtn)
keysHead.appendChild(keysTitleEl)
keysHead.appendChild(keysAddBtn)
var promptRow = document.createElement('div')
promptRow.className = 'dshwv-btn-row'
var candyBtn = document.createElement('button')
candyBtn.type = 'button'
candyBtn.className = 'dshwv-btn'
candyBtn.textContent = '糖果测试'
candyBtn.title = '复制提示词（参考答案 21）'
candyBtn.addEventListener('click', function (e) {
  e.stopPropagation()
  copyPromptText(PROMPT_CANDY, '已复制糖果测试 · 参考答案 21')
})
var pelicanBtn = document.createElement('button')
pelicanBtn.type = 'button'
pelicanBtn.className = 'dshwv-btn'
pelicanBtn.textContent = '鹈鹕测试'
pelicanBtn.title = '复制鹈鹕骑车 2D 动画提示词'
pelicanBtn.addEventListener('click', function (e) {
  e.stopPropagation()
  copyPromptText(PROMPT_PELICAN, '已复制鹈鹕测试')
})
promptRow.appendChild(candyBtn)
promptRow.appendChild(pelicanBtn)
var provListEl = document.createElement('div')
provListEl.className = 'dshwv-prov-list'
function secretInput(ph) {
  var inp = document.createElement('input')
  inp.type = 'password'
  inp.className = 'dshwv-secret'
  inp.placeholder = ph
  inp.autocomplete = 'off'
  inp.spellcheck = false
  return inp
}
var provNameInput = document.createElement('input')
provNameInput.className = 'dshwv-secret'
provNameInput.placeholder = '名称'
provNameInput.spellcheck = false
var provNoteInput = document.createElement('textarea')
provNoteInput.className = 'dshwv-ta'
provNoteInput.placeholder = '备注（可选）'
provNoteInput.spellcheck = false
var provKeyInput = secretInput('sk-... / 任意 Key')
var provUrlInput = document.createElement('input')
provUrlInput.className = 'dshwv-secret'
provUrlInput.placeholder = '端点，如 https://host/v1（可空=官方）'
provUrlInput.spellcheck = false
var formStack = function (lab, el) {
  var r = menuRow()
  r.className = 'dshwv-menu-row dshwv-menu-stack'
  r.appendChild(menuLabel(lab))
  r.appendChild(el)
  return r
}
var provSaveBtn = document.createElement('button')
provSaveBtn.type = 'button'
provSaveBtn.className = 'dshwv-btn primary'
provSaveBtn.textContent = '添加'
provSaveBtn.addEventListener('click', function (e) { e.stopPropagation(); saveProvider(false) })
var provSaveUseBtn = document.createElement('button')
provSaveUseBtn.type = 'button'
provSaveUseBtn.className = 'dshwv-btn primary'
provSaveUseBtn.textContent = '添加并选用'
provSaveUseBtn.addEventListener('click', function (e) { e.stopPropagation(); saveProvider(true) })
var provResetBtn = document.createElement('button')
provResetBtn.type = 'button'
provResetBtn.className = 'dshwv-btn'
provResetBtn.textContent = '清空'
provResetBtn.addEventListener('click', function (e) { e.stopPropagation(); startAddProvider() })
var formActs = document.createElement('div')
formActs.className = 'dshwv-btn-row'
formActs.appendChild(provSaveBtn)
formActs.appendChild(provSaveUseBtn)
formActs.appendChild(provResetBtn)
var keysHintEl = document.createElement('div')
keysHintEl.className = 'dshwv-keys-hint'
menuPageKeys.appendChild(keysHead)
menuPageKeys.appendChild(promptRow)
menuPageKeys.appendChild(menuSection('全部 Key'))
menuPageKeys.appendChild(provListEl)
var keysFormWrap = document.createElement('div')
keysFormWrap.className = 'dshwv-keys-form'
var keysFormSection = menuSection('添加 Key')
keysFormWrap.appendChild(keysFormSection)
keysFormWrap.appendChild(formStack('名称', provNameInput))
keysFormWrap.appendChild(formStack('备注', provNoteInput))
keysFormWrap.appendChild(formStack('Key', provKeyInput))
keysFormWrap.appendChild(formStack('端点', provUrlInput))
keysFormWrap.appendChild(formActs)
keysFormWrap.appendChild(keysHintEl)
menuPageKeys.appendChild(keysFormWrap)

menuBox.appendChild(menuPageMain)
menuBox.appendChild(menuPageKeys)
keysNavBtn.addEventListener('click', function (e) {
  try { e.stopPropagation(); e.preventDefault() } catch (err) {}
  setMenuPage('keys')
})
updateKeysNavSub()
if (API.onProvidersChanged) {
  API.onProvidersChanged(function () {
    loadProviders().then(function () { refresh(true) })
  })
}

var textBox = document.createElement('div')
textBox.className = 'dshwv-text'
var labelEl = document.createElement('div')
labelEl.className = 'dshwv-label'
labelEl.textContent = balanceTitle()
var amountEl = document.createElement('div')
amountEl.className = 'dshwv-amount'
var hintEl = document.createElement('div')
hintEl.className = 'dshwv-hint'
textBox.appendChild(labelEl)
textBox.appendChild(amountEl)
textBox.appendChild(hintEl)

var DEFAULT_BUBBLE_SVG = '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
  '<path class="dshwv-bshape" fill="#FFFFFF" stroke="#203170" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" d="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z"/>' +
  '<ellipse class="dshwv-b1" cx="352" cy="561" rx="37.5" ry="26" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
  '<ellipse class="dshwv-b2" cx="442" cy="646" rx="24.5" ry="18" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
  '</svg>'
var bubbleBox = document.createElement('div')
bubbleBox.className = 'dshwv-bubble'
var bubbleArt = document.createElement('div')
bubbleArt.className = 'dshwv-bubble-art'
bubbleArt.innerHTML = DEFAULT_BUBBLE_SVG
bubbleBox.appendChild(bubbleArt)
var gifEl = document.createElement('img')
gifEl.className = 'dshwv-gif'
gifEl.src = GIF_URL
gifEl.alt = ''
gifEl.draggable = false
bubbleBox.appendChild(gifEl)
var gifFailed = false
gifEl.onerror = function () { gifFailed = true }
bubbleBox.appendChild(textBox)
bubbleBox.addEventListener('click', function (e) {
  e.stopPropagation()
  if (!bubbleShown) return
  if (costBubbleActive) {
    hideCostBubble()
    return
  }
  if (bubbleRandomActive) {
    hideBubble()
  } else {
    // 首次点击：切到随机台词段，并重置5秒计时器让第二段完整停留
    bubbleRandomActive = true
    bubbleRandomLines = pickRandomLines()
    swapBubbleContent(function () { applyBubbleLines(bubbleRandomLines) })
    // 🆕 重置自动关闭计时器
    if (bubbleTimer) {
      clearTimeout(bubbleTimer)
      bubbleTimer = setTimeout(hideBubble, BUBBLE_MS)
    }
  }
})

var body = document.createElement('div')
body.className = 'dshwv-body'
body.appendChild(petCanvas)
body.appendChild(img)
body.appendChild(bubbleBox)
root.appendChild(body)
root.appendChild(menuBtn)
document.body.appendChild(root)
document.body.appendChild(menuBox)

// Position model: the widget is ALWAYS expressed in left/top px (so edge snaps
// animate smoothly via the CSS transition on both sides — switching to
// right/auto cannot transition and flashes). The anchor info (h/v + offsets)
// lives in state and is used by settle() to recompute coordinates on window
// resize and size changes, keeping the widget glued to its anchored edge.
var state = {
  scale: 1.5,
  h: 'right',
  hOff: 0,
  v: 'bottom',
  vOff: 0,
  left: 0,
  top: 0,
  balance: null,
  currency: null,
  todayUsage: null,
  todayCacheTokens: null,
  usageMode: null,
  isPeak: false,
  unlimited: false,
  status: 'loading',
  message: ''
}
var busy = false
var settleTimer = null
var animDelayTimer = null
var drag = null
var shown = null
var animId = null
var bubbleShown = false
var bubbleTimer = null
var bubbleRandomActive = false
var bubbleRandomLines = null
var BUBBLE_STYLE_CLASS = { A: 'dshwv-label', B: 'dshwv-amount', P: 'dshwv-period', C: 'dshwv-hint' }
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function singleCenter(style, text, color, wrap) { return [null, { t: text, s: style, c: color || '', w: !!wrap }, null] }
function todayUsageHint() {
  var base = '今日已用 ' + (state.todayUsage !== null && state.todayUsage !== undefined ? fmt(state.todayUsage, state.currency) : '--')
  var cache = Number(state.todayCacheTokens)
  if (state.usageMode === 'relay-log' && isFinite(cache) && cache > 0) {
    return base + ' · 缓存 ' + Math.round(cache)
  }
  return base
}
function buildGroup1() {
  var peak = !!state.isPeak
  return [
    { t: '当前时间段为:', s: 'A', c: '' },
    { t: peak ? '高峰时段' : '空闲时段', s: 'P', c: peak ? '#e0433f' : '#2fa24c' },
    { t: todayUsageHint(), s: 'C', c: '' },
  ]
}
// 通用：时段 + 今日已用
var COMMON_RANDOM_GROUPS = [
  { w: 45, lines: buildGroup1 },
]
function bubbleGroupFromSpec(spec) {
  var w = Number(spec && spec.w) || 1
  if (spec && spec.gif) {
    return { w: w, lines: function () { return { gif: true } } }
  }
  var style = (spec && spec.style) || 'A'
  var wrap = !!(spec && spec.wrap)
  var color = (spec && spec.color) || ''
  if (spec && Array.isArray(spec.pick) && spec.pick.length) {
    var picks = spec.pick.slice()
    return { w: w, lines: function () { return singleCenter(style, pickOne(picks), color, wrap) } }
  }
  var text = (spec && spec.text) || ''
  return { w: w, lines: function () { return singleCenter(style, text, color, wrap) } }
}
function skinRandomGroups() {
  var s = SKINS[skinId]
  var list = s && Array.isArray(s.bubbles) ? s.bubbles : []
  if (!list.length) {
    return [{ w: 1, lines: function () { return singleCenter('B', (s && s.brand ? s.brand : '桌宠') + ' 在线... ') } }]
  }
  return list.map(bubbleGroupFromSpec)
}
function pickRandomLines() {
  var groups = COMMON_RANDOM_GROUPS.concat(skinRandomGroups())
  var total = 0
  for (var i = 0; i < groups.length; i++) total += groups[i].w
  var r = Math.random() * total
  for (var i = 0; i < groups.length; i++) {
    r -= groups[i].w
    if (r < 0) return groups[i].lines()
  }
  return groups[groups.length - 1].lines()
}
function applyBubbleLines(lines) {
  if (lines && lines.gif) {
    // gif 台词组：只显示 gif，隐藏三行文字（display 必须显式覆盖 CSS 的 none）
    if (gifFailed) {
      // gif 加载失败/路由缺失：降级为文字台词，避免空白白色气泡
      lines = singleCenter('A', pickOne(['gif 加载失败了...', '今天没有动图给你看~', '呜呜 动图不见了...']), '', true)
    } else {
      if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
      gifEl.style.display = 'block'
      gifEl.style.opacity = ''
      labelEl.style.display = 'none'
      amountEl.style.display = 'none'
      hintEl.style.display = 'none'
      return
    }
  }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  var els = [labelEl, amountEl, hintEl]
  for (var i = 0; i < 3; i++) {
    var el = els[i]
    var ln = lines && lines[i]
    if (ln) {
      el.style.display = ''
      el.className = (BUBBLE_STYLE_CLASS[ln.s] || 'dshwv-label') + (ln.w ? ' dshwv-wrap' : '')
      el.textContent = ln.t
      el.style.color = ln.c || ''
    } else {
      el.style.display = 'none'
      el.textContent = ''
      el.style.color = ''
    }
  }
}
var bubbleSwapTimer = null
var hintFadeTimer = null
var gifFadeTimer = null
var lastHintText = null
function setHint(text) {
  // 首次/恢复（lastHintText===null）时直接写文本，不做淡出淡入——否则
  // 气泡打开或按压重开时会先淡出再淡入，造成「消失一下又出现」。
  // 只有气泡打开期间的内容变化（加载中→今日已用）才走动画。
  if (text === lastHintText) return
  var first = lastHintText === null
  lastHintText = text
  if (first || !bubbleShown) {
    hintEl.textContent = text
    return
  }
  hintEl.style.transition = 'opacity .18s ease'
  hintEl.style.opacity = '0'
  hintFadeTimer = setTimeout(function () {
    hintFadeTimer = null
    hintEl.textContent = text
    hintEl.style.opacity = '1'
    setTimeout(function () {
      hintEl.style.transition = ''
      hintEl.style.opacity = ''
    }, 220)
  }, 190)
}
function swapBubbleContent(applyFn) {
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  textBox.style.transition = 'opacity .18s ease'
  textBox.style.opacity = '0'
  bubbleSwapTimer = setTimeout(function () {
    bubbleSwapTimer = null
    applyFn()
    textBox.style.opacity = '1'
    setTimeout(function () {
      textBox.style.transition = ''
      textBox.style.opacity = ''
    }, 220)
  }, 190)
}
function restoreBubbleLines() {
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  lastHintText = null
  textBox.style.transition = ''
  textBox.style.opacity = ''
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = balanceTitle()
  labelEl.style.color = ''
  amountEl.style.display = ''
  amountEl.className = 'dshwv-amount'
  amountEl.style.color = ''
  hintEl.style.display = ''
  hintEl.className = 'dshwv-hint'
  hintEl.style.color = ''
  render()
}
function showBubble() {
  if (!bubbleOn) return
  // 消耗金额泡泡显示期间，余额变动不再弹出普通泡泡
  if (costBubbleActive) return
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  bubbleShown = true
  bubbleRandomActive = false
  restoreBubbleLines()
  bubbleBox.classList.add('dshwv-bubble-open')
  bubbleTimer = setTimeout(hideBubble, BUBBLE_MS)
  modEmit('bubbleopen')
}
function hideBubble() {
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null }
  textBox.style.transition = ''
  textBox.style.opacity = ''
  hintEl.style.transition = ''
  hintEl.style.opacity = ''
  bubbleRandomActive = false
  bubbleRandomLines = null
  bubbleShown = false
  // 只销毁 gif 显示；三行文字保持现状让气泡自然淡出——不能在关闭瞬间
  // 恢复成余额内容（否则随机台词界面会闪现余额）。文字恢复交给下次
  // showBubble() 的 restoreBubbleLines()（那时气泡隐藏，恢复过程不可见）。
  bubbleBox.classList.remove('dshwv-bubble-open')
  gifFadeTimer = setTimeout(function () {
    gifFadeTimer = null
    gifEl.style.display = 'none'
  }, 240)
  modEmit('bubbleclose')
}

// —— 每轮对话消耗金额泡泡 ——
var costBubbleTimer = null
function showCostBubble(amount) {
  if (!bubbleOn || !turnCostOn) return
  if (costBubbleTimer) { clearTimeout(costBubbleTimer); costBubbleTimer = null }
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  costBubbleActive = true
  bubbleRandomActive = false
  bubbleShown = true
  lastHintText = null
  // 样式：第一行 A（标签），第二行 B（红色金额），居中两行
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = '上一轮对话消耗:'
  labelEl.style.color = ''
  amountEl.style.display = ''
  amountEl.className = 'dshwv-amount'
  amountEl.textContent = '¥ ' + (isFinite(amount) ? Number(amount).toFixed(2) : '--')
  amountEl.style.color = '#e0433f'
  hintEl.style.display = 'none'
  hintEl.textContent = ''
  hintEl.style.color = ''
  textBox.style.transition = ''
  textBox.style.opacity = ''
  bubbleBox.classList.add('dshwv-bubble-open')
  if (turnCostCloseMs > 0) {
    costBubbleTimer = setTimeout(hideCostBubble, turnCostCloseMs)
  }
}
function hideCostBubble() {
  if (costBubbleTimer) { clearTimeout(costBubbleTimer); costBubbleTimer = null }
  costBubbleActive = false
  hideBubble()
}

var lowBalanceBubbleTimer = null
function showLowBalanceBubble(payload) {
  if (!bubbleOn || !lowBalanceOn) return
  if (lowBalanceBubbleTimer) { clearTimeout(lowBalanceBubbleTimer); lowBalanceBubbleTimer = null }
  if (costBubbleTimer) { clearTimeout(costBubbleTimer); costBubbleTimer = null }
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  costBubbleActive = false
  bubbleRandomActive = false
  bubbleShown = true
  lastHintText = null
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = '余额不足'
  labelEl.style.color = '#e0433f'
  amountEl.style.display = ''
  amountEl.className = 'dshwv-amount'
  var bal = payload && isFinite(Number(payload.balance)) ? Number(payload.balance) : null
  var cur = payload && payload.currency ? String(payload.currency) : state.currency
  amountEl.textContent = bal != null ? fmt(bal, cur) : '--'
  amountEl.style.color = '#e0433f'
  hintEl.style.display = ''
  hintEl.className = 'dshwv-hint'
  hintEl.style.color = ''
  hintEl.textContent = payload && payload.message
    ? String(payload.message)
    : ('已低于阈值 ' + (payload && payload.threshold != null ? payload.threshold : lowBalanceThreshold))
  bubbleBox.classList.add('dshwv-bubble-open')
  lowBalanceBubbleTimer = setTimeout(function () {
    lowBalanceBubbleTimer = null
    labelEl.style.color = ''
    amountEl.style.color = ''
    hideBubble()
  }, 5000)
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function viewport() {
  return {
    w: window.innerWidth || document.documentElement.clientWidth || 1280,
    h: window.innerHeight || document.documentElement.clientHeight || 800
  }
}
function rightGap() {
  // 开关关闭：贴边（不避让滚动条）
  if (!scrollGapOn) return 0
  // 开启：用用户填写的像素；填 0 也贴边
  return scrollGapPx > 0 ? scrollGapPx : 0
}
function fmt(balance, currency) {
  if (balance === '不限' || !isFinite(Number(balance))) {
    if (balance === '不限') return '不限'
  }
  var num = Number(balance)
  var fixed = isFinite(num) ? num.toFixed(2) : '--'
  return currency === 'CNY' ? '¥ ' + fixed : fixed + ' ' + (currency || '')
}
function formatBalanceAmount() {
  if (state.unlimited) return '不限'
  if (shown !== null) return fmt(shown, state.currency)
  if (state.balance === null) return '…'
  return fmt(state.balance, state.currency)
}
function animateAmount(from, to, currency, duration) {
  // 消耗金额泡泡显示期间，余额数字滚动不触碰金额行
  if (costBubbleActive) return
  if (animId) cancelAnimationFrame(animId)
  if (from === null || !isFinite(from)) from = to
  if (from === to) {
    shown = to
    amountEl.textContent = fmt(to, currency)
    return
  }
  var startTime = null
  function step(ts) {
    if (startTime === null) startTime = ts
    var t = Math.min(1, (ts - startTime) / duration)
    var eased = 1 - Math.pow(1 - t, 3)
    var val = from + (to - from) * eased
    amountEl.textContent = fmt(val, currency)
    if (t < 1) {
      animId = requestAnimationFrame(step)
    } else {
      animId = null
      shown = to
      amountEl.textContent = fmt(to, currency)
    }
  }
  animId = requestAnimationFrame(step)
}
function render() {
  // 消耗金额泡泡显示期间，余额渲染不覆盖其内容（金额行/标题行/提示行）
  if (costBubbleActive) return
  var amount, hint
  if (state.status === 'error') {
    amount = state.unlimited ? '不限' : (shown !== null ? fmt(shown, state.currency) : '--')
    hint = state.message ? state.message.slice(0, 18) : '获取失败 · 点击重试'
  } else if (state.balance === null && !state.unlimited) {
    amount = shown !== null ? fmt(shown, state.currency) : '…'
    hint = '加载中…'
  } else if (state.unlimited) {
    amount = '不限'
    hint = '额度不限'
  } else {
    amount = shown !== null ? fmt(shown, state.currency) : fmt(state.balance, state.currency)
    hint = todayUsageHint()
  }
  amountEl.textContent = amount
  if (bubbleRandomActive && bubbleRandomLines) {
    applyBubbleLines(bubbleRandomLines)
  } else {
    setHint(hint)
  }
  modEmit('render', { state: state, amount: amount, hint: hint })
}
  // 桌面版：挂件固定锚在窗口右下角（CSS right:0;bottom:0），移动/吸附由主进程
// 移动整个窗口完成，因此页面内定位函数改为空操作，仅保留吸附翻转状态。
function express() {
  root.classList.toggle('dshwv-left', state.h === 'left')
}
function settle() {
  express()
}
// 主进程吸附完成后回写吸附状态并保存
function applySnap(h, v) {
  state.h = (h === 'left' || h === 'right') ? h : null
  state.v = (v === 'top' || v === 'bottom') ? v : 'bottom'
  root.classList.toggle('dshwv-left', state.h === 'left')
  saveConfig()
}
function refresh(manual) {
  if (busy) return
  busy = true
  if (animDelayTimer) { clearTimeout(animDelayTimer); animDelayTimer = null }
  if (manual || state.balance === null) { state.status = 'loading'; render() }
  API.fetchBalance()
    .then(function (data) {
      if (data && data.ok) {
        var nb = Number(data.totalBalance)
        var nc = String(data.currency || 'CNY')
        var unlimited = !!data.unlimited
        var changed = state.balance !== null && (nb !== state.balance || nc !== state.currency || unlimited !== state.unlimited)
        var currencyChanged = state.currency !== null && nc !== state.currency
        state.balance = isFinite(nb) ? nb : 0
        state.currency = nc
        state.unlimited = unlimited
        state.message = ''
        state.todayUsage = data.todayUsage !== undefined ? data.todayUsage : null
        state.todayCacheTokens = data.todayCacheTokens != null ? Number(data.todayCacheTokens) : null
        state.usageMode = data.usageMode || null
        state.isPeak = !!data.isPeak
        if (unlimited) {
          shown = null
          state.status = 'ok'
          render()
          if (manual) showBubble()
        } else if (changed && !currencyChanged) {
          if (!manual) {
            showBubble()
            state.status = 'changing'
            // balance-change bubble: wait 0.3s after it floats out, then roll the number
            if (animDelayTimer) clearTimeout(animDelayTimer)
            animDelayTimer = setTimeout(function () {
              animDelayTimer = null
              animateAmount(shown, nb, nc, ANIM_MS)
            }, 300)
            if (settleTimer) clearTimeout(settleTimer)
            settleTimer = setTimeout(function () {
              settleTimer = null
              if (state.status === 'changing') { state.status = 'ok'; render() }
            }, CHANGE_MS + 300)
          } else {
            animateAmount(shown, nb, nc, ANIM_MS)
            state.status = 'ok'
            render()
          }
        } else {
          if (animId === null) shown = nb
          state.status = 'ok'
          render()
        }
      } else {
        state.status = 'error'
        state.message = (data && data.error) ? String(data.error) : '获取失败'
        render()
      }
    })
    .catch(function () {
      state.status = 'error'
      state.message = '获取失败'
      render()
    })
    .finally(function () {
      busy = false
    })
}
var soundOn = true
var soundVol = 0.9
var soundSet = 'duck'
var usageMode = 'ledger'
var peakMode = 'default'
var bubbleOn = true
var hoverSoundOn = true
var burstOn = true
var autoStart = false
var lowBalanceOn = true
var lowBalanceThreshold = 10
// 桌面版无 DSH 会话事件，「每轮对话消耗」功能不可用，保持关闭
var turnCostOn = false
var turnCostCloseMs = 5000
var costBubbleActive = false
var scrollGapOn = false
var scrollGapPx = 17
function saveConfig() {
  try {
    API.saveConfig({
      scale: state.scale,
      sound: soundOn,
      vol: soundVol,
      soundSet: soundSet,
      skin: skinId,
      usageMode: usageMode,
      peakMode: 'default',
      bubbleOn: bubbleOn,
      hoverSoundOn: hoverSoundOn,
      burstOn: burstOn,
      autoStart: autoStart,
      lowBalanceOn: lowBalanceOn,
      lowBalanceThreshold: lowBalanceThreshold,
      scrollGapOn: scrollGapOn,
      scrollGapPx: scrollGapPx,
      pos: { hAnchor: state.h, vAnchor: state.v }
    })
  } catch (err) {}
}
function wrapBubbleMarkup(raw) {
  var t = String(raw || '').trim()
  if (!t) return DEFAULT_BUBBLE_SVG
  if (/<svg[\s>]/i.test(t)) return t
  if (/^<(path|g|ellipse|circle|rect|polygon)\b/i.test(t)) {
    return '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' + t + '</svg>'
  }
  return t
}
function applySkinBubble(s) {
  s = s || {}
  function put(html) {
    bubbleArt.innerHTML = wrapBubbleMarkup(html)
  }
  if (s.bubbleHtmlInline) { put(s.bubbleHtmlInline); return }
  if (s.bubbleSvgInline) { put(s.bubbleSvgInline); return }
  var url = s.bubbleHtmlUrl || s.bubbleSvgUrl
  if (url) {
    fetch(url).then(function (r) { return r.text() }).then(put).catch(function () { put(DEFAULT_BUBBLE_SVG) })
    return
  }
  put(DEFAULT_BUBBLE_SVG)
}
function buildModHost() {
  return {
    version: 1,
    skin: SKINS[skinId] || {},
    skinId: skinId,
    root: root,
    body: body,
    img: img,
    canvas: petCanvas,
    bubble: { box: bubbleBox, art: bubbleArt, text: textBox, gif: gifEl, label: labelEl, amount: amountEl, hint: hintEl },
    menu: {
      box: menuBox,
      add: function (el) {
        if (el && el.setAttribute) el.setAttribute('data-zc-mod', '1')
        menuPageMain.appendChild(el)
        return el
      },
      button: function (label, fn) {
        var b = document.createElement('button')
        b.type = 'button'
        b.className = 'dshwv-menu-nav'
        b.textContent = label
        b.setAttribute('data-zc-mod', '1')
        if (typeof fn === 'function') b.addEventListener('click', fn)
        menuPageMain.appendChild(b)
        return b
      },
    },
    whale: API,
    data: (SKINS[skinId] && SKINS[skinId].data) || {},
    extra: (SKINS[skinId] && SKINS[skinId].extra) || {},
    asset: function (name) {
      return 'skin://' + encodeURIComponent(skinId) + '/' + String(name || '').replace(/^\/+/, '')
    },
    store: {
      get: function (k) {
        try { return JSON.parse(localStorage.getItem('zcmod:' + skinId + ':' + k)) } catch (err) { return null }
      },
      set: function (k, v) {
        try { localStorage.setItem('zcmod:' + skinId + ':' + k, JSON.stringify(v)) } catch (err) {}
      },
    },
    css: function (text) {
      var st = document.createElement('style')
      st.textContent = text
      st.setAttribute('data-zc-mod', '1')
      document.head.appendChild(st)
      return st
    },
    setPose: applySkinPose,
    setImg: function (src) { img.src = src || '' },
    setScale: setScale,
    getScale: function () { return state.scale },
    showBubble: showBubble,
    hideBubble: hideBubble,
    playPress: playPress,
    playRelease: playRelease,
    rect: function () { return root.getBoundingClientRect() },
    pointer: function () { return lastModPointer },
  }
}
var lastModPointer = { x: 0, y: 0, over: false, down: false }
function syncPetCanvasSize() {
  try {
    var w = Math.max(64, Math.round(root.getBoundingClientRect().width * 0.5945))
    if (petCanvas.width !== w) {
      petCanvas.width = w
      petCanvas.height = w
    }
  } catch (err) {}
}
function applySkinMods(s) {
  if (!window.__zcModHost || !window.__zcModHost.loadSkinMods) return
  window.__zcModHost.loadSkinMods(s || {}, buildModHost())
}
function setSkin(id) {
  var next = SKINS[id] ? id : (SKINS[DEFAULT_SKIN_ID] ? DEFAULT_SKIN_ID : Object.keys(SKINS)[0])
  if (!next || !SKINS[next]) return
  skinId = next
  skinSelect.value = skinId
  var s = SKINS[skinId]
  IMG_URL = s.img || ''
  if (s.img) {
    img.src = IMG_URL
    img.style.display = 'block'
  } else {
    img.removeAttribute('src')
    img.style.display = 'none'
  }
  img.alt = balanceTitle()
  syncPetCanvasSize()
  petCanvas.style.display = (s.plugins && s.plugins.length) ? 'block' : 'none'
  try {
    var bw = Math.max(64, Math.round(root.getBoundingClientRect().width * 0.5945))
    petCanvas.width = bw
    petCanvas.height = bw
  } catch (err) {}
  GIF_URL = s.gif || './assets/rua.gif'
  try { gifEl.src = GIF_URL } catch (err) {}
  preloadSkinPress()
  applySkinTheme()
  applySkinSounds()
  applySkinBubble(s)
  applySkinMods(s)
  rapidClicks = []
  menuTitleEl.textContent = (s.brand || 'ZC桌宠') + ' 设置'
  quitBtn.textContent = '退出'
  if (!bubbleRandomActive && !costBubbleActive) {
    labelEl.textContent = balanceTitle()
  }
  hitReady = false
  setupHitTest()
  saveConfig()
  modEmit('skin', s)
}
function preloadSkinPress() {
  var s = SKINS[skinId]
  if (!s || !s.pressImg) return
  try {
    var pre = new Image()
    pre.src = s.pressImg
  } catch (err) {}
}
function applySkinPose(pressed) {
  var s = SKINS[skinId] || {}
  if (pressed && s.pressImg) {
    img.src = s.pressImg
  } else {
    img.src = s.img || IMG_URL
    if (s.img) IMG_URL = s.img
  }
  img.style.display = img.src ? 'block' : 'none'
  modEmit('pose', { pressed: !!pressed })
}
function balanceTitle() {
  var s = SKINS[skinId] || {}
  if (s.balanceTitle) return s.balanceTitle
  return (s.brand || 'ZC桌宠') + ' 余额'
}
function applySkinTheme() {
  var s = SKINS[skinId] || {}
  try {
    root.style.setProperty('--dshw-stroke', s.stroke || '#203170')
    root.style.setProperty('--dshw-text', s.text || '#536ba9')
    root.style.setProperty('--dshw-hint', s.hint || '#9fb0d9')
    root.style.setProperty('--dshw-accent', s.accent || '#203170')
    root.style.setProperty('--dshw-accent-rgb', s.accentRgb || '32,49,112')
    menuBox.style.setProperty('--dshw-stroke', s.stroke || '#203170')
    menuBox.style.setProperty('--dshw-text', s.text || '#536ba9')
    menuBox.style.setProperty('--dshw-hint', s.hint || '#9fb0d9')
    menuBox.style.setProperty('--dshw-accent', s.accent || '#203170')
    menuBox.style.setProperty('--dshw-accent-rgb', s.accentRgb || '32,49,112')
    if (menuTitleEl) menuTitleEl.textContent = (s.brand || 'ZC桌宠') + ' 设置'
  } catch (err) {}
}
function setBubbleOn(v) {
  bubbleOn = !!v
  bubbleToggle.checked = bubbleOn
  saveConfig()
  // 必须走 hideCostBubble：残留的 costBubbleActive 会让 render()/showBubble() 永久早退
  if (!bubbleOn) hideCostBubble()
}
function setHoverSoundOn(v) {
  hoverSoundOn = !!v
  hoverSoundToggle.checked = hoverSoundOn
  if (!hoverSoundOn) stopHoverSound()
  saveConfig()
}
function setBurstOn(v) {
  burstOn = !!v
  burstToggle.checked = burstOn
  if (!burstOn) rapidClicks = []
  saveConfig()
}
function setAutoStart(v) {
  autoStart = !!v
  autoStartToggle.checked = autoStart
  saveConfig()
}
function setLowBalanceOn(v) {
  lowBalanceOn = !!v
  lowBalanceToggle.checked = lowBalanceOn
  saveConfig()
}
function setLowBalanceThreshold(v) {
  var n = Number(v)
  if (!isFinite(n) || n < 0) n = 10
  lowBalanceThreshold = n
  lowBalanceInput.value = String(n)
  saveConfig()
}
function scaleToDisplay(s) {
  return Math.round((s - MIN_SCALE) / ((MAX_SCALE - MIN_SCALE) / 19)) + 1
}
function setScale(v) {
  var next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(v))) * 10) / 10
  // 缩放测量需要 left/top 立即到位：临时禁用过渡（滚轮/数字框路径没有
  // 滑块 pointerdown 的 transition:none，否则 r2 测的是过渡起点导致错锚点）
  var prevTrans = root.style.transition
  root.style.transition = 'none'
  var rect = root.getBoundingClientRect()
  // fixed point: the whale's corner — bottom-right when unflipped, bottom-left
  // when flipped. Growing extends the widget up-left / up-right from that
  // corner; shrinking pulls it back toward the corner. The whale always hugs
  // its corner while scaling.
  var fx = state.h === 'left' ? rect.left : rect.right
  var fy = rect.bottom
  state.scale = next
  root.style.setProperty('--dshw-scale', String(next))
  scaleInput.value = String(next)
  scaleNumber.value = String(scaleToDisplay(next))
  saveConfig()
  // keep the corner fixed while resizing; the position correction applies
  // instantly because the caller disables the transition for the whole drag
  var r2 = root.getBoundingClientRect()
  var vp = viewport()
  if (state.h === 'left') {
    state.left = Math.min(Math.max(fx, 0), Math.max(0, vp.w - r2.width))
  } else {
    state.left = Math.min(Math.max(fx - r2.width, 0), Math.max(0, vp.w - r2.width))
  }
  state.top = Math.min(Math.max(fy - r2.height, 0), Math.max(0, vp.h - r2.height))
  express()
  // 恢复过渡必须延迟到下一帧：本帧 left/top 已在 none 下设置并提交，
  // 立即恢复会让浏览器对「刚改过的 left/top」重新评估并播放过渡动画
  // （翻转时叠加 transform .3s 更明显，表现为抽搐）。
  requestAnimationFrame(function () {
    root.style.transition = prevTrans
  })
}
function setVol(v) {
  var next = Math.round(Math.min(1, Math.max(0, Number(v))) * 100) / 100
  soundVol = next
  soundOn = next > 0
  volInput.value = String(next)
  volPct.textContent = Math.round(next * 100) + '%'
  try {
    if (pressAudio) pressAudio.volume = next
    if (releaseAudio) releaseAudio.volume = next
    if (hoverAudio) hoverAudio.volume = next
  } catch (err) {}
  saveConfig()
}
function setSoundSet(v) {
  soundSet = String(v || 'duck')
  soundSelect.value = soundSet
  applySoundSet()
  saveConfig()
}
var SQUISH = 'scaleY(0.88) scaleX(1.05)'
var pressAudio = null
var releaseAudio = null
var hoverAudio = null
var pressing = false
var pressEnded = false
var releasePlayed = false
var releaseTimer = null
var activeSoundOneshot = false
var FALLBACK_SOUND_FILES = {
  duck: { press: './assets/Ya1.mp3', release: './assets/Ya2.mp3', oneshot: false },
  fx1: { press: './assets/D1.mp3', release: './assets/D2.mp3', oneshot: false }
}
function resolveActiveSoundSet() {
  var sets = currentSkinSoundSets()
  for (var i = 0; i < sets.length; i++) {
    if (sets[i] && sets[i].id === soundSet) return sets[i]
  }
  if (sets.length) return sets[0]
  return FALLBACK_SOUND_FILES[soundSet] || FALLBACK_SOUND_FILES.duck
}
function applySoundSet() {
  try {
    if (pressAudio) { try { pressAudio.pause() } catch (e1) {} pressAudio = null }
    if (releaseAudio) { try { releaseAudio.pause() } catch (e2) {} releaseAudio = null }
    if (hoverAudio) { try { hoverAudio.pause() } catch (e3) {} hoverAudio = null }
  } catch (err) {}
  petHovered = false
  var files = resolveActiveSoundSet() || {}
  activeSoundOneshot = !!files.oneshot || (!!files.press && !files.release)
  try {
    if (files.press) {
      pressAudio = new Audio(files.press)
      pressAudio.preload = 'auto'
      pressAudio.volume = soundVol
    }
    if (files.release) {
      releaseAudio = new Audio(files.release)
      releaseAudio.preload = 'auto'
      releaseAudio.volume = soundVol
    }
    if (files.hover) {
      hoverAudio = new Audio(files.hover)
      hoverAudio.preload = 'auto'
      hoverAudio.volume = soundVol
    }
  } catch (err) {}
}
var petHovered = false
function applySkinSounds() {
  rebuildSoundSelect()
}
function playHoverSound() {
  if (!hoverAudio || !soundOn || !hoverSoundOn) return
  try {
    if (!hoverAudio.paused && !hoverAudio.ended) return
    hoverAudio.volume = soundVol
    hoverAudio.currentTime = 0
    var p = hoverAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function stopHoverSound() {
  if (!hoverAudio) return
  try {
    hoverAudio.pause()
    hoverAudio.currentTime = 0
  } catch (err) {}
}
function playPress() {
  if (!soundOn || !pressAudio) return
  try {
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null }
    if (releaseAudio) {
      releaseAudio.pause()
      releaseAudio.currentTime = 0
    }
    if (activeSoundOneshot) {
      pressEnded = true
      releasePlayed = true
      pressAudio.volume = soundVol
      pressAudio.currentTime = 0
      var sp = pressAudio.play()
      if (sp && typeof sp.catch === 'function') sp.catch(function () {})
      return
    }
    pressEnded = false
    releasePlayed = false
    pressAudio.onended = function () {
      pressEnded = true
      if (!pressing && !releasePlayed) playRelease()
    }
    pressAudio.currentTime = 0
    var p = pressAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function playRelease() {
  if (activeSoundOneshot) return
  if (releasePlayed || !releaseAudio || !soundOn) return
  releasePlayed = true
  try {
    releaseAudio.currentTime = 0
    var p = releaseAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function pressDown() {
  body.style.transform = SQUISH
  pressing = true
  lastModPointer.down = true
  lastModPointer.over = true
  applySkinPose(true)
  playPress()
  modEmit('press')
}
function pressUp() {
  body.style.transform = 'scaleY(1) scaleX(1)'
  pressing = false
  lastModPointer.down = false
  applySkinPose(false)
  modEmit('release')
  if (pressEnded) {
    // hold (or released after Ya1 finished) → Ya2 now
    playRelease()
    return
  }
  // click: start Ya2 in the last 100ms of Ya1's playback
  var durKnown = false
  var remainMs = 0
  try {
    var dur = pressAudio ? pressAudio.duration : 0
    if (isFinite(dur) && dur > 0) {
      durKnown = true
      remainMs = (dur - pressAudio.currentTime) * 1000
    }
  } catch (err) {}
  if (durKnown) {
    releaseTimer = setTimeout(function () {
      releaseTimer = null
      playRelease()
    }, Math.max(0, remainMs - 100))
  }
  // duration unknown → pressAudio.onended fallback plays Ya2 after Ya1 ends
}
var menuOpen = false
function closeMenu() {
  menuOpen = false
  menuBox.classList.remove('dshwv-menu-open')
  setMenuPage('main')
  root.style.transition = ''
}
function toggleMenu() {
  menuOpen = !menuOpen
  if (menuOpen) {
    setMenuPage('main')
    positionMenu()
  } else {
    setMenuPage('main')
  }
  menuBox.classList.toggle('dshwv-menu-open', menuOpen)
  if (menuOpen) menuBtn.classList.add('dshwv-menu-btn-visible')
  modEmit(menuOpen ? 'menuopen' : 'menuclose')
}
function positionMenu() {
  try {
    var r = root.getBoundingClientRect()
    var b = menuBtn.getBoundingClientRect()
    var vp = viewport()
    var onLeft = r.left + r.width / 2 < vp.w / 2
    var pad = 8
    var keys = menuPage === 'keys'
    var wantW = keys ? Math.min(400, vp.w - pad * 2) : 248
    // 向上展开：高度不超过按钮上方可用空间
    var availAbove = Math.max(160, b.top - pad)
    var maxH = keys
      ? Math.min(availAbove, Math.floor(vp.h * 0.82), 620)
      : Math.min(availAbove, Math.floor(vp.h * 0.7), 520)
    menuBox.style.maxHeight = maxH + 'px'

    if (onLeft) {
      var left = Math.round(b.left)
      if (left + wantW > vp.w - pad) left = Math.max(pad, vp.w - pad - wantW)
      if (left < pad) left = pad
      menuBox.style.left = left + 'px'
      menuBox.style.right = 'auto'
      menuBox.style.transformOrigin = 'bottom left'
    } else {
      var right = Math.round(vp.w - b.right)
      if (right + wantW > vp.w - pad) right = Math.max(pad, vp.w - pad - wantW)
      if (right < pad) right = pad
      menuBox.style.right = right + 'px'
      menuBox.style.left = 'auto'
      menuBox.style.transformOrigin = 'bottom right'
    }
    menuBox.style.bottom = (vp.h - b.top) + 'px'
    menuBox.style.top = 'auto'
  } catch (err) {}
}

var hitCanvas = null
var hitReady = false
function setupHitTest() {
  try {
    hitCanvas = document.createElement('canvas')
    hitCanvas.width = 610
    hitCanvas.height = 610
    var probe = new Image()
    probe.onload = function () {
      try {
        // 拉伸到 610×610 与 isWhaleHit 的坐标映射对齐；不指定尺寸会按原图大小绘制，
        // 回退到非 610×610 素材时命中区域会错位
        hitCanvas.getContext('2d').drawImage(probe, 0, 0, 610, 610)
        hitReady = true
      } catch (err) {}
    }
    probe.onerror = function () {}
    probe.src = IMG_URL
  } catch (err) {}
}
function isWhaleHit(e) {
  try {
    if (petCanvas && petCanvas.style.display !== 'none' && petCanvas.width) {
      var cr = petCanvas.getBoundingClientRect()
      if (cr.width > 0 && pointInRect(e.clientX, e.clientY, cr, 0)) {
        var cx = (e.clientX - cr.left) / cr.width * petCanvas.width
        var cy = (e.clientY - cr.top) / cr.height * petCanvas.height
        if (state.h === 'left') cx = petCanvas.width - cx
        var cd = petCanvas.getContext('2d').getImageData(Math.floor(cx), Math.floor(cy), 1, 1).data
        if (cd[3] > 10) return true
      }
    }
  } catch (err) {}
  if (!hitCanvas || !hitReady) return img.style.display !== 'none'
  try {
    var r = img.getBoundingClientRect()
    if (!r || r.width <= 0 || r.height <= 0) return false
    var lx = (e.clientX - r.left) / r.width * 610
    var ly = (e.clientY - r.top) / r.height * 610
    if (lx < 0 || ly < 0 || lx >= 610 || ly >= 610) return false
    if (state.h === 'left') lx = 610 - lx
    var data = hitCanvas.getContext('2d').getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data
    return data[3] > 10
  } catch (err) {
    return true
  }
}
// 菜单钮常落在立绘透明像素上：按坐标判热区，不依赖 e.target（穿透转发时 target 常是 html）
function pointInRect(x, y, r, pad) {
  pad = pad || 0
  return !!r && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
}
function isMenuBtnHit(e) {
  try {
    return pointInRect(e.clientX, e.clientY, menuBtn.getBoundingClientRect(), 12)
  } catch (err) {
    return false
  }
}
function isNearMenuZone(e) {
  try {
    var r = img.getBoundingClientRect()
    if (!r || r.width <= 0) return false
    // 角色图右上角（左吸附镜像后仍用屏幕坐标按钮自身 isMenuBtnHit 兜底）
    return e.clientX >= r.right - 56 && e.clientX <= r.right + 14 &&
      e.clientY >= r.top - 14 && e.clientY <= r.top + 56
  } catch (err) {
    return false
  }
}
function isMenuSurfaceHit(e) {
  try {
    return pointInRect(e.clientX, e.clientY, menuBox.getBoundingClientRect(), 4)
  } catch (err) {
    return false
  }
}
function onDocPointerDown(e) {
  if (e.target && e.target.closest) {
    if (e.target.closest('.dshwv-bubble') || e.target.closest('.dshwv-menu') || e.target.closest('.dshwv-menu-btn')) return
  }
  if (menuOpen) {
    closeMenu()
    return
  }
  if (e.button !== 0 && e.pointerType === 'mouse') return
  if (!isWhaleHit(e)) return
  try { e.preventDefault(); e.stopPropagation() } catch (err) {}
  // 桌面版：按住角色 = 拖动整个窗口（主进程按位移移动窗口）。
  // 注意不能用 clientX/Y 差计算位移：窗口移动会触发合成 pointermove，
  // 其 client 坐标已按新窗口位置计算，会造成「移动→回弹」振荡（抽搐）。
  // 改用 movementX/Y（真实指针位移，合成事件为 0，天然过滤伪事件）。
  drag = { active: true, startX: e.clientX, startY: e.clientY, totalX: 0, totalY: 0, moved: false }
  root.classList.add('dshwv-dragging')
  pressDown()
  setWidgetCursor('grabbing')
  // 指针捕获：快速拖动时窗口可能暂时落后于光标，捕获保证事件不因指针
  // 短暂离开窗口而丢失（松手时在 endDrag 释放）
  try { root.setPointerCapture(e.pointerId) } catch (err) {}
  document.addEventListener('pointermove', onDocPointerMove, true)
  document.addEventListener('pointerup', onDocPointerUp, true)
  document.addEventListener('pointercancel', onDocPointerCancel, true)
}
function onDocPointerMove(e) {
  if (!drag || !drag.active) return
  var mx = e.movementX || 0
  var my = e.movementY || 0
  if (mx === 0 && my === 0) return // 合成事件（窗口移动引起），忽略
  drag.totalX += mx
  drag.totalY += my
  if (drag.totalX * drag.totalX + drag.totalY * drag.totalY >= CLICK_SQ) drag.moved = true
  if (drag.moved) {
    API.moveWindow(drag.totalX, drag.totalY)
  }
}
function onDocPointerUp(e) {
  // 拦截角色区域内的 pointerup：防止下方元素（如文件行）监听 pointerup 穿透误触发
  try { if (isWhaleHit(e)) { e.preventDefault(); e.stopPropagation() } } catch (err) {}
  endDrag(e, true)
}
function onDocPointerCancel(e) { endDrag(e, false) }
function onDocClickStopper(e) {
  // 只在角色命中区域拦截 click（保持透明区 pass-through）。
  // 持久注册（不随 endDrag 移除）——click 在 pointerup 之后派发，
  // 若在 endDrag 移除会导致 click 穿透到下方元素（如误打开文件）。
  if (!isWhaleHit(e)) return
  try { e.preventDefault(); e.stopPropagation() } catch (err) {}
}
document.addEventListener('pointerdown', onDocPointerDown, true)
document.addEventListener('click', onDocClickStopper, true)

var widgetCursor = ''
function setWidgetCursor(v) {
  if (v !== widgetCursor) {
    widgetCursor = v
    try { document.body.style.cursor = v } catch (err) {}
  }
}
function onDocPointerMoveCursor(e) {
  lastModPointer.x = e.clientX
  lastModPointer.y = e.clientY
  if (drag && drag.active) { setWidgetCursor('grabbing'); return }
  var el = null
  try { el = document.elementFromPoint(e.clientX, e.clientY) } catch (err) {}
  var overMenu = !!(el && el.closest && (el.closest('.dshwv-bubble') || el.closest('.dshwv-menu') || el.closest('.dshwv-menu-btn')))
  var overBtn = isMenuBtnHit(e) || isNearMenuZone(e)
  var overPanel = menuOpen && isMenuSurfaceHit(e)
  var overPet = isWhaleHit(e)
  if (overPet && !petHovered) {
    petHovered = true
    lastModPointer.over = true
    playHoverSound()
    modEmit('hoverenter')
  } else if (!overPet && petHovered) {
    petHovered = false
    lastModPointer.over = false
    stopHoverSound()
    modEmit('hoverleave')
  }
  var interactive = overMenu || overBtn || overPanel || overPet || menuOpen
  setWidgetCursor(overPet ? 'grab' : (overMenu || overBtn || overPanel || menuOpen ? 'pointer' : ''))
  menuBtn.classList.toggle('dshwv-menu-btn-visible', interactive)
  // 鼠标穿透：不在角色/菜单热区时把鼠标事件交给下层窗口（forward 保留 mousemove）
  if (API.setIgnore) API.setIgnore(!interactive)
}
document.addEventListener('pointermove', onDocPointerMoveCursor, true)
// setIgnoreMouseEvents(forward:true) 保证 mousemove 转发；pointer 事件通常同步生成，
// 这里双监听兜底，避免某些平台只有 mousemove 时悬停检测失效
document.addEventListener('mousemove', onDocPointerMoveCursor, true)

function endDrag(e, clickAllowed) {
  if (!drag || !drag.active) return
  drag.active = false
  try { root.releasePointerCapture(e.pointerId) } catch (err) {}
  document.removeEventListener('pointermove', onDocPointerMove, true)
  document.removeEventListener('pointerup', onDocPointerUp, true)
  document.removeEventListener('pointercancel', onDocPointerCancel, true)
  pressUp()
  root.classList.remove('dshwv-dragging')
  setWidgetCursor(isWhaleHit(e) ? 'grab' : '')
  if (clickAllowed && !drag.moved) {
    noteRapidClick()
    showBubble()
    refresh(true)
    return
  }
  // 拖拽结束：主进程做边缘吸附，回传吸附结果用于水平翻转
  API.dragEnd().then(function (snap) {
    if (snap) applySnap(snap.h, snap.v)
  }).catch(function () {})
}

// 5 秒内快速左键 10 次 → 短暂抖动 + 弹出彩蛋图
var rapidClicks = []
var burstBusy = false
var burstTimer = null
function noteRapidClick() {
  if (!burstOn) {
    rapidClicks = []
    return
  }
  var s = SKINS[skinId] || {}
  var need = Number(s.burstClicks) || 0
  if (need <= 0) {
    rapidClicks = []
    return
  }
  var now = Date.now()
  rapidClicks.push(now)
  rapidClicks = rapidClicks.filter(function (t) { return now - t <= 5000 })
  if (burstBusy) return
  if (rapidClicks.length >= need) {
    rapidClicks = []
    triggerPetBurst()
  }
}
function triggerPetBurst() {
  if (burstBusy) return
  burstBusy = true
  try {
    body.style.transform = 'scaleY(1) scaleX(1)'
    body.classList.remove('dshwv-shake')
    void body.offsetWidth
    body.classList.add('dshwv-shake')
  } catch (err) {}
  try {
    var s = SKINS[skinId] || {}
    if (API.showBurst) API.showBurst({ ms: 1600, img: s.burstImg || '' })
    if (soundOn && s.burstSound) {
      var burstAudio = new Audio(s.burstSound)
      burstAudio.volume = soundVol
      var bp = burstAudio.play()
      if (bp && bp.catch) bp.catch(function () {})
    }
    modEmit('burst', s)
  } catch (err) {}
  if (burstTimer) clearTimeout(burstTimer)
  burstTimer = setTimeout(function () {
    burstTimer = null
    try { body.classList.remove('dshwv-shake') } catch (err) {}
    burstBusy = false
  }, 1600)
}
// —— 初始化：先加载 .skin 包，再读配置并启动余额轮询 ——
var rect0 = root.getBoundingClientRect()
state.left = rect0.left
state.top = rect0.top
express()
render()
applySoundSet()
setupHitTest()
if (API.setIgnore) API.setIgnore(true)

function applySkinsCatalog(payload) {
  SKINS = {}
  var list = payload && Array.isArray(payload.skins) ? payload.skins : []
  list.forEach(function (s) {
    if (s && s.id && s.img) SKINS[s.id] = s
  })
  if (payload && payload.defaultId) DEFAULT_SKIN_ID = payload.defaultId
  if (!SKINS[DEFAULT_SKIN_ID]) {
    var ids = Object.keys(SKINS)
    if (ids.length) DEFAULT_SKIN_ID = ids[0]
  }
  rebuildSkinSelect()
}

function bootWithConfig(d) {
  if (!d) d = {}
  if (typeof d.scale === 'number' && d.scale >= MIN_SCALE - 0.1 && d.scale <= MAX_SCALE + 0.1) {
    state.scale = d.scale
    root.style.setProperty('--dshw-scale', String(d.scale))
    scaleInput.value = String(d.scale)
    scaleNumber.value = String(scaleToDisplay(d.scale))
  }
  if (typeof d.vol === 'number') {
    soundVol = d.vol
    soundOn = soundVol > 0
    volInput.value = String(soundVol)
    volPct.textContent = Math.round(soundVol * 100) + '%'
    try {
      if (pressAudio) pressAudio.volume = soundVol
      if (releaseAudio) releaseAudio.volume = soundVol
      if (hoverAudio) hoverAudio.volume = soundVol
    } catch (err) {}
  }
  if (typeof d.soundSet === 'string' && d.soundSet) {
    soundSet = String(d.soundSet)
  }
  if (typeof d.skin === 'string' && SKINS[d.skin]) setSkin(d.skin)
  else if (Object.keys(SKINS).length) setSkin(DEFAULT_SKIN_ID)
  else {
    applySkinTheme()
    rebuildSoundSelect()
  }
  usageMode = 'ledger'
  peakMode = 'default'
  if (typeof d.bubbleOn === 'boolean') {
    bubbleOn = d.bubbleOn
    bubbleToggle.checked = bubbleOn
  }
  if (typeof d.hoverSoundOn === 'boolean') {
    hoverSoundOn = d.hoverSoundOn
    hoverSoundToggle.checked = hoverSoundOn
  }
  if (typeof d.burstOn === 'boolean') {
    burstOn = d.burstOn
    burstToggle.checked = burstOn
  }
  if (typeof d.autoStart === 'boolean') {
    autoStart = d.autoStart
    autoStartToggle.checked = autoStart
  }
  if (typeof d.lowBalanceOn === 'boolean') {
    lowBalanceOn = d.lowBalanceOn
    lowBalanceToggle.checked = lowBalanceOn
  }
  if (typeof d.lowBalanceThreshold === 'number' && isFinite(d.lowBalanceThreshold)) {
    lowBalanceThreshold = d.lowBalanceThreshold
    lowBalanceInput.value = String(d.lowBalanceThreshold)
  }
  if (Array.isArray(d.providers)) {
    applyProvidersPayload({ ok: true, providers: d.providers, activeProviderId: d.activeProviderId || null })
  } else {
    loadProviders()
  }
  if (d.pos && (d.pos.hAnchor === 'left' || d.pos.hAnchor === 'right')) {
    state.h = d.pos.hAnchor
    root.classList.toggle('dshwv-left', state.h === 'left')
  }
  refresh(false)
}

var skinsReady = API.listSkins
  ? API.listSkins().then(applySkinsCatalog).catch(function () { applySkinsCatalog({ skins: [] }) })
  : Promise.resolve(applySkinsCatalog({ skins: [] }))

skinsReady
  .then(function () { return API.getConfig() })
  .then(bootWithConfig)
  .catch(function () { bootWithConfig({}) })
setInterval(function () { refresh(false) }, REFRESH_MS)

if (API.onSkinsChanged) {
  API.onSkinsChanged(function () {
    if (!API.listSkins) return
    var keep = skinId
    API.listSkins().then(function (payload) {
      applySkinsCatalog(payload)
      if (SKINS[keep]) setSkin(keep)
      else if (Object.keys(SKINS).length) setSkin(DEFAULT_SKIN_ID)
      rebuildSkinSelect()
    }).catch(function () {})
  })
}
if (API.onLowBalance) {
  API.onLowBalance(function (payload) {
    showLowBalanceBubble(payload || {})
  })
}
if (API.onConfigHint) {
  API.onConfigHint(function (cfg) {
    if (!cfg || typeof cfg !== 'object') return
    if (typeof cfg.autoStart === 'boolean') {
      autoStart = cfg.autoStart
      autoStartToggle.checked = autoStart
    }
  })
}
})()
