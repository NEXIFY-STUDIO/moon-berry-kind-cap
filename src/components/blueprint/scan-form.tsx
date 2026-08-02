import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Globe2,
  FileCode2,
  Loader2,
  ScanSearch,
  AlertCircle,
  Bot,
  Layers,
  Archive,
  Package,
  Blocks,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScanProgressOverlay } from "@/components/blueprint/scan-progress-overlay";
import { scanBlueprint } from "@/lib/blueprint/server";
import { save as historySave } from "@/lib/history/store";
import type { Blueprint } from "@/lib/blueprint/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import {
  estimateTauMs,
  reduceScanProgress,
  SCAN_FINISH_HOLD_MS,
  SCAN_PROGRESS_INITIAL,
} from "@/lib/scan/progress-machine";

const EXAMPLES = [
  "https://example.com",
  "https://news.ycombinator.com",
  "https://tailwindcss.com",
];

/** Long-press threshold (ms) before toggle activates */
const LONG_PRESS_MS = 500;
/** Pointer move (px) cancels pending long-press */
const MOVE_CANCEL_PX = 8;
/** Tooltip auto-hide */
const TIP_MS = 2200;

/** Dashboard / URL deep-link → ScanForm options */
export type ScanFormDeepLink = {
  tool?: string;
  render?: boolean;
  wayback?: boolean;
  crawl?: boolean;
  assets?: boolean;
  wp?: boolean;
};

type Props = {
  onScanned: (bp: Blueprint) => void;
  busy?: boolean;
  setBusy?: (v: boolean) => void;
  /** Compact mode for centered 100dvh shell (hides long copy) */
  compact?: boolean;
  /** Apply mode + toggles from dashboard / URL search params */
  deepLink?: ScanFormDeepLink | null;
};

type IconToggleProps = {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
  description: string;
  testId: string;
  emphasized?: boolean;
  children: ReactNode;
};

/**
 * Short tap/click → tooltip only (does NOT toggle).
 * Long-press ≥ LONG_PRESS_MS → toggles.
 * Keyboard Space/Enter → toggles (a11y / desktop exception).
 */
function IconToggle({
  active,
  disabled,
  onToggle,
  label,
  description,
  testId,
  emphasized,
  children,
}: IconToggleProps) {
  const [tipOpen, setTipOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [pressScale, setPressScale] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const didToggleRef = useRef(false);
  const holdingRef = useRef(false);

  const clearHoldTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    holdingRef.current = false;
    setHolding(false);
  }, []);

  const showTip = useCallback(() => {
    setTipOpen(true);
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(() => setTipOpen(false), TIP_MS);
  }, []);

  const hideTip = useCallback(() => {
    setTipOpen(false);
    if (tipTimerRef.current) {
      clearTimeout(tipTimerRef.current);
      tipTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    };
  }, [clearHoldTimer]);

  useEffect(() => {
    if (!tipOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideTip();
    };
    const onDoc = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(`[data-testid="${testId}"]`)) return;
      hideTip();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDoc);
    };
  }, [tipOpen, hideTip, testId]);

  useEffect(() => {
    if (!emphasized || disabled) return;
    showTip();
  }, [emphasized, disabled, showTip]);

  function fireToggle() {
    if (disabled) return;
    didToggleRef.current = true;
    hideTip();
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
    setPressScale(true);
    window.setTimeout(() => setPressScale(false), 140);
    onToggle();
  }

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    didToggleRef.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    holdingRef.current = true;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!holdingRef.current) return;
      holdingRef.current = false;
      setHolding(false);
      fireToggle();
    }, LONG_PRESS_MS);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!startPos.current || !holdingRef.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
      clearHoldTimer();
      startPos.current = null;
    }
  }

  function onPointerUp() {
    const wasHolding = holdingRef.current || timerRef.current !== null;
    clearHoldTimer();
    startPos.current = null;
    if (wasHolding && !didToggleRef.current && !disabled) {
      showTip();
    }
  }

  function onPointerCancel() {
    clearHoldTimer();
    startPos.current = null;
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      fireToggle();
    }
  }

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        data-testid={testId}
        role="switch"
        aria-checked={active}
        aria-label={label}
        aria-describedby={tipOpen ? `${testId}-tip` : undefined}
        title={label}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "toggle-btn h-10 w-10 flex items-center justify-center rounded-full border transition-all duration-150",
          active
            ? "toggle-neon-ring bg-bg-subtle text-accent border-transparent"
            : "text-fg-subtle border-transparent hover:text-fg-muted",
          emphasized && "ring-2 ring-accent/60 scale-105",
          disabled && "opacity-40 pointer-events-none",
          pressScale && "scale-95",
          holding && !disabled && "scale-[0.97]",
        )}
      >
        {holding && !disabled && (
          <span className="toggle-hold-progress" aria-hidden />
        )}
        {children}
      </button>
      {tipOpen && (
        <div id={`${testId}-tip`} role="tooltip" className="toggle-tip">
          <span className="font-medium text-accent">{label}</span>
          <span className="block text-fg-muted mt-0.5">{description}</span>
        </div>
      )}
    </div>
  );
}

