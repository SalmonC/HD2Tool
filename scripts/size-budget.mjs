import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "dist");
const include = /\.(?:js|css|json|html|svg|webmanifest)$/i;
let total = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (include.test(entry.name)) total += (await stat(path)).size;
  }
}
await walk(root);
console.log(`Static app/data size: ${(total / 1024).toFixed(1)} KiB`);
if (total > 1024 * 1024)
  throw new Error("静态应用与数据超过 1 MiB 预算（不含延迟图片）。");
