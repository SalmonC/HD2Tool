# HD2 军需簿实施计划

## 1. 目标与交付物

构建一个简体中文优先、离线可用的《HELLDIVERS 2》装备速查工具，同时交付：

- GitHub Pages 可部署的 PWA。
- Windows 10/11 x64 单文件免安装 EXE。
- 可版本化、可验证、带来源记录的静态装备数据库。
- 完整源码、自动化测试、构建与发布工作流、维护说明。

应用名称固定为“HD2 军需簿”。公开、免费、无账号、无后端、无分析统计。

## 2. 首版功能

### 2.1 速查

- 收录武器、护甲、战备、手雷、强化剂；不收录披风、表情、姿势、称号、玩家卡、涂装和债券内返还的超级货币。
- 支持按官方简中名、型号、英文名、社区外号、拼音全拼、拼音首字母搜索，并容忍少量错字。
- 排序优先级：型号/正式名精确命中 > 外号精确命中 > 前缀 > 包含 > 拼音 > 模糊匹配。
- 结果显示缩略图、型号、官方简中名、类别和获取来源，并标注通过哪个外号命中。
- 武器详情使用来源驱动的版本化 `AttackProfile`，不再把一件武器压缩为单一 AP/拆毁值：
  - 每个攻击组件独立记录 projectile、explosion、spray、charge 等组件类型、档位、来源和核验状态；组件可按来源提供 standard/durable damage、DPS、AP0–10、角度穿透、demolition force、stagger、push、状态效果、半径和爆炸/BaDR 相关性。
  - 列表筛选只使用明确配置的 primary attack component 代表值；代表规则、组件 ID 和缺失状态必须在详情与数据说明中可追溯，不能从描述自行计算。
  - `weaponType` 先区分 primary/secondary/support/throwable，再采用游戏/Wiki 的 rifle/shotgun/marksman 等细类；`ammoTraits` 只收录 Wiki attack/projectile/status 明确给出的 ballistic、laser、plasma、arc/electric、flame、explosive 等标签，爆炸属性不自动等同于唯一弹药类型。
  - `armorPenetration` 保留 Wiki AP 标签并尽可能记录 AP0–10 数值；没有来源明确标尺时缺省，不从“轻甲/中甲穿透”文字反推。
  - `demolitionPower` 迁移到 Wiki 支持的 0–60 整数标尺；B-100/地狱火炸弹等 60 必须有逐字段来源，旧 0–50 数据通过 schema migration 处理，禁止静默扩展。
- 分类体系的选择顺序固定为官方 > 维护良好的 Wiki > 有共识且可引用的社区资料。每个维度记录 `taxonomySource`、标尺版本和来源说明，数据说明页公开当前采用的体系。
- 上述字段允许缺省。没有可信来源时宁可不展示、不进入该筛选结果，也不得猜测；筛选器只显示当前已核验数据中实际存在的值，并提示覆盖条目数。
- 详情页/抽屉显示：
  - 债券装备：债券名、债券类型、页码、页面勋章门槛、物品勋章价格、从零开始的理论总勋章数、债券本身的超级货币价格。
  - 基础战备：默认自带，或等级要求与征用点价格。
  - 超级商店、版本奖励、活动、联动、不可获取物品：显示对应来源、价格和状态。
- “页面勋章门槛”解释为进入该页前需在该债券中消费的勋章，不伪装成固定前置物品清单。

### 2.2 解锁计划

- 添加、删除、拖动排序、标记已购买。
- 已购买项移动到折叠的“已完成”区，可恢复或彻底删除。
- 活跃目标按债券分组，显示单项理论成本。
- 首版不记录玩家完整债券进度，因此不得声称计算准确的账号剩余成本，也不得简单重复相加共享页面门槛。
- 网页与 EXE 分别本地保存，通过版本化 JSON 导入/导出迁移计划。

### 2.3 UI

