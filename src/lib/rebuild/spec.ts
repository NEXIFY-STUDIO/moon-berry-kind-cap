import { z } from "zod";

/** Current RebuildSpec schema — bump when breaking fields change */
export const REBUILD_SPEC_SCHEMA_VERSION = "1.0.0" as const;

export const ColorRoleSchema = z.enum([
  "bg",
  "surface",
  "text",
  "muted",
  "accent",
  "border",
]);
export type ColorRole = z.infer<typeof ColorRoleSchema>;

export const LayoutRoleSchema = z.enum([
  "nav",
  "hero",
  "grid",
  "cta",
  "footer",
  "form",
  "content",
  "sidebar",
  "unknown",
]);
export type LayoutRole = z.infer<typeof LayoutRoleSchema>;

export const GapCategorySchema = z.enum([
  "interaction",
  "hover",
  "js_behavior",
  "api",
  "routing",
  "auth",
  "media",
  "typography",
  "layout",
  "data",
  "other",
]);
export type GapCategory = z.infer<typeof GapCategorySchema>;

export const RebuildSpecSchema = z.object({
  schemaVersion: z.literal(REBUILD_SPEC_SCHEMA_VERSION),
  id: z.string(),
  source: z.object({
    blueprintId: z.string(),
    sourceUrl: z.string().nullable(),
    finalUrl: z.string().nullable(),
    title: z.string(),
    description: z.string(),
    language: z.string().nullable(),
    isThinHtml: z.boolean(),
    tech: z.array(
      z.object({
        name: z.string(),
        confidence: z.string(),
      }),
    ),
  }),
  designTokens: z.object({
    colors: z.array(
      z.object({
        role: ColorRoleSchema,
        value: z.string(),
        sources: z.array(z.string()),
      }),
    ),
    typography: z.object({
      fontFamilies: z.array(z.string()),
      scale: z.array(
        z.object({
          step: z.string(),
          fontSize: z.string().nullable(),
          fontWeight: z.string().nullable(),
          lineHeight: z.string().nullable(),
          letterSpacing: z.string().nullable(),
          fontFamily: z.string().nullable(),
        }),
      ),
    }),
    spacing: z.array(z.string()),
    radii: z.array(z.string()),
    shadows: z.array(z.string()),
  }),
  layout: z.object({
    sections: z.array(
      z.object({
        id: z.string(),
        role: LayoutRoleSchema,
        order: z.number().int().nonnegative(),
        label: z.string(),
        headings: z.array(z.string()),
        breakpointHints: z.array(z.string()),
      }),
    ),
  }),
  components: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      instances: z.number().int().positive(),
      varyingProps: z.array(z.string()),
      sample: z.record(z.string(), z.string()).optional(),
    }),
  ),
  content: z.object({
    texts: z.array(
      z.object({
        slot: z.string(),
        text: z.string(),
      }),
    ),
    images: z.array(
      z.object({
        slot: z.string(),
        url: z.string(),
        alt: z.string().optional(),
      }),
    ),
  }),
  gaps: z.array(
    z.object({
      id: z.string(),
      category: GapCategorySchema,
      message: z.string(),
      /** Machine key for completeness / fix hints */
      code: z.string(),
    }),
  ),
});

export type RebuildSpec = z.infer<typeof RebuildSpecSchema>;

/** Stable JSON for snapshots & downloads (sorted keys, no random order). */
export function stableStringify(value: unknown, space = 2): string {
  return JSON.stringify(sortValue(value), null, space) + "\n";
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortValue(obj[k]);
    }
    return out;
  }
  return v;
}

export function parseRebuildSpec(raw: unknown): RebuildSpec {
  return RebuildSpecSchema.parse(raw);
}

/** Soft parse — never throws; returns null on invalid */
export function safeParseRebuildSpec(raw: unknown): RebuildSpec | null {
  const r = RebuildSpecSchema.safeParse(raw);
  return r.success ? r.data : null;
}
