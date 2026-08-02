import { describe, expect, it } from "vitest";
import {
  RITUAL_INITIAL,
  buildNetwork,
  easeOutCubic,
  percentFromLinear,
  phaseFromProgress,
  reduceRitual,
  seedFromString,
} from "@/lib/export/ritual-machine";

describe("export ritual machine", () => {
  it("START sets arming and busy; double START ignored", () => {
    const s1 = reduceRitual(RITUAL_INITIAL, { type: "START", kind: "json" });
    expect(s1.phase).toBe("arming");
    expect(s1.busy).toBe(true);
    expect(s1.kind).toBe("json");
    const s2 = reduceRitual(s1, { type: "START", kind: "zip" });
    expect(s2.kind).toBe("json"); // ignored
  });

  it("TICK maps progress to phases with ease-out percent", () => {
    let s = reduceRitual(RITUAL_INITIAL, { type: "START", kind: "json" });
    s = reduceRitual(s, { type: "TICK", t: 0.05 });
    expect(s.phase).toBe("arming");
    s = reduceRitual(s, { type: "TICK", t: 0.4 });
    expect(s.phase).toBe("weave");
    s = reduceRitual(s, { type: "TICK", t: 0.85 });
    expect(s.phase).toBe("lock");
    s = reduceRitual(s, { type: "TICK", t: 0.98 });
    expect(s.phase).toBe("release");
    expect(s.percent).toBeLessThan(100); // capped until COMPLETE_READY
    expect(s.percent).toBe(Math.min(99, percentFromLinear(0.98)));
  });

  it("percent never decreases on TICK / WORK_PROGRESS", () => {
    let s = reduceRitual(RITUAL_INITIAL, { type: "START", kind: "zip" });
    s = reduceRitual(s, { type: "WORK_PROGRESS", percent: 50 });
    s = reduceRitual(s, { type: "TICK", t: 0.1 });
    expect(s.percent).toBeGreaterThanOrEqual(50);
  });

  it("COMPLETE_READY sets 100 and not busy", () => {
    let s = reduceRitual(RITUAL_INITIAL, { type: "START", kind: "json" });
    s = reduceRitual(s, { type: "COMPLETE_READY" });
    expect(s.phase).toBe("ready");
    expect(s.percent).toBe(100);
    expect(s.busy).toBe(false);
  });

  it("FAIL clears busy and keeps error", () => {
    let s = reduceRitual(RITUAL_INITIAL, { type: "START", kind: "zip" });
    s = reduceRitual(s, { type: "FAIL", error: "boom" });
    expect(s.phase).toBe("error");
    expect(s.busy).toBe(false);
    expect(s.error).toBe("boom");
  });

  it("RESET returns to idle", () => {
    let s = reduceRitual(RITUAL_INITIAL, { type: "START", kind: "elementor" });
    s = reduceRitual(s, { type: "RESET" });
    expect(s).toEqual(RITUAL_INITIAL);
  });

  it("easeOutCubic is monotonic and deterministic", () => {
    const a = [0, 0.25, 0.5, 0.75, 1].map(easeOutCubic);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThanOrEqual(a[i - 1]);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("phaseFromProgress boundaries", () => {
    expect(phaseFromProgress(0)).toBe("arming");
    expect(phaseFromProgress(0.14)).toBe("arming");
    expect(phaseFromProgress(0.15)).toBe("weave");
    expect(phaseFromProgress(0.75)).toBe("lock");
    expect(phaseFromProgress(0.95)).toBe("release");
  });

  it("buildNetwork is deterministic for same seed", () => {
    const a = buildNetwork("BLUEPRINT_same", false);
    const b = buildNetwork("BLUEPRINT_same", false);
    expect(a).toEqual(b);
    expect(a.nodes.some((n) => n.core)).toBe(true);
    expect(a.edges.length).toBeGreaterThan(0);
    const mobile = buildNetwork("BLUEPRINT_same", true);
    expect(mobile.nodes.length).toBe(8);
  });

  it("seedFromString stable", () => {
    expect(seedFromString("abc")).toBe(seedFromString("abc"));
    expect(seedFromString("abc")).not.toBe(seedFromString("abd"));
  });
});
