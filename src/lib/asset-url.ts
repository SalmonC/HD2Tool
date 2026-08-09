/** Resolve a bundled asset for both Vite's relative preview base and Pages. */
export function resolveAssetUrl(
  path: string,
  baseUrl = import.meta.env.BASE_URL,
  documentBaseUri = typeof document === "undefined"
    ? undefined
    : document.baseURI,
): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) return path;

  const cleanPath = path.replace(/^\/+/, "");
  const cleanBase = baseUrl.trim() || "./";
  if (!documentBaseUri) {
    const relativeBase = cleanBase.endsWith("/") ? cleanBase : `${cleanBase}/`;
    return `${relativeBase}${cleanPath}`;
  }
  if (cleanBase === "./" || cleanBase === ".")
    return new URL(cleanPath, documentBaseUri).href;

  const joined = `${cleanBase.replace(/\/+$/, "")}/${cleanPath}`;
  return new URL(joined, documentBaseUri).href;
}
