/**
 * 给现有 .skin 注入音效文件 + soundSets。
 * 通用：小黄鸭 / 音效1；有 press.mp4+hover.mp4 的皮肤追加「哈气」。
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const skinsDir = path.join(root, 'renderer', 'assets', 'skins')
const assetsDir = path.join(root, 'renderer', 'assets')

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }) }

function inject(skinPath) {
  const id = path.basename(skinPath, '.skin')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-sfx-' + id + '-'))
  try {
    execFileSync('tar', ['-xf', skinPath, '-C', tmp], { windowsHide: true })
    const manifestPath = path.join(tmp, 'skin.json')
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    // 拷贝通用音效进包
    fs.copyFileSync(path.join(assetsDir, 'Ya1.mp3'), path.join(tmp, 'ya1.mp3'))
    fs.copyFileSync(path.join(assetsDir, 'Ya2.mp3'), path.join(tmp, 'ya2.mp3'))
    fs.copyFileSync(path.join(assetsDir, 'D1.mp3'), path.join(tmp, 'd1.mp3'))
    fs.copyFileSync(path.join(assetsDir, 'D2.mp3'), path.join(tmp, 'd2.mp3'))

    const soundSets = [
      { id: 'duck', label: '小黄鸭', press: 'ya1.mp3', release: 'ya2.mp3' },
      { id: 'fx1', label: '音效1', press: 'd1.mp3', release: 'd2.mp3' },
    ]

    const pressMp4 = fs.existsSync(path.join(tmp, 'press.mp4'))
    const hoverMp4 = fs.existsSync(path.join(tmp, 'hover.mp4'))
    let legacyPress = null
    let legacyHover = null
    const mediaRe = /\.(mp3|mp4|m4a|aac|wav|ogg|oga|opus|flac|webm|mov)$/i
    if (m.pressSound && mediaRe.test(String(m.pressSound)) && fs.existsSync(path.join(tmp, m.pressSound))) {
      legacyPress = String(m.pressSound)
    }
    if (m.hoverSound && mediaRe.test(String(m.hoverSound)) && fs.existsSync(path.join(tmp, m.hoverSound))) {
      legacyHover = String(m.hoverSound)
    }

    if (pressMp4 || hoverMp4 || legacyPress || legacyHover) {
      if (legacyPress && legacyPress !== 'press.mp4') {
        fs.copyFileSync(path.join(tmp, legacyPress), path.join(tmp, 'press.mp4'))
      }
      if (legacyHover && legacyHover !== 'hover.mp4') {
        fs.copyFileSync(path.join(tmp, legacyHover), path.join(tmp, 'hover.mp4'))
      }
      const special = { id: 'special', label: '哈气' }
      if (fs.existsSync(path.join(tmp, 'press.mp4'))) special.press = 'press.mp4'
      if (fs.existsSync(path.join(tmp, 'hover.mp4'))) special.hover = 'hover.mp4'
      if (special.press || special.hover) {
        soundSets.push(special)
        m.pressSound = special.press || undefined
        m.hoverSound = special.hover || undefined
      }
    } else {
      delete m.pressSound
      delete m.hoverSound
    }

    m.soundSets = soundSets
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8')

    const zip = path.join(os.tmpdir(), id + '-sfx.zip')
    try { fs.unlinkSync(zip) } catch {}
    execFileSync('tar', ['-a', '-cf', zip, '-C', tmp, '.'], { windowsHide: true })
    fs.copyFileSync(zip, skinPath)
    try { fs.unlinkSync(zip) } catch {}
    console.log('updated', id, 'soundSets=', soundSets.map((s) => s.id).join(','))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

for (const name of fs.readdirSync(skinsDir)) {
  if (!/\.skin$/i.test(name)) continue
  inject(path.join(skinsDir, name))
}

// 清缓存
const cache = path.join(process.env.APPDATA || '', 'zc-desktop-pet', 'skin-cache')
if (cache && fs.existsSync(cache)) {
  fs.rmSync(cache, { recursive: true, force: true })
  console.log('cleared skin-cache')
}
