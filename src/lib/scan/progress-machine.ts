/**
 * Deterministic scan progress (UI only — no real server %).
 * Asymptotic 0→cap while busy; lock to 100 on complete. Always clamped.
 */

export type ScanProgressOpts = {
  maxPages: number;
  render: boolean;
  captureAssets: boolean;
  wpJetEngine: boolean;
  mode: "url" | "html";
};

/** Time constant (ms) — higher = slower climb toward cap. */
export function estimateTauMs(opts: ScanProgressOpts): number {
  if (opts.mode === "html") return 2_400;
  let tau = 3_200;
  tau += Math.max(0, opts.maxPages - 1) * 900;
  if (opts.render) tau += 1_800;
  if (opts.captureAssets) tau += 1_200;
  if (opts.wpJetEngine) tau += 1_400;
  return tau;
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Asymptotic ease: approaches `cap` (default 92), never hits 100 until complete.
 * elapsedMs from busy start.
 */
export function asymptoticPercent(
  elapsedMs: number,
  tauMs: number,
  cap = 92,
): number {
  if (elapsedMs <= 0) return 0;
  if (tauMs <= 0) return clampPercent(cap);
  const t = Math.max(0, elapsedMs);
  const p = cap * (1 - Math.exp(-t / tauMs));
  return clampPercent(Math.min(cap, p));
}

export type ScanProgressPhase = "idle" | "running" | "finishing" | "done";

export type ScanProgressState = {
  phase: ScanProgressPhase;
  percent: number;
};

export const SCAN_PROGRESS_INITIAL: ScanProgressState = {
  phase: "idle",
  percent: 0,
};

export type ScanProgressAction =
  | { type: "START" }
  | { type: "TICK"; elapsedMs: number; tauMs: number }
  | { type: "COMPLETE" }
  | { type: "FINISH_HOLD_DONE" }
  | { type: "CANCEL" }
  | { type: "ERROR" };

/** Hold 100% briefly so user sees completion before overlay unmounts. */
export const SCAN_FINISH_HOLD_MS = 420;

export function reduceScanProgress(
  state: ScanProgressState,
  action: ScanProgressAction,
): ScanProgressState {
  switch (action.type) {
    case "START":
      return { phase: "running", percent: 0 };
    case "TICK": {
      if (state.phase !== "running") return state;
      return {
        phase: "running",
        percent: asymptoticPercent(action.elapsedMs, action.tauMs),
      };
    }
    case "COMPLETE":
      return { phase: "finishing", percent: 100 };
    case "FINISH_HOLD_DONE":
      return { phase: "done", percent: 100 };
    case "CANCEL":
    case "ERROR":
      return { phase: "idle", percent: 0 };
    default:
      return state;
  }
}
