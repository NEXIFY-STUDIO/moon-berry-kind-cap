import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  GitCompareArrows,
  History,
  Import,
  LayoutDashboard,
  RefreshCw,
  ScanLine,
  X,
} from "lucide-react";
import {
  ScanForm,
  type ScanFormDeepLink,
} from "@/components/blueprint/scan-form";
import { BlueprintView } from "@/components/blueprint/blueprint-view";
import { HistoryList } from "@/components/blueprint/history-list";
import { ComparePanel } from "@/components/blueprint/compare-panel";
import { Button } from "@/components/ui/button";
import { normalizeImportedBlueprint } from "@/lib/blueprint/import-normalize";
import type { Blueprint } from "@/lib/blueprint/types";
import {
  clear as historyClear,
  ensureBoot,
  get as historyGet,
  getHistoryError,
  getHistoryMode,
  list as historyList,
  remove as historyRemove,
  save as historySave,
  type HistoryMode,
  type HistorySummary,
} from "@/lib/history/store";
import { toast } from "sonner";
import { LanguageSwitcher, useI18n } from "@/lib/i18n/context";

type HomeSearch = {
  open?: string;
  tool?: string;
  tab?: string;
  render?: boolean;
  wayback?: boolean;
  crawl?: boolean;
  assets?: boolean;
  wp?: boolean;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const out: HomeSearch = {};
    if (typeof search.open === "string") out.open = search.open;
    if (typeof search.tool === "string") out.tool = search.tool;
    if (typeof search.tab === "string") out.tab = search.tab;
    if (search.render === "true" || search.render === true) out.render = true;
    if (search.render === "false" || search.render === false) out.render = false;
    if (search.wayback === "true" || search.wayback === true) out.wayback = true;
    if (search.wayback === "false" || search.wayback === false) out.wayback = false;
    if (search.crawl === "true" || search.crawl === true) out.crawl = true;
    if (search.crawl === "false" || search.crawl === false) out.crawl = false;
    if (search.assets === "true" || search.assets === true) out.assets = true;
    if (search.assets === "false" || search.assets === false) out.assets = false;
    if (search.wp === "true" || search.wp === true) out.wp = true;
    if (search.wp === "false" || search.wp === false) out.wp = false;
    return out;
  },
  component: HomePage,
});

type Overlay = "none" | "history" | "compare";

