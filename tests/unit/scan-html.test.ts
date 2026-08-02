import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanToBlueprint } from "@/lib/blueprint/scan";

const fixture = readFileSync(
  path.resolve(__dirname, "../fixtures/sample-page.html"),
  "utf8",
);

const baseOpts = {
  html: fixture,
  baseUrl: "https://sample.example/app",
  captureAssets: false,
  render: false,
  wayback: false,
  maxPages: 1,
} as const;

describe("scanToBlueprint · HTML mode", () => {
  it("builds a complete blueprint from pasted HTML", async () => {
    const bp = await scanToBlueprint({ ...baseOpts });

    expect(bp.version).toBe("1.2.0");
    expect(bp.source).toBe("html");
    expect(bp.id).toMatch(/^BLUEPRINT_/);
    expect(bp.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(bp.meta.title).toBe("Sample Blueprint App");
    expect(bp.meta.description).toContain("Ukážková");
    expect(bp.meta.language).toBe("sk");
    expect(bp.meta.canonical).toBe("https://sample.example/app");
    expect(bp.meta.themeColor).toBe("#0a0a0b");
    expect(bp.meta.og["og:title"]).toBe("Sample App OG");
    expect(bp.pages).toEqual([]);
    expect(bp.stats.pageCount).toBe(1);
  });

  it("extracts headings, links and forms", async () => {
    const bp = await scanToBlueprint({ ...baseOpts });

    expect(bp.headings.some((h) => h.level === 1 && /Vitaj/.test(h.text))).toBe(
      true,
    );
    expect(bp.links.length).toBeGreaterThanOrEqual(3);
    expect(bp.links.some((l) => l.internal && l.href.includes("/pricing"))).toBe(
      true,
    );
    expect(bp.links.some((l) => !l.internal)).toBe(true);
    expect(bp.forms).toHaveLength(1);
    expect(bp.forms[0].method).toBe("POST");
    expect(bp.forms[0].fields.some((f) => f.name === "email" && f.required)).toBe(
      true,
    );
  });

  it("extracts assets and design tokens", async () => {
    const bp = await scanToBlueprint({ ...baseOpts });

    expect(bp.assets.some((a) => a.type === "image")).toBe(true);
    expect(bp.assets.some((a) => a.type === "script")).toBe(true);
    expect(bp.design.colors.length).toBeGreaterThan(0);
    expect(bp.design.fonts.some((f) => /Inter/i.test(f))).toBe(true);
    expect(bp.design.cssVariables["--color-bg"]).toBeTruthy();
    expect(bp.design.borderRadii.length).toBeGreaterThan(0);
  });

  it("detects tech signals from fixture HTML", async () => {
    const bp = await scanToBlueprint({ ...baseOpts });
    const names = bp.tech.map((t) => t.name);
    expect(names).toContain("React");
    expect(names).toContain("Next.js");
    expect(names).toContain("PWA");
    expect(names).toContain("Google Analytics");
  });

  it("builds DOM outline and stats", async () => {
    const bp = await scanToBlueprint({ ...baseOpts });
    expect(bp.outline.length).toBeGreaterThan(0);
    expect(bp.stats.htmlBytes).toBeGreaterThan(100);
    expect(bp.stats.formCount).toBe(1);
    expect(bp.stats.scriptCount).toBeGreaterThan(0);
    expect(bp.stats.scanMs).toBeGreaterThanOrEqual(0);
    expect(bp.limitations.length).toBeGreaterThan(0);
    expect(bp.html).toContain("<!DOCTYPE html>");
  });

  it("rewrites relative asset URLs to absolute", async () => {
    const bp = await scanToBlueprint({ ...baseOpts });
    expect(bp.html).toContain("https://sample.example/images/hero.png");
    expect(bp.scripts.some((s) => s.startsWith("https://sample.example/"))).toBe(
      true,
    );
  });

  it("rejects empty input", async () => {
    await expect(scanToBlueprint({})).rejects.toThrow(/Enter a URL|Zadaj URL/i);
  });
});
