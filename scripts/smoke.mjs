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
      // Preview is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`Preview server did not start: ${output}`);
}

try {
  await waitForServer();
  const checks = [
    ["home", appUrl, "HD2"],
    ["PWA manifest", `${appUrl}manifest.webmanifest`, "HD2"],
    ["shared item query", `${appUrl}?item=sg-225ie-breaker-incendiary`, "HD2"],
  ];
  for (const [label, url, marker] of checks) {
    const response = await fetch(url);
    const body = await response.text();
    if (!response.ok || !body.includes(marker))
      throw new Error(`${label} smoke failed: HTTP ${response.status}`);
    console.log(`${label}: OK`);
  }

  const serviceWorker = await fetch(`${appUrl}sw.js`);
  if (!serviceWorker.ok)
    throw new Error(
      `service worker smoke failed: HTTP ${serviceWorker.status}`,
    );
  const serviceWorkerText = await serviceWorker.text();
  const precacheManifest =
    serviceWorkerText.match(/precacheAndRoute\(\[(.*?)\](?:,|\))/s)?.[1] ?? "";
  const wikiPrecacheRefs = (precacheManifest.match(/assets\/wiki\//g) ?? [])
    .length;
  if (wikiPrecacheRefs !== 0)
    throw new Error(
      `service worker precaches ${wikiPrecacheRefs} Wiki images; expected 0`,
    );
  if (!serviceWorkerText.includes("wiki-equipment-images-v1"))
    throw new Error(
      "service worker is missing the bounded Wiki image runtime cache",
    );
  if (!/maxEntries:\s*64/.test(serviceWorkerText))
    throw new Error("Wiki image runtime cache must retain at most 64 entries");
  if (!/maxAgeSeconds:\s*(?:2592000|2592e3)/.test(serviceWorkerText))
    throw new Error("Wiki image runtime cache is missing its 30-day expiry");
  if (!/purgeOnQuotaError:\s*(?:!0|true)/.test(serviceWorkerText))
    throw new Error("Wiki image runtime cache must purge on quota errors");
  console.log(
    "service worker: OK (0 Wiki precache entries; runtime cache max 64 / 30 days)",
  );
} finally {
  child.kill();
}