- 战术终端风格：深色、高对比、黄白点缀、克制的网格/扫描线装饰；不照搬游戏 UI。
- 主导航仅包含“速查 / 解锁计划 / 数据说明”。
- 移动优先，覆盖 360px 手机、平板和桌面。
- 使用系统中文字体，不额外下载字体。
- 支持 `/` 聚焦搜索、方向键选结果、Enter 打开、Esc 返回，提供可见焦点与图片替代文本。
- 使用 `?item=<stable-id>` 分享装备详情，避免 GitHub Pages SPA 路由回退问题。

## 3. 技术方案

- TypeScript + Vite + Preact + 原生 CSS。
- 不引入大型 UI 库、状态管理库或运行时 Schema 库。
- PWA 使用 `vite-plugin-pwa`，预缓存应用、静态数据与装备缩略图；有新版本时提示刷新。
- Windows 使用 Neutralinojs，并以 `--embed-resources` 生成单文件 x64 EXE；运行时依赖 Windows 10/11 通常已有的 WebView2。
- 同一份前端构建产物供 PWA 与 EXE 使用。
- 本地状态使用带 schema 版本的 localStorage 封装，并提供显式迁移函数。
- 拼音索引在构建期生成，客户端使用轻量自研评分，不把拼音库或 Fuse 类库带入运行时。

性能预算：

- 首屏压缩传输量（不含延迟图片）不超过 350 KB。
- 应用代码与静态数据（不含图片）不超过 1 MB。
- 每张 WebP 缩略图最长边约 480px、目标不超过 60 KB。
- 单文件 EXE 含全部缩略图目标不超过 30 MB。
- 数据加载后普通设备单次搜索更新目标低于 50ms。

## 4. 数据模型

建立明确的 TypeScript 接口和 JSON Schema：

- `Equipment`：稳定 ID、型号、官方简中名、英文对照、类别、图片、别名、获取方式、来源引用、验证版本。
- 武器可带版本化 `attackProfile` 和可选兼容投影 `weaponProfile`：`weaponType`、`ammoTraits`、`armorPenetration`、`demolitionPower` 从攻击组件或分类来源映射而来，字段分别携带 `sourceRefs`、source revision/oldid、抓取时间、taxonomy/scale 版本与核验状态；非武器禁止出现攻击结构。生成器不得把投影反写成唯一真值。
- `AttackProfile`：版本、组件数组、primary component 选择规则与代表值说明；`AttackComponent`：稳定组件 ID、组件类型/档位、原始字段、单位、来源、核验状态和可选 `derived` 公式/输入来源。没有来源的字段为 null/pending。
- `TranslationEvidence`：canonical English、候选中文、证据 URL/平台、命中关键词、检索时间、置信度、审核状态（`verified-community | pending | conflicting` 等）；翻译证据与最终映射落盘，不在代码中散落硬编码。
- `Acquisition` 判别联合：`warbond | requisition | default | superstore | edition | event | unavailable | other`。
- `WarbondAcquisition`：`warbondId`、`page`、`itemMedals`、`pageIncrementalMedals`、`pageUnlockMedals`；其中 `pageUnlockMedals` 固定表示从零到该页的累计前置勋章。
- `Alias`：文本、类别、来源链接、审核状态；规范化与拼音字段由构建过程生成。
- `AssetRecord`：本地路径、原始页面、作者/上传者、许可证或版权状态、同步日期、文件哈希。
- `PlanState`：schema 版本、待购买稳定 ID 顺序、已完成记录、导出时间。
- `DataMeta`：游戏 build ID、数据版本、生成时间、核验状态和未决差异。
- `SourceRef`：增加 `revision`/`oldid`、`capturedAt`、`retrievedAt` 等可选字段；条目级、字段级、图片级和翻译级来源都必须可独立追溯。

所有货币分栏展示，不跨勋章、超级货币、征用点求和。稳定 ID 不随中文翻译变化。

