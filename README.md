# ZC桌宠

独立 Electron 桌宠：常驻桌面，显示 API 余额与今日用量，支持多 Key、多皮肤（`.skin` 包）、拖拽吸附。

ZC桌宠开源项目，MIT 协议。欢迎提 Issue / PR。

## 快速开始

```bash
npm install
npm start
```

菜单可切换皮肤、导入 `.skin`、开关气泡/音效/连点/开机自启/低余额提醒。  
托盘图标：显示/隐藏、开机自启、退出。

打包：

```bash
npm run dist
```

用户数据：`userdata.json`（EXE 同目录；写失败时回退到用户主目录）。

## 皮肤

皮肤为单个 `.skin` 文件（zip + `skin.json`），放在 `renderer/assets/skins/`，也可在菜单里导入。

音效也在包内：`soundSets`。

皮肤包还可带 `bubble.svg` / `bubble.html` 自定义气泡外形，以及 `plugin.js`、`mods/*.js`：用 `ZC.register({ onLoad, onTick, drawPet, drawBubble })` 当模组接入，事件含 press / release / tick / burst 等。`skin.json` 里未占用的字段会原样交给插件。

```bash
npm run pack:skins          # 从源文件重新打包
npm run inject:skin-sounds  # 给已有 .skin 注入通用音效
```

## 目录

```
main.js / preload.js
lib/           # 余额、记账、皮肤加载
renderer/      # 挂件 UI、音效、皮肤包
scripts/       # pack-skins、prepare-electron
build/         # 应用图标
```

## License

MIT
