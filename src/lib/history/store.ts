/**
 * Unified history store — localStorage cache + optional remote DB.
 *
 * Boot detects backend once (getHistoryBackend). Components read
 * getHistoryMode() — never guess env themselves.
 *
 * Without DATABASE_URL: localStorage is source of truth (same UX as before).
 * With DATABASE_URL: DB is source of truth, localStorage is cache.
 */

import type { Blueprint } from "@/lib/blueprint/types";
import {
  clearLocalBlueprints,
  deleteLocalBlueprint,
  getLocalRecord,
  listLocalBlueprints,
  loadLocalBlueprint,
  readLocalRecords,
  saveBlueprintLocal,
  writeLocalRecords,
  type BlueprintSummary,
  type LocalVaultRecord,
} from "@/lib/blueprint/storage";
import {
  clearBlueprints,
  deleteBlueprint,
  getBlueprint,
  getHistoryBackend,
  listBlueprints,
  upsertBlueprint,
} from "@/lib/blueprint/server";

export type HistoryMode = "local" | "remote";

export type HistorySummary = BlueprintSummary & {
  updatedAt: string;
};

export type HistoryListState = {
  mode: HistoryMode;
  items: HistorySummary[];
  loading: boolean;
  error: string | null;
  synced: boolean;
};

let mode: HistoryMode = "local";
let booted = false;
let bootPromise: Promise<HistoryMode> | null = null;
let lastError: string | null = null;

function tsOf(bp: { updatedAt?: string; createdAt: string }): string {
  return bp.updatedAt || bp.createdAt || new Date(0).toISOString();
}

function toHistorySummary(s: BlueprintSummary): HistorySummary {
  return {
    ...s,
    updatedAt: s.updatedAt || s.createdAt,
  };
}

export function getHistoryMode(): HistoryMode {
  return mode;
}

export function getHistoryError(): string | null {
  return lastError;
}

export function isHistoryBooted(): boolean {
  return booted;
}

/** Boot once: detect remote + optional sync. Safe to call repeatedly. */
export async function ensureBoot(): Promise<HistoryMode> {
  if (booted) return mode;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    if (typeof window === "undefined") {
      mode = "local";
      booted = true;
      return mode;
    }
    try {
      const backend = await getHistoryBackend();
      mode = backend.remote ? "remote" : "local";
    } catch {
      mode = "local";
    }

    if (mode === "remote") {
      try {
        await syncFromRemote();
        lastError = null;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "History sync failed";
        console.warn("[history] sync failed:", e);
      }
    }

    booted = true;
    return mode;
  })();

  try {
    return await bootPromise;
  } finally {
    bootPromise = null;
  }
}

/**
 * Merge remote list with local vault.
 * Newer updatedAt wins. Differing contentHash always logs a warning.
 */
async function syncFromRemote(): Promise<void> {
  const remote = await listBlueprints();
  const local = readLocalRecords();
  const localById = new Map(local.map((r) => [r.blueprint.id, r]));
  const remoteIds = new Set(remote.items.map((i) => i.id));

  // Pull remote → local
  for (const item of remote.items) {
    const loc = localById.get(item.id);
    const remoteTs = item.updatedAt || item.createdAt;
    if (!loc) {
      await pullRemoteFull(item.id, remoteTs);
      continue;
    }
    const localTs = loc.updatedAt;
    if (loc.blueprint.contentHash !== item.contentHash) {
      if (localTs > remoteTs) {
        console.warn(
          `[history] conflict ${item.id}: local newer (hash differ) — pushing local`,
        );
        await pushLocal(loc.blueprint);
      } else if (remoteTs > localTs) {
        console.warn(
          `[history] conflict ${item.id}: remote newer (hash differ) — pulling remote`,
        );
        await pullRemoteFull(item.id, remoteTs);
      } else {
        console.warn(
          `[history] conflict ${item.id}: same timestamp, hash differ — preferring remote`,
        );
        await pullRemoteFull(item.id, remoteTs);
      }
    } else if (remoteTs > localTs) {
      // same content-ish but remote stamp newer — refresh meta only via full pull if stub
      if (loc.remoteOnly) {
        await pullRemoteFull(item.id, remoteTs);
      } else {
        loc.updatedAt = remoteTs;
      }
    }
  }

  // Push local-only to remote
  for (const rec of readLocalRecords()) {
    if (!remoteIds.has(rec.blueprint.id)) {
      await pushLocal(rec.blueprint);
    }
  }
}

