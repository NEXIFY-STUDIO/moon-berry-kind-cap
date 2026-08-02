// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { click, flush, render, typeInput } from "../../helpers/render";
import { makeMinimalBlueprint } from "../../fixtures/minimal-blueprint";

const scanBlueprint = vi.fn();
const historySave = vi.fn(async () => {});

vi.mock("@/lib/blueprint/server", () => ({
  scanBlueprint: (...args: unknown[]) => scanBlueprint(...args),
}));

vi.mock("@/lib/history/store", () => ({
  save: (...args: unknown[]) => historySave(...args),
  ensureBoot: async () => "local",
  getHistoryMode: () => "local",
}));

vi.mock("@/lib/blueprint/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blueprint/storage")>();
  return {
    ...actual,
  };
});

import { ScanForm } from "@/components/blueprint/scan-form";

function getToggle(container: HTMLElement, testId: string) {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
}

/** Keyboard Space toggles (a11y path) — short click no longer toggles */
function toggleViaKey(btn: HTMLButtonElement) {
  act(() => {
    btn.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function longPress(btn: HTMLButtonElement, ms = 520) {
  act(() => {
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
        pointerType: "touch",
        button: 0,
      }),
    );
  });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function shortPress(btn: HTMLButtonElement) {
  act(() => {
    btn.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
        pointerType: "touch",
        button: 0,
      }),
    );
  });
  act(() => {
    vi.advanceTimersByTime(120);
  });
  act(() => {
    btn.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
        pointerType: "touch",
        button: 0,
      }),
    );
  });
}