## 5. 数据来源与更新

中文来源优先级：

1. 本机已安装游戏的简体中文资源，作为装备名和债券名首要真值源。
2. PlayStation/Steam 官方简中公告用于交叉验证名称和归属。
3. `https://helldivers.wiki.gg/` 作为主要英文事实来源；优先 MediaWiki API、页面结构和可缓存快照，用于条目、攻击组件、分类、获取数据、页码/价格和图片候选；Wiki 只在同步阶段访问，不在构建运行时访问。
4. 游戏内截图核对无法从结构化资源确认的页码、价格和页面门槛。

实现一个开发期同步命令，不在用户端运行：

- 检测 Steam 安装路径、manifest 和 build ID。
- 使用 BSD-3-Clause 的 `xypwn/filediver` 字符串导出能力读取简中资源；固定版本并记录校验和，不复制无许可证项目代码。
- 查询 Wiki API/页面结构并生成新增、删除、字段变化、Potentially Outdated 标记、攻击组件和图片候选报告；同步记录明确 User-Agent、节流、原始快照或规范化中间层。
- 保留已有人工核验字段；无法确认的新字段进入待核验报告并使正式发布失败，不静默发布猜测译名。
- 输出格式化后的静态 JSON、搜索索引、数据版本和来源清单。
- 当前策略是用户请求更新时由 Codex 执行同步与校验，不做定时无人值守同步。

中文名称不得由英文 Wiki 自动翻译冒充官方简中。已有小黑盒中文正式名、俗称和 53 个称呼必须保留并建立唯一映射；新增中文名要用中文互联网搜索保存证据 URL、平台、关键词、检索时间、置信度和审核状态。无法确认时显示 canonical English + “中文名待核验”，不反向覆盖 Wiki 数值。

外号通过有来源的社区材料加入。默认要求两个独立公开用例，或一个较权威社区词表/作者来源；小圈子称呼可以收录但标记“少见”。

用户提供了以下“称呼—债券来源”候选，必须原样保存在候选层并逐项核验，不得仅凭此清单标为官方或已验证：

- 电榴弹 — 法律铁碗
- 最后通牒 — 自由公仆
- 制导手枪 — 外骨骼装甲专家
- 焦土 — 绝地潜兵总动员
- 导弹井 — 尘卷风
- 离子喷 — 遥遥领先
- 爆炸弩、爆裂铳、铝热剂 — 民主爆破
- 千兆雷、工兵甲 — 堑壕之师
- 荡平者 — 破围先锋
- 潜行甲、审查官 — 绝密军团

候选层保留用户原始拼写（包括可能的“铁碗/铁腕”等差异）、提交时间和来源类型；核验后再决定其是官方名、型号简称、社区外号还是误配。未核验候选默认不进入生产搜索索引。

## 6. 图片策略

- 所有实战装备均有本地缩略图或统一占位图。
- 官方素材优先，其次 Wiki 文件页图片；逐图记录来源页、file page、原始 URL、Wiki revision/oldid、作者（如有）、明确 license raw、同步时间和 SHA-256。Wiki 页面正文的 CC 声明不能自动推导单张图片许可；作者为空时保持为空。
- 构建期统一裁切留白、转 WebP/AVIF 或合理 SVG、检查最大像素和体积；文件页许可不清楚时继续使用项目占位图。
- 不热链第三方图片；无明确来源的图片不得进入正式资源集。
- 源代码可用 MIT；游戏数据与图片不纳入 MIT，另设 NOTICE/素材来源页。
- 页面注明非官方、与 Arrowhead/Sony 无隶属关系，商标和素材归各权利人所有，并以 GitHub Issue 作为移除联系渠道。

## 7. 构建与发布

