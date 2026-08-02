import { describe, expect, it, vi } from "vitest";
import {
  buildPartialStats,
  harvestCrawlPages,
  partialScanBadgeLabel,
  resolveScanStatus,
  type PageHarvest,
} from "@/lib/blueprint/crawl-pages";
import type { BlueprintPage, DesignTokens } from "@/lib/blueprint/types";

const emptyDesign = (): DesignTokens => ({
  colors: [],
  fonts: [],
  cssVariables: {},
  borderRadii: [],
  shadows: [],
  spacingHints: [],
});

function okHarvest(url: string, title: string): PageHarvest {
  const page: BlueprintPage = {
    url,
    title,
    contentHash: `hash-${title}`,
    statusCode: 200,
    htmlBytes: 100,
    headings: [{ level: 1, text: title }],
    internalLinkCount: 0,
    formCount: 0,
  };
  return {
    page,
    links: [],
    forms: [],
    assets: [],
    scripts: [],
    stylesheets: [],
    cssBundles: [],
    design: emptyDesign(),
  };
}

function httpErrorHarvest(url: string, status: number): PageHarvest {
  return {
    page: {
      url,
      title: "",
      contentHash: "",
      statusCode: status,
      htmlBytes: 0,
      headings: [],
      internalLinkCount: 0,
      formCount: 0,
    },
    links: [],
    forms: [],
    assets: [],
    scripts: [],
    stylesheets: [],
    cssBundles: [],
    design: emptyDesign(),
  };
}

const noRetry = { maxAttemptsPerUrl: 1 as const, baseDelayMs: 1, maxDelayMs: 2 };

