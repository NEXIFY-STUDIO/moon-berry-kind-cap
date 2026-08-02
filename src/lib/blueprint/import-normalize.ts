import type { Blueprint } from "./types";

/**
 * Validate + normalize a JSON object imported as Blueprint (vault / file import).
 * Throws Error with Slovak message on invalid shape.
 */
export function normalizeImportedBlueprint(raw: unknown): Blueprint {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid blueprint format");
  }
  const parsed = raw as Partial<Blueprint> & {
    id?: string;
    version?: string;
    html?: string;
    stats?: Partial<Blueprint["stats"]> & { pageCount?: number };
    assets?: Blueprint["assets"];
    options?: Partial<Blueprint["options"]>;
  };

  if (!parsed.id || !parsed.version || !parsed.html) {
    throw new Error("Invalid blueprint format");
  }

  const bp = parsed as Blueprint;

  if (!bp.pages) bp.pages = [];
  if (!bp.options) {
    bp.options = {
      maxPages: 1,
      render: false,
      wayback: false,
      captureAssets: false,
      wpJetEngine: false,
    };
  } else if (bp.options.wpJetEngine == null) {
    bp.options.wpJetEngine = false;
  }
  if (bp.wordpress === undefined) bp.wordpress = null;
  if (bp.elementorTemplate === undefined) bp.elementorTemplate = null;
  if (bp.rendered == null) bp.rendered = false;
  if (bp.waybackUrl === undefined) bp.waybackUrl = null;
  if (!bp.stats) {
    throw new Error("Invalid blueprint format");
  }
  if (!bp.stats.pageCount) bp.stats.pageCount = 1;
  if (bp.stats.capturedAssetCount == null) {
    bp.stats.capturedAssetCount = (bp.assets || []).filter((a) => a.captured).length;
  }
  if (!Array.isArray(bp.assets)) bp.assets = [];
  if (!Array.isArray(bp.tech)) bp.tech = [];
  if (bp.scanStatus == null) bp.scanStatus = "complete";
  if (bp.partialStats === undefined) bp.partialStats = null;
  if (bp.scanWarnings === undefined) bp.scanWarnings = null;
  if (bp.isThinHtml == null) bp.isThinHtml = false;
  if (!Array.isArray(bp.thinHtmlReasons)) bp.thinHtmlReasons = [];
  if (!Array.isArray(bp.partialErrors)) bp.partialErrors = [];
  if (!bp.design) {
    bp.design = {
      colors: [],
      fonts: [],
      cssVariables: {},
      borderRadii: [],
      shadows: [],
      spacingHints: [],
    };
  }

  return bp;
}

export function isValidBlueprintId(id: string): boolean {
  return typeof id === "string" && id.length >= 3 && id.length <= 200;
}

export function canSubmitScan(opts: {
  mode: "url" | "html";
  url: string;
  html: string;
  busy: boolean;
}): boolean {
  if (opts.busy) return false;
  if (opts.mode === "url") return Boolean(opts.url.trim());
  return Boolean(opts.html.trim());
}

export function clampMaxPages(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(20, Math.max(1, Math.floor(n)));
}

/** Guard for production asset paths in index.html (MIME text/html blank-page fix). */
export function assertIndexHtmlAssetPaths(indexHtml: string): {
  ok: boolean;
  scriptSrcs: string[];
  cssHrefs: string[];
  issues: string[];
} {
  const issues: string[] = [];
  const scriptSrcs = [...indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(
    (m) => m[1],
  );
  const cssHrefs = [
    ...indexHtml.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi),
  ].map((m) => m[1]);

  if (scriptSrcs.length === 0) {
    issues.push("No <script src> in index.html — production bundle may be empty.");
  }
  for (const src of scriptSrcs) {
    if (src.startsWith("http://") || src.startsWith("https://")) continue;
    if (src.startsWith("data:")) {
      issues.push(`Script data: URL: ${src.slice(0, 40)}`);
      continue;
    }
    // absolute path preferred; relative ./assets is ok
    if (!src.includes("assets") && !src.startsWith("/")) {
      issues.push(`Suspicious script path (may 404 → MIME text/html): ${src}`);
    }
  }
  return { ok: issues.length === 0, scriptSrcs, cssHrefs, issues };
}
