# HD2 军需簿数据架构 v3（已冻结）

本目录是下一版最小设计，尚未迁移旧数据。产品任务只有：名称/型号/外号搜索、查看怎么买、固定白名单怎么用、主图与 Wiki、购买计划。

## 分层与边界

```text
sealed source snapshots
  -> 构建期 RawFact + 每个 candidate disposition
  -> typed corrections
  -> compact canonical resolved catalog + fieldEvidence
  -> runtime whitelist projection
```

另有全量 audit report 与 migration diff。RawFact/candidate 是构建期自动产物，不是人工维护的第二数据库；Correction 是唯一人工决策入口。Resolved catalog 使用普通紧凑值，字段证据放在 sidecar，runtime 不携带事实、候选或 evidence。

RawCandidate 只在顶层保存 `factIds`；`sourceId` 必填；disposition 只有 `extracted`、`rejected(reason)`、`unresolved(reason)`。构建语义校验必须证明 candidate → fact → snapshot 的引用闭合、各类 ID 唯一、所有候选都有 disposition。

## 唯一分类

唯一落盘 `ProductKind`：

`primary-weapon | secondary-weapon | grenade | body-armor | support-weapon | other-stratagem`。

不落盘 `entityKind/category/productGroup/displayGroup/slot`；UI group、slot、scope 全由纯函数派生：primary/secondary/grenade 是 weapon，body-armor 是 armor，support-weapon 与 other-stratagem 是 stratagem。MG-43 是 support-weapon，UI 组为 stratagem，能力可同时有 combat + deployment；EXO-55 是 other-stratagem，UI 组为 stratagem，能力为 combat + deployment(kind vehicle)。不建 vehicle profile。

Wiki Infobox/Contents Type 只能生成 RawFact，不能直接成为 productKind。支援武器不重复计入武器和战备，手雷归武器组。

## FieldEvidence 与 typed correction

Canonical 字段保存普通值；fieldEvidence 使用判别联合：

- `known`：至少一个 factId 和 `resolvedValueHash`；
- `unknown`：枚举 reason，例如 source-missing、not-published、parse-failed、identity-unresolved、unknown-threshold；
- `conflict`：reason 和至少两组 candidateFactIds；
- `not-applicable`：明确 reason。

0 是合法值，unknown/N/A 不得变成 0 或空字符串。`fieldPath` 是稳定 ID DSL，不得使用数组下标；组件路径必须包含 `componentId`。semantic gate 要求核心 canonical path 恰有一份 evidence，且 value hash 一致；组件 ID 必须全局地在所属装备内唯一。单位只在 RawFact/字段 taxonomy 定义一次，不在 resolved 数值和 evidence 重复存储。

Correction 只有 `identity-link`、`candidate-selection`、`fact-supersession`、`taxonomy-map` 四类。每条必须有 target/path、expectedBefore、`sourceBindings[{sourceId,sha256,revision?}]` 至少一项、after、evidenceFactIds、reason、reviewer、reviewedAt 和可选 expiry。没有 `revalidate=never`；source binding 变化永远重新验证。每类 after 使用严格 oneOf，不能任意整对象 override、静默合并/删除实体或清除冲突。`CorrectionsFile` 与 `correctionsHash` 是单一 wrapper。

## Canonical Equipment、名称与资产

正式 canonical 只收 released 且在产品范围内的实体；upcoming/excluded 只出现在 candidate/audit，不进入 canonical equipment。

Equipment 最小字段：

`id, productKind, model?, nameZhHans, nameEn, currentAcquisition, combat?, armor?, deployment?, imageAssetId, wikiUrl, fieldEvidence`。

stable ID 不由译名或当前 Wiki title 重算。顶层唯一 `idAliases[{legacyId,equipmentId}]` 不得重复，legacyId 不得与 canonical ID 冲突。顶层唯一 `aliases` registry 保存 text、targetIds、locale、kind、state、evidence；Equipment 不嵌 alias。只有 accepted alias 按 targetIds 派生到 runtime 搜索，pending/ambiguous/conflict 不进入正式搜索。

