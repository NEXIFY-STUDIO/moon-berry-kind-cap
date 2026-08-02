/**
 * Fidelity harness: fixture HTML → blueprint → RebuildSpec snapshot.
 * Regression in extraction fails CI.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanToBlueprint } from "@/lib/blueprint/scan";
import { blueprintToRebuildSpec, stableStringify } from "@/lib/rebuild";

const fixturesDir = path.resolve(__dirname, "../../fixtures");
const snapDir = path.resolve(__dirname, "../../fixtures/rebuild-snapshots");

const CASES = [
  {
    id: "static-sample",
    html: "sample-page.html",
    baseUrl: "https://sample.example/app",
    wpJetEngine: false,
  },
  {
    id: "wp-elementor",
    html: "wp-jetengine-sample.html",
    baseUrl: "https://wp.example/",
    wpJetEngine: true,
  },
  {
    id: "spa-shell",
    html: "spa-shell.html",
    baseUrl: "https://spa.example/",
    wpJetEngine: false,
  },
] as const;

function snapPath(id: string) {
  return path.join(snapDir, `${id}.rebuild-spec.json`);
}

describe("RebuildSpec fidelity harness", () => {
  it("weights config present", () => {
    expect(CASES).toHaveLength(3);
  });

  for (const c of CASES) {
    it(`snapshot: ${c.id}`, async () => {
      const html = readFileSync(path.join(fixturesDir, c.html), "utf8");
      const bp = await scanToBlueprint({
        html,
        baseUrl: c.baseUrl,
        captureAssets: false,
        render: false,
        wayback: false,
        maxPages: 1,
        wpJetEngine: c.wpJetEngine,
      });
      const spec = blueprintToRebuildSpec(bp);
      // Strip volatile id that includes blueprint id timestamp if any —
      // use structural compare via stable stringify of normalized fields.
      const normalized = {
        ...spec,
        id: `rebuild_${c.id}`,
        source: {
          ...spec.source,
          blueprintId: c.id,
        },
      };
      const json = stableStringify(normalized);

      if (!existsSync(snapDir)) mkdirSync(snapDir, { recursive: true });
      const file = snapPath(c.id);

      if (!existsSync(file) || process.env.UPDATE_REBUILD_SNAPSHOTS === "1") {
        writeFileSync(file, json, "utf8");
      }

      const expected = readFileSync(file, "utf8");
      expect(json).toBe(expected);

      // Invariants per case
      expect(spec.schemaVersion).toBe("1.0.0");
      expect(spec.gaps.some((g) => g.code === "NO_API")).toBe(true);

      if (c.id === "spa-shell") {
        expect(spec.source.isThinHtml || spec.gaps.some((g) => g.code === "THIN_HTML")).toBe(
          true,
        );
      }
      if (c.id === "static-sample") {
        expect(spec.content.texts.length).toBeGreaterThan(0);
      }
      if (c.id === "wp-elementor") {
        expect(
          spec.components.length + spec.layout.sections.length,
        ).toBeGreaterThan(0);
      }
    });
  }
});