function deepLinkKey(dl: ScanFormDeepLink | null | undefined): string {
  if (!dl) return "";
  return [
    dl.tool ?? "",
    dl.render === undefined ? "" : String(dl.render),
    dl.wayback === undefined ? "" : String(dl.wayback),
    dl.crawl === undefined ? "" : String(dl.crawl),
    dl.assets === undefined ? "" : String(dl.assets),
    dl.wp === undefined ? "" : String(dl.wp),
  ].join("|");
}

export function ScanForm({
  onScanned,
  busy,
  setBusy,
  compact = false,
  deepLink = null,
}: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"url" | "html">("url");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [maxPages, setMaxPages] = useState(5);
  const [render, setRender] = useState(true);
  const [wayback, setWayback] = useState(true);
  const [captureAssets, setCaptureAssets] = useState(true);
  const [wpJetEngine, setWpJetEngine] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [deepNote, setDeepNote] = useState<string | null>(null);
  const [progress, dispatchProgress] = useReducer(
    reduceScanProgress,
    SCAN_PROGRESS_INITIAL,
  );
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const htmlAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const appliedKeyRef = useRef<string>("");
  const progressStartRef = useRef(0);
  const progressRafRef = useRef<number | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBusy = busy ?? localBusy;
  const crawlOn = maxPages > 1;

  const markBusy = (v: boolean) => {
    setLocalBusy(v);
    setBusy?.(v);
  };

  const stopProgressLoop = useCallback(() => {
    if (progressRafRef.current != null) {
      cancelAnimationFrame(progressRafRef.current);
      progressRafRef.current = null;
    }
  }, []);

  const startProgressLoop = useCallback(() => {
    stopProgressLoop();
    progressStartRef.current = performance.now();
    dispatchProgress({ type: "START" });
    const tauMs = estimateTauMs({
      maxPages,
      render,
      captureAssets,
      wpJetEngine,
      mode,
    });
    const tick = (now: number) => {
      dispatchProgress({
        type: "TICK",
        elapsedMs: now - progressStartRef.current,
        tauMs,
      });
      progressRafRef.current = requestAnimationFrame(tick);
    };
    progressRafRef.current = requestAnimationFrame(tick);
  }, [stopProgressLoop, maxPages, render, captureAssets, wpJetEngine, mode]);

  useEffect(() => {
    return () => {
      stopProgressLoop();
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, [stopProgressLoop]);

  useEffect(() => {
    if (!deepLink) return;
    const key = deepLinkKey(deepLink);
    if (!key || key === appliedKeyRef.current) return;
    appliedKeyRef.current = key;

    const notes: string[] = [];
    let focus: "url" | "html" = "url";
    let emphasize: string | null = null;

    if (deepLink.tool === "html-paste") {
      setMode("html");
      focus = "html";
      notes.push(t("scan.mode.html"));
    } else {
      setMode("url");
      focus = "url";
      if (deepLink.tool === "url-scan") {
        notes.push(t("scan.mode.url"));
      }
    }

    if (typeof deepLink.render === "boolean") {
      setRender(deepLink.render);
      emphasize = "render";
      if (deepLink.render) notes.push(t("scan.toggle.render"));
    }
    if (typeof deepLink.wayback === "boolean") {
      setWayback(deepLink.wayback);
      emphasize = "wayback";
      if (deepLink.wayback) notes.push(t("scan.toggle.wayback"));
    }
    if (typeof deepLink.crawl === "boolean") {
      setMaxPages(deepLink.crawl ? 5 : 1);
      emphasize = "crawl";
      if (deepLink.crawl) notes.push(t("scan.toggle.crawl"));
    }
    if (typeof deepLink.assets === "boolean") {
      setCaptureAssets(deepLink.assets);
      emphasize = "assets";
      if (deepLink.assets) notes.push(t("scan.toggle.assets"));
    }
    if (typeof deepLink.wp === "boolean") {
      setWpJetEngine(deepLink.wp);
      emphasize = "wp";
      if (deepLink.wp) notes.push(t("scan.toggle.wp"));
    }

    if (notes.length > 0) {
      setDeepNote(notes.join(" · "));
    }
    if (emphasize) {
      setHighlight(emphasize);
      window.setTimeout(() => setHighlight(null), 2800);
    }

    requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (focus === "html") {
          htmlAreaRef.current?.focus();
        } else {
          urlInputRef.current?.focus();
        }
      }, 50);
    });
  }, [deepLink, t]);

  function cancelScan() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    stopProgressLoop();
    dispatchProgress({ type: "CANCEL" });
    markBusy(false);
    setError(t("scan.cancelled"));
  }

  async function runScan() {
    setError(null);
    cancelledRef.current = false;
    const ac = new AbortController();
    abortRef.current = ac;
    markBusy(true);
    startProgressLoop();
    const startedAt = performance.now();
    const MIN_PROGRESS_MS = 900;
    try {
      const payload =
        mode === "url"
          ? {
              url: url.trim(),
              maxPages,
              render,
              wayback,
              captureAssets,
              wpJetEngine,
            }
          : {
              html,
              baseUrl: baseUrl.trim() || undefined,
              captureAssets,
              maxPages: 1,
              render: false,
              wayback: false,
              wpJetEngine,
            };

      const result = await (
        scanBlueprint as (args: {
          data: typeof payload;
          signal?: AbortSignal;
        }) => Promise<
          { ok: true; blueprint: Blueprint } | { ok: false; error: string }
        >
      )({
        data: payload,
        signal: ac.signal,
      });

      if (cancelledRef.current || ac.signal.aborted) {
        stopProgressLoop();
        dispatchProgress({ type: "CANCEL" });
        setError(t("scan.cancelled"));
        return;
      }

      if (!result.ok) {
        stopProgressLoop();
        dispatchProgress({ type: "ERROR" });
        setError(result.error);
        return;
      }

      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_PROGRESS_MS) {
        await new Promise((r) => setTimeout(r, MIN_PROGRESS_MS - elapsed));
      }
      if (cancelledRef.current || ac.signal.aborted) {
        stopProgressLoop();
        dispatchProgress({ type: "CANCEL" });
        setError(t("scan.cancelled"));
        return;
      }

      stopProgressLoop();
      dispatchProgress({ type: "COMPLETE" });
      await historySave(result.blueprint);

      await new Promise<void>((resolve) => {
        finishTimerRef.current = setTimeout(() => {
          dispatchProgress({ type: "FINISH_HOLD_DONE" });
          resolve();
        }, SCAN_FINISH_HOLD_MS);
      });

      onScanned(result.blueprint);
    } catch (e) {
      stopProgressLoop();
      if (
        cancelledRef.current ||
        ac.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" || /abort|zrušen/i.test(e.message)))
      ) {
        dispatchProgress({ type: "CANCEL" });
        setError(t("scan.cancelled"));
        return;
      }
      dispatchProgress({ type: "ERROR" });
      setError(e instanceof Error ? e.message : t("scan.failed"));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      markBusy(false);
    }
  }

  const showProgress =
    progress.phase === "running" || progress.phase === "finishing";

  return (
    <div className={cn("w-full relative", compact ? "" : "panel p-5 sm:p-6")}>
      <ScanProgressOverlay
        active={showProgress}
        percent={progress.percent}
        finishing={progress.phase === "finishing"}
      />

      {!compact && (
        <div className="mb-5 flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{t("scan.title")}</h2>
          <p className="text-sm text-fg-muted">{t("scan.desc")}</p>
        </div>
      )}
      {compact && <h2 className="sr-only">{t("scan.title")}</h2>}

      {deepNote && (
        <div
          data-testid="deep-link-note"
          className="mb-3 rounded-[var(--radius-md)] border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent"
        >
          {deepNote}
        </div>
      )}

      <div className="w-full grid grid-cols-2 p-1 bg-bg border border-border rounded-xl text-xs font-medium mb-5">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setMode("url")}
          className={cn(
            "py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5",
            mode === "url"
              ? "bg-bg-subtle text-fg border border-border font-semibold"
              : "text-fg-muted hover:text-fg border border-transparent",
          )}
        >
          <Globe2 className="size-3.5" />
          {t("scan.mode.url")}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setMode("html")}
          data-testid="mode-html"
          className={cn(
            "py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5",
            mode === "html"
              ? "bg-bg-subtle text-fg border border-border font-semibold"
              : "text-fg-muted hover:text-fg border border-transparent",
          )}
        >
          <FileCode2 className="size-3.5" />
          {t("scan.mode.html")}
        </button>
      </div>

      <div className="relative pt-2.5 mb-4">
        <div className="absolute -top-1 left-3 z-20 px-2 py-0.5 rounded-full bg-bg-elevated border border-accent/40 text-[10px] font-mono text-accent flex items-center gap-1.5 start-here-badge">
          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
          {t("scan.badge.startHere")}
        </div>
        <div className="neon-border-wrapper">
          <div className="neon-inner">
            {mode === "url" ? (
              <Input
                ref={urlInputRef}
                data-testid="scan-url-input"
                placeholder={t("scan.placeholder.url")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim() && !isBusy) void runScan();
                }}
                autoComplete="url"
                inputMode="url"
                disabled={isBusy}
                className="h-12 border-0 bg-transparent shadow-none focus-visible:ring-0 mono text-sm px-4"
              />
            ) : (
              <div className="space-y-2 p-2">
                <Input
                  placeholder={t("scan.placeholder.baseUrl")}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={isBusy}
                  className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0 text-xs"
                />
                <Textarea
                  ref={htmlAreaRef}
                  data-testid="scan-html-input"
                  placeholder={t("scan.placeholder.html")}
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  disabled={isBusy}
                  className="min-h-[140px] border-0 bg-transparent shadow-none focus-visible:ring-0 mono text-xs resize-none"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {mode === "url" && !compact && (
        <div className="flex flex-wrap gap-2 mb-4">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={isBusy}
              onClick={() => setUrl(ex)}
              className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-fg-muted transition-colors hover:text-fg mono"
            >
              {ex.replace(/^https?:\/\//, "")}
            </button>
          ))}
        </div>
      )}
      {mode === "url" && compact && (
        <p className="text-xs text-center text-fg-subtle mb-4">
          {t("scan.example")}{" "}
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setUrl("https://example.com")}
            className="text-fg-muted hover:text-accent underline mono"
          >
            example.com
          </button>
        </p>
      )}

      <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-2 bg-bg border border-border rounded-full">
        <span className="text-xs text-fg-subtle shrink-0">{t("scan.options")}</span>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <IconToggle
            testId="opt-render"
            label={t("scan.toggle.render")}
            description={t("scan.toggle.render.desc")}
            active={render && mode === "url"}
            disabled={isBusy || mode === "html"}
            emphasized={highlight === "render"}
            onToggle={() => setRender((v) => !v)}
          >
            <Bot className="size-4" />
          </IconToggle>
          <IconToggle
            testId="opt-wayback"
            label={t("scan.toggle.wayback")}
            description={t("scan.toggle.wayback.desc")}
            active={wayback && mode === "url"}
            disabled={isBusy || mode === "html"}
            emphasized={highlight === "wayback"}
            onToggle={() => setWayback((v) => !v)}
          >
            <Archive className="size-4" />
          </IconToggle>
          <IconToggle
            testId="opt-crawl"
            label={t("scan.toggle.crawl")}
            description={t("scan.toggle.crawl.desc")}
            active={crawlOn && mode === "url"}
            disabled={isBusy || mode === "html"}
            emphasized={highlight === "crawl"}
            onToggle={() => setMaxPages((n) => (n > 1 ? 1 : 5))}
          >
            <Layers className="size-4" />
          </IconToggle>
          <IconToggle
            testId="opt-assets"
            label={t("scan.toggle.assets")}
            description={t("scan.toggle.assets.desc")}
            active={captureAssets}
            disabled={isBusy}
            emphasized={highlight === "assets"}
            onToggle={() => setCaptureAssets((v) => !v)}
          >
            <Package className="size-4" />
          </IconToggle>
          <IconToggle
            testId="opt-wp"
            label={t("scan.toggle.wp")}
            description={t("scan.toggle.wp.desc")}
            active={wpJetEngine}
            disabled={isBusy}
            emphasized={highlight === "wp"}
            onToggle={() => setWpJetEngine((v) => !v)}
          >
            <Blocks className="size-4" />
          </IconToggle>
        </div>
      </div>
      {!compact && (
        <p className="mb-4 text-[11px] text-fg-subtle text-center sm:text-left">
          {t("scan.tip.hold")}
        </p>
      )}
      {compact && <div className="mb-4" />}

      <span className="sr-only">{t("scan.srOptions")}</span>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex w-full flex-col-reverse sm:flex-row gap-2">
          {isBusy && (
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={cancelScan}
              className="w-full sm:w-auto min-w-[120px] border-danger/40 text-danger hover:bg-danger/10 relative z-20"
            >
              <XCircle className="size-4" />
              {t("scan.cancel")}
            </Button>
          )}
          <Button
            size="lg"
            disabled={isBusy || (mode === "url" ? !url.trim() : !html.trim())}
            onClick={() => void runScan()}
            className="w-full min-w-[160px] bg-accent text-accent-fg hover:bg-accent/90 font-semibold relative z-20"
          >
            {isBusy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("scan.busy")}
              </>
            ) : (
              <>
                <ScanSearch className="size-4" />
                {t("scan.cta")}
                <ArrowRight className="size-4 opacity-70" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
