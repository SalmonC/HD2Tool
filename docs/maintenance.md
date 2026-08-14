# 维护指南

## 数据边界

正式目录仅包含主武器、副武器、支援武器、手雷、身体护甲和其他战备。强化剂、头盔、披风、玩家卡、表情和未发布内容不进入目录。

`src/data/catalog.json` 是唯一装备事实源：稳定 ID 不随翻译或 Wiki 标题变化；债券累计前置只在顶层债券页面表中维护；装备只引用债券 ID、页码和物品价格。`src/data/community-aliases.json` 只保存社区外号，英文替代名应写入装备的 `alternateNames`。

未知值直接省略。穿甲、拆毁、伤害和价格不得从描述推算，不得用 `0` 代替未知。

### 拆毁值待办（2026-08-09）

本轮从 Wiki 的 `Module:Decodedata-Attacks` 与旧版 `Module:Decodedata-Weapons` 当前 revision 中，按“稳定装备身份 + 明确攻击引用 + 组件类型”补入 183 个组件的拆毁值。其中 31 件（含 B-100 便携式地狱火炸弹）原本没有攻击组件的战备已按模块中的精确引用建立组件；B-100 按页面明确的 `Hellbomb` 爆炸组件补入拆毁 60。仍有 79 个旧组件无法与来源唯一对应，目录继续留空，界面直接省略对应字段，不得把同一装备的最大值复制给所有组件。

待核对装备：`a-arc-3-tesla-tower`、`a-flam-40-flame-sentry`、`a-gm-17-gas-mortar-sentry`、`a-las-98-laser-sentry`、`ac-8-autocannon`、`ar-gl-21-one-two`、`arc-12-blitzer`、`ax-arc-3-k-9`、`ax-flam-75-hot-dog`、`ax-las-5-rover`、`ax-tx-13-dog-breath`、`b-flam-80-cremator`、`cqc-1-one-true-flag`、`cqc-19-stun-lance`、`cqc-2-saber`、`cqc-20-breaching-hammer`、`cqc-30-stun-baton`、`cqc-42-machete`、`cqc-5-combat-hatchet`、`cqc-72-entrenchment-tool`、`cqc-73-entrenchment-tool`、`cqc-9-defoliation-tool`、`dbs-2-double-freedom`、`e-at-12-anti-tank-emplacement`、`e-mg-101-hmg-emplacement`、`eat-700-expendable-napalm`、`exo-55-breakthrough-exosuit`、`flam-40-flamethrower`、`flam-66-torcher`、`g-10-incendiary`、`g-109-urchin`、`g-123-thermite`、`g-13-incendiary-impact`、`g-142-pyrotech`、`g-3-smoke`、`g-31-arc`、`g-4-gas`、`g-6-frag`、`g-89-smokescreen`、`g-sh-39-shield`、`gl-52-de-escalator`、`gr-8-recoilless-rifle`、`k-2-throwing-knife`、`las-13-trident`、`las-17-double-edge-sickle`、`las-5-scythe`、`las-7-dagger`、`las-98-laser-cannon`、`m90a-shotgun`、`p-11-stim-pistol`、`p-35-re-educator`、`p-72-crisper`、`plas-101-purifier`、`plas-15-loyalist`、`plas-45-epoch`、`r-4-hyena`、`s-11-speargun`、`sg-20-halt`、`sg-22-bushwhacker`、`sg-225-breaker`、`sg-225ie-breaker-incendiary`、`sg-225sp-breaker-spray-pray`、`sg-451-cookout`、`sg-8-punisher`、`sg-88-break-action-shotgun`、`sg-97-sweeper`、`tx-41-sterilizer`。

后续只处理这些歧义项：优先读取 Wiki `Demolition` 汇总表与对应装备的 Detailed Weapon Statistics，按页面 ID 和明确的攻击组件名人工确认；仍不能唯一对应就继续留空。补给背包、护盾、位移背包和照明弹等没有可展示攻击组件的战备不显示“攻击参数”区块。

## 新版本更新

