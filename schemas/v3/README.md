# v3 最小数据合同（已冻结）

`model.ts` 是唯一权威类型与纯函数文件；JSON Schema 是边界校验合同；`docs/data-architecture-v3.md` 是分层/来源/门禁说明；`fixtures/contract-cases.json` 是纯合成反例；`contract-runner.mjs` 是本目录唯一轻量合同执行器。runner 只实现当前 v3 合同所需的 schema 关键字与语义，不宣称替代完整 JSON Schema validator。

文件职责：

- `source-ledger.schema.json`：sealed snapshots、RawFact、candidate disposition。
- `corrections.schema.json`：带 sourceBindings 的四类 typed corrections。
- `resolved-catalog.schema.json`：紧凑 canonical equipment、alias/idAlias registry、warbond registry/pages、asset registry 和 fieldEvidence。
- `runtime.schema.json`：绑定 catalog/projection hash 的 released whitelist，不含审计证据和待处理候选。
- `plan.schema.json`：有界 payload 的 pending/completed/orphan 记录。
- `audit.schema.json`：强类型集合对账、runtime diff、migration diff 和阻断信息。

当前只设计，不迁移旧数据，不包含旧目录条目。旧数据迁移必须在独立 migration map 和二次 schema 审阅后进行。CQC/GP、helmet/body、P-33 等 fixture 仅是 resolver 迁移验收规范；当前 runner 不把它们当作真实旧目录解析结果。
