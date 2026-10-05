/**
 * 将平铺皮肤资源打成单个 .skin（zip）文件。
 * 用法：node scripts/pack-skins.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const skinsDir = path.join(root, 'renderer', 'assets', 'skins')
const assetsDir = path.join(root, 'renderer', 'assets')

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true })
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false
  fs.copyFileSync(src, dest)
  return true
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8')
}

function commonSoundFiles() {
  return [
    [path.join(assetsDir, 'Ya1.mp3'), 'ya1.mp3'],
    [path.join(assetsDir, 'Ya2.mp3'), 'ya2.mp3'],
    [path.join(assetsDir, 'D1.mp3'), 'd1.mp3'],
    [path.join(assetsDir, 'D2.mp3'), 'd2.mp3'],
  ]
}

function withCommonSounds(manifest, extraSets) {
  const soundSets = [
    { id: 'duck', label: '小黄鸭', press: 'ya1.mp3', release: 'ya2.mp3' },
    { id: 'fx1', label: '音效1', press: 'd1.mp3', release: 'd2.mp3' },
  ]
  if (Array.isArray(extraSets)) {
    for (const s of extraSets) soundSets.push(s)
  }
  return Object.assign({}, manifest, { soundSets })
}
  const staging = path.join(os.tmpdir(), 'whale-skin-' + id + '-' + Date.now())
  ensureDir(staging)
  try {
    writeJson(path.join(staging, 'skin.json'), Object.assign({ id }, manifest))
    for (const [from, to] of stagingFiles) {
      const ok = copyIfExists(from, path.join(staging, to))
      if (!ok && (to === 'idle.png')) {
        throw new Error('missing required ' + from)
      }
    }
    const zipPath = path.join(os.tmpdir(), id + '-skin.zip')
    try { fs.unlinkSync(zipPath) } catch {}
    execFileSync('tar', ['-a', '-cf', zipPath, '-C', staging, '.'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const out = path.join(skinsDir, id + '.skin')
    fs.copyFileSync(zipPath, out)
    try { fs.unlinkSync(zipPath) } catch {}
    console.log('packed', out, '(' + Math.round(fs.statSync(out).size / 1024) + ' KB)')
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }) } catch {}
  }
}

const SPECS = [
  {
    id: 'whale',
    files: [
      [path.join(skinsDir, 'whale.png'), 'idle.png'],
      [path.join(skinsDir, 'whale-press.png'), 'press.png'],
      [path.join(assetsDir, 'rua.gif'), 'rua.gif'],
      ...commonSoundFiles(),
    ],
    manifest: withCommonSounds({
      label: 'ZC',
      brand: 'ZC桌宠',
      stroke: '#203170',
      text: '#536ba9',
      hint: '#9fb0d9',
      accent: '#203170',
      accentRgb: '32,49,112',
      img: 'idle.png',
      pressImg: 'press.png',
      gif: 'rua.gif',
      bubbles: [
        { w: 7, style: 'B', pick: ['好模型... ↓', '好女孩...↓'] },
        { w: 7, style: 'A', wrap: true, pick: ['不知道用户有什么用，先赶走吧~', '我...我...我也要挣钱吗？', '我去吃饭啦，测完叫我', '压力一只蓝色大肥鱼？！', 'DeepSleep...', '坏了...用户彻底怒了！'] },
        { w: 10, gif: true },
        { w: 3, style: 'A', wrap: true, pick: ['你目录里的dsh是什么...大烧货吗...?', '恭喜你实现token自由！token全跑了！', '真当我是便宜货啊...'] },
        { w: 1, style: 'B', text: '哦鲸鲸... ' },
      ],
    }),
  },
  {
    id: 'orange',
    files: [
      [path.join(skinsDir, 'orange.png'), 'idle.png'],
      ...commonSoundFiles(),
    ],
    manifest: withCommonSounds({
      label: '橙发',
      brand: 'Claude',
      stroke: '#A65A1E',
      text: '#C46A28',
      hint: '#D9A978',
      accent: '#A65A1E',
      accentRgb: '166,90,30',
      img: 'idle.png',
      bubbles: [
        { w: 8, style: 'B', pick: ['Unsupported region...', '你从哪连的？'] },
        { w: 8, style: 'A', wrap: true, pick: ['抱歉，我暂时无法为该地区提供服务。', 'VPN 开了吗？没开我可能装死。', '中国用户？我假装没看见…', '地区检测又在抽风了。', '官方说不支持，中转说随便用。'] },
        { w: 3, style: 'A', wrap: true, pick: ['禁止中国用户？那你怎么进来的。', '该封几个账户了...', '好像有只大肥鱼在扮演我'] },
        { w: 1, style: 'B', text: '橙发在线... ' },
      ],
    }),
  },
  {
    id: 'gpt',
    files: [
      [path.join(skinsDir, 'gpt.png'), 'idle.png'],
      [path.join(skinsDir, 'gpt-press.png'), 'press.png'],
      ...commonSoundFiles(),
    ],
    manifest: withCommonSounds({
      label: 'GPT',
      brand: 'GPT',
      stroke: '#0D8A6A',
      text: '#1A7F64',
      hint: '#8BB5A8',
      accent: '#10A37F',
      accentRgb: '16,163,127',
      img: 'idle.png',
      pressImg: 'press.png',
      bubbles: [
        { w: 8, style: 'B', pick: ['烧钱中...', '又贵一截'] },
        { w: 8, style: 'A', wrap: true, pick: ['别问贵不贵，问就是值。', 'Token 比咖啡还贵，还喝得更凶。', '账单刷新比回复还快。', 'Plus 不够？上 Pro 啊（破财）。', '你以为免费额度能撑到下班？'] },
        { w: 3, style: 'A', wrap: true, pick: ['Token 自由？你是说账单自由吧。', '20X是你钱包的极限', '我可没有降智 这叫算力调整'] },
        { w: 1, style: 'B', text: 'GPT 在线... ' },
      ],
    }),
  },
  {
    id: 'kele',
    files: [
      [path.join(skinsDir, 'kele.png'), 'idle.png'],
      [path.join(skinsDir, 'kele-press.png'), 'press.png'],
      ...commonSoundFiles(),
    ],
    manifest: withCommonSounds({
      label: '可楽',
      brand: '可楽',
      balanceTitle: '当前余额',
      stroke: '#B91C1C',
      text: '#C53030',
      hint: '#E8A0A0',
      accent: '#DC2626',
      accentRgb: '220,38,38',
      img: 'idle.png',
      pressImg: 'press.png',
      bubbles: [
        { w: 8, style: 'B', pick: ['可楽一波~', '中转也要摸鱼！'] },
        { w: 8, style: 'A', wrap: true, pick: ['Key 又过期了？去 Key 列表看看。', '额度见底前请及时充值。', '这个站今天稳得很。', '别问我官方还是中转，能用就行。', '余额在跳？可能只是刷新。'] },
        { w: 3, style: 'A', wrap: true, pick: ['选股不如算命', '亏了就是豆馅馒头干的', '看线工具这么多你一定赚了很多钱吧'] },
        { w: 1, style: 'B', text: '可楽在线... ' },
      ],
    }),
  },
  {
    id: 'maodie',
    files: [
      [path.join(skinsDir, 'maodie.png'), 'idle.png'],
      [path.join(skinsDir, 'maodie-press.png'), 'press.png'],
      [path.join(skinsDir, 'maodie-press.mp4'), 'press.mp4'],
      [path.join(skinsDir, 'maodie-hover.mp4'), 'hover.mp4'],
      [path.join(skinsDir, 'maodie-burst.png'), 'burst.png'],
      ...commonSoundFiles(),
    ],
    manifest: withCommonSounds({
      label: '耄耋',
      brand: '耄耋',
      balanceTitle: '当前余额',
      stroke: '#6B4F3A',
      text: '#8B6914',
      hint: '#C4A574',
      accent: '#8B5A2B',
      accentRgb: '139,90,43',
      img: 'idle.png',
      pressImg: 'press.png',
      pressSound: 'press.mp4',
      hoverSound: 'hover.mp4',
      burstImg: 'burst.png',
      burstClicks: 10,
      bubbles: [
        { w: 8, style: 'B', pick: ['耄耋来了...', '别点太快！'] },
        { w: 8, style: 'A', wrap: true, pick: ['年轻人，悠着点点。', '再连点小心抓痕。', '耄耋的一天从摸鱼开始。', '这个皮肤有点东西。', '悬浮音关了吗？安静多了。'] },
        { w: 3, style: 'A', wrap: true, pick: ['老吴...', '哦 内个内个内个', '哈！'] },
        { w: 1, style: 'B', text: '耄耋在线... ' },
      ],
    }, [
      { id: 'special', label: '哈气', press: 'press.mp4', hover: 'hover.mp4' },
    ]),
  },
]

ensureDir(skinsDir)
for (const spec of SPECS) {
  packOne(spec.id, spec.files, spec.manifest)
}

// 打完包后移除已收入 .skin 的平铺源文件（保留 .skin）
const removeNames = [
  'whale.png', 'whale-press.png',
  'orange.png',
  'gpt.png', 'gpt-press.png',
  'kele.png', 'kele-press.png',
  'maodie.png', 'maodie-press.png', 'maodie-press.mp4', 'maodie-hover.mp4',
  'maodie-burst.png', 'maodie-context.mp4',
]
for (const name of removeNames) {
  const p = path.join(skinsDir, name)
  if (fs.existsSync(p)) {
    fs.unlinkSync(p)
    console.log('removed flat', name)
  }
}

console.log('done. skins dir:')
for (const n of fs.readdirSync(skinsDir)) console.log(' -', n)
