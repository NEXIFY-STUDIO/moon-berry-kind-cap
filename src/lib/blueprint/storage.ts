import type { Blueprint } from "./types";
import { safeJsonStringify } from "@/lib/scanner/assets";
import {
  compileElementorFromBlueprint,
  exportElementorTemplateJson,
  exportElementorTemplateJsonWithMeta,
} from "./elementor-compiler";

const KEY = "blueprint.vault.v1";
/** Soft budget for localStorage vault (~4 MB UTF-16-ish estimate uses 2×) */
export const LOCAL_VAULT_BUDGET_CHARS = 2_000_000;
/** Never keep more than this many full/slim records */
export const LOCAL_VAULT_MAX_ITEMS = 40;

export type BlueprintSummary = {
  id: string;
  title: string;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt?: string;
  tech: string[];
  contentHash: string;
  /** Full body lives only on remote DB; local is a stub/slim */
  remoteOnly?: boolean;
};

export type LocalVaultRecord = {
  blueprint: Blueprint;
  updatedAt: string;
  remoteOnly?: boolean;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function stamp(bp: Blueprint): string {
  return bp.updatedAt || bp.createdAt || new Date(0).toISOString();
}

function slimForLocal(bp: Blueprint): Blueprint {
  return {
    ...bp,
    assets: bp.assets.map(({ base64, ...rest }) => rest),
    // keep html but cap extreme sizes
    html: bp.html.length > 400_000 ? bp.html.slice(0, 400_000) : bp.html,
    cssBundles: bp.cssBundles.map((b) => ({
      ...b,
      css: b.css.length > 200_000 ? b.css.slice(0, 200_000) : b.css,
    })),
  };
}

function estimateSize(records: LocalVaultRecord[]): number {
  try {
    return JSON.stringify(records).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function toSummary(rec: LocalVaultRecord): BlueprintSummary {
  const bp = rec.blueprint;
  return {
    id: bp.id,
    title: bp.meta.title || bp.sourceUrl || "Untitled",
    sourceUrl: bp.sourceUrl,
    createdAt: bp.createdAt,
    updatedAt: rec.updatedAt,
    tech: bp.tech.map((t) => t.name),
    contentHash: bp.contentHash,
    remoteOnly: rec.remoteOnly || undefined,
  };
}

function readRecords(): LocalVaultRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Legacy: Blueprint[] without wrapper
    return parsed.map((item) => {
      if (item && typeof item === "object" && "blueprint" in item) {
        const rec = item as LocalVaultRecord;
        return {
          blueprint: rec.blueprint,
          updatedAt: rec.updatedAt || stamp(rec.blueprint),
          remoteOnly: rec.remoteOnly,
        };
      }
      const bp = item as Blueprint;
      return { blueprint: bp, updatedAt: stamp(bp), remoteOnly: false };
    });
  } catch {
    return [];
  }
}

/**
 * Persist records with size-based LRU eviction.
 * Never throws QuotaExceededError to callers — shrinks until write succeeds.
 */
function writeRecords(records: LocalVaultRecord[]): {
  ok: boolean;
  evicted: number;
  remoteOnlyForced: string[];
} {
  if (!isBrowser()) return { ok: true, evicted: 0, remoteOnlyForced: [] };

  // newest first
  let next = [...records].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  if (next.length > LOCAL_VAULT_MAX_ITEMS) {
    next = next.slice(0, LOCAL_VAULT_MAX_ITEMS);
  }

  let evicted = 0;
  const remoteOnlyForced: string[] = [];

  // Fit budget by slimming oldest, then dropping
  const fitBudget = () => {
    while (next.length > 1 && estimateSize(next) > LOCAL_VAULT_BUDGET_CHARS) {
      // slim oldest full records first
      let slimmed = false;
      for (let i = next.length - 1; i >= 0; i--) {
        const r = next[i];
        if (!r.remoteOnly && estimateSize([r]) > 50_000) {
          next[i] = {
            ...r,
            blueprint: slimForLocal(r.blueprint),
            remoteOnly: true,
          };
          remoteOnlyForced.push(r.blueprint.id);
          slimmed = true;
          break;
        }
      }
      if (slimmed) continue;
      next.pop();
      evicted += 1;
    }
  };

  fitBudget();

  const tryWrite = (payload: LocalVaultRecord[]): boolean => {
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      const msg = e instanceof Error ? e.message : String(e);
      if (
        name === "QuotaExceededError" ||
        /quota/i.test(msg) ||
        /exceeded/i.test(msg)
      ) {
        return false;
      }
      // other errors — swallow
      return false;
    }
  };

  if (tryWrite(next)) return { ok: true, evicted, remoteOnlyForced };

  // Aggressive shrink on QuotaExceededError
  while (next.length > 0) {
    // convert all to slim remoteOnly stubs
    next = next.map((r) => ({
      ...r,
      blueprint: slimForLocal(r.blueprint),
      remoteOnly: true,
    }));
    if (tryWrite(next)) {
      return { ok: true, evicted, remoteOnlyForced: next.map((r) => r.blueprint.id) };
    }
    next.pop();
    evicted += 1;
  }

  // last resort: clear key
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return { ok: false, evicted, remoteOnlyForced };
}

