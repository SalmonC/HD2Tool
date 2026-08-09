import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(
  await readFile(resolve(root, "neutralino.config.json"), "utf8"),
);
const requireBinaries = process.argv.includes("--require-binaries");
const required = [
  config.applicationId,
  config.version,
  config.defaultMode,
  config.documentRoot,
  config.url,
  config.cli?.binaryName,
  config.cli?.resourcesPath,
  config.cli?.distributionPath,
  config.cli?.binaryVersion,
];
if (required.some((value) => typeof value !== "string" || value.length === 0))
  throw new Error("Neutralino 配置缺少必要字段。");
if (config.enableNativeAPI !== false)
  throw new Error("本项目不需要 Native API，必须保持 enableNativeAPI=false。");
if (
  config.cli.resourcesPath !== "/dist" ||
  config.cli.distributionPath !== "/desktop-dist"
)
  throw new Error("Neutralino 必须复用 dist，并将桌面包输出到 desktop-dist。");
for (const file of [
  "dist/index.html",
  "public/assets/placeholder-equipment.svg",
]) {
  try {
    await access(resolve(root, file));
  } catch {
    if (file.startsWith("dist/"))
      console.warn(`未找到 ${file}；先运行 npm run build，再执行桌面构建。`);
    else throw new Error(`缺少 ${file}。`);
  }
}
if (requireBinaries) {
  try {
    await access(resolve(root, "bin/neutralino-win_x64.exe"));
  } catch {
    throw new Error(
      "缺少 Neutralino Windows x64 框架。请先执行 npx --no-install neu update；CI Release 会从官方版本下载。",
    );
  }
}
console.log(
  `Neutralino config OK: ${config.cli.binaryName}, framework ${config.cli.binaryVersion}, command: neu build --embed-resources`,
);
