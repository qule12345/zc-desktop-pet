# ZC桌宠

独立 Electron 桌宠：透明置顶挂件常驻桌面，实时显示 API 余额与今日用量，支持多 Key、多皮肤（`.skin`）、插件模组、拖拽吸附、托盘与开机自启。

ZC桌宠开源项目，MIT 协议。欢迎提 Issue / PR。

仓库：<https://github.com/qule12345/zc-desktop-pet>

## 特性

- **独立桌面应用**：Electron 透明无边框置顶窗口，不依赖浏览器；空闲时鼠标穿透，桌面照常操作
- **余额与今日已用**：约 60 秒自动刷新，点击宠物可立即刷新并弹气泡；数字变化带滚动动画
- **用量模式自动选择**
  - **记账**：用余额差值累计今日已用（免额外令牌，跨天归零并保留历史）
  - **中转日志**：对接 one-api / new-api 等 `/api/log/token` 汇总用量（含缓存 token）
  - **无限额度**：识别到无限配额时单独展示
- **多 Key / 多端点**：命名管理多组 API Key，支持官方与中转（自定义 Base URL / callback）；选用、查余额、拉模型列表、复制 Key/端点
- **皮肤系统（`.skin`）**：zip + `skin.json`，内置多套皮肤；菜单一键切换，也可导入用户皮肤（同 id 覆盖内置）
- **插件模组**：皮肤包内 `plugin.js` / `mods/*.js` 等，通过 `ZC.register({ onLoad, onTick, drawPet, drawBubble, ... })` 接入按压、连点、绘制与菜单扩展
- **气泡 / 音效 / 连点**：皮肤自定义台词与气泡外形（`bubble.svg` / `bubble.html`）；多音效组与音量；连点可触发全屏爆发特效
- **拖拽 + 边缘吸附**：左/右/上/下四分吸附，左吸附时整体水平镜像；窗口位置记忆
- **托盘与开机自启**：关闭进托盘；托盘可显示/隐藏、开关自启、退出；设置里也可开自启
- **低余额提醒**：可设阈值，系统通知 + 气泡提示
- **密钥加密**：`API_KEY` 等经 AES-256-GCM 写入 `userdata.json`，明文不落盘、渲染层读不到

## 快速开始（使用打包好的程序）

