import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Download,
  FileArchive,
  FileJson,
  LayoutGrid,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/context";
import { cn, formatBytes } from "@/lib/utils";
import type { Blueprint } from "@/lib/blueprint/types";
import {
  prepareElementorExport,
  prepareJsonExport,
  prepareZipExport,
  triggerBlobDownload,
  type PreparedExport,
} from "@/lib/blueprint/storage";
import {
  RITUAL_DURATION_MS,
  RITUAL_REDUCED_MS,
  RITUAL_INITIAL,
  buildNetwork,
  reduceRitual,
  type ExportKind,
  type RitualState,
} from "@/lib/export/ritual-machine";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 480;
}

export function useExportRitual(blueprint: Blueprint) {
  const [state, setState] = useState<RitualState>(RITUAL_INITIAL);
  const [prepared, setPrepared] = useState<PreparedExport | null>(null);
  const [shake, setShake] = useState(false);
  const runningRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const dispatch = useCallback((action: Parameters<typeof reduceRitual>[1]) => {
    setState((s) => reduceRitual(s, action));
  }, []);

  const reset = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setPrepared(null);
    dispatch({ type: "RESET" });
  }, [dispatch]);

  const run = useCallback(
    async (kind: ExportKind) => {
      if (runningRef.current || state.busy) return;
      runningRef.current = true;
      setPrepared(null);
      dispatch({ type: "START", kind });

      const reduced = prefersReducedMotion();
      const duration = reduced ? RITUAL_REDUCED_MS : RITUAL_DURATION_MS;
      const t0 = performance.now();

      const workPromise = (async (): Promise<PreparedExport> => {
        if (kind === "json") {
          dispatch({ type: "WORK_PROGRESS", percent: 40 });
          const p = prepareJsonExport(blueprint);
          dispatch({ type: "WORK_PROGRESS", percent: 90 });
          return p;
        }
        if (kind === "elementor") {
          dispatch({ type: "WORK_PROGRESS", percent: 40 });
          const p = prepareElementorExport(blueprint);
          dispatch({ type: "WORK_PROGRESS", percent: 90 });
          return p;
        }
        // zip with step mapping 20/50/80
        return prepareZipExport(blueprint, (step) => {
          if (step === "collect") dispatch({ type: "WORK_PROGRESS", percent: 20 });
          if (step === "zip") dispatch({ type: "WORK_PROGRESS", percent: 50 });
          if (step === "blob") dispatch({ type: "WORK_PROGRESS", percent: 80 });
        });
      })();

      // animation loop
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / duration);
          dispatch({ type: "TICK", t });
          if (t < 1) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            resolve();
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      });

      try {
        const result = await workPromise;
        // ensure anim finished AND work done
        setPrepared(result);
        triggerBlobDownload(result.blob, result.filename);
        dispatch({ type: "COMPLETE_READY" });
      } catch (e) {
        setShake(true);
        window.setTimeout(() => setShake(false), 500);
        dispatch({
          type: "FAIL",
          error: e instanceof Error ? e.message : "Export failed",
        });
      } finally {
        runningRef.current = false;
      }
    },
    [blueprint, dispatch, state.busy],
  );

  const downloadAgain = useCallback(() => {
    if (!prepared) return;
    triggerBlobDownload(prepared.blob, prepared.filename);
  }, [prepared]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    state,
    prepared,
    shake,
    run,
    reset,
    downloadAgain,
    busy: state.busy,
  };
}

function kindIcon(kind: ExportKind | null) {
  if (kind === "zip") return FileArchive;
  if (kind === "elementor") return LayoutGrid;
  return FileJson;
}

function phaseLabelKey(phase: RitualState["phase"]): string {
  switch (phase) {
    case "arming":
      return "export.ritual.preparing";
    case "weave":
      return "export.ritual.weaving";
    case "lock":
      return "export.ritual.locking";
    case "release":
      return "export.ritual.releasing";
    case "ready":
      return "export.ritual.ready";
    case "error":
      return "export.ritual.error";
    default:
      return "export.ritual.preparing";
  }
}

