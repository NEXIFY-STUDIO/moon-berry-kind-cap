// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMinimalBlueprint } from "../../fixtures/minimal-blueprint";

const getHistoryBackend = vi.fn();
const listBlueprints = vi.fn();
const getBlueprint = vi.fn();
const upsertBlueprint = vi.fn();
const deleteBlueprint = vi.fn();
const clearBlueprints = vi.fn();

vi.mock("@/lib/blueprint/server", () => ({
  getHistoryBackend: (...a: unknown[]) => getHistoryBackend(...a),
  listBlueprints: (...a: unknown[]) => listBlueprints(...a),
  getBlueprint: (...a: unknown[]) => getBlueprint(...a),
  upsertBlueprint: (...a: unknown[]) => upsertBlueprint(...a),
  deleteBlueprint: (...a: unknown[]) => deleteBlueprint(...a),
  clearBlueprints: (...a: unknown[]) => clearBlueprints(...a),
}));

describe("history store · remote mode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    getHistoryBackend.mockReset();
    listBlueprints.mockReset();
    getBlueprint.mockReset();
    upsertBlueprint.mockReset();
    deleteBlueprint.mockReset();
    clearBlueprints.mockReset();

    getHistoryBackend.mockResolvedValue({ remote: true, source: "neon" });
    listBlueprints.mockResolvedValue({ remote: true, items: [] });
    getBlueprint.mockResolvedValue({ blueprint: null });
    upsertBlueprint.mockResolvedValue({ ok: true });
    deleteBlueprint.mockResolvedValue({ ok: true });
    clearBlueprints.mockResolvedValue({ ok: true });
  });

  it("boots as remote and pushes save to upsert", async () => {
    const store = await import("@/lib/history/store");
    store.__unbootHistoryStoreForTests();
    // force re-boot
    store.__unbootHistoryStoreForTests();

    const bp = makeMinimalBlueprint({ id: "R1" });
    await store.save(bp);

    expect(store.getHistoryMode()).toBe("remote");
    expect(upsertBlueprint).toHaveBeenCalled();
    const items = await store.list();
    expect(items.some((i) => i.id === "R1")).toBe(true);
  });

  it("pulls remote-only items on list merge", async () => {
    const remoteBp = makeMinimalBlueprint({
      id: "REMOTE",
      meta: {
        ...makeMinimalBlueprint().meta,
        title: "From DB",
      },
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    listBlueprints.mockResolvedValue({
      remote: true,
      items: [
        {
          id: "REMOTE",
          title: "From DB",
          sourceUrl: remoteBp.sourceUrl,
          createdAt: remoteBp.createdAt,
          updatedAt: remoteBp.updatedAt,
          tech: ["React"],
          contentHash: remoteBp.contentHash,
        },
      ],
    });
    getBlueprint.mockResolvedValue({ blueprint: remoteBp });

    const store = await import("@/lib/history/store");
    store.__unbootHistoryStoreForTests();
    await store.ensureBoot();

    const items = await store.list();
    expect(items.some((i) => i.id === "REMOTE")).toBe(true);

    const full = await store.get("REMOTE");
    expect(full?.meta.title).toBe("From DB");
  });

  it("remove deletes both layers", async () => {
    const store = await import("@/lib/history/store");
    store.__unbootHistoryStoreForTests();
    await store.save(makeMinimalBlueprint({ id: "DEL" }));
    await store.remove("DEL");
    expect(deleteBlueprint).toHaveBeenCalled();
    expect(await store.get("DEL")).toBeNull();
  });
});