1. 从 [Releases](https://github.com/qule12345/zc-desktop-pet/releases) 下载 Windows 便携版 `ZC桌宠_<version>_win_x64.exe`（或按下方自行打包），放到任意可写目录双击运行
2. 桌面出现桌宠 → 悬停右上角**三点菜单** → 进入 **Key 列表**，添加并保存你的 API Key（可填中转地址）
3. 余额约 60 秒内自动显示；点击宠物可立即刷新并弹气泡
4. 首次运行后，EXE 同目录生成 `userdata.json`（设置 + 加密密钥 + 记账数据）

托盘图标：显示/隐藏、开机自启、退出。关闭窗口默认隐藏到托盘，不会直接退出。

## 从源码运行

环境：Windows 10/11 或 macOS，Node.js ≥ 18。

```bash
npm install
npm start
```

冒烟测试（启动约 5 秒后自动退出）：

```bash
npx electron . --smoke
```

开发模式下数据同样写到项目目录的 `userdata.json`。

## ZC工坊 / 成品广场（网站）

在线示例：<https://zc.qile.chat/>（成品广场：[/plaza.html](https://zc.qile.chat/plaza.html)）

源码目录：`skin-studio/`（皮肤制作工坊 + 广场上传/审核）。

```bash
cd skin-studio/server
npm install
# 建议生产环境：
# export ADMIN_NAME=你的管理员
# export ADMIN_PASS=至少8位
# export UPLOAD_TOKEN=可选主令牌
# export SESSION_SECRET=长随机串
export PORT=5188
npm start
```

浏览器打开 `http://127.0.0.1:5188/plaza.html`。Nginx 反代到该端口时，建议 `index` 设为 `plaza.html`，或把 `/` 也反代到 Node（Node 会把 `/` 重定向到广场）。

勿提交 `skin-studio/server/data/`（用户、会话、上传文件）；`fixtures/`、`sfx/` 为工坊示例素材，需一并部署。

## 构建

### Windows 便携 EXE

```bash
# 国内网络可先设 electron-builder 镜像
# PowerShell:
# $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

npm run dist
```

产物：`dist/ZC桌宠_<version>_win_x64.exe`（当前版本见 `package.json`）。

说明：

- `npm run dist` = `prepare-electron.mjs` + `electron-builder --win portable`
- 默认 `signAndEditExecutable: false`，由 `scripts/prepare-electron.mjs` 在打包前用 rcedit 打好图标与版本信息，避免未开「开发者模式」时符号链接失败
- 首次打包会把 Electron 运行时复制到 `build/electron-dist/`（约 300MB，已 gitignore），之后可离线复用

### macOS

需在 Mac 上构建：

```bash
npm run dist:mac       # zip（x64 + arm64）
npm run dist:mac:dmg   # dmg（x64 + arm64）
```

### 其他

```bash
npm run dist:win   # Windows 构建（含 prepare-electron）
npm run dist:all   # Win 便携 + Mac zip
```

## 设置菜单（悬停宠物 → 三点）

| 项 | 说明 |
| --- | --- |
| **皮肤** | 切换内置/已导入皮肤；旁侧 **导入** 选择 `.skin` |
| **大小** | 缩放滑块 + 数字 |
| **音效 / 音量** | 皮肤提供的音效组；音量 0 = 静音 |
| **气泡** | 思考气泡开关 |
| **悬浮音** | 悬停是否播放音效 |
| **连点效果** | 短时间连点触发爆发层（皮肤可配次数/图/音） |
| **开机自启** | 登录系统后自动启动 |
| **低余额** | 开关 + 阈值；低于阈值时通知 |
| **Key 列表** | 多 Key 管理：添加/编辑/选用/查余额/模型列表等 |
| **退出** | 退出应用（托盘「退出」同样有效） |

## 皮肤（`.skin`）

皮肤为单个 `.skin` 文件（zip，内含 `skin.json` 与资源）：

- 放置：`renderer/assets/skins/`（内置）或菜单导入（用户目录，同 id 优先）
- 常见资源：待机/按压图、gif、配色、`brand`、台词气泡、`soundSets`
- 可选：`bubble.svg` / `bubble.html` 自定义气泡外形
- 可选插件：`plugin.js`、`mod.js`、`mods/*.js` 以及配套 CSS

插件入口示例：

```js
ZC.register({
  onLoad(api) { /* api.menu / api.store / api.asset ... */ },
  onTick(ctx) {},
  drawPet(ctx, canvas) {},
  drawBubble(ctx, canvas) {},
})
```

事件包括 press / release / tick / burst / pose / skin / bubbleopen / bubbleclose 等。`skin.json` 中未被核心占用的字段会原样交给插件。

维护内置包：

```bash
npm run pack:skins          # 从源文件重新打包内置 .skin
npm run inject:skin-sounds  # 给已有 .skin 注入通用音效组
```

内置示例皮肤 id：`whale`、`orange`、`gpt`、`kele`、`maodie` 等（以 `pack-skins` 与 `renderer/assets/skins/` 为准）。

## 数据存储与安全

- 数据文件：**`userdata.json` 与 EXE 同目录**（开发模式为项目目录；目录只读时回退用户主目录）
- 主要内容：`settings`、窗口位置、加密的密钥、用量账本与历史、皮肤相关偏好
- 加密：AES-256-GCM；密钥由内置 pepper + 本机标识经 PBKDF2 派生——防明文直读，不是军规保险柜；换机器后通常需重新填写 Key
- 迁移：把程序与 `userdata.json` 一起复制；注意加密绑定本机

## 目录结构

```
zc-desktop-pet/
├── LICENSE
├── README.md
├── package.json
├── main.js                 # 主进程：窗口 / 托盘 / IPC / 吸附 / 自启
├── preload.js              # contextBridge
├── lib/
│   ├── core.js             # userdata、加密、余额/账本
│   └── skins.js            # .skin 加载与缓存
├── renderer/
│   ├── index.html / widget.js
│   ├── keys.html / keys.js # Key 管理页
│   ├── burst.html          # 连点爆发层
│   ├── mod-host.js         # 插件宿主
│   └── assets/skins/       # 内置 .skin
├── scripts/
│   ├── pack-skins.mjs
│   ├── inject-skin-sounds.mjs
│   └── prepare-electron.mjs
└── build/                  # 图标等打包资源
```

## 常见问题

- **余额显示未配置**：打开菜单 → Key 列表，添加并选用一组 Key。
- **今日已用是 --**：记账模式需先成功观测到一次余额；中转日志模式需端点支持对应接口。
- **窗口拖不动**：按住宠物不透明区域拖动；透明区域是穿透的。
- **点不到宠物**：空闲时穿透已开，鼠标移入宠物区域即恢复交互。
- **如何退出**：菜单底部「退出」，或托盘 → 退出。
- **没有声音**：确认皮肤包内音效文件存在；音量不为 0；缺失时静默降级。
- **userdata 写不进去**：把程序放到可写目录；只读目录会回退到用户主目录。
- **杀软误报**：未签名 Electron 应用常见现象，可自行签名后分发。
- **自定义外观**：做 `.skin` 包导入，或改 `skin.json` + 资源后 `npm run pack:skins`。

## 许可证

MIT License，详见 [LICENSE](./LICENSE)。

```
Copyright (c) 2026 qule12345
```