export function readLocalRecords(): LocalVaultRecord[] {
  return readRecords();
}

export function writeLocalRecords(records: LocalVaultRecord[]) {
  return writeRecords(records);
}

export function saveBlueprintLocal(
  bp: Blueprint,
  opts?: { remoteOnly?: boolean },
): { ok: boolean; remoteOnly: boolean } {
  const updatedAt = bp.updatedAt || new Date().toISOString();
  const withTime: Blueprint = { ...bp, updatedAt };
  const all = readRecords().filter((r) => r.blueprint.id !== bp.id);
  const remoteOnly = Boolean(opts?.remoteOnly);
  const record: LocalVaultRecord = {
    blueprint: remoteOnly ? slimForLocal(withTime) : withTime,
    updatedAt,
    remoteOnly,
  };
  // If huge, force slim
  const size = estimateSize([record]);
  if (size > LOCAL_VAULT_BUDGET_CHARS * 0.6) {
    record.blueprint = slimForLocal(withTime);
    record.remoteOnly = true;
  }
  all.unshift(record);
  const result = writeRecords(all);
  return {
    ok: result.ok,
    remoteOnly: Boolean(record.remoteOnly || result.remoteOnlyForced.includes(bp.id)),
  };
}

export function listLocalBlueprints(): BlueprintSummary[] {
  return readRecords()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toSummary);
}

export function loadLocalBlueprint(id: string): Blueprint | null {
  return readRecords().find((r) => r.blueprint.id === id)?.blueprint ?? null;
}

export function getLocalRecord(id: string): LocalVaultRecord | null {
  return readRecords().find((r) => r.blueprint.id === id) ?? null;
}

export function deleteLocalBlueprint(id: string) {
  writeRecords(readRecords().filter((r) => r.blueprint.id !== id));
}

export function clearLocalBlueprints() {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    try {
      writeRecords([]);
    } catch {
      /* ignore */
    }
  }
}