function NeonNetwork({
  seed,
  phase,
  percent,
}: {
  seed: string;
  phase: RitualState["phase"];
  percent: number;
}) {
  const mobile = isMobileViewport();
  const { nodes, edges } = useMemo(
    () => buildNetwork(seed, mobile),
    [seed, mobile],
  );

  const nodeReveal = Math.min(1, Math.max(0, (percent - 10) / 55));
  const edgeReveal = Math.min(1, Math.max(0, (percent - 20) / 50));
  const lock = phase === "lock" || phase === "release" || phase === "ready";
  const core = nodes.find((n) => n.core) || nodes[0];

  return (
    <svg
      viewBox="0 0 100 100"
      className="export-ritual-net w-full h-full"
      aria-hidden
    >
      {edges.map((e, i) => {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const show = i / edges.length <= edgeReveal;
        return (
          <line
            key={`${e.a}-${e.b}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={cn(
              "export-ritual-edge",
              show && "export-ritual-edge-on",
              lock && "export-ritual-edge-dim",
            )}
          />
        );
      })}
      {nodes.map((n, i) => {
        const show = i / nodes.length <= nodeReveal || n.core;
        const isCore = Boolean(n.core);
        return (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={isCore && lock ? 4.2 : 1.8}
              className={cn(
                "export-ritual-node",
                show && "export-ritual-node-on",
                isCore && lock && "export-ritual-node-core",
              )}
            />
          </g>
        );
      })}
      {lock && core && (
        <g transform={`translate(${core.x}, ${core.y})`}>
          <circle r="7" className="export-ritual-core-ring" />
        </g>
      )}
    </svg>
  );
}

type RitualUiProps = {
  state: RitualState;
  prepared: PreparedExport | null;
  shake: boolean;
  seed: string;
  onClose: () => void;
  onDownloadAgain: () => void;
};

export function ExportRitualOverlay({
  state,
  prepared,
  shake,
  seed,
  onClose,
  onDownloadAgain,
}: RitualUiProps) {
  const { t } = useI18n();
  if (state.phase === "idle") return null;

  const Icon = kindIcon(state.kind);
  const showDialog = state.phase === "ready" && prepared;
  const showError = state.phase === "error";
  const showWeave =
    state.busy || state.phase === "release" || state.phase === "ready";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-bg/75 backdrop-blur-sm"
      data-testid="export-ritual-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-ritual-title"
    >
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!state.busy) onClose();
        }}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 w-full sm:max-w-md max-h-[90dvh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-border bg-bg-elevated shadow-soft",
          shake && "export-ritual-shake",
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="size-4 text-accent shrink-0" />
            <h3
              id="export-ritual-title"
              className="text-sm font-semibold truncate"
            >
              {t(phaseLabelKey(state.phase) as "export.ritual.preparing")}
            </h3>
          </div>
          <button
            type="button"
            className="p-1.5 text-fg-subtle hover:text-fg rounded-md"
            onClick={onClose}
            disabled={state.busy}
            aria-label={t("action.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {showWeave && !showError && (
            <div className="relative aspect-[4/3] sm:aspect-[16/10] rounded-[var(--radius-md)] border border-border bg-bg overflow-hidden export-ritual-stage">
              <NeonNetwork
                seed={seed}
                phase={state.phase}
                percent={state.percent}
              />
              {(state.phase === "lock" ||
                state.phase === "release" ||
                state.phase === "ready") && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className={cn(
                      "export-ritual-download-core toggle-neon-ring flex items-center justify-center size-14 rounded-full bg-bg-elevated border border-accent/40",
                      state.phase === "release" && "export-ritual-flash",
                    )}
                  >
                    <Download className="size-6 text-accent" />
                  </div>
                </div>
              )}
            </div>
          )}

          {state.busy && (
            <div
              className="flex items-center justify-between gap-3"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm text-fg-muted">
                <Loader2 className="size-4 animate-spin text-accent" />
                <span>{t(phaseLabelKey(state.phase) as "export.ritual.preparing")}</span>
              </div>
              <span
                data-testid="export-ritual-percent"
                className="mono text-sm font-semibold text-accent tabular-nums"
              >
                {state.percent}%
              </span>
            </div>
          )}

          {state.busy && (
            <div className="h-1.5 w-full rounded-full bg-bg border border-border overflow-hidden">
              <div
                className="h-full bg-accent/80 transition-[width] duration-100 ease-out"
                style={{ width: `${state.percent}%` }}
              />
            </div>
          )}

          {showError && (
            <div
              className="flex items-start gap-2 rounded-[var(--radius-md)] border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
              data-testid="export-ritual-error"
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">{t("export.ritual.error")}</div>
                <div className="text-xs opacity-90">{state.error}</div>
              </div>
            </div>
          )}

          {showDialog && prepared && (
            <ExportReadyDialog
              prepared={prepared}
              onDownloadAgain={onDownloadAgain}
              onDone={onClose}
            />
          )}

          {showError && (
            <Button type="button" className="w-full" onClick={onClose}>
              {t("action.close")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportReadyDialog({
  prepared,
  onDownloadAgain,
  onDone,
}: {
  prepared: PreparedExport;
  onDownloadAgain: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const typeLabel =
    prepared.kind === "zip"
      ? t("export.kind.zip")
      : prepared.kind === "elementor"
        ? t("export.kind.elementor")
        : t("export.kind.json");

  return (
    <div className="space-y-3" data-testid="export-ready-dialog">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-5 text-success" />
        <div>
          <div className="text-sm font-semibold">{t("export.ritual.readyTitle")}</div>
          <Badge variant="success" className="mt-1">
            {t("export.ritual.onDevice")}
          </Badge>
        </div>
      </div>
      <div className="rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2.5 text-xs space-y-1">
        <div className="flex justify-between gap-2">
          <span className="text-fg-subtle">{t("export.ritual.file")}</span>
          <span className="mono text-fg truncate max-w-[60%]" title={prepared.filename}>
            {prepared.filename}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-fg-subtle">{t("export.ritual.type")}</span>
          <span className="text-fg">{typeLabel}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-fg-subtle">{t("export.ritual.size")}</span>
          <span className="mono text-fg">{formatBytes(prepared.size)}</span>
        </div>
      </div>
      <div className="flex flex-col-reverse sm:flex-row gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onDone}>
          {t("export.ritual.done")}
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={onDownloadAgain}
          data-testid="export-download-again"
        >
          <Download className="size-3.5" />
          {t("export.ritual.again")}
        </Button>
      </div>
    </div>
  );
}

/** Toolbar buttons + ritual host */
export function ExportRitualBar({
  blueprint,
  children,
}: {
  blueprint: Blueprint;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const ritual = useExportRitual(blueprint);

  return (
    <>
      <div className="flex flex-wrap gap-2 shrink-0">
        {children}
        <Button
          variant="secondary"
          size="sm"
          disabled={ritual.busy}
          onClick={() => void ritual.run("json")}
          data-testid="export-btn-json"
        >
          <FileJson className="size-3.5" />
          {t("export.btn.json")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={ritual.busy}
          onClick={() => void ritual.run("elementor")}
          data-testid="export-btn-elementor"
        >
          <LayoutGrid className="size-3.5" />
          {t("export.btn.elementor")}
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={ritual.busy}
          onClick={() => void ritual.run("zip")}
          data-testid="export-btn-zip"
        >
          <FileArchive className="size-3.5" />
          {ritual.busy && ritual.state.kind === "zip"
            ? t("export.btn.zipBusy")
            : t("export.btn.zip")}
        </Button>
      </div>

      {(ritual.state.phase !== "idle") && (
        <ExportRitualOverlay
          state={ritual.state}
          prepared={ritual.prepared}
          shake={ritual.shake}
          seed={blueprint.id}
          onClose={ritual.reset}
          onDownloadAgain={ritual.downloadAgain}
        />
      )}
    </>
  );
}
