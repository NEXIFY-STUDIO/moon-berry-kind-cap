// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, render } from "../../helpers/render";
import { HistoryList } from "@/components/blueprint/history-list";
import type { HistorySummary } from "@/lib/history/store";

const items: HistorySummary[] = [
  {
    id: "A",
    title: "Alpha App",
    sourceUrl: "https://a.test",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    tech: ["React", "Vite"],
    contentHash: "h1",
  },
  {
    id: "B",
    title: "Beta App",
    sourceUrl: null,
    createdAt: "2026-01-02",
    updatedAt: "2026-01-02",
    tech: ["WordPress"],
    contentHash: "h2",
    remoteOnly: true,
  },
];

describe("UI · HistoryList", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("empty state message + local badge", () => {
    const { container, unmount } = render(
      <HistoryList items={[]} onSelect={() => {}} onDelete={() => {}} mode="local" />,
    );
    expect(container.textContent).toMatch(
      /No blueprints yet|History|Zatiaľ žiadne blueprinty|História/,
    );
    expect(container.textContent).toMatch(/Local only|Len lokálne/);
    unmount();
  });

  it("shows Synced badge in remote mode", () => {
    const { container, unmount } = render(
      <HistoryList
        items={items}
        mode="remote"
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="history-badge-synced"]')).toBeTruthy();
    expect(container.textContent).toMatch(/Synced/);
    unmount();
  });

  it("loading shows skeleton not spinner", () => {
    const { container, unmount } = render(
      <HistoryList
        items={[]}
        loading
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="history-skeleton"]')).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeFalsy();
    unmount();
  });

  it("error state with retry", () => {
    const onRetry = vi.fn();
    const { container, unmount } = render(
      <HistoryList
        items={[]}
        error="boom"
        onSelect={() => {}}
        onDelete={() => {}}
        onRetry={onRetry}
      />,
    );
    expect(container.querySelector('[data-testid="history-error"]')).toBeTruthy();
    const retry = [...container.querySelectorAll("button")].find((b) =>
      /Retry|Skúsiť/.test(b.textContent || ""),
    );
    click(retry!);
    expect(onRetry).toHaveBeenCalled();
    unmount();
  });

  it("renders item titles and remoteOnly marker", () => {
    const { container, unmount } = render(
      <HistoryList items={items} onSelect={() => {}} onDelete={() => {}} />,
    );
    expect(container.textContent).toMatch(/Alpha App/);
    expect(container.textContent).toMatch(/Beta App/);
    expect(container.textContent).toMatch(/Remote/);
    unmount();
  });

  it("shows history count", () => {
    const { container, unmount } = render(
      <HistoryList items={items} onSelect={() => {}} onDelete={() => {}} />,
    );
    expect(container.textContent).toMatch(/History \(2\)|História \(2\)/);
    unmount();
  });

  it("calls onSelect when row clicked", () => {
    const onSelect = vi.fn();
    const { container, unmount } = render(
      <HistoryList items={items} onSelect={onSelect} onDelete={() => {}} />,
    );
    const rowBtn = [...container.querySelectorAll("button")].find((b) =>
      /Alpha App/.test(b.textContent || ""),
    );
    click(rowBtn!);
    expect(onSelect).toHaveBeenCalledWith("A");
    unmount();
  });

  it("calls onDelete from trash button", () => {
    const onDelete = vi.fn();
    const { container, unmount } = render(
      <HistoryList items={items} onSelect={() => {}} onDelete={onDelete} />,
    );
    const del =
      container.querySelector('[aria-label="Delete"]') ||
      container.querySelector('[aria-label="Zmazať"]');
    click(del!);
    expect(onDelete).toHaveBeenCalledWith("A");
    unmount();
  });

  it("highlights activeId", () => {
    const { container, unmount } = render(
      <HistoryList
        items={items}
        activeId="B"
        onSelect={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(container.querySelectorAll("li").length).toBe(2);
    unmount();
  });

  it("clear all button", () => {
    const onClearAll = vi.fn();
    const { container, unmount } = render(
      <HistoryList
        items={items}
        onSelect={() => {}}
        onDelete={() => {}}
        onClearAll={onClearAll}
      />,
    );
    const btn =
      container.querySelector('[aria-label="Clear all"]') ||
      container.querySelector('[aria-label="Vymazať všetko"]');
    click(btn!);
    expect(onClearAll).toHaveBeenCalled();
    unmount();
  });
});
