import type {
  BlueprintAsset,
  BlueprintForm,
  BlueprintLink,
  BlueprintPage,
  DesignTokens,
  FailedUrlRecord,
  PartialStats,
  ScanStatus,
  ScanWarnings,
} from "./types";
import {
  isTransientError,
  shouldRetryHttpStatus,
  withRetry,
} from "./retry";

export interface PageHarvest {
  page: BlueprintPage;
  links: BlueprintLink[];
  forms: BlueprintForm[];
  assets: BlueprintAsset[];
  scripts: string[];
  stylesheets: string[];
  cssBundles: Array<{ url: string; css: string }>;
  design: DesignTokens;
}

export interface CrawlHarvestResult {
  /** Successfully harvested pages (excludes primary) */
  scannedPages: BlueprintPage[];
  failedUrls: FailedUrlRecord[];
  scanStatus: ScanStatus;
  partialStats: PartialStats;
  scanWarnings: ScanWarnings;
  aborted: boolean;
  links: BlueprintLink[];
  forms: BlueprintForm[];
  assets: BlueprintAsset[];
  scripts: string[];
  stylesheets: string[];
  cssBundles: Array<{ url: string; css: string }>;
  design: DesignTokens;
}

function emptyDesign(): DesignTokens {
  return {
    colors: [],
    fonts: [],
    cssVariables: {},
    borderRadii: [],
    shadows: [],
    spacingHints: [],
  };
}

export function normalizePageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // drop trailing slash except root
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return url;
  }
}

export function buildPartialStats(
  succeeded: number,
  failed: number,
): PartialStats {
  return {
    totalAttempted: succeeded + failed,
    succeeded,
    failed,
  };
}

/** Determine scanStatus from crawl outcomes (primary page is separate). */
export function resolveScanStatus(opts: {
  failedCount: number;
  aborted: boolean;
  maxAdditional: number;
  succeededAdditional: number;
}): ScanStatus {
  if (opts.aborted) return "aborted";
  if (opts.failedCount > 0) return "partial";
  return "complete";
}

export function mergeDesignTokens(
  base: DesignTokens,
  next: DesignTokens,
): DesignTokens {
  return {
    colors: [...new Set([...base.colors, ...next.colors])].slice(0, 64),
    fonts: [...new Set([...base.fonts, ...next.fonts])].slice(0, 24),
    cssVariables: { ...next.cssVariables, ...base.cssVariables },
    borderRadii: [...new Set([...base.borderRadii, ...next.borderRadii])].slice(
      0,
      20,
    ),
    shadows: [...new Set([...base.shadows, ...next.shadows])].slice(0, 16),
    spacingHints: [
      ...new Set([...base.spacingHints, ...next.spacingHints]),
    ].slice(0, 24),
    elementorGlobals: base.elementorGlobals ?? next.elementorGlobals,
    typography: base.typography ?? next.typography,
    fullImageUrls: [
      ...new Set([
        ...(base.fullImageUrls || []),
        ...(next.fullImageUrls || []),
      ]),
    ].slice(0, 200),
  };
}

/**
 * Fault-tolerant same-origin multi-page harvest.
 * Each URL is isolated: failures are recorded and crawl continues.
 * AbortSignal stops further fetches and marks status aborted/partial.
 */

/**
 * Run harvestOne with retries for transient HTTP statuses and network errors.
 * Permanent failures (404/401/403) fail immediately.
 */