describe("partial crawl recovery · harvestCrawlPages", () => {
  it("a) 5-page crawl where page 3 returns 500 → 4 success + 1 failed warning", async () => {
    const base = "https://shop.example/";
    const urls = [
      "https://shop.example/p1",
      "https://shop.example/p2",
      "https://shop.example/p3",
      "https://shop.example/p4",
      "https://shop.example/p5",
    ];

    const harvestOne = vi.fn(async (url: string) => {
      if (url.endsWith("/p3")) return httpErrorHarvest(url, 500);
      return okHarvest(url, url.split("/").pop()!);
    });

    const result = await harvestCrawlPages({
      baseUrl: base,
      maxAdditionalPages: 5,
      primaryInternalLinks: urls,
      harvestOne,
      ...noRetry,
    });

    expect(result.scannedPages).toHaveLength(4);
    expect(result.failedUrls).toHaveLength(1);
    expect(result.failedUrls[0].url).toContain("/p3");
    expect(result.failedUrls[0].statusCode).toBe(500);
    expect(result.scanStatus).toBe("partial");
    expect(result.partialStats).toEqual({
      totalAttempted: 5,
      succeeded: 4,
      failed: 1,
    });
    expect(result.scanWarnings.failedUrls).toHaveLength(1);
    expect(harvestOne).toHaveBeenCalledTimes(5);
  });

  it("b) network timeout on page 2 → partial status, no unhandled rejection", async () => {
    const base = "https://app.example/";
    const urls = [
      "https://app.example/a",
      "https://app.example/b",
      "https://app.example/c",
    ];

    const harvestOne = vi.fn(async (url: string) => {
      if (url.endsWith("/b")) {
        const err = new Error("The operation was aborted due to timeout");
        err.name = "AbortError";
        throw err;
      }
      return okHarvest(url, url.split("/").pop()!);
    });

    await expect(
      harvestCrawlPages({
        baseUrl: base,
        maxAdditionalPages: 3,
        primaryInternalLinks: urls,
        harvestOne,
        ...noRetry,
      }),
    ).resolves.toMatchObject({
      scanStatus: "partial",
      scannedPages: expect.any(Array),
    });

    const result = await harvestCrawlPages({
      baseUrl: base,
      maxAdditionalPages: 3,
      primaryInternalLinks: urls,
      harvestOne,
      ...noRetry,
    });

    expect(result.scannedPages.length).toBe(2);
    expect(result.failedUrls.length).toBe(1);
    expect(result.failedUrls[0].url).toContain("/b");
    expect(result.failedUrls[0].error).toMatch(/timeout|abort/i);
    expect(result.scanStatus).toBe("partial");
    expect(result.partialStats?.succeeded).toBe(2);
    expect(result.partialStats?.failed).toBe(1);
  });

  it("records DNS / throw failures and continues queue", async () => {
    const harvestOne = vi.fn(async (url: string) => {
      if (url.includes("bad")) throw new Error("getaddrinfo ENOTFOUND bad.example");
      return okHarvest(url, "ok");
    });
    const result = await harvestCrawlPages({
      baseUrl: "https://ok.example/",
      maxAdditionalPages: 3,
      primaryInternalLinks: [
        "https://ok.example/1",
        "https://ok.example/bad",
        "https://ok.example/2",
      ],
      harvestOne,
      ...noRetry,
    });
    expect(result.scannedPages.length).toBe(2);
    expect(result.failedUrls.some((f) => f.error.includes("ENOTFOUND"))).toBe(
      true,
    );
    expect(result.scanStatus).toBe("partial");
  });

  it("AbortSignal mid-crawl saves harvested pages as aborted/partial", async () => {
    const ac = new AbortController();
    let n = 0;
    const harvestOne = vi.fn(async (url: string) => {
      n += 1;
      if (n === 2) ac.abort();
      return okHarvest(url, `p${n}`);
    });
    const result = await harvestCrawlPages({
      baseUrl: "https://x.example/",
      maxAdditionalPages: 5,
      primaryInternalLinks: [
        "https://x.example/1",
        "https://x.example/2",
        "https://x.example/3",
        "https://x.example/4",
        "https://x.example/5",
      ],
      signal: ac.signal,
      harvestOne,
      ...noRetry,
    });
    expect(result.aborted).toBe(true);
    expect(result.scanStatus).toBe("aborted");
    expect(result.scannedPages.length).toBeGreaterThanOrEqual(1);
    expect(result.scannedPages.length).toBeLessThan(5);
  });

  it("onProgress receives incremental scannedPages checkpoint", async () => {
    const snapshots: number[] = [];
    await harvestCrawlPages({
      baseUrl: "https://c.example/",
      maxAdditionalPages: 3,
      primaryInternalLinks: [
        "https://c.example/1",
        "https://c.example/2",
        "https://c.example/3",
      ],
      harvestOne: async (url) => okHarvest(url, "t"),
      onProgress: ({ scannedPages }) => {
        snapshots.push(scannedPages.length);
      },
      ...noRetry,
    });
    expect(snapshots).toEqual([1, 2, 3]);
  });

  it("complete when no failures", async () => {
    const result = await harvestCrawlPages({
      baseUrl: "https://full.example/",
      maxAdditionalPages: 2,
      primaryInternalLinks: [
        "https://full.example/a",
        "https://full.example/b",
      ],
      harvestOne: async (url) => okHarvest(url, "ok"),
      ...noRetry,
    });
    expect(result.scanStatus).toBe("complete");
    expect(result.failedUrls).toHaveLength(0);
    expect(result.partialStats.failed).toBe(0);
  });
});

describe("partial crawl helpers", () => {
  it("buildPartialStats / resolveScanStatus", () => {
    expect(buildPartialStats(14, 1)).toEqual({
      totalAttempted: 15,
      succeeded: 14,
      failed: 1,
    });
    expect(
      resolveScanStatus({
        failedCount: 1,
        aborted: false,
        maxAdditional: 20,
        succeededAdditional: 14,
      }),
    ).toBe("partial");
    expect(
      resolveScanStatus({
        failedCount: 0,
        aborted: true,
        maxAdditional: 20,
        succeededAdditional: 14,
      }),
    ).toBe("aborted");
    expect(
      resolveScanStatus({
        failedCount: 0,
        aborted: false,
        maxAdditional: 5,
        succeededAdditional: 5,
      }),
    ).toBe("complete");
  });

  it("partialScanBadgeLabel EN copy (default)", () => {
    const label = partialScanBadgeLabel("partial", {
      totalAttempted: 15,
      succeeded: 14,
      failed: 1,
    });
    expect(label).toMatch(/Partial scan/);
  });

  it("partialScanBadgeLabel SK copy", () => {
    const label = partialScanBadgeLabel(
      "partial",
      { totalAttempted: 5, succeeded: 4, failed: 1 },
      true,
      "sk",
    );
    expect(label).toMatch(/Čiastočný sken/);
    expect(label).toMatch(/5\/6/);
    expect(label).toMatch(/1 zlyhala/);
  });
});
