import { describe, expect, it } from "vitest";
import { resolveAssetUrl } from "./currency";

describe("currency asset URL resolution", () => {
  it("resolves a relative deployment base against the current document", () => {
    expect(
      resolveAssetUrl(
        "assets/wiki/currency-medals.png",
        "./",
        "http://localhost:4173/index.html",
      ),
    ).toBe("http://localhost:4173/assets/wiki/currency-medals.png");
  });

  it("keeps assets under the GitHub Pages repository base", () => {
    expect(
      resolveAssetUrl(
        "/assets/wiki/currency-medals.png",
        "/HD2Tool/",
        "https://example.github.io/HD2Tool/index.html",
      ),
    ).toBe("https://example.github.io/HD2Tool/assets/wiki/currency-medals.png");
  });

  it("does not require browser globals during SSR tests", () => {
    expect(resolveAssetUrl("assets/icon.png", "./", undefined)).toBe(
      "./assets/icon.png",
    );
  });
});
