/**
 * Pure export ritual state machine — no React, easy to unit test.
 * Phases: idle → arming → weave → lock → release → ready → idle
 */

export type RitualPhase =
  | "idle"
  | "arming"
  | "weave"
  | "lock"
  | "release"
  | "ready"
  | "error";

export type ExportKind = "json" | "elementor" | "zip";

export type RitualState = {
  phase: RitualPhase;
  kind: ExportKind | null;
  /** 0–100 integer */
  percent: number;
  error: string | null;
  /** true while any phase except idle/ready/error */
  busy: boolean;
};

export const RITUAL_INITIAL: RitualState = {
  phase: "idle",
  kind: null,
  percent: 0,
  error: null,
  busy: false,
};

/** Default full choreography ms (non-reduced motion) */
export const RITUAL_DURATION_MS = 1900;
/** Reduced motion total */
export const RITUAL_REDUCED_MS = 380;

/** Phase boundaries as progress fractions 0..1 */
export const PHASE_BOUNDS = {
  arming: [0, 0.15] as const,
  weave: [0.15, 0.75] as const,
  lock: [0.75, 0.95] as const,
  release: [0.95, 1] as const,
};

/** Ease-out cubic — deterministic, no random jumps */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export function phaseFromProgress(p: number): Exclude<
  RitualPhase,
  "idle" | "ready" | "error"
> {
  if (p < 0.15) return "arming";
  if (p < 0.75) return "weave";
  if (p < 0.95) return "lock";
  return "release";
}

export function percentFromLinear(t: number): number {
  return Math.min(100, Math.max(0, Math.round(easeOutCubic(t) * 100)));
}

/**
 * Seeded PRNG (mulberry32) for deterministic network layout from blueprint.id
 */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type NetNode = { id: number; x: number; y: number; core?: boolean };
export type NetEdge = { a: number; b: number };

export function buildNetwork(
  seedStr: string,
  mobile: boolean,
): { nodes: NetNode[]; edges: NetEdge[] } {
  const rand = mulberry32(seedFromString(seedStr || "blueprint"));
  const count = mobile ? 8 : 16;
  const nodes: NetNode[] = [];
  // place on soft grid with jitter
  const cols = mobile ? 3 : 4;
  const rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = ((col + 0.5) / cols) * 100 + (rand() - 0.5) * 10;
    const y = ((row + 0.5) / rows) * 100 + (rand() - 0.5) * 10;
    nodes.push({
      id: i,
      x: Math.min(92, Math.max(8, x)),
      y: Math.min(92, Math.max(8, y)),
    });
  }
  // core = center-most
  let core = 0;
  let best = Infinity;
  for (const n of nodes) {
    const d = (n.x - 50) ** 2 + (n.y - 50) ** 2;
    if (d < best) {
      best = d;
      core = n.id;
    }
  }
  nodes[core].core = true;

  const edges: NetEdge[] = [];
  // connect each node to 2 nearest
  for (const n of nodes) {
    const others = nodes
      .filter((o) => o.id !== n.id)
      .map((o) => ({
        id: o.id,
        d: (o.x - n.x) ** 2 + (o.y - n.y) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const o of others) {
      const a = Math.min(n.id, o.id);
      const b = Math.max(n.id, o.id);
      if (!edges.some((e) => e.a === a && e.b === b)) {
        edges.push({ a, b });
      }
    }
  }
  // ensure core connected
  return { nodes, edges };
}

export type RitualAction =
  | { type: "START"; kind: ExportKind }
  | { type: "TICK"; /** linear 0..1 elapsed/duration */ t: number }
  | { type: "WORK_PROGRESS"; percent: number }
  | { type: "FAIL"; error: string }
  | { type: "COMPLETE_READY" }
  | { type: "RESET" };

/**
 * Combine animation progress with real work progress (zip steps).
 * Display percent = max(animPercent, workPercent) while busy, capped 99 until COMPLETE.
 */
export function reduceRitual(
  state: RitualState,
  action: RitualAction,
): RitualState {
  switch (action.type) {
    case "START": {
      if (state.busy) return state; // no double-click
      return {
        phase: "arming",
        kind: action.kind,
        percent: 0,
        error: null,
        busy: true,
      };
    }
    case "TICK": {
      if (!state.busy || state.phase === "error") return state;
      const anim = percentFromLinear(action.t);
      const phase = phaseFromProgress(action.t);
      const percent = Math.min(99, Math.max(state.percent, anim));
      return { ...state, phase, percent };
    }
    case "WORK_PROGRESS": {
      if (!state.busy) return state;
      const percent = Math.min(99, Math.max(state.percent, action.percent));
      return { ...state, percent };
    }
    case "FAIL":
      return {
        phase: "error",
        kind: state.kind,
        percent: state.percent,
        error: action.error,
        busy: false,
      };
    case "COMPLETE_READY":
      return {
        phase: "ready",
        kind: state.kind,
        percent: 100,
        error: null,
        busy: false,
      };
    case "RESET":
      return { ...RITUAL_INITIAL };
    default:
      return state;
  }
}