function HomePage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [history, setHistory] = useState<HistorySummary[]>([]);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("local");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>("none");

  const deepLink = useMemo((): ScanFormDeepLink | null => {
    const has =
      search.tool ||
      search.render !== undefined ||
      search.wayback !== undefined ||
      search.crawl !== undefined ||
      search.assets !== undefined ||
      search.wp !== undefined;
    if (!has) return null;
    const dl: ScanFormDeepLink = {};
    if (search.tool) dl.tool = search.tool;
    if (search.render !== undefined) dl.render = search.render;
    if (search.wayback !== undefined) dl.wayback = search.wayback;
    if (search.crawl !== undefined) dl.crawl = search.crawl;
    if (search.assets !== undefined) dl.assets = search.assets;
    if (search.wp !== undefined) dl.wp = search.wp;
    return dl;
  }, [search]);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      await ensureBoot();
      setHistoryMode(getHistoryMode());
      const items = await historyList();
      setHistory(items);
      setHistoryError(getHistoryError());
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "History failed");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // Open overlays from dashboard deep-links (?open=history|compare|import)
  useEffect(() => {
    if (search.open === "history") {
      setOverlay("history");
    } else if (search.open === "compare") {
      setOverlay("compare");
    } else if (search.open === "import") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = normalizeImportedBlueprint(JSON.parse(text));
          await historySave(parsed);
          setBlueprint(parsed);
          await refreshHistory();
          toast.success(t("toast.imported"));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t("toast.importFailed"));
        }
      };
      input.click();
    }
  }, [search.open, refreshHistory, t]);

  useEffect(() => {
    if (!search.tab) return;
    if (!blueprint) {
      toast.message(t("scan.cta"), {
        description: t("app.subtitle"),
      });
    }
  }, [search.tab, blueprint, t]);

  function handleScanned(bp: Blueprint) {
    setBlueprint(bp);
    void refreshHistory();
    toast.success(t("toast.ready"), {
      description: t("toast.readyDesc", {
        id: bp.id,
        pages: bp.stats?.pageCount ?? 1,
      }),
    });
  }

  async function handleSelect(id: string) {
    const bp = await historyGet(id);
    if (!bp) {
      toast.error(t("toast.notFound"));
      return;
    }
    setBlueprint(bp);
    setOverlay("none");
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("history.deleteConfirm"))) return;
    await historyRemove(id);
    if (blueprint?.id === id) setBlueprint(null);
    await refreshHistory();
    toast.message(t("toast.deleted"));
  }

  async function handleClearAll() {
    if (!window.confirm(t("history.clearConfirm"))) return;
    await historyClear();
    setBlueprint(null);
    await refreshHistory();
    toast.message(t("toast.cleared"));
  }

  function handleImportJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = normalizeImportedBlueprint(JSON.parse(text));
        await historySave(parsed);
        setBlueprint(parsed);
        await refreshHistory();
        toast.success(t("toast.imported"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("toast.importFailed"));
      }
    };
    input.click();
  }

  const showResult = Boolean(blueprint);

  return (
    <div className="relative min-h-dvh bg-bg">
      <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-40">
        <LanguageSwitcher />
      </div>

      {!showResult && (
        <section className="relative min-h-dvh w-full flex flex-col items-center justify-center px-4 py-10 overflow-hidden">
          <div aria-hidden className="ambient-glow" />

          <div className="fixed top-3 left-3 sm:top-4 sm:left-4 z-40">
            <a
              href="/dashboard"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-medium rounded-lg border border-border bg-bg-elevated/90 text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors"
            >
              <LayoutDashboard className="size-3.5" />
              Dashboard
              <span className="text-[10px] text-warning mono">test</span>
            </a>
          </div>

          <div className="w-full max-w-[540px] flex flex-col gap-8 z-10">
            <div className="flex flex-col items-center gap-2 text-center min-h-[5.5rem]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-bg-subtle border border-border text-accent">
                  <ScanLine className="size-5" />
                </div>
                <span className="text-2xl font-semibold tracking-tight text-fg">
                  {t("app.name")}
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-medium tracking-tight text-fg text-balance">
                {t("app.tagline")}
              </h1>
              <p className="text-sm text-fg-subtle text-balance max-w-[28rem]">
                {t("app.subtitle")}
              </p>
            </div>

            <div className="panel p-5 sm:p-6 shadow-soft">
              <ScanForm
                onScanned={handleScanned}
                busy={busy}
                setBusy={setBusy}
                compact
                deepLink={deepLink}
              />
            </div>

            <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 text-xs text-fg-muted border-t border-border pt-6 min-h-[2.75rem]">
              <button
                type="button"
                onClick={() => setOverlay("history")}
                className="hover:text-fg flex items-center gap-1.5"
              >
                <History className="size-3.5 text-fg-subtle" />
                {t("action.historyCount", { count: history.length })}
              </button>
              <span className="h-3 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={handleImportJson}
                className="hover:text-fg flex items-center gap-1.5"
              >
                <Import className="size-3.5 text-fg-subtle" />
                {t("action.import")}
              </button>
              <span className="h-3 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => setOverlay("compare")}
                className="hover:text-fg flex items-center gap-1.5"
              >
                <GitCompareArrows className="size-3.5 text-fg-subtle" />
                {t("action.compare")}
              </button>
            </div>
          </div>
        </section>
      )}

      {showResult && blueprint && (
        <section className="h-dvh w-full flex flex-col overflow-hidden bg-bg">
          <header className="h-14 shrink-0 border-b border-border pl-3 sm:pl-4 pr-[5.5rem] sm:pr-24 flex items-center justify-between gap-3 bg-bg">
            <div className="flex items-center gap-2.5 min-w-0">
              <a
                href="/dashboard"
                className="p-1.5 rounded-md bg-bg-subtle border border-border text-accent shrink-0 hover:bg-bg-elevated"
                title="Dashboard"
              >
                <LayoutDashboard className="size-4" />
              </a>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate mono">
                  {blueprint.sourceUrl || blueprint.meta.title || blueprint.id}
                </div>
                <div className="text-[11px] text-fg-subtle truncate">
                  {t("result.pagesAssets", {
                    pages: blueprint.stats?.pageCount ?? 1,
                    assets: blueprint.stats?.capturedAssetCount ?? 0,
                    tech:
                      blueprint.tech?.slice(0, 3).map((x) => x.name).join(" · ") ||
                      "—",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOverlay("history")}
                className="hidden sm:inline-flex min-w-[6.5rem] justify-center"
              >
                <History className="size-3.5" />
                {t("action.history")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setBlueprint(null);
                  setOverlay("none");
                }}
                className="min-w-[6.75rem] justify-center"
              >
                <RefreshCw className="size-3.5" />
                {t("action.newScan")}
              </Button>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-3 sm:px-6 py-5 sm:py-6">
              <BlueprintView blueprint={blueprint} initialTab={search.tab} />
            </div>
          </div>
        </section>
      )}

      {overlay === "history" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-bg/70 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setOverlay("none")}
            aria-hidden
          />
          <div className="relative z-10 w-full sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-bg-elevated shadow-soft">
            <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-border bg-bg-elevated">
              <h3 className="text-sm font-semibold">{t("action.historyTitle")}</h3>
              <button
                type="button"
                onClick={() => setOverlay("none")}
                className="text-fg-subtle hover:text-fg p-1"
                aria-label={t("action.close")}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-3">
              <HistoryList
                items={history}
                activeId={blueprint?.id}
                mode={historyMode}
                loading={historyLoading}
                error={historyError}
                onSelect={(id) => void handleSelect(id)}
                onDelete={(id) => void handleDelete(id)}
                onRetry={() => void refreshHistory()}
                onClearAll={() => void handleClearAll()}
              />
            </div>
          </div>
        </div>
      )}

      {overlay === "compare" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-bg/70 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setOverlay("none")}
            aria-hidden
          />
          <div className="relative z-10 w-full sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-bg-elevated shadow-soft">
            <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-border bg-bg-elevated">
              <h3 className="text-sm font-semibold">{t("action.compare")}</h3>
              <button
                type="button"
                onClick={() => setOverlay("none")}
                className="text-fg-subtle hover:text-fg p-1"
                aria-label={t("action.close")}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-3">
              <ComparePanel history={history} current={blueprint} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
