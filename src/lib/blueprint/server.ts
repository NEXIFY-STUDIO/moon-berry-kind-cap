import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { compareBlueprints } from "./compare";
import {
  clearBlueprintsDb,
  deleteBlueprintDb,
  listBlueprintsDb,
  loadBlueprintDb,
  saveBlueprintDb,
} from "./db-store";
import { scanToBlueprint } from "./scan";
import type { Blueprint } from "./types";
import {
  installProcessErrorGuards,
  withApiGuard,
  toApiError,
} from "@/lib/scanner/errors";

installProcessErrorGuards();

const memory = new Map<string, Blueprint>();

function isRemoteDb(): boolean {
  const url =
    typeof process !== "undefined" ? process.env.DATABASE_URL?.trim() : "";
  return Boolean(url);
}

const scanSchema = z
  .object({
    url: z.string().optional(),
    html: z.string().optional(),
    baseUrl: z.string().optional(),
    maxPages: z.number().int().min(1).max(20).optional(),
    render: z.boolean().optional(),
    wayback: z.boolean().optional(),
    captureAssets: z.boolean().optional(),
    wpJetEngine: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.url?.trim() || d.html?.trim()), {
    message: "Zadaj URL alebo HTML",
  });

export const scanBlueprint = createServerFn({ method: "POST" })
  .validator((data: unknown) => scanSchema.parse(data))
  .handler(async (ctx) => {
    const data = ctx.data;
    const signal =
      "signal" in ctx && ctx.signal instanceof AbortSignal
        ? ctx.signal
        : undefined;
    return withApiGuard(async () => {
      try {
        const blueprint = await scanToBlueprint({
          url: data.url,
          html: data.html,
          baseUrl: data.baseUrl,
          maxPages: data.maxPages,
          render: data.render,
          wayback: data.wayback,
          captureAssets: data.captureAssets,
          wpJetEngine: data.wpJetEngine,
          signal,
        });
        if (signal?.aborted) {
          return { ok: false as const, error: "Scan cancelled.", code: "ABORTED" };
        }
        const withTime: Blueprint = {
          ...blueprint,
          updatedAt: blueprint.updatedAt || new Date().toISOString(),
        };
        memory.set(withTime.id, withTime);
        if (memory.size > 40) {
          const first = memory.keys().next().value;
          if (first) memory.delete(first);
        }
        try {
          await saveBlueprintDb(withTime);
        } catch (err) {
          console.warn("[blueprint] DB save failed:", err);
        }
        return { ok: true as const, blueprint: withTime };
      } catch (err) {
        if (
          signal?.aborted ||
          (err instanceof Error &&
            (err.name === "AbortError" || /abort/i.test(err.message)))
        ) {
          return { ok: false as const, error: "Scan cancelled.", code: "ABORTED" };
        }
        return toApiError(err, "Scan failed for an unknown reason.");
      }
    });
  });

/** Runtime history backend — remote only when DATABASE_URL is set */
export const getHistoryBackend = createServerFn({ method: "GET" }).handler(
  async () => {
    const remote = isRemoteDb();
    return {
      remote,
      source: remote ? ("neon" as const) : ("local" as const),
    };
  },
);

export const getBlueprint = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    try {
      let bp = memory.get(data.id) ?? null;
      if (!bp) {
        try {
          bp = await loadBlueprintDb(data.id);
        } catch {
          bp = null;
        }
      }
      return { blueprint: bp };
    } catch (err) {
      console.error("[getBlueprint]", err);
      return { blueprint: null };
    }
  });

export const listBlueprints = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const items = await listBlueprintsDb(40);
      return {
        remote: isRemoteDb(),
        items: items.map((b) => ({
          id: b.id,
          title: b.title,
          sourceUrl: b.sourceUrl,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          tech: b.tech,
          contentHash: b.contentHash,
        })),
      };
    } catch {
      const items = [...memory.values()]
        .map((b) => ({
          id: b.id,
          title: b.meta.title || b.sourceUrl || "Untitled",
          sourceUrl: b.sourceUrl,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt || b.createdAt,
          tech: b.tech.map((t) => t.name),
          contentHash: b.contentHash,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { remote: isRemoteDb(), items };
    }
  },
);

export const upsertBlueprint = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ blueprint: z.any() }).parse(data),
  )
  .handler(async ({ data }) => {
    const bp = data.blueprint as Blueprint;
    if (!bp?.id) return { ok: false as const, error: "Invalid blueprint" };
    const withTime: Blueprint = {
      ...bp,
      updatedAt: bp.updatedAt || new Date().toISOString(),
    };
    memory.set(withTime.id, withTime);
    try {
      await saveBlueprintDb(withTime);
    } catch (err) {
      console.warn("[upsertBlueprint] DB save failed:", err);
      // Still ok if only memory — client treats remote flag separately
      if (isRemoteDb()) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "DB save failed",
        };
      }
    }
    return { ok: true as const };
  });

export const deleteBlueprint = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    memory.delete(data.id);
    try {
      await deleteBlueprintDb(data.id);
    } catch {
      /* ignore */
    }
    return { ok: true as const };
  });

export const clearBlueprints = createServerFn({ method: "POST" }).handler(
  async () => {
    memory.clear();
    try {
      await clearBlueprintsDb();
    } catch {
      /* ignore */
    }
    return { ok: true as const };
  },
);

export const compareBlueprintPair = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        leftId: z.string().min(1),
        rightId: z.string().min(1),
        left: z.any().optional(),
        right: z.any().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    let left =
      (data.left as Blueprint | undefined) ||
      memory.get(data.leftId) ||
      (await loadBlueprintDb(data.leftId).catch(() => null));
    let right =
      (data.right as Blueprint | undefined) ||
      memory.get(data.rightId) ||
      (await loadBlueprintDb(data.rightId).catch(() => null));
    if (!left || !right) {
      return { ok: false as const, error: "Blueprint not found" };
    }
    return { ok: true as const, result: compareBlueprints(left, right) };
  });