export async function harvestOneWithRetry(
  url: string,
  harvestOne: (url: string) => Promise<PageHarvest | null>,
  opts?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    signal?: AbortSignal;
    onRetry?: (info: {
      url: string;
      attempt: number;
      nextAttempt: number;
      reason: string;
      delayMs: number;
    }) => void;
  },
): Promise<{ harvested: PageHarvest | null; attempts: number }> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 3);
  let attempts = 0;

  const result = await withRetry(
    async (attempt) => {
      attempts = attempt;
      if (opts?.signal?.aborted) {
        const e = new Error("Aborted");
        e.name = "AbortError";
        throw e;
      }
      const harvested = await harvestOne(url);

      if (!harvested) {
        // empty body — treat as transient once or twice
        const err = new Error("Empty harvest result");
        (err as Error & { code?: string }).code = "EMPTY_HARVEST";
        throw err;
      }

      const status = harvested.page.statusCode;
      if (status != null && status >= 400) {
        if (shouldRetryHttpStatus(status) && attempt < maxAttempts) {
          const err = new Error(`HTTP ${status}`);
          (err as Error & { statusCode?: number }).statusCode = status;
          throw err; // triggers retry
        }
        // permanent HTTP error — return as-is (caller records failure, no throw)
        return harvested;
      }
      return harvested;
    },
    {
      maxAttempts,
      baseDelayMs: opts?.baseDelayMs ?? 200,
      maxDelayMs: opts?.maxDelayMs ?? 2_500,
      signal: opts?.signal,
      shouldRetry: (err, attempt) => {
        if (opts?.signal?.aborted) return false;
        if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode != null) {
          return shouldRetryHttpStatus((err as Error & { statusCode?: number }).statusCode);
        }
        if (err instanceof Error && (err as Error & { code?: string }).code === "EMPTY_HARVEST") {
          return attempt < maxAttempts;
        }
        return isTransientError(err);
      },
      onRetry: ({ attempt, nextAttempt, error, delayMs }) => {
        const reason =
          error instanceof Error ? error.message : String(error);
        opts?.onRetry?.({
          url,
          attempt,
          nextAttempt,
          reason,
          delayMs,
        });
      },
    },
  );

  return { harvested: result, attempts };
}

