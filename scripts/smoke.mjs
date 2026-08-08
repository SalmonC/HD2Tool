import { spawn } from "node:child_process";
import { resolve } from "node:path";

const port = Number(process.env.SMOKE_PORT ?? 4173);
const baseUrl = `http://127.0.0.1:${port}`;
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1);
const configuredBase =
  process.env.SMOKE_BASE_PATH ??
  process.env.VITE_BASE_PATH ??
  (repositoryName ? `/${repositoryName}/` : "./");
const appPath =
  configuredBase === "./"
    ? "/"
    : `/${configuredBase.replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
const appUrl = `${baseUrl}${appPath}`;
const root = resolve(import.meta.dirname, "..");
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
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      /* preview is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`预览服务器未启动：${output}`);
}

try {
  await waitForServer();
  const checks = [
    ["首页", appUrl, "HD2"],
    ["PWA manifest", `${appUrl}manifest.webmanifest`, "HD2"],
    ["分享查询参数", `${appUrl}?item=sg-225ie-breaker-incendiary`, "HD2"],
  ];
  for (const [label, url, marker] of checks) {
    const response = await fetch(url);
    const text = await response.text();
    if (!response.ok || !text.includes(marker))
      throw new Error(`${label} smoke 失败：HTTP ${response.status}`);
    console.log(`${label}: OK`);
  }
  const serviceWorker = await fetch(`${appUrl}sw.js`);
  console.log(
    `service worker: ${serviceWorker.ok ? "OK" : "未生成（检查 PWA 配置）"}`,
  );
} finally {
  child.kill();
}
