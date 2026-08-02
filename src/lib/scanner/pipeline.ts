/**
 * Graceful degradation + circuit breaker for page fetch.
 * Chain: Headless → HTTP static → Wayback
 * Partial failures never abort the whole product pipeline.
 */

import { renderWithBrowserShield } from "./browser";
import { findWaybackSnapshot } from "@/lib/blueprint/wayback";

export type PartialError = {
  stage: "headless" | "http" | "wayback" | "assets" | "css" | "crawl" | "other";
  message: string;
  statusCode?: number | null;
  at: string;
};

export type FetchStage = "headless" | "http" | "wayback" | "html";

export type PipelineFetchResult = {
  html: string;
  finalUrl: string;
  statusCode: number | null;
  headers: Record<string, string>;
  contentType: string | null;
  rendered: boolean;
  source: "url" | "wayback" | "html";
  waybackUrl: string | null;
  stageUsed: FetchStage;
  partialErrors: PartialError[];
};

const MAX_HTML_BYTES = 2_500_000;
const USER_AGENT =
  "BlueprintScanner/1.2 (+public frontend reconstruction; pipeline)";

function pe(
  stage: PartialError["stage"],
  message: string,
  statusCode?: number | null,
): PartialError {
  return {
    stage,
    message: message.slice(0, 500),
    statusCode: statusCode ?? null,
    at: new Date().toISOString(),
  };
}

async function httpFetch(
  url: string,
  signal?: AbortSignal,
): Promise<{
  text: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  contentType: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const onOuter = () => controller.abort();
  signal?.addEventListener("abort", onOuter, { once: true });
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,text/css,*/*;q=0.8",
        "accept-language": "en,sk;q=0.9",
      },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced =
      buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
    return {
      text,
      finalUrl: res.url || url,
      status: res.status,
      headers,
      contentType: headers["content-type"] ?? null,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuter);
  }
}

/**
 * Resilient page harvest with explicit fallback chain.
 */
export async function fetchPageWithFallback(opts: {
  url: string;
  wantRender: boolean;
  wantWayback: boolean;
  signal?: AbortSignal;
  /** injectables for tests */
  renderFn?: typeof renderWithBrowserShield;
  httpFn?: typeof httpFetch;
  waybackFn?: typeof findWaybackSnapshot;
}): Promise<PipelineFetchResult> {
  const partialErrors: PartialError[] = [];
  const renderFn = opts.renderFn ?? renderWithBrowserShield;
  const httpFn = opts.httpFn ?? httpFetch;
  const waybackFn = opts.waybackFn ?? findWaybackSnapshot;
  const url = opts.url;

  if (opts.signal?.aborted) {
    throw Object.assign(new Error("Scan cancelled."), { name: "AbortError" });
  }

  // 1) Headless
  if (opts.wantRender) {
    try {
      const r = await renderFn(url, { signal: opts.signal, timeoutMs: 30_000 });
      if (r.aborted) {
        throw Object.assign(new Error("Scan cancelled."), {
          name: "AbortError",
        });
      }
      if (r.html && r.html.length > 50) {
        return {
          html: r.html.slice(0, MAX_HTML_BYTES),
          finalUrl: r.finalUrl || url,
          statusCode: r.statusCode,
          headers: { "content-type": "text/html; charset=utf-8" },
          contentType: "text/html",
          rendered: true,
          source: "url",
          waybackUrl: null,
          stageUsed: "headless",
          partialErrors,
        };
      }
      partialErrors.push(
        pe("headless", "Headless returned empty/thin HTML — falling back to HTTP"),
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      partialErrors.push(
        pe(
          "headless",
          err instanceof Error ? err.message : String(err),
        ),
      );
    }
  }

  if (opts.signal?.aborted) {
    throw Object.assign(new Error("Scan cancelled."), { name: "AbortError" });
  }

  // 2) HTTP static
  try {
    const page = await httpFn(url, opts.signal);
    if (page.status >= 400) {
      partialErrors.push(
        pe("http", `HTTP ${page.status}`, page.status),
      );
      // 403/429/5xx → try wayback if allowed
      if (!opts.wantWayback) {
        // still return body if any (graceful) for soft 404s with content
        if (page.text && page.status < 500) {
          return {
            html: page.text.slice(0, MAX_HTML_BYTES),
            finalUrl: page.finalUrl,
            statusCode: page.status,
            headers: page.headers,
            contentType: page.contentType,
            rendered: false,
            source: "url",
            waybackUrl: null,
            stageUsed: "http",
            partialErrors,
          };
        }
        throw new Error(`HTTP ${page.status}`);
      }
    } else {
      return {
        html: page.text.slice(0, MAX_HTML_BYTES),
        finalUrl: page.finalUrl,
        statusCode: page.status,
        headers: page.headers,
        contentType: page.contentType,
        rendered: false,
        source: "url",
        waybackUrl: null,
        stageUsed: "http",
        partialErrors,
      };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    partialErrors.push(
      pe("http", err instanceof Error ? err.message : String(err)),
    );
    if (!opts.wantWayback) {
      throw err instanceof Error ? err : new Error("HTTP fetch failed");
    }
  }

  if (opts.signal?.aborted) {
    throw Object.assign(new Error("Scan cancelled."), { name: "AbortError" });
  }

  // 3) Wayback
  if (opts.wantWayback) {
    try {
      const snap = await waybackFn(url);
      if (!snap) {
        partialErrors.push(pe("wayback", "No Wayback snapshot found"));
        throw new Error(
          "Live URL unavailable and Wayback Machine has no snapshot. Paste HTML manually.",
        );
      }
      const page = await httpFn(snap.url, opts.signal);
      if (page.status >= 400) {
        partialErrors.push(
          pe("wayback", `Wayback HTTP ${page.status}`, page.status),
        );
        throw new Error(`Wayback snapshot returned HTTP ${page.status}.`);
      }
      return {
        html: page.text.slice(0, MAX_HTML_BYTES),
        finalUrl: url,
        statusCode: page.status,
        headers: page.headers,
        contentType: page.contentType,
        rendered: false,
        source: "wayback",
        waybackUrl: snap.url,
        stageUsed: "wayback",
        partialErrors,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      partialErrors.push(
        pe("wayback", err instanceof Error ? err.message : String(err)),
      );
      throw err instanceof Error ? err : new Error("Wayback fallback failed");
    }
  }

  throw new Error(
    partialErrors.map((e) => e.message).join(" | ") || "All fetch stages failed",
  );
}

/** Record non-fatal stage errors without throwing */
export function pushPartialError(
  list: PartialError[],
  stage: PartialError["stage"],
  message: string,
  statusCode?: number | null,
): void {
  list.push(pe(stage, message, statusCode));
}
