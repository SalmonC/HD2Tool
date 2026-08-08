# HD2 军需簿

HD2 军需簿是一个简体中文优先、离线优先的《HELLDIVERS 2》装备速查与解锁计划工具。它是公开、免费、无账号、无后端的非官方项目，不收集分析数据。

当前仓库包含首批社区来源数据：38 个装备条目、48 个装备外号和 5 个护甲属性俗称。它不是完整当前数据库。名称、型号、债券归属与外号来自用户提供全文的一篇小黑盒社区整理帖，全部保留来源并标为 `pending`；页码、价格、英文名、武器数值和图片尚未核验，不会被自动补全或冒充官方事实。

## 开发

需要 Node.js 24、npm 和可联网的依赖安装环境：

```bash
npm ci
npm run dev
```

常用检查：

```bash
npm run validate:data
npm run typecheck
npm test
npm run build
npm run smoke
npm run desktop:check
```

`npm run check` 会依次执行数据生成/校验、类型检查、单测、Prettier 检查、生产构建、PWA preview smoke 和 Neutralino 配置静态检查。

## 数据与搜索

基础数据契约位于 `src/data/source/catalog-source.json`，社区转录位于 `src/data/source/xiaoheihe-community-aliases.json`，人工覆盖位于 `src/data/overrides/manual-overrides.json`，构建生成物为 `src/data/catalog.json`，不要直接手改生成物。`npm run generate:data` 会从原始层重新生成规范化搜索字段。

武器属性使用版本化、来源驱动的 taxonomy。没有可靠统一体系时，维度保持 pending，UI 隐藏筛选项；字段必须同时匹配 taxonomy 来源和标尺版本，并有字段级来源，不能从描述推导数值。候选数据见 `src/data/candidates/user-supplied.json`。

开发期同步只生成报告，不自动改目录：

```bash
npm run sync:data
node scripts/sync-data.mjs --steam-path "G:\\Steam"
node scripts/sync-data.mjs --wiki-api https://example-wiki.invalid/api.php --wiki-query "candidate"
```

`--steam-path` 指向 Steam 客户端根目录即可；脚本还会只读解析 `libraryfolders.vdf`，发现安装在其他盘符的游戏库。Steam manifest、Wiki API 和 filediver 结果都只能先进入报告/候选层。正式数据需要人工核验；本项目不复制 filediver 代码，也不把英文 Wiki 名称自动翻译成简中正式名。

## PWA 与 Pages

Vite 默认使用相对 base，适合本地 preview 和 Neutralino；GitHub Pages 工作流设置 `VITE_BASE_PATH=/<repo>/`，因此仓库子路径、PWA 资源和 `?item=<stable-id>` 分享参数都使用同一份构建产物。

PWA 由 `vite-plugin-pwa` 生成 service worker。发现新版本时页面会提示刷新；localStorage 计划不会随刷新丢失。

## Windows 桌面端

Neutralino CLI 已作为锁定版本的 devDependency。配置位于 `neutralino.config.json`，桌面端复用 `dist`，不引入 Electron：

```bash
npx --no-install neu update
npm run desktop:build
```

`neu build --embed-resources` 会在 `desktop-dist/hd2-supply-book/` 生成内嵌资源的单文件 Windows EXE；本机没有下载条件时，GitHub Actions 的 Windows Release workflow 会按同一配置下载官方 Neutralino 二进制并构建。首版没有代码签名证书，Windows SmartScreen 可能提示；发布文件同时提供 SHA-256。

## 许可与声明

源代码按 [MIT](LICENSE) 发布。游戏数据、名称、商标和图片不包含在代码许可中，素材记录和移除联系说明见 [NOTICE](NOTICE) 与 `docs/data-pipeline.md`。HD2 军需簿与 Arrowhead Game Studios、Sony 或 PlayStation 无隶属关系。
