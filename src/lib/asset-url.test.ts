import { describe, expect, it } from "vitest";
import { resolveAssetUrl } from "./asset-url";

describe("resolveAssetUrl", () => {
  it("resolves relative Vite base URLs against the document", () => {
    expect(
      resolveAssetUrl("assets/brand/icon.png", "./", "http://127.0.0.1:4173/"),
    ).toBe("http://127.0.0.1:4173/assets/brand/icon.png");
  });

  it("keeps the GitHub Pages repository base path", () => {
    expect(
      resolveAssetUrl(
        "assets/brand/icon.png",
        "/HD2Tool/",
        "https://example.test/HD2Tool/",
      ),
    ).toBe("https://example.test/HD2Tool/assets/brand/icon.png");
  });

  it("does not rewrite an already absolute URL", () => {
    expect(
      resolveAssetUrl(
        "https://cdn.example.test/icon.png",
        "./",
        "http://127.0.0.1:4173/",
      ),
    ).toBe("https://cdn.example.test/icon.png");
  });
});
