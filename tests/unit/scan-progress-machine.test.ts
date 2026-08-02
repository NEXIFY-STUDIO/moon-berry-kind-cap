import { describe, expect, it } from "vitest";
import {
  asymptoticPercent,
  clampPercent,
  estimateTauMs,
  reduceScanProgress,
  SCAN_PROGRESS_INITIAL,
} from "@/lib/scan/progress-machine";

describe("scan progress machine", () => {
  it("clamps percent to 0..100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(50.4)).toBe(50);
    expect(clampPercent(100)).toBe(100);
    expect(clampPercent(240)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it("asymptotic never exceeds cap before complete", () => {
    const tau = 3000;
    for (const t of [0, 500, 2000, 10_000, 60_000]) {
      const p = asymptoticPercent(t, tau, 92);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(92);
    }
    expect(asymptoticPercent(0, tau)).toBe(0);
    expect(asymptoticPercent(60_000, tau, 92)).toBe(92);
  });

  it("tau grows with heavier scan options", () => {
    const light = estimateTauMs({
      mode: "html",
      maxPages: 1,
      render: false,
      captureAssets: false,
      wpJetEngine: false,
    });
    const heavy = estimateTauMs({
      mode: "url",
      maxPages: 5,
      render: true,
      captureAssets: true,
      wpJetEngine: true,
    });
    expect(heavy).toBeGreaterThan(light);
  });

  it("state machine: start → tick → complete → hold", () => {
    let s = SCAN_PROGRESS_INITIAL;
    s = reduceScanProgress(s, { type: "START" });
    expect(s.phase).toBe("running");
    expect(s.percent).toBe(0);

    s = reduceScanProgress(s, { type: "TICK", elapsedMs: 2000, tauMs: 3000 });
    expect(s.phase).toBe("running");
    expect(s.percent).toBeGreaterThan(0);
    expect(s.percent).toBeLessThanOrEqual(92);

    s = reduceScanProgress(s, { type: "COMPLETE" });
    expect(s.phase).toBe("finishing");
    expect(s.percent).toBe(100);

    s = reduceScanProgress(s, { type: "FINISH_HOLD_DONE" });
    expect(s.phase).toBe("done");
    expect(s.percent).toBe(100);
  });

  it("cancel and error reset to idle", () => {
    let s = reduceScanProgress(SCAN_PROGRESS_INITIAL, { type: "START" });
    s = reduceScanProgress(s, { type: "TICK", elapsedMs: 1000, tauMs: 3000 });
    s = reduceScanProgress(s, { type: "CANCEL" });
    expect(s).toEqual({ phase: "idle", percent: 0 });

    s = reduceScanProgress(SCAN_PROGRESS_INITIAL, { type: "START" });
    s = reduceScanProgress(s, { type: "ERROR" });
    expect(s).toEqual({ phase: "idle", percent: 0 });
  });

  it("no double-start leak: tick ignored outside running", () => {
    const s = reduceScanProgress(SCAN_PROGRESS_INITIAL, {
      type: "TICK",
      elapsedMs: 5000,
      tauMs: 1000,
    });
    expect(s.percent).toBe(0);
    expect(s.phase).toBe("idle");
  });
});
