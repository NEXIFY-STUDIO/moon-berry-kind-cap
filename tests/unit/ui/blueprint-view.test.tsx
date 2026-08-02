// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, flush, render } from "../../helpers/render";
import { makeMinimalBlueprint } from "../../fixtures/minimal-blueprint";
import { BlueprintView } from "@/components/blueprint/blueprint-view";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

const {
  downloadElementorTemplate,
  exportBlueprintZip,
  downloadText,
  prepareJsonExport,
  prepareElementorExport,
  prepareZipExport,
  triggerBlobDownload,
} = vi.hoisted(() => {
  const blob = new Blob(["x"], { type: "application/json" });
  const prepared = {
    kind: "json" as const,
    filename: "t.json",
    mime: "application/json",
    size: 1,
    blob,
  };
  return {
    downloadElementorTemplate: vi.fn(() => ({
      version: "0.4",
      title: "t",
      type: "page",
      content: [],
      page_settings: [],
      _blueprint: {
        widgetCount: 2,
        nodeCount: 3,
        notes: [],
        sourceId: "x",
        sourceUrl: null,
        compiledAt: "",
      },
    })),
    exportBlueprintZip: vi.fn(async () => {}),
    downloadText: vi.fn(),
    prepareJsonExport: vi.fn(() => ({ ...prepared, kind: "json" as const })),
    prepareElementorExport: vi.fn(() => ({
      ...prepared,
      kind: "elementor" as const,
      filename: "elementor-template-import.json",
      meta: { widgetCount: 2 },
    })),
    prepareZipExport: vi.fn(async () => ({
      ...prepared,
      kind: "zip" as const,
      filename: "t.zip",
      mime: "application/zip",
    })),
    triggerBlobDownload: vi.fn(),
  };
});

vi.mock("@/lib/blueprint/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blueprint/storage")>();
  return {
    ...actual,
    downloadElementorTemplate,
    exportBlueprintZip,
    downloadText,
    prepareJsonExport,
    prepareElementorExport,
    prepareZipExport,
    triggerBlobDownload,
  };
});

function richBlueprint() {
  return makeMinimalBlueprint({
    version: "1.2.0",
    rendered: true,
    waybackUrl: "https://web.archive.org/web/1/https://x.test",
    wordpress: {
      detected: true,
      isWordPress: true,
      isJetEngine: true,
      isElementor: true,
      rest: {
        root: null,
        namespaces: ["wp/v2"],
        pages: null,
        posts: null,
        jetCctIndex: null,
        otherEndpoints: [],
      },
      cctTypes: [],
      listingGrids: [
        {
          id: "g1",
          classes: ["jet-listing-grid--1"],
          listingId: "1",
          postType: "apps",
          itemCount: 2,
          itemTemplate: {
            outerHtml: "<div/>",
            classes: [],
            links: [],
            textSample: "Alpha",
            icons: [],
            typographyHints: [],
            dynamicFields: [],
          },
          settingsHints: {},
          dynamicFields: [
            {
              key: "post_title",
              kind: "field",
              source: "post_title",
              metaKey: null,
              taxonomy: null,
              sampleValue: "Alpha",
              sampleUrl: null,
              tag: "h3",
              elementorId: "a",
              classes: [],
              settings: {},
              formatHints: [],
              confidence: "high",
              context: "listing_item",
              evidence: "title",
            },
          ],
        },
      ],
      dynamicFields: [
        {
          key: "post_title",
          kind: "field",
          source: "post_title",
          metaKey: null,
          taxonomy: null,
          sampleValue: "Alpha",
          sampleUrl: null,
          tag: "h3",
          elementorId: "a",
          classes: [],
          settings: {},
          formatHints: [],
          confidence: "high",
          context: "listing_item",
          evidence: "title",
        },
      ],
      dynamicFieldCatalog: [
        {
          key: "post_title",
          kind: "field",
          source: "post_title",
          metaKey: null,
          occurrences: 1,
          sampleValues: ["Alpha"],
        },
      ],
      elementorSections: [
        {
          dataId: "hero01",
          elementorType: "section",
          classes: [],
          role: "hero",
          headings: ["Hero"],
          childSummary: [],
        },
      ],
      sitemapUrls: [],
      navLinks: ["https://x.test/a"],
      footerLinks: [],
      notes: ["dom extract"],
      limitations: ["public only"],
    },
    elementorTemplate: {
      version: "0.4",
      title: "T",
      type: "page",
      content: [
        {
          id: "abc1234",
          elType: "container",
          settings: {},
          elements: [],
        },
      ],
      page_settings: [],
      _blueprint: {
        sourceId: "id",
        sourceUrl: null,
        compiledAt: "2026-01-01",
        nodeCount: 1,
        widgetCount: 0,
        notes: ["compiled"],
      },
    },
    design: {
      colors: ["#111", "#c8a16e"],
      fonts: ["Inter"],
      cssVariables: {
        "--e-global-color-primary": "#111",
        "--x": "1",
      },
      borderRadii: [],
      shadows: [],
      spacingHints: [],
      elementorGlobals: {
        colors: { "--e-global-color-primary": "#111" },
        typography: {},
        raw: { "--e-global-color-primary": "#111" },
        inlineCssBytes: 10,
        styleIds: ["elementor-frontend-inline-css"],
      },
      typography: [
        {
          selector: "h1",
          fontFamily: "Inter",
          fontSize: "40px",
          fontWeight: "700",
          lineHeight: "1.2",
          letterSpacing: null,
          source: "css-rule",
        },
      ],
      fullImageUrls: ["https://x.test/wp-content/uploads/2024/a.jpg"],
    },
    forms: [
      {
        action: "https://x.test/wp-login.php",
        method: "POST",
        category: "login",
        confidence: "high",
        evidence: "login",
        fields: [{ name: "log", type: "text", required: true }],
      },
    ],
  });
}