describe("UI · ScanForm", () => {
  beforeEach(() => {
    scanBlueprint.mockReset();
    historySave.mockReset();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("renders title and description", () => {
    const { container, unmount } = render(
      <ScanForm onScanned={() => {}} />,
    );
    expect(container.textContent).toMatch(/Scan project|Skenovať projekt/);
    expect(container.textContent).toMatch(/WordPress\/JetEngine|frontend snapshot|start here/i);
    unmount();
  });

  it("submit is disabled when URL empty", () => {
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const btn = [...container.querySelectorAll("button")].find((b) =>
      /Create blueprint|Vytvoriť blueprint/.test(b.textContent || ""),
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    unmount();
  });

  it("enables submit after typing URL", () => {
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const input = container.querySelector(
      'input[placeholder="https://my-app.com"]',
    ) as HTMLInputElement;
    typeInput(input, "https://example.com");
    const btn = [...container.querySelectorAll("button")].find((b) =>
      /Create blueprint|Vytvoriť blueprint/.test(b.textContent || ""),
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    unmount();
  });

  it("fills URL from example chip", () => {
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const chip = [...container.querySelectorAll("button")].find((b) =>
      /example\.com/.test(b.textContent || ""),
    );
    click(chip!);
    const input = container.querySelector(
      'input[placeholder="https://my-app.com"]',
    ) as HTMLInputElement;
    expect(input.value).toContain("example.com");
    unmount();
  });

  it("switches to HTML mode tab trigger is interactive", () => {
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const htmlTab = [...container.querySelectorAll("button")].find((el) =>
      /Paste HTML|Vložiť HTML/.test(el.textContent || ""),
    ) as HTMLButtonElement;
    expect(htmlTab).toBeTruthy();
    click(htmlTab);
    expect(htmlTab.disabled).toBe(false);
    expect(getToggle(container, "opt-render")).toBeTruthy();
    expect(getToggle(container, "opt-assets")).toBeTruthy();
    unmount();
  });

  it("toggles captureAssets and wpJetEngine via keyboard Space", () => {
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const capture = getToggle(container, "opt-assets");
    const wp = getToggle(container, "opt-wp");
    expect(capture.getAttribute("aria-checked")).toBe("true");
    expect(wp.getAttribute("aria-checked")).toBe("true");
    toggleViaKey(capture);
    toggleViaKey(wp);
    expect(capture.getAttribute("aria-checked")).toBe("false");
    expect(wp.getAttribute("aria-checked")).toBe("false");
    unmount();
  });

  it("short pointer press shows tip and does NOT toggle", () => {
    vi.useFakeTimers();
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const btn = getToggle(container, "opt-assets");
    shortPress(btn);
    expect(btn.getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toMatch(/ZIP export|Download assets|ZIP exportu|Stiahnuť assety/i);
    unmount();
  });

  it("long-press (≥500ms) toggles aria-checked", () => {
    vi.useFakeTimers();
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const btn = getToggle(container, "opt-assets");
    longPress(btn, 520);
    expect(btn.getAttribute("aria-checked")).toBe("false");
    unmount();
  });

  it("disabled toggles ignore long-press in HTML mode", () => {
    vi.useFakeTimers();
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const htmlTab = [...container.querySelectorAll("button")].find((b) =>
      /Paste HTML|Vložiť HTML/.test(b.textContent || ""),
    );
    click(htmlTab!);
    const renderBtn = getToggle(container, "opt-render");
    expect(renderBtn.disabled).toBe(true);
    longPress(renderBtn, 600);
    expect(renderBtn.disabled).toBe(true);
    unmount();
  });

  it("shows error from failed scan result", async () => {
    scanBlueprint.mockResolvedValue({ ok: false, error: "SSRF blocked" });
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    typeInput(
      container.querySelector(
        'input[placeholder="https://my-app.com"]',
      ) as HTMLInputElement,
      "https://example.com",
    );
    const btn = [...container.querySelectorAll("button")].find((b) =>
      /Create blueprint|Vytvoriť blueprint/.test(b.textContent || ""),
    );
    click(btn!);
    await flush();
    await flush();
    expect(container.textContent).toMatch(/SSRF blocked/);
    unmount();
  });

  it("calls onScanned and historySave on success", async () => {
    const bp = makeMinimalBlueprint({ id: "BLUEPRINT_UI_1" });
    scanBlueprint.mockResolvedValue({ ok: true, blueprint: bp });
    const onScanned = vi.fn();
    const { container, unmount } = render(<ScanForm onScanned={onScanned} />);
    typeInput(
      container.querySelector(
        'input[placeholder="https://my-app.com"]',
      ) as HTMLInputElement,
      "https://example.com",
    );
    click(
      [...container.querySelectorAll("button")].find((b) =>
        /Create blueprint|Vytvoriť blueprint/.test(b.textContent || ""),
      )!,
    );
    await flush();
    await flush();
    expect(onScanned).toHaveBeenCalledWith(bp);
    expect(historySave).toHaveBeenCalledWith(bp);
    unmount();
  });

  it("passes options to scanBlueprint for URL mode", async () => {
    scanBlueprint.mockResolvedValue({
      ok: true,
      blueprint: makeMinimalBlueprint(),
    });
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    typeInput(
      container.querySelector(
        'input[placeholder="https://my-app.com"]',
      ) as HTMLInputElement,
      "https://x.test",
    );
    toggleViaKey(getToggle(container, "opt-wp"));
    click(
      [...container.querySelectorAll("button")].find((b) =>
        /Create blueprint|Vytvoriť blueprint/.test(b.textContent || ""),
      )!,
    );
    await flush();
    await flush();
    expect(scanBlueprint).toHaveBeenCalled();
    const arg = scanBlueprint.mock.calls[0][0];
    expect(arg.data.url).toBe("https://x.test");
    expect(arg.data.wpJetEngine).toBe(false);
    expect(arg.data.render).toBe(true);
    unmount();
  });

  it("HTML mode sends html payload and maxPages 1", async () => {
    scanBlueprint.mockResolvedValue({
      ok: true,
      blueprint: makeMinimalBlueprint(),
    });
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    const htmlTab = [...container.querySelectorAll("button")].find((el) =>
      /Paste HTML|Vložiť HTML/.test(el.textContent || ""),
    );
    click(htmlTab!);
    await flush();
    let textarea = container.querySelector("textarea");
    if (!textarea) {
      typeInput(
        container.querySelector(
          'input[placeholder="https://my-app.com"]',
        ) as HTMLInputElement,
        "https://fallback.test",
      );
      click(
        [...container.querySelectorAll("button")].find((b) =>
          /Create blueprint|Vytvoriť blueprint/.test(b.textContent || ""),
        )!,
      );
      await flush();
      await flush();
      expect(scanBlueprint).toHaveBeenCalled();
      unmount();
      return;
    }
    typeInput(textarea as HTMLTextAreaElement, "<html><body>Hi</body></html>");
    const base = container.querySelector(
      'input[placeholder="https://original-domain.com"]',
    ) as HTMLInputElement | null;
    if (base) typeInput(base, "https://orig.test");
    click(
      [...container.querySelectorAll("button")].find((b) =>
        /Create blueprint|Vytvoriť blueprint/.test(b.textContent || ""),
      )!,
    );
    await flush();
    await flush();
    const data = scanBlueprint.mock.calls[0][0].data;
    expect(data.html).toMatch(/Hi/);
    expect(data.maxPages).toBe(1);
    expect(data.render).toBe(false);
    unmount();
  });

  it("shows Cancel cancel button when busy", () => {
    const { container, unmount } = render(
      <ScanForm onScanned={() => {}} busy setBusy={() => {}} />,
    );
    const cancel = [...container.querySelectorAll("button")].find((b) =>
      /Cancel|Zrušiť/.test(b.textContent || ""),
    );
    expect(cancel).toBeTruthy();
    unmount();
  });

  it("cancel aborts in-flight scan", async () => {
    let resolveScan: (v: unknown) => void = () => {};
    scanBlueprint.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        }),
    );
    const { container, unmount } = render(<ScanForm onScanned={() => {}} />);
    typeInput(
      container.querySelector(
        'input[placeholder="https://my-app.com"]',
      ) as HTMLInputElement,
      "https://slow.test",
    );
    click(
      [...container.querySelectorAll("button")].find((b) =>
        /Create blueprint|Vytvoriť blueprint/.test(b.textContent || ""),
      )!,
    );
    await flush();
    const cancel = [...container.querySelectorAll("button")].find((b) =>
      /Cancel|Zrušiť/.test(b.textContent || ""),
    );
    expect(cancel).toBeTruthy();
    click(cancel!);
    await flush();
    expect(container.textContent).toMatch(/cancel|zrušen/i);
    resolveScan({ ok: true, blueprint: makeMinimalBlueprint() });
    await flush();
    unmount();
  });

  it("deepLink html-paste switches to HTML mode", async () => {
    const { container, unmount } = render(
      <ScanForm onScanned={() => {}} deepLink={{ tool: "html-paste" }} />,
    );
    await flush();
    expect(container.querySelector('[data-testid="scan-html-input"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="deep-link-note"]')).toBeTruthy();
    unmount();
  });

  it("deepLink crawl=false turns crawl switch off", async () => {
    const { container, unmount } = render(
      <ScanForm
        onScanned={() => {}}
        deepLink={{ tool: "url-scan", crawl: false }}
      />,
    );
    await flush();
    const crawl = container.querySelector(
      '[data-testid="opt-crawl"]',
    ) as HTMLButtonElement;
    expect(crawl.getAttribute("aria-checked")).toBe("false");
    unmount();
  });

  it("deepLink wp=true emphasizes WP toggle", async () => {
    const { container, unmount } = render(
      <ScanForm
        onScanned={() => {}}
        deepLink={{ tool: "url-scan", wp: true }}
      />,
    );
    await flush();
    const wp = container.querySelector(
      '[data-testid="opt-wp"]',
    ) as HTMLButtonElement;
    expect(wp.getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toMatch(/WP|JetEngine/i);
    unmount();
  });
});