`wikiUrl` 必须有 known evidence，且是经过验证的绝对规范装备页 URL，不能是债券页、文件页或猜测 slug。

Asset registry 只向 canonical 交付 `assetId/path/sha256/sourceEvidenceId/licenseEligible/displayEligibility`。`real` 必须 `licenseEligible=true`；blocked 不得投影；runtime 图片只有 `{assetId,path,status:real|placeholder}`，且必须绑定同一 asset registry 项。详细许可与 provenance 留在 source snapshot/audit；权利不足使用 placeholder。

## Acquisition 与 Warbond

`currentAcquisition` 是单一 union：`default | requisition | warbond | superstore | edition | event | poi | grant | unavailable | unknown`。不表示历史多路径，不建 bundle，不建时间线。edition 只记录 editionName，整包美元价格绝不能成为装备价；unavailable 不造 0。requisition、superstore、warbond 价格均为非负整数。

Resolved/runtime 顶层都有 `acquisitionAsOf`，不保存历史 offer。顶层 Warbond registry 保存 `id/nameZhHans/nameEn/purchaseSuperCredits?/fieldEvidence`，runtime 可显示中文名和债券购买价。WarbondPage 只保存唯一 `(warbondId,page)`、`cumulativePrerequisiteMedals` 和 evidence；不保存 incremental 或 page purchase price。page 1 cumulative 必须为 0；known number 与 unknown/null 必须和 evidence 状态配对，页面 cumulative 单调。Equipment 不复制页面门槛，runtime 通过 warbondId+page 派生卡片摘要。

计划汇总按债券显示 itemMedals 小计和最高累计页面门槛，分栏展示，不把门槛相加成伪总价。

## 固定“怎么用”白名单

Combat 仅保留可选 `weaponClass`、`ammoTraits`（ballistic/laser/plasma/arc/fire/gas/other；explosion 永不属于 ammoTrait）、稳定 componentId 的组件和可选 handling。组件 role 为 direct/shrapnel/explosion/fire/melee/spray/status/alternate/other，每组件独立保存 standardDamage、durableDamage、armorPenetration、demolition。数值为 scalar/range/variants；AP 整数 0..10，demolition 整数 0..50，range 要求 min≤max；不提供无来源 root 代表值，组件不继承字段。

Handling 只保留 capacity、reserveCapacity、fireRateRpm、recoil；capacity kind 为 rounds/charges/heat/uses。不建 reload、firing mode、DPS、stagger、push、radius、status 细节、角度 AP 或公式推导。

Armor 字段均可选：class(light/medium/heavy)、rating、speed、staminaRegen、passive{name/summary?}。class 不从 rating 推断。Deployment 字段均可选：kind(orbital/eagle/backpack/sentry/emplacement/minefield/vehicle/other)、code、callInSeconds、cooldownSeconds、uses。字段缺省和字段 unknown 由 fieldEvidence 区分，不能填空串。

## Runtime、搜索、计划

Runtime 只含 released canonical equipment、accepted alias 派生的字符串、白名单能力、current acquisition、主图、Wiki URL、Warbond registry/pages；不含 facts/sourceRefs/candidates/upcoming/excluded。它必须含 catalogVersion、resolvedCatalogHash、inputManifestHash、acquisitionAsOf 和 projectionHash。阻断由现场 gate 重算，不能信任手填 `blocked`。

启动时对输入做 NFKC、大小写、空格/标点归一化，在 model/nameZhHans/nameEn/accepted alias 做子串检索；不做拼音、模糊服务或预生成索引。

Plan v3 保存 `schemaVersion/catalogVersion/catalogHash/pendingIds/completedIds/orphans/updatedAt`。pending 与 completed 必须互斥，orphan 不静默丢失；单条 localStorage 记录的容量由实现按 payload bytes 限制，不用任意 maxItems 截断全目录。损坏恢复和 idAliases 迁移写在实现契约中，v3 架构不要求导入导出或复杂迁移框架。