1. 记录游戏 build 和数据获取时间。
2. 从当时最新 Wiki 获取候选装备、获取方式、战斗参数和图片；从游戏本地简中资源获取正式中文名。能确认时记录游戏版本，不能确认则让 `gameBuild` 保持 `null`。
3. 优先用 Wiki page ID、官方本地化 key 和稳定型号与旧目录对齐，不按翻译名猜测身份。
4. 生成新增、变化、消失三类差异；人工确认后才修改权威目录。
5. 新增图片时记录 file page 和页面给出的 license，不需要对仓库内图片做逐文件哈希。
6. 运行 `npm run validate:data`、`npm test` 和 `npm run check`，然后分别验收 Pages 与 EXE。

未来 Wiki 或游戏文件格式变化时，为当次版本编写短期导入脚本即可；导入脚本不是长期运行时架构的一部分。

### 1.007.000 更新记录（2026-08-12）

- 新增 Castellan’s Creed 传奇债券与 6 件范围内装备；中文名暂按社区校对保存，待可核验的游戏简中资源出现后再替换为官方名称。
- 已按[官方 7.0.0 补丁](https://store.steampowered.com/news/app/553850/view/703276586134143012)更新 P-113、M6C/SOCOM、P-19 的备用弹匣和 MD-17 的拆毁值。短弹匣变化属于附件配置，没有覆盖到基础武器数据。
- 债券第三页累计前置可由 Wiki 的 `all-pages=210` 核验；第二页前置暂缺直接来源，保持未知，不猜值。
- 官方所称的图标更新只针对支援武器配装栏图标（背包／不可装填标记）。本项目展示装备实体图，现有图片不受影响；其他战备 SVG 在当日也没有对应文件更新。
- `npm run images:check` 会显式联网，比对 Wiki 原文件 SHA-1，并从支援武器页面重新发现当前配装栏图标引用；它不进入普通构建或 `check`。检测到变化后先人工确认图片内容，再用 `npm run images:accept` 接受新基线。本清单比较的是 Wiki 原文件哈希，不是本地 480px 缩略图哈希。
- CQC-72 战壕铲和 SG-88 双管霰弹枪是地图拾取武器，没有可呼叫的战备图标，明确排除在配装图标监视之外。接受基线时会拒绝空哈希、目录图片缺项或已有监视项消失，避免 Wiki 临时解析异常覆盖有效基线。
- 日常版本复查先运行 `npm run updates:check`，只检查两个启发式哨兵：焚燃者配装图标的页面引用与原文件 SHA-1，以及 G/40-K 热熔地雷详细攻击区的可用状态。焚燃者触发后运行完整 `images:check` 并同步整类支援武器图标；热熔地雷触发后核对所有同期新品及 decoded 模块，再补目录中有来源的字段。不能只更新哨兵本身；锚点未触发也不等于整类绝无变化。退出码 0 表示锚点未变，1 表示触发，检查异常直接失败。
- 2026-08-14，四件新品已进入 Wiki detailed attack / weapons data。目录已补入分组件伤害、耐久伤害、穿甲、拆毁、硬直、推力与可靠范围；P/40-K 的 500 总伤害拆分为 325 直击与 175 爆炸，不能再合并成单组件。

## 必须保留的回归案例

- MG-43 等 Wiki `Support Weapon` 条目使用 `support-weapon`，UI 归入“战备”，同时保留武器攻击和操控属性。
- EXO 条目属于其他战备，不因拥有攻击参数而归入普通武器。
- CQC-72 与 CQC-73、GP-20 与 GP-31、LAS-13 与 LAS-16 是不同实体，不得按近似标题合并。
- 身体护甲不能被同名头盔的价格和属性覆盖。
- 飞矛、WASP 等多组件攻击分别保存直击与爆炸 AP，不能取最大值代表整件装备。
- 债券非第一页显示该页物品价格和从零到该页的累计前置勋章，两者不得相加为“总价”。
- “火喷”等社区外号只能指向一个稳定装备 ID。

## 发布

Vite 始终使用相对资源路径，同一份 `dist` 同时用于 GitHub Pages 子路径和 Neutralino。Pages 不注册 Service Worker；EXE 与 Pages 的购买计划分别保存在各自 localStorage 中，不进行同步或导入导出。

Neutralino 的端口 `47831` 和 `applicationId` 是桌面购买计划的持久化身份，后续版本不得随意修改。桌面版按单实例使用；若端口被其他程序占用或重复启动第二份 EXE，应用可能无法启动，应先关闭占用该端口的进程。清理 WebView2 应用数据或更换 Windows 用户仍会清除计划。
