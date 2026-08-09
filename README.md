# HD2 军需簿

面向简体中文玩家的轻量级《HELLDIVERS 2》装备速查与购买计划工具。支持名称、型号、英文名和社区外号检索，展示装备图片、获取方式、价格、穿甲、拆毁和已有可信属性。

项目无账号、无后端、无分析上报。GitHub Pages 是主要版本；Neutralino 单文件 EXE 复用同一份静态构建，仅作无法访问网页时的离线备份。

## 开发

需要 Node.js 24 和 npm：

```bash
npm ci
npm run dev
```

完整检查：

```bash
npm run check
```

桌面构建：

```bash
npx --no-install neu update
npm run desktop:build
```

## 数据

- `src/data/catalog.json`：唯一权威装备目录，当前包含 292 条装备。
- `src/data/community-aliases.json`：用户提供的小黑盒帖子转录，包含 38 件装备的 48 个社区外号。
- `public/assets/wiki/`：本地装备图片，Pages 按需加载，EXE 离线内嵌。

目录直接供前端读取，不存在构建期代码生成。数据字段、更新步骤和关键回归案例见 [维护指南](docs/maintenance.md)。

源代码按 MIT 许可发布；游戏数据、名称、商标和图片不包含在代码许可中，详见 [NOTICE](NOTICE)。本项目与 Arrowhead Game Studios、Sony 或 PlayStation 无隶属关系。
