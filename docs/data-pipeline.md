# 数据管线与纠错边界

## 分层

```text
原始来源 / 用户候选
        ↓ 人工核验与覆盖
source catalog + manual overrides + candidates
        ↓ 可重复生成
catalog.json + 搜索索引
        ↓ Vite/PWA/Neutralino 共用
用户端只读静态数据
```

债券页的 `pageUnlockMedals` 统一表示“从零到该页的累计前置勋章”，不是该页物品价格，也不是把前页价格重新相加的估算值。生成层同时保留 `pageIncrementalMedals` 表示本页新增阶段门槛；卡片、详情和计划汇总统一显示“累计前置”，同一债券只取计划条目的最高累计值。可复核的特殊门槛记录在 `src/data/source/warbond-page-thresholds.json`，缺证据时保持 `null` 并隔离。

- `src/data/source/catalog-source.json`：人工维护的原始结构层。
- `src/data/overrides/manual-overrides.json`：按稳定 ID 保存已核验覆盖；没有来源或不是 `verified` 时生成失败。
- `src/data/candidates/user-supplied.json`：用户提交的原始候选，保留原文和提交时间，默认 `pending`，不会进入正式目录或搜索索引。
- `src/data/assets/manifest.json`：逐图记录本地路径、原始页面、file page、原始 URL、作者（如有）、license raw、权利状态、同步日期和文件哈希；缺来源或 license raw 的图片不物化。
- `src/data/source/brand-assets.json`：记录首页使用的官方 Steam/本机客户端图标来源、提取位置、哈希和诚实的版权状态；它不属于 MIT 代码许可。
- `src/data/catalog.json`：完整审计生成物；`src/data/catalog-runtime.json` 是去除审计冗余字段的前端精简投影。两者均由 `npm run generate:data` 生成，不直接手改。
- `reports/data-sync-report.json`：开发期同步报告；已加入、删除、候选图片和字段差异只能先在报告中出现。

## 来源策略

中文正式名称优先来自本机游戏简体中文资源，其次是官方简中公告。Wiki API 只用于发现候选条目、候选页面和图片来源，不自动翻译英文名称。filediver 仅作为开发者本机可选工具：使用时应固定版本、记录校验和，不能把无许可证项目代码复制进本仓库。

`npm run sync:data` 会按稳定 ID 对比原始 catalog 与生成 catalog，记录 source-only、generated-only 和字段变化，并从资源 manifest 汇总 `candidate` 图片。它始终保持 `catalogWrite=false`；报告中的候选必须经过人工覆盖和来源核验后，才允许下一次生成进入正式目录。

没有来源的名称、页码、价格、图片和武器属性保持缺省或 `pending`。发布校验拒绝未知的已核验 taxonomy 值、悬空债券、负数价格、重复 ID/正式名和外号冲突。

## Taxonomy

武器属性的 `weaponType`、`ammoTraits`、`armorPenetration` 和 `demolitionPower` 都由版本化 taxonomy 定义选项/标尺。每个字段还必须记录 `taxonomySource`、`scaleVersion` 和独立 `sourceRefs`；taxonomy 未核验或字段未核验时，UI 不展示该值，也不把它算进筛选覆盖数。当前产品标尺遵循来源确认的 `demolitionPower` 0–60 版本；它不是由伤害、爆炸范围或描述推导的游戏事实，未来标尺改变时必须新增 taxonomy 版本并显式迁移。

## 候选提升

同步工具不会静默把候选提升成正式名称或别名。人工核验后，应将接受的值写入 source/override 层并保留外部来源；误配标记为 `misassigned`，无法确认则继续 `pending`。用户候选中的“铁碗”原始拼写必须保持不变，除非另有来源覆盖且同时保留原始记录。

## AP 卡片规则与原子同步

卡片穿甲摘要只读 `AttackProfile.components[].fields.armorPenetration` 的 direct 值；角度穿甲只在展开详情显示。多个组件按 `projectile → shrapnel → explosion → spray → melee → charge → alternate → status` 稳定排序；direct AP、taxonomy 标签和模式/蓄力范围相同且无决策差异时合并，否则分开显示，预览最多 3 个 chip，更多组件提示展开详情。不得使用整把武器的最大/最小 AP 代表值，也不得从伤害或描述推算。

`demolitionForce` 按当前 Wiki taxonomy 版本迁移为整数 0..60；来源标尺变化必须新建 taxonomy/scaleVersion 并显式迁移。`handlingStats` 与攻击组件分离，容量、射速、后坐力等武器级字段不得复制到 Fire/status 或 explosion 组件。

Wiki 同步先生成类别清单、页面 revision 和中间层到 staging，并写 `reports/wiki-sync-report.json`；任一类别请求失败、continuation 未耗尽或发现页数较 last-known-good 下降时不替换正式快照。当前冻结快照报告 `rawSnapshotComplete=true`，已对账 467/467 个类别页；以后同步若不满足这些条件，必须保留上一份快照并报告失败，不能宣称全量完成。
