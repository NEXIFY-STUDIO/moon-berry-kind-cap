import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDynamicFieldCatalog,
  extractJetDynamicFields,
  extractWordPressArchitecture,
} from "@/lib/blueprint/wordpress-jetengine";

const fixture = readFileSync(
  path.resolve(__dirname, "../fixtures/wp-jetengine-sample.html"),
  "utf8",
);
const base = "https://wp.example/";

describe("JetEngine dynamic field catalog + architecture", () => {
  it("buildDynamicFieldCatalog aggregates occurrences and samples", () => {
    const fields = extractJetDynamicFields(fixture, base);
    const catalog = buildDynamicFieldCatalog(fields);
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((c) => c.occurrences >= 1)).toBe(true);
    // title appears on multiple listing items → occurrences > 1 likely
    const title = catalog.find(
      (c) => c.source === "post_title" || c.key === "post_title",
    );
    expect(title || catalog[0]).toBeTruthy();
    if (title) {
      expect(title.sampleValues.length).toBeGreaterThan(0);
    }
  });

  it("extractWordPressArchitecture with liveRest:false is DOM-only", async () => {
    const arch = await extractWordPressArchitecture({
      baseUrl: base,
      html: fixture,
      liveRest: false,
      deep: false,
    });
    expect(arch.detected).toBe(true);
    expect(arch.isJetEngine).toBe(true);
    expect(arch.isElementor).toBe(true);
    expect(arch.listingGrids.length).toBeGreaterThan(0);
    expect(arch.dynamicFields.length).toBeGreaterThan(0);
    expect(arch.dynamicFieldCatalog.length).toBeGreaterThan(0);
    expect(arch.notes.some((n) => /Live REST disabled|Live REST vypnutý|DOM/i.test(n))).toBe(true);
    expect(arch.rest.root).toBeNull();
    expect(arch.limitations.some((l) => /dynamic fields/i.test(l))).toBe(true);
  });

  it("invalid base URL returns empty architecture", async () => {
    const arch = await extractWordPressArchitecture({
      baseUrl: "not-a-url",
      html: fixture,
      liveRest: false,
      deep: false,
    });
    expect(arch.detected).toBe(false);
    expect(arch.listingGrids).toEqual([]);
    expect(arch.dynamicFields).toEqual([]);
    expect(arch.notes[0]).toMatch(/Invalid|Neplatná|URL/i);
  });

  it("catalog prefers metaKey when present", () => {
    const catalog = buildDynamicFieldCatalog([
      {
        key: "popis",
        kind: "field",
        source: "post_meta",
        metaKey: "popis",
        taxonomy: null,
        sampleValue: "A",
        sampleUrl: null,
        tag: "div",
        elementorId: "1",
        classes: [],
        settings: {},
        formatHints: [],
        confidence: "high",
        context: "listing_item",
        evidence: "meta=popis",
      },
      {
        key: "popis",
        kind: "field",
        source: "unknown",
        metaKey: null,
        taxonomy: null,
        sampleValue: "B",
        sampleUrl: null,
        tag: "div",
        elementorId: "2",
        classes: [],
        settings: {},
        formatHints: [],
        confidence: "low",
        context: "listing_item",
        evidence: "x",
      },
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].occurrences).toBe(2);
    expect(catalog[0].metaKey).toBe("popis");
    expect(catalog[0].source).toBe("post_meta");
    expect(catalog[0].sampleValues).toEqual(expect.arrayContaining(["A", "B"]));
  });
});
