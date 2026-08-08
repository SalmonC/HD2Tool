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

- `src/data/source/catalog-source.json`：人工维护的原始结构层。
- `src/data/overrides/manual-overrides.json`：按稳定 ID 保存已核验覆盖；没有来源或不是 `verified` 时生成失败。
- `src/data/candidates/user-supplied.json`：用户提交的原始候选，保留原文和提交时间，默认 `pending`，不会进入正式目录或搜索索引。
- `src/data/assets/manifest.json`：逐图记录本地路径、原始页面、作者/上传者、许可证状态、同步日期和文件哈希；当前只有项目自制通用占位 SVG。
- `src/data/catalog.json`：生成物；运行 `npm run generate:data` 生成，不直接手改。
- `reports/data-sync-report.json`：开发期同步报告；已加入、删除、候选图片和字段差异只能先在报告中出现。

## 来源策略

中文正式名称优先来自本机游戏简体中文资源，其次是官方简中公告。Wiki API 只用于发现候选条目、候选页面和图片来源，不自动翻译英文名称。filediver 仅作为开发者本机可选工具：使用时应固定版本、记录校验和，不能把无许可证项目代码复制进本仓库。

`npm run sync:data` 会按稳定 ID 对比原始 catalog 与生成 catalog，记录 source-only、generated-only 和字段变化，并从资源 manifest 汇总 `candidate` 图片。它始终保持 `catalogWrite=false`；报告中的候选必须经过人工覆盖和来源核验后，才允许下一次生成进入正式目录。

没有来源的名称、页码、价格、图片和武器属性保持缺省或 `pending`。发布校验拒绝未知的已核验 taxonomy 值、悬空债券、负数价格、重复 ID/正式名和外号冲突。

## Taxonomy

武器属性的 `weaponType`、`ammoTraits`、`armorPenetration` 和 `demolitionPower` 都由版本化 taxonomy 定义选项/标尺。每个字段还必须记录 `taxonomySource`、`scaleVersion` 和独立 `sourceRefs`；taxonomy 未核验或字段未核验时，UI 不展示该值，也不把它算进筛选覆盖数。产品当前仅对 `demolitionPower` 约束 0–50 的待核验标尺；它不是游戏事实，未来来源标尺改变时必须新增 taxonomy 版本并显式迁移。

## 候选提升

同步工具不会静默把候选提升成正式名称或别名。人工核验后，应将接受的值写入 source/override 层并保留外部来源；误配标记为 `misassigned`，无法确认则继续 `pending`。用户候选中的“铁碗”原始拼写必须保持不变，除非另有来源覆盖且同时保留原始记录。