## Audit、迁移和确定性

Audit 强类型记录 input hashes、schema/rule/tool versions、stage counts/set hashes、`setReconciliations[{reconciliationId,missingIds,extraIds,expectedHash,actualHash}]`、`runtimeDiff[{matches,expectedHash,actualHash,changes}]`、`migrationDiff[{lossyCount,changes}]`、mismatches、unknownByReason、conflicts、staleCorrections、unaccountedCandidates、durations 和 source-fetch cache hits。`lossyCount>0` 或 P0 mismatch 非零阻断；blocked 不是可手填字段。

规范序列化：对象 key 按字典序，忽略换行；各 artifact producer 必须先按稳定 ID/页码规范化数组顺序，hash 函数保留该顺序。计算 `resolvedCatalogHash` 时排除自身 hash 字段；计算 `projectionHash` 时排除自身 projectionHash；计算 `correctionsHash` 时排除 wrapper 的 correctionsHash。输入 hash、schema/rule/tool version 不得被省略。normalize/reconcile/semantic/runtime diff 每次本地全量运行，只有联网 source fetch 可缓存。

## 来源权威

| 字段                           | 首选来源                          | 边界                                                 |
| ------------------------------ | --------------------------------- | ---------------------------------------------------- |
| 正式简中/英文名                | 官方游戏 exact localization key   | 官方简中网页可交叉；zh-Hant 不替代 zh-Hans；不能机翻 |
| Wiki item facts/参数/图片      | helldivers.wiki.gg item/file page | 保留精确 locator/revision                            |
| 债券 membership/page/item cost | Warbond Contents                  | item page 仅交叉核对                                 |
| 页面累计前置                   | 官方/Wiki 明示                    | Unknown 保持 Unknown                                 |
| 外号/术语                      | 小黑盒/社区                       | 只能进入 alias，不能覆盖事实/分类                    |

Node 只处理构建期静态 JSON；最终 Web/PWA/Neutralino 仍是轻量静态文件，无云、服务端、运行时数据库。

## 合成 contract runner

`schemas/v3/fixtures/contract-cases.json` 只含合成反例，覆盖 MG/EXO 分组、CQC/GP 身份、helmet/body 行序、P-33 开放 Type、多组件 AP/demolition、unknown≠0、edition package price、event/POI/unavailable、简繁冲突、图片许可、stable ID/idAliases、plan orphan、stale correction、runtime hash 和确定性。`schemas/v3/contract-runner.mjs` 独立读取 v3 JSON Schema 与 fixture，动态调用 `model.ts` 的 `displayGroupFor`，运行当前 schema 子集与语义断言；golden/fixture 不承担完整目录门禁。CQC/GP、helmet/body、P-33 等静态 fixture 是迁移 resolver 的验收规范，不代表 runner 已验证真实 resolver，迁移开始前必须转成实际测试。

## 迁移阶段发布门禁

1. 旧数据到 v3 stable ID 的 migration map 必须另建、另审；当前 v3 不含旧目录数据。
2. weaponClass/ammo taxonomy 和 AP scale 仍需各自锁定来源版本；没有来源只留 fieldEvidence unknown。
3. 图片逐文件 rights review 与 placeholder 门槛需要单独发布审议。
4. CQC-72/73、GP-20/31、同名头盔/护甲、P-33 开放 Type、Wiki 型号冲突必须从静态规范转为真实 resolver 测试。
5. 发布 gate 必须现场重算 source manifest、corrections、resolved catalog 与 runtime projection hash；集合 expected/actual hash 不同、runtime changes 非空或 migration lossiness 非零均阻断，不能复用旧 Audit 自报结果。
6. 对 released 目录运行全量双向集合核验，并逐项核对债券 `(warbondId,page,itemMedals)`；未发布条目继续排除在 runtime 之外。