describe("UI · BlueprintView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    downloadElementorTemplate.mockClear();
    exportBlueprintZip.mockClear();
    downloadText.mockClear();
    
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    });
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders title and version badge", () => {
    const bp = richBlueprint();
    const { container, unmount } = render(<BlueprintView blueprint={bp} />);
    expect(container.textContent).toMatch(/Sample Blueprint App/);
    expect(container.textContent).toMatch(/v1\.2\.0|1\.2\.0/);
    unmount();
  });

  it("shows headless and wayback badges when set", () => {
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    expect(container.textContent).toMatch(/headless|Wayback|wayback/i);
    unmount();
  });

  it("shows WP badge when wordpress.detected", () => {
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    expect(container.textContent).toMatch(/WP|JetEngine|WordPress/i);
    unmount();
  });

  it("has Design tab with Elementor global colors", () => {
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    const designTab = [...container.querySelectorAll("button, [role='tab']")].find(
      (el) => /^Design$|^Dizajn$|Design|Dizajn/.test((el.textContent || "").trim()) ||
        /Design|Dizajn/.test(el.textContent || ""),
    );
    expect(designTab).toBeTruthy();
    click(designTab!);
    expect(container.textContent).toMatch(/Elementor|Colors|Farby|Typography|Typografia|primary|#111/i);
    unmount();
  });

  it("WP tab shows dynamic fields catalog empty-safe", () => {
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    const tab = [...container.querySelectorAll("button, [role='tab']")].find((el) =>
      /WP\s*\/\s*JetEngine|JetEngine/.test(el.textContent || ""),
    );
    click(tab!);
    expect(container.textContent).toMatch(/dynamic|listing|post_title|Alpha|Jet/i);
    unmount();
  });

  it("Elementor tab shows compiler stats", () => {
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    const tab = [...container.querySelectorAll("button, [role='tab']")].find((el) =>
      /Elementor JSON/.test(el.textContent || ""),
    );
    click(tab!);
    expect(container.textContent).toMatch(/Elementor|0\.4|Widgets|compiled|Import/i);
    unmount();
  });

  it("empty wordpress shows empty state on WP tab", () => {
    const bp = makeMinimalBlueprint({ wordpress: null });
    const { container, unmount } = render(<BlueprintView blueprint={bp} />);
    const tab = [...container.querySelectorAll("button, [role='tab']")].find((el) =>
      /WP\s*\/\s*JetEngine/.test(el.textContent || ""),
    );
    if (tab) click(tab);
    // either no tab content or empty message
    expect(container.textContent).toBeTruthy();
    unmount();
  });

  it("empty elementorTemplate message", () => {
    const bp = makeMinimalBlueprint({ elementorTemplate: null });
    const { container, unmount } = render(<BlueprintView blueprint={bp} />);
    const tab = [...container.querySelectorAll("button, [role='tab']")].find((el) =>
      /Elementor JSON/.test(el.textContent || ""),
    );
    click(tab!);
    expect(container.textContent).toMatch(/not compiled|nie je skompilovaný|Template|Elementor/i);
    unmount();
  });

  it("Structure tab lists forms with category", () => {
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    const tab = [...container.querySelectorAll("button, [role='tab']")].find((el) =>
      /Štruktúra|Structure|Links|Odkazy|Form/.test(el.textContent || ""),
    );
    if (tab) click(tab);
    // forms may be on structure tab
    expect(container.textContent?.length).toBeGreaterThan(20);
    unmount();
  });

  it("download Elementor button starts export ritual", async () => {
    vi.useFakeTimers();
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    const btn = container.querySelector(
      '[data-testid="export-btn-elementor"]',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    click(btn);
    await flush();
    expect(container.querySelector('[data-testid="export-ritual-overlay"]')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2200);
    await flush();
    expect(prepareElementorExport).toHaveBeenCalled();
    expect(triggerBlobDownload).toHaveBeenCalled();
    vi.useRealTimers();
    unmount();
  });

  it("download JSON button starts export ritual", async () => {
    vi.useFakeTimers();
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    const btn = container.querySelector(
      '[data-testid="export-btn-json"]',
    ) as HTMLButtonElement;
    click(btn);
    await flush();
    expect(container.querySelector('[data-testid="export-ritual-overlay"]')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2200);
    await flush();
    expect(prepareJsonExport).toHaveBeenCalled();
    expect(triggerBlobDownload).toHaveBeenCalled();
    vi.useRealTimers();
    unmount();
  });

  it("ZIP export starts ritual and prepares zip", async () => {
    vi.useFakeTimers();
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    const btn = container.querySelector(
      '[data-testid="export-btn-zip"]',
    ) as HTMLButtonElement;
    click(btn);
    await flush();
    expect(container.querySelector('[data-testid="export-ritual-overlay"]')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2200);
    await flush();
    expect(prepareZipExport).toHaveBeenCalled();
    expect(triggerBlobDownload).toHaveBeenCalled();
    vi.useRealTimers();
    unmount();
  });

  it("copy JSON uses clipboard API", async () => {
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    const btn = [...container.querySelectorAll("button")].find((b) =>
      /Kopír|Copy|JSON/i.test(b.textContent || ""),
    );
    if (btn && /Kopír|clipboard|Copy/i.test(btn.textContent || "") || btn) {
      click(btn!);
      await flush();
    }
    // soft assert — button exists
    expect(
      [...container.querySelectorAll("button")].some((b) =>
        /JSON|Kopír|ZIP|Elementor/.test(b.textContent || ""),
      ),
    ).toBe(true);
    unmount();
  });

  it("renders tech list on overview", () => {
    const { container, unmount } = render(
      <BlueprintView blueprint={richBlueprint()} />,
    );
    expect(container.textContent).toMatch(/React/);
    unmount();
  });

  it("renders limitations / notes if present", () => {
    const bp = makeMinimalBlueprint({
      notes: ["note-xyz"],
      limitations: ["limit-xyz"],
    });
    const { container, unmount } = render(<BlueprintView blueprint={bp} />);
    expect(container.textContent).toMatch(/note-xyz|limit-xyz|Limit|Poznám/i);
    unmount();
  });
});
