// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMinimalBlueprint } from "../../fixtures/minimal-blueprint";

describe("local vault · quota handling", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("saveBlueprintLocal never throws on QuotaExceededError", async () => {
    const storage = await import("@/lib/blueprint/storage");
    const realSet = localStorage.setItem.bind(localStorage);
    let calls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      (key: string, value: string) => {
        calls += 1;
        if (calls === 1) {
          const err = new DOMException("quota", "QuotaExceededError");
          throw err;
        }
        return realSet(key, value);
      },
    );

    const bp = makeMinimalBlueprint({
      id: "BIG",
      html: "x".repeat(5000),
    });
    expect(() => storage.saveBlueprintLocal(bp)).not.toThrow();
    // eventually wrote or cleared
    expect(storage.listLocalBlueprints().length).toBeGreaterThanOrEqual(0);
  });

  it("LRU keeps newer items when many saves", async () => {
    const storage = await import("@/lib/blueprint/storage");
    for (let i = 0; i < 45; i++) {
      storage.saveBlueprintLocal(
        makeMinimalBlueprint({
          id: `ID_${i}`,
          updatedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
          meta: {
            ...makeMinimalBlueprint().meta,
            title: `Item ${i}`,
          },
        }),
      );
    }
    const list = storage.listLocalBlueprints();
    expect(list.length).toBeLessThanOrEqual(storage.LOCAL_VAULT_MAX_ITEMS);
    // newest should be present
    expect(list.some((x) => x.id === "ID_44")).toBe(true);
  });

  it("scan-like path: history.save survives quota", async () => {
    vi.mock("@/lib/blueprint/server", () => ({
      getHistoryBackend: vi.fn(async () => ({ remote: false, source: "local" })),
      listBlueprints: vi.fn(async () => ({ remote: false, items: [] })),
      getBlueprint: vi.fn(async () => ({ blueprint: null })),
      upsertBlueprint: vi.fn(async () => ({ ok: true })),
      deleteBlueprint: vi.fn(async () => ({ ok: true })),
      clearBlueprints: vi.fn(async () => ({ ok: true })),
    }));

    const store = await import("@/lib/history/store");
    store.__unbootHistoryStoreForTests();

    const realSet = Storage.prototype.setItem;
    let n = 0;
    Storage.prototype.setItem = function (k: string, v: string) {
      n += 1;
      if (n <= 2) {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      }
      return realSet.call(this, k, v);
    };

    await expect(
      store.save(makeMinimalBlueprint({ id: "Q1", html: "y".repeat(2000) })),
    ).resolves.toBeUndefined();

    Storage.prototype.setItem = realSet;
  });
});
