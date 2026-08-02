import { getSql } from "@/lib/db";
import type { Blueprint } from "./types";

export type DbBlueprintSummary = {
  id: string;
  title: string;
  sourceUrl: string | null;
  contentHash: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  tech: string[];
  ownerId: string | null;
};

function toIso(v: string | Date | null | undefined, fallback: string): string {
  if (!v) return fallback;
  if (typeof v === "string") return v;
  try {
    return new Date(v).toISOString();
  } catch {
    return fallback;
  }
}

function techFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const tech = (payload as Blueprint).tech;
  if (!Array.isArray(tech)) return [];
  return tech
    .map((t) => (t && typeof t === "object" ? String((t as { name?: string }).name || "") : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function slimBlueprint(bp: Blueprint): Blueprint {
  return {
    ...bp,
    assets: bp.assets.map((a) =>
      a.base64 && a.base64.length > 50_000
        ? { ...a, base64: undefined, captured: a.captured }
        : a,
    ),
  };
}

export async function saveBlueprintDb(bp: Blueprint): Promise<void> {
  const sql = await getSql();
  const slim = slimBlueprint(bp);
  const updatedAt = bp.updatedAt || bp.createdAt || new Date().toISOString();
  await sql`
    insert into blueprints (
      id, title, source_url, content_hash, source,
      created_at, updated_at, owner_id, payload
    )
    values (
      ${bp.id},
      ${bp.meta.title || bp.id},
      ${bp.sourceUrl},
      ${bp.contentHash},
      ${bp.source},
      ${bp.createdAt}::timestamptz,
      ${updatedAt}::timestamptz,
      ${null},
      ${JSON.stringify(slim)}::jsonb
    )
    on conflict (id) do update set
      title = excluded.title,
      source_url = excluded.source_url,
      content_hash = excluded.content_hash,
      source = excluded.source,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `;
}

export async function listBlueprintsDb(limit = 40): Promise<DbBlueprintSummary[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    title: string;
    source_url: string | null;
    content_hash: string;
    source: string;
    created_at: string | Date;
    updated_at: string | Date | null;
    owner_id: string | null;
    payload: Blueprint | string | null;
  }>`
    select
      id, title, source_url, content_hash, source,
      created_at, updated_at, owner_id, payload
    from blueprints
    order by coalesce(updated_at, created_at) desc
    limit ${limit}
  `;
  return rows.map((r) => {
    const createdAt = toIso(r.created_at, new Date(0).toISOString());
    const payload =
      typeof r.payload === "string"
        ? (JSON.parse(r.payload) as Blueprint)
        : r.payload;
    return {
      id: r.id,
      title: r.title,
      sourceUrl: r.source_url,
      contentHash: r.content_hash,
      source: r.source,
      createdAt,
      updatedAt: toIso(r.updated_at, createdAt),
      tech: techFromPayload(payload),
      ownerId: r.owner_id ?? null,
    };
  });
}

export async function loadBlueprintDb(id: string): Promise<Blueprint | null> {
  const sql = await getSql();
  const rows = await sql<{ payload: Blueprint | string }>`
    select payload from blueprints where id = ${id} limit 1
  `;
  if (!rows[0]) return null;
  const p = rows[0].payload;
  return typeof p === "string" ? (JSON.parse(p) as Blueprint) : p;
}

export async function deleteBlueprintDb(id: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from blueprints where id = ${id}`;
}

export async function clearBlueprintsDb(): Promise<void> {
  const sql = await getSql();
  await sql`delete from blueprints`;
}