- PR/提交检查：格式检查、类型检查、单元测试、数据 Schema 校验、生产构建、端到端测试、体积预算。
- `main` 通过 GitHub Actions 构建并部署 GitHub Pages，正确处理 `/<repo>/` base path。
- Git tag 触发 Windows runner，生成 Neutralinojs 单文件 EXE、SHA-256 文件和数据版本说明并上传 GitHub Release。
- 首版不购买 Windows 代码签名证书；README 说明 SmartScreen 可能提示，并提供源码与 SHA-256 核验方式。

## 8. 测试与验收

- 数据：重复 ID、重复正式名、悬空债券引用、负数价格、非法页码、缺来源、无图片记录、外号冲突。
- 搜索：正式名、型号、外号、拼音首字母、包含、轻微错字和冲突外号的排序。
- 武器数据：Wiki 纳入范围条目数对账、组件稳定 ID、字段来源/revision、AP0–10、攻击组件、primary 代表规则、0–60 拆毁值、旧 0–50 migration、缺失/pending/derived 规则。
- 获取方式：第一页/后续页、免费/付费债券、默认战备、等级征用点战备、债券战备、超级商店和绝版项目。
- 计划：增删、拖动、完成、恢复、刷新持久化、导入导出、旧 schema 迁移、损坏 JSON 拒绝。
- UI：手机/桌面响应式、键盘、焦点、对比度、长中文名、缺图占位。
- PWA：仓库子路径、分享链接、离线重启、缓存更新、更新不丢计划。
- EXE：Windows 10/11 x64 双击启动、完全离线查询、中文渲染、本地持久化、JSON 与网页互通。
- 页面必须显示游戏 build、数据更新时间与核验状态。

## 9. 敏捷实施顺序

1. 建立可运行的 Preact/Vite 纵向切片：少量样例数据、搜索、详情、计划、本地持久化。
2. 补齐数据 Schema、验证器、搜索索引、导入导出和完整测试。
3. 完成战术终端 UI、响应式、键盘与无障碍。
4. 实现 PWA 离线、GitHub Pages 构建与部署工作流。
5. 实现 Neutralinojs 单文件 EXE 与 Release 工作流。
6. 实现数据同步/差异报告/图片优化管线，并尽可能填充当前完整可信数据。
7. 执行生产构建、端到端测试、体积检查和最终文档验收。

每个阶段都必须保持主干可运行、测试可通过。若完整数据或图片授权无法一次确认，优先交付结构完整且诚实标注核验状态的应用，不用虚构内容填满数据库。

## 10. 本阶段实施计划：Wiki 数据与双栏工作台

### 11.1 先稳定的架构边界

```text
Wiki API / 可缓存页面 / 本机简中资源 / 用户候选 / 中文检索证据
                         ↓ 原始快照与来源清单
                 normalized records + review queue
                         ↓ 人工/规则核验
              versioned catalog + attack components
                         ↓ 生成
            search index + localized assets + PWA/EXE dist
```

- `data/raw`（原始快照）不可直接作为运行时数据；`data/normalized` 保存规范化但未必核验的字段；`data/review` 保存翻译、图片、攻击组件和字段差异审核记录；`src/data/catalog.json`、索引和本地图片 manifest 是可重复生成物。
- stable ID 优先使用 Wiki page ID/稳定 canonical key；中文翻译变化不能改变 ID。旧 ID 通过 alias/migration 显式兼容，不能靠名称重新匹配。
- `Catalog` schema 升级到下一版本：攻击组件成为可选但强类型结构；旧 `weaponProfile.demolitionPower` 迁移到 0–60 标尺的兼容字段时必须记录 `migration: 0..50 → 0..60` 和原始来源，不将旧值伪装成新 Wiki 事实。

### 11.2 同步、审核和缺口报告