async function pullRemoteFull(id: string, updatedAt?: string): Promise<void> {
  const res = await getBlueprint({ data: { id } });
  const bp = res.blueprint;
  if (!bp) return;
  const stamped: Blueprint = {
    ...bp,
    updatedAt: bp.updatedAt || updatedAt || bp.createdAt,
  };
  saveBlueprintLocal(stamped);
}

async function pushLocal(bp: Blueprint): Promise<void> {
  const stamped: Blueprint = {
    ...bp,
    updatedAt: tsOf(bp),
  };
  try {
    await upsertBlueprint({ data: { blueprint: stamped } });
  } catch (e) {
    console.warn("[history] push failed:", e);
  }
}

export async function list(): Promise<HistorySummary[]> {
  await ensureBoot();
  if (mode === "remote") {
    try {
      const remote = await listBlueprints();
      // Prefer remote order; enrich with local remoteOnly flags / tech
      const localMap = new Map(
        listLocalBlueprints().map((s) => [s.id, s] as const),
      );
      const items: HistorySummary[] = remote.items.map((r) => {
        const loc = localMap.get(r.id);
        return {
          id: r.id,
          title: r.title,
          sourceUrl: r.sourceUrl,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt || r.createdAt,
          tech: r.tech?.length ? r.tech : loc?.tech || [],
          contentHash: r.contentHash,
          remoteOnly: loc?.remoteOnly,
        };
      });
      // Include local-only not yet on remote (offline saves)
      for (const loc of localMap.values()) {
        if (!items.some((i) => i.id === loc.id)) {
          items.push(toHistorySummary(loc));
        }
      }
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      lastError = null;
      return items;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "List failed";
      // fallback local
      return listLocalBlueprints().map(toHistorySummary);
    }
  }
  return listLocalBlueprints().map(toHistorySummary);
}

export async function get(id: string): Promise<Blueprint | null> {
  await ensureBoot();
  const local = loadLocalBlueprint(id);
  const rec = getLocalRecord(id);
  if (local && !rec?.remoteOnly) return local;

  if (mode === "remote" || rec?.remoteOnly) {
    try {
      const res = await getBlueprint({ data: { id } });
      if (res.blueprint) {
        saveBlueprintLocal(res.blueprint);
        return res.blueprint;
      }
    } catch (e) {
      console.warn("[history] get remote failed:", e);
    }
  }
  return local;
}

export async function save(blueprint: Blueprint): Promise<void> {
  await ensureBoot();
  const stamped: Blueprint = {
    ...blueprint,
    updatedAt: new Date().toISOString(),
  };

  // Always try local cache (never throw on quota)
  const localResult = saveBlueprintLocal(stamped);

  if (mode === "remote") {
    try {
      const res = await upsertBlueprint({ data: { blueprint: stamped } });
      if (!res.ok) {
        lastError = res.error || "Remote save failed";
        console.warn("[history] remote save:", lastError);
      } else {
        lastError = null;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Remote save failed";
      console.warn("[history] remote save failed:", e);
    }
  }

  if (localResult.remoteOnly && mode === "remote") {
    // full body on DB only — local is marker
    console.info(
      `[history] ${stamped.id} stored remotely (local cache slimmed)`,
    );
  }
}

export async function remove(id: string): Promise<void> {
  await ensureBoot();
  deleteLocalBlueprint(id);
  if (mode === "remote") {
    try {
      await deleteBlueprint({ data: { id } });
      lastError = null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Remote delete failed";
      console.warn("[history] remote delete failed:", e);
    }
  }
}

export async function clear(): Promise<void> {
  await ensureBoot();
  clearLocalBlueprints();
  if (mode === "remote") {
    try {
      await clearBlueprints();
      lastError = null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Remote clear failed";
      console.warn("[history] remote clear failed:", e);
    }
  }
}

/** Force re-sync (remote mode only). */
export async function sync(): Promise<void> {
  await ensureBoot();
  if (mode !== "remote") return;
  await syncFromRemote();
}

/** Test helper — reset boot state */
export function __resetHistoryStoreForTests(nextMode: HistoryMode = "local") {
  mode = nextMode;
  booted = true;
  bootPromise = null;
  lastError = null;
}

export function __unbootHistoryStoreForTests() {
  mode = "local";
  booted = false;
  bootPromise = null;
  lastError = null;
}

export type { LocalVaultRecord, BlueprintSummary };