export function exportBlueprintJson(bp: Blueprint): string {
  return safeJsonStringify(bp, 2);
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  triggerBlobDownload(blob, filename);
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type PreparedExport = {
  kind: "json" | "elementor" | "zip";
  filename: string;
  mime: string;
  size: number;
  blob: Blob;
  meta?: { widgetCount?: number };
};

export function prepareJsonExport(bp: Blueprint): PreparedExport {
  const content = exportBlueprintJson(bp);
  const blob = new Blob([content], { type: "application/json" });
  return {
    kind: "json",
    filename: `${bp.id}.json`,
    mime: "application/json",
    size: blob.size,
    blob,
  };
}

export function prepareElementorExport(bp: Blueprint): PreparedExport {
  const tpl = bp.elementorTemplate || compileElementorFromBlueprint(bp);
  const content = exportElementorTemplateJson(tpl);
  const blob = new Blob([content], { type: "application/json" });
  return {
    kind: "elementor",
    filename: "elementor-template-import.json",
    mime: "application/json",
    size: blob.size,
    blob,
    meta: { widgetCount: tpl._blueprint?.widgetCount },
  };
}

export async function prepareZipExport(
  bp: Blueprint,
  onStep?: (step: "collect" | "zip" | "blob") => void,
): Promise<PreparedExport> {
  onStep?.("collect");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const slimAssets = bp.assets.map(({ base64, ...rest }) => rest);
  zip.file(
    "blueprint.json",
    JSON.stringify({ ...bp, assets: slimAssets }, null, 2),
  );
  zip.file("index.html", bp.html);
  zip.file(
    "README.md",
    [
      `# ${bp.meta.title || bp.id}`,
      "",
      `- ID: \`${bp.id}\``,
      `- Source: ${bp.sourceUrl ?? "HTML paste"}`,
      `- Version: ${bp.version}`,
      `- Created: ${bp.createdAt}`,
      `- Content hash: \`${bp.contentHash}\``,
      `- Pages: ${bp.stats?.pageCount ?? 1}`,
      `- Rendered: ${bp.rendered ? "yes" : "no"}`,
      bp.waybackUrl ? `- Wayback: ${bp.waybackUrl}` : "",
      "",
      "## Elementor",
      "- Import file: `elementor-template-import.json`",
      "- WP: Templates → Saved Templates → Import Templates",
      "",
      "## Limitations",
      ...(bp.limitations || []).map((l) => `- ${l}`),
      "",
      "## Tech",
      ...bp.tech.map((t) => `- ${t.name} (${t.confidence}): ${t.evidence}`),
      "",
      "## Pages",
      `- primary: ${bp.finalUrl || bp.sourceUrl || "—"}`,
      ...(bp.pages || []).map((p) => `- ${p.url} — ${p.title || "(no title)"}`),
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const cssDir = zip.folder("css");
  bp.cssBundles.forEach((b, i) => {
    const name = b.url.startsWith("inline:")
      ? `inline-${i + 1}.css`
      : `sheet-${i + 1}.css`;
    cssDir?.file(name, b.css);
  });

  for (const a of bp.assets) {
    if (!a.captured || !a.base64 || !a.path) continue;
    try {
      zip.file(a.path, base64ToUint8(a.base64));
    } catch {
      /* skip */
    }
  }

  if (bp.pages?.length) {
    zip.file("pages.json", JSON.stringify(bp.pages, null, 2));
  }

  try {
    const tpl = bp.elementorTemplate || compileElementorFromBlueprint(bp);
    zip.file(
      "elementor-template-import.json",
      exportElementorTemplateJson(tpl),
    );
    zip.file(
      "elementor-template-with-meta.json",
      exportElementorTemplateJsonWithMeta(tpl),
    );
  } catch {
    /* skip */
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        id: bp.id,
        title: bp.meta.title,
        sourceUrl: bp.sourceUrl,
        version: bp.version,
        options: bp.options,
        assets: slimAssets,
        design: bp.design,
        tech: bp.tech,
        pages: bp.pages,
        hasElementorTemplate: Boolean(bp.elementorTemplate),
      },
      null,
      2,
    ),
  );

  onStep?.("zip");
  const blob = await zip.generateAsync({ type: "blob" });
  onStep?.("blob");
  return {
    kind: "zip",
    filename: `${bp.id}.zip`,
    mime: "application/zip",
    size: blob.size,
    blob,
  };
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function downloadElementorTemplate(bp: Blueprint) {
  const prepared = prepareElementorExport(bp);
  triggerBlobDownload(prepared.blob, prepared.filename);
  const tpl = bp.elementorTemplate || compileElementorFromBlueprint(bp);
  return tpl;
}

export async function exportBlueprintZip(bp: Blueprint) {
  const prepared = await prepareZipExport(bp);
  triggerBlobDownload(prepared.blob, prepared.filename);
}