1. 先用 MediaWiki API 获取 category/page/旧修订信息和页面正文，带 User-Agent、请求节流、失败重试上限和缓存；记录 HTTP 状态、抓取时间、revision/oldid 和 Potentially Outdated。
2. 将页面结构解析为 normalized warbond/equipment/acquisition/attack-component records；解析失败、字段变化、条目删除和页面范围外内容进入 review/diff report，不直接写 catalog。
3. 以 API 返回条目数、页面 ID、category 交集和生成 catalog 条目数对账；每个缺失范围写入 `coverage-report`，不以“尽可能完整”代替数字。
4. 中文名、图片许可、攻击数值和获取门槛分别审核；任何未核验字段保持 null/pending，正式构建可以因规则错误失败，但不能静默猜测。

### 11.3 中文与图片证据

- 中文检索证据独立于英文事实字段；检索命中只决定候选中文名的流通性，不改变 Wiki 数值、分类或获取数据。
- 每张图片必须同时有来源页/文件页/原始 URL/license raw/同步时间/hash，并记录 Wiki revision/oldid；作者仅在文件页提供时记录，缺作者不伪造。来源可追溯但明确为版权游戏素材时记为 `documented-copyrighted`，license raw 缺失或来源不可追溯则只保留失败/占位记录。
- 图片本地化、尺寸、压缩和 manifest 校验在构建期完成；运行时只读取本地资源，PWA/Neutralino 不访问 Wiki。

### 11.4 双栏 UI 与本地状态

- 删除“速查/解锁计划/数据说明”分页主导航，主页面固定左速查、右计划；桌面两栏各自 `overflow-y:auto`，body 不承担主要滚动；窄屏改为同页上下排列，不使用 Tab 替代。
- 详情在左栏内 inline/drawer 展开，不盖住右栏；右栏计划始终可见，按债券分组并显示单项成本/待核验状态。
- 固定 localStorage key 与 schema 版本；启动时只保留一份状态，迁移旧 schema、去重、清理未知 ID 并执行合理容量上限。图片、catalog、攻击组件原文和搜索索引不得写入 localStorage。
- PWA/Workbox 使用版本化 cache name 和 activate 清理旧 cache；刷新、重开、安装 PWA、Neutralino 重开都复用同一份计划迁移逻辑。

### 11.5 本阶段验收与明确限制

- 必须运行 `npm run check`、Pages `/HD2Tool/` smoke、PWA manifest/service worker、Neutralino config/desktop build 静态检查，并记录静态数据/图片/EXE 体积。
- 主任务审查重点：Wiki API 的范围与条目数对账、攻击组件解析是否保留原始值、primary 代表规则、中文证据是否逐项落盘、图片许可是否逐图而非页面级推断、旧计划/旧 ID 是否可迁移。
- 真实游戏当前数据、可读取的本机简中资源、中文互联网检索结果、Wiki 图片文件许可、Windows Neutralino 二进制下载、代码签名证书和 GitHub 发布权限属于外部限制；没有这些证据时只能交付 pending/coverage report/占位图和可复现管线，不能虚构完整覆盖或签名结果。

## 12. 发布门槛与正式目录 admission gate

本阶段的同步覆盖范围与正式展示目录分离。Wiki/API 可以把完整范围写入 raw/normalized/review/quarantine，但只有通过 admission gate 的条目才进入主搜索、详情推荐和解锁计划。

