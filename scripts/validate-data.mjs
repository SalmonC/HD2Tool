import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));
const catalog = await readJson("src/data/catalog.json");
const aliases = await readJson("src/data/community-aliases.json");
const errors = [];
const fail = (message) => errors.push(message);
const kinds = new Set([
  "primary-weapon",
  "secondary-weapon",
  "support-weapon",
  "grenade",
  "body-armor",
  "other-stratagem",
]);
const itemIds = new Set();
const warbondIds = new Set(catalog.warbonds.map((entry) => entry.id));
let demolitionCount = 0;

if (catalog.items.length !== 292)
  fail(`expected 292 accepted items, found ${catalog.items.length}`);
for (const item of catalog.items) {
  if (!item.id || itemIds.has(item.id))
    fail(`duplicate or empty item id ${item.id}`);
  itemIds.add(item.id);
  if (!kinds.has(item.productKind)) fail(`invalid productKind ${item.id}`);
  if (!item.nameZh || !item.nameEn) fail(`missing identity ${item.id}`);
  if (!item.image?.path) fail(`missing image path ${item.id}`);
  else if (item.image.path.includes("placeholder"))
    fail(`placeholder image remains ${item.id}`);
  else {
    try {
      const imagePath = resolve(root, "public", item.image.path);
      await access(imagePath);
      const imageBytes = await readFile(imagePath);
      if (imageBytes.length === 0) fail(`empty image ${item.id}`);
      if (
        item.image.path.toLowerCase().endsWith(".png") &&
        !imageBytes
          .subarray(0, 8)
          .equals(Buffer.from("89504e470d0a1a0a", "hex"))
      )
        fail(`invalid PNG header ${item.id}`);
    } catch {
      fail(`missing image ${item.id}: ${item.image.path}`);
    }
  }
  const acquisition = item.acquisition;
  if (acquisition.kind === "warbond") {
    if (!warbondIds.has(acquisition.warbondId))
      fail(`unknown warbond ${item.id}`);
    const pages =
      catalog.warbonds.find((entry) => entry.id === acquisition.warbondId)
        ?.pages ?? [];
    if (
      acquisition.page !== null &&
      !pages.some((entry) => entry.page === acquisition.page)
    )
      fail(`unknown warbond page ${item.id}`);
    if (acquisition.itemMedals !== null && acquisition.itemMedals < 0)
      fail(`negative medals ${item.id}`);
  }
  for (const component of item.combat?.components ?? []) {
    const ap = component.fields.armorPenetration;
    for (const value of [ap?.value, ap?.minValue, ap?.maxValue])
      if (
        value !== undefined &&
        (!Number.isInteger(value) || value < 0 || value > 10)
      )
        fail(`invalid AP ${item.id}/${component.id}`);
    const demolition = component.fields.demolitionForce;
    if (demolition !== undefined) demolitionCount += 1;
    if (
      demolition !== undefined &&
      (!Number.isInteger(demolition) || demolition < 0 || demolition > 60)
    )
      fail(`invalid demolition ${item.id}/${component.id}`);
  }
}
if (demolitionCount < 120)
  fail(
    `expected at least 120 sourced demolition components, found ${demolitionCount}`,
  );
if (catalog.meta.demolitionSource?.importedComponents !== demolitionCount)
  fail(
    `demolition source count mismatch: ${catalog.meta.demolitionSource?.importedComponents} / ${demolitionCount}`,
  );

const seenAliases = new Map();
let aliasCount = 0;
for (const entry of aliases.entries) {
  if (!itemIds.has(entry.equipmentId))
    fail(`alias targets unknown item ${entry.equipmentId}`);
  for (const alias of entry.aliases) {
    aliasCount += 1;
    const key = alias
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s\p{P}\p{S}]+/gu, "");
    const previous = seenAliases.get(key);
    if (previous && previous !== entry.equipmentId)
      fail(`alias collision ${alias}: ${previous}/${entry.equipmentId}`);
    seenAliases.set(key, entry.equipmentId);
  }
}
if (aliases.entries.length !== 38 || aliasCount !== 48)
  fail(
    `expected 38 aliased items / 48 aliases, found ${aliases.entries.length} / ${aliasCount}`,
  );

const requiredFixtures = [
  ["sg-451-cookout", "warbond"],
  ["mg-43-machine-gun", "support-weapon"],
  ["cqc-72-entrenchment-tool", "support-weapon"],
  ["cqc-73-entrenchment-tool", "secondary-weapon"],
  ["gp-20-ultimatum", "secondary-weapon"],
  ["gp-31-grenade-pistol", "secondary-weapon"],
];
for (const [id, expected] of requiredFixtures) {
  const item = catalog.items.find((entry) => entry.id === id);
  if (!item) fail(`missing fixture ${id}`);
  else if (
    expected === "warbond"
      ? item.acquisition.kind !== expected
      : item.productKind !== expected
  )
    fail(`fixture mismatch ${id}: expected ${expected}`);
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Catalog OK: ${catalog.items.length} items, ${catalog.warbonds.length} warbonds, ${aliasCount} community aliases.`,
  );
}
