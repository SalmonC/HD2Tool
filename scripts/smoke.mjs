import { spawn } from "node:child_process";
import { resolve } from "node:path";

const port = Number(process.env.SMOKE_PORT ?? 4173);
const root = resolve(import.meta.dirname, "..");
const baseUrl = `http://127.0.0.1:${port}/`;
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: root, windowsHide: true, stdio: "pipe" },
);
let output = "";
child.stdout.on("data", (chunk) => (output += chunk.toString()));
child.stderr.on("data", (chunk) => (output += chunk.toString()));

try {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) break;
    } catch {
      // Server is still starting.
    }
    if (attempt === 29) throw new Error(`Preview did not start: ${output}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  const response = await fetch(baseUrl);
  const html = await response.text();
  if (!response.ok || !html.includes("HD2 军需簿"))
    throw new Error(`home smoke failed: HTTP ${response.status}`);
  const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
  const stylePath = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];
  for (const path of [scriptPath, stylePath]) {
    if (!path) throw new Error("built asset reference missing");
    if (!path.startsWith("./"))
      throw new Error(
        `built asset must stay relative for Pages and EXE: ${path}`,
      );
    const pagesUrl = new URL(path, "https://example.test/HD2Tool/");
    if (!pagesUrl.pathname.startsWith("/HD2Tool/"))
      throw new Error(`built asset escapes the Pages repository path: ${path}`);
    const asset = await fetch(new URL(path, baseUrl));
    if (!asset.ok) throw new Error(`built asset missing: ${path}`);
  }
  console.log("Static home and relative assets: OK");
} finally {
  child.kill();
}