- 正式条目必须有可靠中文显示名，或已有广泛中文用法并保存 `TranslationEvidence`；只有英文名或“中文名待核验”的条目进入 quarantine，默认不出现在主界面。
- 正式条目必须有明确类别/槽位、获取来源分类，以及该类别最关键的速查字段。缺任一核心字段则不 admission；债券装备至少要有债券、页码、物品勋章和当前页前置消费门槛，战备至少要有默认/征用点/债券分类及对应货币字段。
- 主 UI 只在条目有值时展示字段；`pending`、`unknown`、`null` 和占位符不反复出现在卡片或普通详情中。核验状态、缺口和来源只在用户主动展开“数据来源/高级信息”时显示；顶部只保留一次紧凑版本提示。
- 正式目录图片不能普遍共用同一占位图。核心武器/装备优先使用文件页许可明确的真实本地缩略图；少量缺图使用按类别设计的占位图。发布报告必须统计实际图片覆盖率，低于门槛不得宣称完成。
- 搜索卡片最多显示图片、中文名/型号、类别、来源、核心成本和 3 个关键标签；伤害、AP、拆毁、组件和详细来源默认折叠/分组，不做数据表墙。
- release-readiness 报告至少统计正式条目总数、中文证据覆盖、获取核心字段完整率、真实图片覆盖率、攻击参数覆盖率和 quarantine 数量。`npm run check` 必须执行门禁：任何硬门槛不达标都失败并阻止发布；报告可以列出未达标原因和可恢复的 quarantine 清单。
- 双栏必须在 1366×768、1920×1080 和窄屏做视觉验收：桌面左右独立滚动且计划常驻，详情不遮挡计划；窄屏上下同页、不使用 Tab 替代。验收结果写入报告，不以静态 CSS 推测通过。
- Header 左侧使用可追溯的《HELLDIVERS 2》官方应用图标；优先 Steam/PlayStation 或本地 Steam manifest 对应 client icon，不能用第三方重绘、AI 仿制或来源不清图标。原始 URL、hash、来源和非 MIT 游戏素材声明进入 NOTICE/数据说明。
- Header 只保留紧凑品牌“HD2 军需簿”和低干扰“数据说明”入口；删除“非官方·离线优先”、build/data version/status 徽章、重复 eyebrow、数据库免责声明、导航 Tab 和巨大匹配数字。数据说明改为独立低干扰入口，审计细节不进入主操作区。
- 首页/双栏速查区域不得显示 sourceRefs、数据来源证据、核验徽章、翻译证据、图片许可、英文名、长篇 notes、数据版本解释或“待核验”提示；这些集中到数据说明/高级审计视图。首页唯一允许的“来源”是玩家需要的债券/征用点/默认获取等解锁路径。
- 搜索卡片的正式中文装备名是最大标题；社区外号仅在其下方以弱文字显示“外号：…”，没有外号不留空行。型号、类别、债券/征用点和核心成本紧凑排列，不抢标题；用户以外号命中时只对对应外号轻量高亮，不另起重复提示块。
- 详情优先显示游戏信息，证据来源与核验信息默认折叠；结构验收必须检查首页没有“正式名 + 英文名 + 状态徽章 + 来源证据 + 外号命中提示”的旧式多行堆叠。
- 视觉验收必须覆盖 1366×768 首屏、1920×1080 和窄屏，并记录首页删除/移入数据说明的文案清单；ARIA 标签、键盘焦点和 reduced-motion 行为不能因减法删除。

## 11. 工程质量原则

- 正确性与可维护性优先于开发速度；允许在编码前完成数据模型、模块边界、错误状态和测试契约设计。
- “敏捷”表示小步验证和可回退，不表示用临时代码抢进度；核心类型、验证规则和持久化格式必须先稳定再扩充 UI。
- 保持轻量：优先浏览器原生能力和小型纯函数模块，新增依赖必须说明用途、许可证和无法用少量本地代码替代的原因。
- 保持可纠错：原始来源数据、人工覆盖、生成数据和搜索索引分层存放；生成物可重复构建，不直接手改；每个字段可追溯来源并能在更新时产生差异报告。
- 保持失败可见：不确定数据使用缺省/待核验状态，解析失败、版本不兼容和损坏导入必须给出明确错误，不静默回退到可能错误的值。

## 13. 对抗式审查结论与修订契约（2026-08-08）

本节优先于此前“尽可能展示 pending”的表述。raw/normalized 可以覆盖更大 Wiki 范围，但 release catalog 只接受可直接完成“确认装备—确认购买—加入计划”的条目；未满足条件的记录进入 quarantine，且 `npm run check` 的 release gate 失败时不得宣称可发布。

