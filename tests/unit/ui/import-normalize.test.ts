import { describe, expect, it } from "vitest";
import {
  assertIndexHtmlAssetPaths,
  canSubmitScan,
  clampMaxPages,
  isValidBlueprintId,
  normalizeImportedBlueprint,
} from "@/lib/blueprint/import-normalize";
import { makeMinimalBlueprint } from "../../fixtures/minimal-blueprint";

describe("import-normalize · vault / Import JSON", () => {
  it("accepts full minimal blueprint", () => {
    const bp = normalizeImportedBlueprint(makeMinimalBlueprint());
    expect(bp.id).toMatch(/BLUEPRINT/);
    expect(bp.html).toBeTruthy();
  });

  it.each([
    [null, "Invalid"],
    [undefined, "Invalid"],
    [{}, "Invalid"],
    [{ id: "x" }, "Invalid"],
    [{ id: "x", version: "1" }, "Invalid"],
    [{ id: "x", version: "1", html: "<p/>" }, "Invalid"], // missing stats
  ])("rejects invalid payload %#", (raw, msg) => {
    expect(() => normalizeImportedBlueprint(raw)).toThrow(new RegExp(msg));
  });

  it("fills missing pages and options defaults", () => {
    const raw = makeMinimalBlueprint();
    // @ts-expect-error intentional
    delete raw.pages;
    // @ts-expect-error intentional
    delete raw.options;
    const bp = normalizeImportedBlueprint(raw);
    expect(bp.pages).toEqual([]);
    expect(bp.options.wpJetEngine).toBe(false);
    expect(bp.options.maxPages).toBe(1);
  });

  it("sets wpJetEngine false when null on options", () => {
    const raw = makeMinimalBlueprint({
      options: {
        maxPages: 3,
        render: true,
        wayback: true,
        captureAssets: true,
        // @ts-expect-error test null
        wpJetEngine: null,
      },
    });
    const bp = normalizeImportedBlueprint(raw);
    expect(bp.options.wpJetEngine).toBe(false);
  });

  it("defaults wordpress and elementorTemplate to null", () => {
    const raw = makeMinimalBlueprint();
    // @ts-expect-error
    delete raw.wordpress;
    // @ts-expect-error
    delete raw.elementorTemplate;
    const bp = normalizeImportedBlueprint(raw);
    expect(bp.wordpress).toBeNull();
    expect(bp.elementorTemplate).toBeNull();
  });

  it("computes capturedAssetCount from assets", () => {
    const raw = makeMinimalBlueprint({
      assets: [
        { url: "a", type: "image", captured: true },
        { url: "b", type: "image", captured: false },
      ],
      stats: {
        ...makeMinimalBlueprint().stats,
        // @ts-expect-error
        capturedAssetCount: null,
      },
    });
    const bp = normalizeImportedBlueprint(raw);
    expect(bp.stats.capturedAssetCount).toBe(1);
  });

  it("forces pageCount >= 1", () => {
    const raw = makeMinimalBlueprint({
      stats: { ...makeMinimalBlueprint().stats, pageCount: 0 },
    });
    expect(normalizeImportedBlueprint(raw).stats.pageCount).toBe(1);
  });

  it("defaults rendered and waybackUrl", () => {
    const raw = makeMinimalBlueprint();
    // @ts-expect-error
    delete raw.rendered;
    // @ts-expect-error
    delete raw.waybackUrl;
    const bp = normalizeImportedBlueprint(raw);
    expect(bp.rendered).toBe(false);
    expect(bp.waybackUrl).toBeNull();
  });
});

describe("import-normalize · canSubmitScan / clampMaxPages / ids", () => {
  it.each([
    [{ mode: "url" as const, url: "", html: "", busy: false }, false],
    [{ mode: "url" as const, url: "  ", html: "", busy: false }, false],
    [{ mode: "url" as const, url: "https://x", html: "", busy: false }, true],
    [{ mode: "url" as const, url: "https://x", html: "", busy: true }, false],
    [{ mode: "html" as const, url: "", html: "", busy: false }, false],
    [{ mode: "html" as const, url: "", html: "<p/>", busy: false }, true],
    [{ mode: "html" as const, url: "", html: "<p/>", busy: true }, false],
  ])("canSubmitScan %#", (opts, expected) => {
    expect(canSubmitScan(opts)).toBe(expected);
  });

  it.each([
    [0, 1],
    [-5, 1],
    [1, 1],
    [5, 5],
    [20, 20],
    [99, 20],
    [3.9, 3],
    [NaN, 1],
  ])("clampMaxPages(%s) → %s", (n, exp) => {
    expect(clampMaxPages(n)).toBe(exp);
  });

  it.each([
    ["AB", false],
    ["ABC", true],
    ["BLUEPRINT_x", true],
    ["", false],
  ])("isValidBlueprintId(%s)", (id, exp) => {
    expect(isValidBlueprintId(id)).toBe(exp);
  });
});

describe("import-normalize · production index.html asset guard", () => {
  it("flags missing scripts", () => {
    const r = assertIndexHtmlAssetPaths("<html><body>empty</body></html>");
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatch(/script/i);
  });

  it("accepts /assets/ module scripts", () => {
    const r = assertIndexHtmlAssetPaths(
      `<html><head>
        <script type="module" src="/assets/index-abc.js"></script>
        <link rel="stylesheet" href="/assets/index-abc.css" />
      </head></html>`,
    );
    expect(r.ok).toBe(true);
    expect(r.scriptSrcs[0]).toMatch(/\/assets\//);
  });

  it("flags suspicious relative script without assets", () => {
    const r = assertIndexHtmlAssetPaths(
      `<script type="module" src="chunk.js"></script>`,
    );
    expect(r.ok).toBe(false);
  });

  it("allows absolute https CDN scripts", () => {
    const r = assertIndexHtmlAssetPaths(
      `<script src="https://cdn.example/app.js"></script>`,
    );
    expect(r.ok).toBe(true);
  });
});
