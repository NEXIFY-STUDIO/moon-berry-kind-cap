import { describe, expect, it } from "vitest";
import { makeMinimalBlueprint } from "../../fixtures/minimal-blueprint";
import {
  blueprintToRebuildSpec,
  parseRebuildSpec,
  stableStringify,
  REBUILD_SPEC_SCHEMA_VERSION,
} from "@/lib/rebuild";
import {
  assertWeightsSum100,
  COMPLETENESS_WEIGHTS,
  scoreRebuildSpec,
} from "@/lib/rebuild/completeness";
import {
  buildAllRebuildPrompts,
  buildRebuildPrompt,
} from "@/lib/rebuild/prompts";

describe("RebuildSpec mapper", () => {
  it("is deterministic for the same blueprint", () => {
    const bp = makeMinimalBlueprint();
    const a = stableStringify(blueprintToRebuildSpec(bp));
    const b = stableStringify(blueprintToRebuildSpec(bp));
    expect(a).toBe(b);
  });

  it("validates against Zod schema", () => {
    const spec = blueprintToRebuildSpec(makeMinimalBlueprint());
    expect(spec.schemaVersion).toBe(REBUILD_SPEC_SCHEMA_VERSION);
    expect(() => parseRebuildSpec(spec)).not.toThrow();
  });

  it("never throws on sparse / legacy blueprints", () => {
    const sparse = {
      id: "legacy",
      version: "1.0.0",
      createdAt: "2020-01-01T00:00:00.000Z",
      source: "html",
      sourceUrl: null,
      finalUrl: null,
      statusCode: null,
      contentHash: "x",
      contentType: null,
      headers: {},
      meta: {
        title: "",
        description: "",
        canonical: null,
        language: null,
        robots: null,
        og: {},
        twitter: {},
        icons: [],
        themeColor: null,
        viewport: null,
      },
      tech: [],
      design: {
        colors: [],
        fonts: [],
        cssVariables: {},
        borderRadii: [],
        shadows: [],
        spacingHints: [],
      },
      assets: [],
      links: [],
      forms: [],
      scripts: [],
      stylesheets: [],
      outline: [],
      headings: [],
      html: "",
      cssBundles: [],
      pages: [],
      options: {
        maxPages: 1,
        render: false,
        wayback: false,
        captureAssets: false,
        wpJetEngine: false,
      },
      waybackUrl: null,
      rendered: false,
      wordpress: null,
      elementorTemplate: null,
      stats: {
        htmlBytes: 0,
        assetCount: 0,
        capturedAssetCount: 0,
        pageCount: 1,
        internalLinkCount: 0,
        externalLinkCount: 0,
        formCount: 0,
        scriptCount: 0,
        stylesheetCount: 0,
        scanMs: 0,
      },
      notes: [],
      limitations: [],
    } as unknown as import("@/lib/blueprint/types").Blueprint;

    const spec = blueprintToRebuildSpec(sparse);
    expect(spec.gaps.length).toBeGreaterThan(0);
    expect(spec.gaps.some((g) => g.code === "NO_HOVER_STATES")).toBe(true);
  });

  it("clusters colors into roles", () => {
    const bp = makeMinimalBlueprint({
      design: {
        colors: ["#0a0a0b", "#0b0b0c", "#f4f4f5", "#C8A16E", "#27272a"],
        fonts: ["Inter"],
        cssVariables: { "--color-primary": "#C8A16E" },
        borderRadii: ["12px"],
        shadows: [],
        spacingHints: ["16px", "24px"],
      },
    });
    const spec = blueprintToRebuildSpec(bp);
    const roles = spec.designTokens.colors.map((c) => c.role).sort();
    expect(roles).toContain("bg");
    expect(roles).toContain("accent");
    expect(spec.designTokens.colors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Completeness weights", () => {
  it("sum to exactly 100", () => {
    expect(assertWeightsSum100()).toBe(100);
    expect(
      Object.values(COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0),
    ).toBe(100);
  });

  it("penalizes thin HTML shell fully on shell weight", () => {
    const thin = blueprintToRebuildSpec(
      makeMinimalBlueprint({ isThinHtml: true, thinHtmlReasons: ["empty root"] }),
    );
    const rich = blueprintToRebuildSpec(
      makeMinimalBlueprint({
        isThinHtml: false,
        design: {
          colors: ["#111", "#eee", "#c8a16e"],
          fonts: ["Inter"],
          cssVariables: {},
          borderRadii: ["8px", "12px"],
          shadows: ["0 1px 2px #000"],
          spacingHints: ["8px", "16px", "24px"],
          typography: [
            {
              selector: "h1",
              fontFamily: "Inter",
              fontSize: "32px",
              fontWeight: "700",
              lineHeight: "1.2",
              letterSpacing: null,
              source: "css-rule",
            },
            {
              selector: "h2",
              fontFamily: "Inter",
              fontSize: "24px",
              fontWeight: "600",
              lineHeight: "1.3",
              letterSpacing: null,
              source: "css-rule",
            },
            {
              selector: "body",
              fontFamily: "Inter",
              fontSize: "16px",
              fontWeight: "400",
              lineHeight: "1.5",
              letterSpacing: null,
              source: "css-rule",
            },
          ],
        },
      }),
    );
    const thinScore = scoreRebuildSpec(thin);
    const richScore = scoreRebuildSpec(rich);
    expect(thinScore.weights.find((w) => w.id === "shell")?.earned).toBe(0);
    expect(richScore.score).toBeGreaterThan(thinScore.score);
  });
});

describe("Prompt builders", () => {
  it("all three stacks include UNKNOWN and acceptance blocks", () => {
    const spec = blueprintToRebuildSpec(makeMinimalBlueprint());
    const all = buildAllRebuildPrompts(spec);
    for (const stack of ["react-tailwind", "html-css", "nextjs-app"] as const) {
      const p = all[stack];
      expect(p.fullPrompt).toMatch(/UNKNOWN — do not invent/);
      expect(p.fullPrompt).toMatch(/Acceptance criteria/);
      expect(p.fullPrompt).toMatch(/Do NOT invent/);
      expect(p.fullPrompt).toMatch(/schemaVersion/);
      expect(p.meta.completeness).toBeGreaterThanOrEqual(0);
    }
  });

  it("prompts are deterministic", () => {
    const spec = blueprintToRebuildSpec(makeMinimalBlueprint());
    const a = buildRebuildPrompt(spec, "react-tailwind").fullPrompt;
    const b = buildRebuildPrompt(spec, "react-tailwind").fullPrompt;
    expect(a).toBe(b);
  });
});