### 13.1 正式目录 admission gate

所有类别都必须有稳定 ID、canonical English、正式中文名或两处独立中文流通证据、类别/槽位、完整 acquisition、字段级 sourceRefs（含 revision/oldid 或抓取时间）、translation evidence 和本地图片记录。中文用户转录只能证明候选/保留外号，单一转录不得独立证明正式中文名。

| 类别      | 必须可用于首屏/详情的核心字段                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| weapon    | primary/secondary/support 槽位、Wiki 细类、AttackProfile 至少一个有来源的攻击组件、direct AP（含 0–10 数值与 Wiki 等级）、标准伤害或明确的非伤害例外、完整获取方式 |
| grenade   | throwable 槽位、攻击组件伤害与 direct AP（或有来源的特殊非伤害规则）、完整获取方式                                                                                 |
| stratagem | 战备类别、默认/征用点/债券等获取分类、等级与货币价格（适用时）；只有存在攻击数据才附 AttackProfile，不为非武器硬塞 weaponProfile                                   |
| armor     | armor 值、passive/效果、护甲类别与完整获取方式                                                                                                                     |
| booster   | booster 类别、效果/作用对象与完整获取方式                                                                                                                          |

### 13.2 对账、翻译、获取与成本

- 每次同步必须保存 run manifest、类别分页响应、页面 ID/revision/timestamp、HTTP 错误/重试和 continuation；以 category-member page ID 集合对账，`source-only`、`generated-only`、`changed`、`unresolved` 都进入差异报告。同步必须先写临时目录，所有类别与页面成功/明确失败后再原子替换 normalized，禁止一次不完整运行覆盖上一次快照。
- 中文名进入正式目录至少需要官方/游戏简中资源，或两个独立平台/作者/页面的稳定一致用法；转载链、同一原帖镜像和机器翻译不算独立证据。搜索结果只判断中文名流通，不覆盖 Wiki 数值。
- 债券页面只在页面结构明确给出 page、itemMedals 和从零累计的前置勋章时 admission；若只能得到 item price 或页面文本无法稳定拆解，保持 null/quarantine，不用累计猜测填充。获取来源、页面、物品价格、当页增量和累计前置都是独立字段。
- 计划按债券显示“计划物品勋章小计”和“最高累计前置”两项；共享前置只显示一次，不与物品小计相加成虚假的理论总数。征用点/超级货币按货币分别汇总。

### 13.3 AttackProfile/AP 卡片规则

- 卡片只读取组件的 direct AP；角度穿甲、爆炸半径、蓄力层级详情默认折叠。组件按来源顺序，再按 projectile/shrapnel/explosion/spray/melee/charge/alternate/status 的稳定优先级和 component ID 排序。
- direct AP 数值相同且没有 charge/mode 区别时可合并；不同数值、模式或蓄力层级必须分别显示。卡片最多展示 3 个 chip，超出显示“+N 个组件，展开详情”，不得取最大/最小值冒充整枪；详情保留全部组件。
- AP taxonomy 固定来源为 Wiki `Template:Armor`，版本化保存 0–10 数值、Wiki 英文等级和稳定中文标签；未来变化通过 taxonomy 版本迁移。动态/范围 AP 在来源可直接支持时显示范围，否则不 admission。

### 13.4 轻量性、持久化与验收

