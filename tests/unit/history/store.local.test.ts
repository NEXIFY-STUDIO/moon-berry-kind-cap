// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMinimalBlueprint } from "../../fixtures/minimal-blueprint";

vi.mock("@/lib/blueprint/server", () => ({
  getHistoryBackend: vi.fn(async () => ({ remote: false, source: "local" })),
  listBlueprints: vi.fn(async () => ({ remote: false, items: [] })),
  getBlueprint: vi.fn(async () => ({ blueprint: null })),
  upsertBlueprint: vi.fn(async () => ({ ok: true })),
  deleteBlueprint: vi.fn(async () => ({ ok: true })),
  clearBlueprints: vi.fn(async () => ({ ok: true })),
}));

describe("history store · local mode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("save / list / get / remove without DB", async () => {
    const store = await import("@/lib/history/store");
    store.__unbootHistoryStoreForTests();

    const bp = makeMinimalBlueprint({ id: "H1" });
    await store.save(bp);

    expect(store.getHistoryMode()).toBe("local");
    const items = await store.list();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("H1");
    expect(items[0].updatedAt).toBeTruthy();

    const loaded = await store.get("H1");
    expect(loaded?.contentHash).toBe("abc123");

    await store.remove("H1");
    expect(await store.list()).toHaveLength(0);
  });

  it("clear empties vault", async () => {
    const store = await import("@/lib/history/store");
    store.__unbootHistoryStoreForTests();
    await store.save(makeMinimalBlueprint({ id: "A" }));
    await store.save(makeMinimalBlueprint({ id: "B" }));
    expect((await store.list()).length).toBe(2);
    await store.clear();
    expect(await store.list()).toHaveLength(0);
  });

  it("newest first on list", async () => {
    const store = await import("@/lib/history/store");
    store.__unbootHistoryStoreForTests();
    await store.save(
      makeMinimalBlueprint({
        id: "old",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      }),
    );
    await store.save(
      makeMinimalBlueprint({
        id: "new",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const items = await store.list();
    expect(items[0].id).toBe("new");
  });
});