export async function harvestCrawlPages(opts: {
  baseUrl: string;
  /** max *additional* pages (primary is outside); typically maxPages - 1 */
  maxAdditionalPages: number;
  seedUrls?: string[];
  primaryInternalLinks?: string[];
  initialDesign?: DesignTokens;
  signal?: AbortSignal;
  /** Injected per-URL harvest (fetch+parse). Throw or return null for failure. */
  harvestOne: (url: string) => Promise<PageHarvest | null>;
  /**
   * Called after each page attempt (success or fail) so callers can
   * checkpoint partial blueprints (vault / crash recovery).
   */
  onProgress?: (state: {
    scannedPages: BlueprintPage[];
    failedUrls: FailedUrlRecord[];
    totalAttempted: number;
  }) => void | Promise<void>;
  /** Total harvest attempts per URL (default 3). Set 1 to disable retries. */
  maxAttemptsPerUrl?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (info: {
    url: string;
    attempt: number;
    nextAttempt: number;
    reason: string;
    delayMs: number;
  }) => void;
}): Promise<CrawlHarvestResult> {
  const origin = new URL(opts.baseUrl).origin;
  const queue: string[] = [];
  const seen = new Set<string>([normalizePageUrl(opts.baseUrl)]);

  const enqueue = (href: string, priority = false) => {
    try {
      if (new URL(href).origin !== origin) return;
    } catch {
      return;
    }
    const n = normalizePageUrl(href);
    if (seen.has(n)) return;
    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|xml|css|js)(\?|$)/i.test(n)) return;
    seen.add(n);
    if (priority) queue.unshift(n);
    else queue.push(n);
  };

  for (const u of opts.seedUrls || []) enqueue(u, true);
  for (const u of opts.primaryInternalLinks || []) enqueue(u, false);

  const scannedPages: BlueprintPage[] = [];
  const failedUrls: FailedUrlRecord[] = [];
  let links: BlueprintLink[] = [];
  let forms: BlueprintForm[] = [];
  let assets: BlueprintAsset[] = [];
  let scripts: string[] = [];
  let stylesheets: string[] = [];
  let cssBundles: Array<{ url: string; css: string }> = [];
  let design = opts.initialDesign ? { ...opts.initialDesign } : emptyDesign();
  let aborted = false;

  const report = async () => {
    if (!opts.onProgress) return;
    await opts.onProgress({
      scannedPages: [...scannedPages],
      failedUrls: [...failedUrls],
      totalAttempted: scannedPages.length + failedUrls.length,
    });
  };

  while (queue.length && scannedPages.length < opts.maxAdditionalPages) {
    if (opts.signal?.aborted) {
      aborted = true;
      break;
    }

    const nextUrl = queue.shift()!;

    try {
      if (opts.signal?.aborted) {
        aborted = true;
        break;
      }

      const { harvested, attempts } = await harvestOneWithRetry(
        nextUrl,
        opts.harvestOne,
        {
          maxAttempts: opts.maxAttemptsPerUrl ?? 3,
          baseDelayMs: opts.baseDelayMs ?? 200,
          maxDelayMs: opts.maxDelayMs ?? 2_500,
          signal: opts.signal,
          onRetry: opts.onRetry,
        },
      );

      if (!harvested) {
        failedUrls.push({
          url: nextUrl,
          statusCode: null,
          error: `Page harvest returned empty after ${attempts} attempt(s)`,
          at: new Date().toISOString(),
        });
        await report();
        continue;
      }

      // HTTP error pages still returned as harvest with status — treat >=400 as fail
      if (
        harvested.page.statusCode != null &&
        harvested.page.statusCode >= 400
      ) {
        failedUrls.push({
          url: harvested.page.url || nextUrl,
          statusCode: harvested.page.statusCode,
          error:
            attempts > 1
              ? `HTTP ${harvested.page.statusCode} after ${attempts} attempts`
              : `HTTP ${harvested.page.statusCode}`,
          at: new Date().toISOString(),
        });
        await report();
        continue;
      }

      scannedPages.push(harvested.page);
      for (const l of harvested.links) {
        links.push(l);
        if (l.internal) enqueue(l.href, false);
      }
      forms = forms.concat(harvested.forms);
      assets = assets.concat(harvested.assets);
      scripts = scripts.concat(harvested.scripts);
      stylesheets = stylesheets.concat(harvested.stylesheets);
      cssBundles = cssBundles.concat(harvested.cssBundles);
      design = mergeDesignTokens(design, harvested.design);
      await report();
    } catch (err) {
      // Per-URL isolation: never abort whole crawl on single failure
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timeout / aborted"
            : err.message
          : String(err);
      const statusMatch = message.match(/HTTP\s+(\d{3})/i);
      const statusCode = statusMatch ? Number(statusMatch[1]) : null;
      failedUrls.push({
        url: nextUrl,
        statusCode,
        error: message.slice(0, 400),
        at: new Date().toISOString(),
      });
      if (err instanceof Error && err.name === "AbortError" && opts.signal?.aborted) {
        aborted = true;
        await report();
        break;
      }
      await report();
      // continue remaining queue
    }
  }

  if (opts.signal?.aborted) aborted = true;

  const partialStats = buildPartialStats(
    scannedPages.length,
    failedUrls.length,
  );
  // primary page counted outside; status reflects crawl leg
  const scanStatus = resolveScanStatus({
    failedCount: failedUrls.length,
    aborted,
    maxAdditional: opts.maxAdditionalPages,
    succeededAdditional: scannedPages.length,
  });

  return {
    scannedPages,
    failedUrls,
    scanStatus,
    partialStats,
    scanWarnings: { failedUrls: [...failedUrls] },
    aborted,
    links,
    forms,
    assets,
    scripts,
    stylesheets,
    cssBundles,
    design,
  };
}

/** UI badge label for partial / aborted scans */
export function partialScanBadgeLabel(
  scanStatus: ScanStatus | undefined,
  partialStats: PartialStats | null | undefined,
  primaryIncluded = true,
  locale: "en" | "sk" = "en",
): string | null {
  if (!scanStatus || scanStatus === "complete") return null;
  const s = partialStats?.succeeded ?? 0;
  const f = partialStats?.failed ?? 0;
  const t = partialStats?.totalAttempted ?? s + f;
  const saved = primaryIncluded ? s + 1 : s;
  const total = primaryIncluded ? t + 1 : t;
  const maxTotal = Math.max(total, saved);
  if (locale === "sk") {
    if (scanStatus === "aborted") {
      return `Prerušený sken: Uložených ${saved}/${maxTotal} stránok (${f} zlyhala)`;
    }
    return `Čiastočný sken: Uložených ${saved}/${maxTotal} stránok (${f} zlyhala)`;
  }
  if (scanStatus === "aborted") {
    return `Aborted scan: saved ${saved}/${maxTotal} pages (${f} failed)`;
  }
  return `Partial scan: saved ${saved}/${maxTotal} pages (${f} failed)`;
}