- release 目标为来源追溯且权利状态诚实的真实图片覆盖至少 80%，核心武器至少 90%，单缩略图不超过 60 KiB，代码+运行时 JSON 不超过 1 MiB；许可 raw 不清晰的图片不得下载进正式素材，只能使用类别占位并计入缺图率。品牌图标必须是完整可追溯官方资产；不能把 Steam 横幅裁成伪图标，若找不到真实 app icon，应使用文字品牌并在 gate 报告限制。
- storage 使用固定 v2 key、总容量 100 条、schema 0/1→2 迁移、启动清理未知 ID/重复/旧 key；损坏 JSON 清除坏值并返回一次性恢复提示。PWA 采用版本化缓存并在 activate 清理旧缓存；Neutralino 与 PWA 复用相同 dist 和 plan schema。
- 详情打开前保存 query、taxonomy filters、左栏 scrollTop；关闭或从计划打开时恢复左栏状态，计划滚动位置不被详情改变。窄屏为同页上下布局，并提供“跳到购买计划/返回速查”锚点，不伪装成分页 Tab。
- release-readiness 硬门槛：admitted ≥ 20、正式项中文证据 100%、获取核心字段 100%、真实图片 ≥ 80%、武器/投掷物 AP 覆盖 100%、货币图标 100%。未达标阻止 check/release，不能降级宣称“完整”。

## 14. P0 对抗审查复核（2026-08-08）

本轮确认产品核心是“听到名称/外号或看到图片后快速确认；不点开知道怎么买；点开知道怎么用；计划可持久化”，不是把 Wiki 全量页面直接塞进首页。Wiki 全量只属于 raw/normalized 对账范围，release catalog 必须经过 admission；P2 的账号进度模拟、复杂 DPS 派生、比较器、自动翻译审核和花哨拖拽延后。

当前冻结快照已完成 467/467 个类别页对账，`rawSnapshotComplete=true`，归一化 318 条（weapon 109、armor 107、stratagem 63、grenade 21、booster 18），正式目录 257 条、隔离 61 条；后续同步若类别失败、页数下降或 continuation 未耗尽，必须保留 last-known-good 并使门禁失败。taxonomy 已由 Wiki 字段生成，不再是空对象；Steam 横幅不能冒充 app icon。

P0 修复契约：

1. 飞矛必须保留 projectile AP7 / explosion AP3；WASP 必须保留 projectile AP6 / explosion AP3；Fire/status 组件不得继承 AP、弹匣、射速、后坐力或全局 DPS。契约测试位于 `src/data/wiki-regression.test.ts`，生成源为 `scripts/sync-wiki.mjs` 的组件级解析和独立 `handlingStats`。
2. acquisition 解析优先保留可追溯 Wiki 字段，同时对社区/人工冲突写入 `conflictRefs` 并隔离；SG-451 必须来自 Freedom's Flame 第 1 页、20 勋章，不得被 `default` 覆盖。
3. 计划成本只输出每债券“目标物品勋章小计”和“最高共享页面门槛”，不输出两者相加的虚假总数。纯函数和回归测试位于 `src/lib/plan-totals.ts` / `src/lib/plan-totals.test.ts`。
4. 图片将来源追溯与权利状态分开：计入真实覆盖必须有具体 file page、原始 URL、Wiki revision/oldid、hash 和具体 license raw 值。`License/`、缺来源或缺 license 不得物化；文件页明确为游戏素材/版权或 fair-use 时记为 `documented-copyrighted`（作者可为空，不臆造），不得标为开放许可。单一用户转录不计作正式中文交叉证据，需官方或至少两个独立社区证据 URL/平台/作者。
5. Wiki 同步先写 staging 和报告；类别失败或发现页数下降时退出并保留 last-known-good。Pages、CI 和 tag Release 共用 `npm run check`，readiness 门槛不因当前数据不足而降低。
6. localStorage 损坏时保留有界恢复副本、删除坏主键并向 UI 返回一次提示；未知 ID 返回 orphan 报告，固定 v2 key、100 条容量、schema 迁移和 alias 层不把 catalog/图片写入存储。

移动端建议采用同一页面内的粘性“速查 / 计划 N”锚点与受限高度工作区，点击只切换同页可见工作区，不切路由、不清 query/filter/scroll，也不构成分页；桌面维持左右独立滚动。首页继续隐藏 sourceRefs、核验徽章、英文名、审计文案和 pending 噪声，详情/数据说明才展示审计字段。
