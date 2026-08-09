import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "dist");
const include = /\.(?:js|css|json|html|svg|webmanifest)$/i;
let coreTotal = 0;
let mediaTotal = 0;
let mediaFiles = 0;
let distTotal = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      const size = (await stat(path)).size;
      const relative = path.slice(root.length + 1).replaceAll("\\", "/");
      distTotal += size;
      if (relative.startsWith("assets/wiki/")) {
        mediaTotal += size;
        mediaFiles += 1;
      } else if (include.test(entry.name)) coreTotal += size;
    }
  }
}

await walk(root);
console.log(`Static app/data size: ${(coreTotal / 1024).toFixed(1)} KiB`);
console.log(
  `Packaged Wiki media: ${mediaFiles} files, ${(mediaTotal / 1024 / 1024).toFixed(2)} MiB (desktop/offline payload; excluded from the core budget)`,
);
console.log(`Total dist payload: ${(distTotal / 1024 / 1024).toFixed(2)} MiB`);
if (coreTotal > 1024 * 1024)
  throw new Error(
    "Static app and data exceed the 1 MiB core budget (deferred Wiki media excluded).",
  );
if (distTotal > 25 * 1024 * 1024)
  throw new Error("Complete static/offline payload exceeds the 25 MiB budget.");
