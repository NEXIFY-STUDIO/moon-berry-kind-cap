/**
 * Deterministic Blueprint → RebuildSpec mapper.
 * Same blueprint always yields the same JSON (stable sorts, no random IDs).
 */

import type { Blueprint, DomOutlineNode } from "@/lib/blueprint/types";
import {
  REBUILD_SPEC_SCHEMA_VERSION,
  type ColorRole,
  type GapCategory,
  type LayoutRole,
  type RebuildSpec,
  parseRebuildSpec,
} from "./spec";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normHex(c: string): string | null {
  const s = c.trim();
  if (!HEX_RE.test(s)) return null;
  if (s.length === 4) {
    const r = s[1],
      g = s[2],
      b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return s.toLowerCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = normHex(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function relativeLuma(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function chromaApprox(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  return (max - min) / 255;
}

function colorDistance(a: string, b: string): number {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return 999;
  return Math.hypot(A.r - B.r, A.g - B.g, A.b - B.b);
}

/** Cluster similar hex colors; pick representative (median by channel). */
function clusterColors(
  colors: Array<{ value: string; source: string }>,
  threshold = 28,
): Array<{ value: string; sources: string[] }> {
  const clusters: Array<{ members: string[]; sources: Set<string> }> = [];
  for (const c of colors) {
    const hex = normHex(c.value) || c.value.trim().toLowerCase();
    let placed = false;
    for (const cl of clusters) {
      if (colorDistance(cl.members[0], hex) <= threshold) {
        cl.members.push(hex);
        cl.sources.add(c.source);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ members: [hex], sources: new Set([c.source]) });
    }
  }
  return clusters
    .map((cl) => {
      const sorted = [...cl.members].sort();
      const mid = sorted[Math.floor(sorted.length / 2)];
      return {
        value: mid,
        sources: [...cl.sources].sort(),
      };
    })
    .sort((a, b) => a.value.localeCompare(b.value));
}

function assignColorRoles(
  clusters: Array<{ value: string; sources: string[] }>,
  themeColor: string | null,
): RebuildSpec["designTokens"]["colors"] {
  if (!clusters.length) return [];

  const scored = clusters.map((c) => ({
    ...c,
    luma: relativeLuma(c.value),
    chroma: chromaApprox(c.value),
    isTheme:
      themeColor && normHex(themeColor)
        ? colorDistance(c.value, themeColor) < 20
        : /primary|accent|brand/i.test(c.sources.join(" ")),
  }));

  const byLuma = [...scored].sort((a, b) => a.luma - b.luma);
  const byChroma = [...scored].sort((a, b) => b.chroma - a.chroma);

  const used = new Set<string>();
  const pick = (
    role: ColorRole,
    candidates: typeof scored,
  ): { role: ColorRole; value: string; sources: string[] } | null => {
    for (const c of candidates) {
      if (used.has(c.value)) continue;
      used.add(c.value);
      return { role, value: c.value, sources: c.sources };
    }
    return null;
  };

  const out: RebuildSpec["designTokens"]["colors"] = [];
  const accent =
    pick(
      "accent",
      [
        ...scored.filter((s) => s.isTheme),
        ...byChroma.filter((s) => s.chroma > 0.12),
      ],
    ) || pick("accent", byChroma);

  const bg = pick("bg", byLuma);
  const text = pick("text", [...byLuma].reverse());
  const surface =
    pick(
      "surface",
      byLuma.filter((s) => !used.has(s.value)),
    ) || null;
  const muted =
    pick(
      "muted",
      [...scored].sort(
        (a, b) =>
          Math.abs(a.luma - 0.45) - Math.abs(b.luma - 0.45) ||
          a.chroma - b.chroma,
      ),
    ) || null;
  const border =
    pick(
      "border",
      [...scored].sort(
        (a, b) => Math.abs(a.luma - 0.35) - Math.abs(b.luma - 0.35),
      ),
    ) || null;

  for (const item of [bg, surface, text, muted, accent, border]) {
    if (item) out.push(item);
  }

  // stable role order
  const order: ColorRole[] = [
    "bg",
    "surface",
    "text",
    "muted",
    "accent",
    "border",
  ];
  out.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  return out;
}

function collectColors(bp: Blueprint): Array<{ value: string; source: string }> {
  const out: Array<{ value: string; source: string }> = [];
  for (const c of bp.design?.colors || []) {
    if (typeof c === "string" && c.trim()) {
      out.push({ value: c.trim(), source: "design.colors" });
    }
  }
  for (const [k, v] of Object.entries(bp.design?.cssVariables || {})) {
    if (typeof v === "string" && (HEX_RE.test(v.trim()) || /^rgba?\(/i.test(v))) {
      out.push({ value: v.trim(), source: `css:${k}` });
    }
  }
  for (const [k, v] of Object.entries(
    bp.design?.elementorGlobals?.colors || {},
  )) {
    if (typeof v === "string" && v.trim()) {
      out.push({ value: v.trim(), source: `elementor:${k}` });
    }
  }
  if (bp.meta?.themeColor) {
    out.push({ value: bp.meta.themeColor, source: "meta.themeColor" });
  }
  // deterministic order
  out.sort(
    (a, b) =>
      a.value.localeCompare(b.value) || a.source.localeCompare(b.source),
  );
  return out;
}

function inferSectionRole(
  label: string,
  index: number,
  total: number,
): LayoutRole {
  const s = label.toLowerCase();
  if (/nav|menu|header|logo/.test(s)) return "nav";
  if (/hero|banner|jumbo|splash|intro/.test(s)) return "hero";
  if (/footer|copyright/.test(s)) return "footer";
  if (/cta|call.to.action|subscribe|newsletter|pricing/.test(s)) return "cta";
  if (/grid|card|listing|gallery|features|products/.test(s)) return "grid";
  if (/form|contact|login|register|booking/.test(s)) return "form";
  if (/sidebar|aside/.test(s)) return "sidebar";
  if (index === 0) return "nav";
  if (index === 1) return "hero";
  if (index === total - 1 && total > 2) return "footer";
  return "content";
}

function walkOutline(
  nodes: DomOutlineNode[] | undefined,
  depth = 0,
  acc: Array<{ tag: string; text: string; role?: string; classes: string }> = [],
): typeof acc {
  if (!nodes || depth > 6) return acc;
  for (const n of nodes) {
    const text = (n.text || "").trim();
    const classes = (n.classes || []).join(" ");
    if (
      ["header", "nav", "main", "section", "footer", "aside", "form"].includes(
        n.tag,
      ) ||
      n.role ||
      /hero|nav|footer|cta|grid|card/i.test(classes)
    ) {
      acc.push({
        tag: n.tag,
        text: text.slice(0, 80),
        role: n.role,
        classes,
      });
    }
    if (n.children?.length) walkOutline(n.children, depth + 1, acc);
  }
  return acc;
}

function buildLayout(bp: Blueprint): RebuildSpec["layout"] {
  const outlineHits = walkOutline(bp.outline);
  const headings = (bp.headings || []).map((h) => ({
    level: h.level,
    text: (h.text || "").trim().slice(0, 120),
  }));

  type Sec = RebuildSpec["layout"]["sections"][number];
  const sections: Sec[] = [];

  if (outlineHits.length) {
    outlineHits.slice(0, 16).forEach((hit, i, arr) => {
      const label =
        hit.text ||
        hit.role ||
        hit.classes.split(/\s+/).find(Boolean) ||
        hit.tag;
      const role = inferSectionRole(
        `${hit.tag} ${hit.role || ""} ${hit.classes} ${hit.text}`,
        i,
        arr.length,
      );
      sections.push({
        id: `sec-${String(i + 1).padStart(2, "0")}`,
        role,
        order: i,
        label: label.slice(0, 80) || hit.tag,
        headings: headings
          .filter((h) => h.level <= 2)
          .slice(0, 3)
          .map((h) => h.text)
          .filter(Boolean),
        breakpointHints: [],
      });
    });
  } else if (headings.length) {
    // fallback: group by h1/h2
    const tops = headings.filter((h) => h.level <= 2).slice(0, 12);
    tops.forEach((h, i, arr) => {
      sections.push({
        id: `sec-${String(i + 1).padStart(2, "0")}`,
        role: inferSectionRole(h.text, i, arr.length),
        order: i,
        label: h.text || `Section ${i + 1}`,
        headings: [h.text].filter(Boolean),
        breakpointHints: [],
      });
    });
  }

  // ensure nav from internal links if missing
  const hasNav = sections.some((s) => s.role === "nav");
  const navLinks = (bp.links || []).filter((l) => l.internal).slice(0, 8);
  if (!hasNav && navLinks.length >= 2) {
    sections.unshift({
      id: "sec-00",
      role: "nav",
      order: 0,
      label: "Primary navigation",
      headings: navLinks.map((l) => l.text || l.href).filter(Boolean),
      breakpointHints: ["collapse-to-menu-on-mobile-unknown"],
    });
    sections.forEach((s, i) => {
      s.order = i;
      if (s.id !== "sec-00") {
        s.id = `sec-${String(i).padStart(2, "0")}`;
      }
    });
  }

  return {
    sections: sections
      .map((s, i) => ({ ...s, order: i }))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  };
}

function buildComponents(bp: Blueprint): RebuildSpec["components"] {
  const comps: RebuildSpec["components"] = [];

  // Forms as components
  const forms = [...(bp.forms || [])].sort((a, b) =>
    (a.category || a.action || "").localeCompare(b.category || b.action || ""),
  );
  const formGroups = new Map<string, typeof forms>();
  for (const f of forms) {
    const key = f.category || "form";
    const list = formGroups.get(key) || [];
    list.push(f);
    formGroups.set(key, list);
  }
  for (const key of [...formGroups.keys()].sort()) {
    const list = formGroups.get(key)!;
    const fieldNames = [
      ...new Set(list.flatMap((f) => (f.fields || []).map((x) => x.name))),
    ].sort();
    comps.push({
      id: `comp-form-${key}`,
      name: `${key} form`,
      kind: "form",
      instances: list.length,
      varyingProps: fieldNames,
      sample: {
        method: list[0].method || "post",
        action: list[0].action || "",
        category: key,
      },
    });
  }

  // Cards / listing from WP jet listing if present
  const listingCount = bp.wordpress?.listingGrids?.length || 0;
  if (listingCount > 0) {
    comps.push({
      id: "comp-listing-grid",
      name: "Listing grid",
      kind: "grid",
      instances: listingCount,
      varyingProps: ["title", "image", "meta", "permalink"],
    });
  }

  // Buttons inferred from headings + links count
  const externalCtas = (bp.links || [])
    .filter((l) => !l.internal && (l.text || "").length < 40)
    .slice(0, 6);
  if (externalCtas.length >= 2) {
    comps.push({
      id: "comp-cta-link",
      name: "CTA link",
      kind: "link",
      instances: externalCtas.length,
      varyingProps: ["href", "label"],
      sample: {
        label: externalCtas[0].text || "",
        href: externalCtas[0].href,
      },
    });
  }

  return comps.sort((a, b) => a.id.localeCompare(b.id));
}

function buildContent(bp: Blueprint): RebuildSpec["content"] {
  const texts: RebuildSpec["content"]["texts"] = [];
  if (bp.meta?.title) {
    texts.push({ slot: "meta.title", text: bp.meta.title });
  }
  if (bp.meta?.description) {
    texts.push({ slot: "meta.description", text: bp.meta.description });
  }
  (bp.headings || []).slice(0, 20).forEach((h, i) => {
    if (!h.text?.trim()) return;
    texts.push({
      slot: `heading.h${h.level}.${String(i + 1).padStart(2, "0")}`,
      text: h.text.trim().slice(0, 200),
    });
  });
  (bp.links || [])
    .filter((l) => l.internal && l.text?.trim())
    .slice(0, 16)
    .forEach((l, i) => {
      texts.push({
        slot: `nav.link.${String(i + 1).padStart(2, "0")}`,
        text: l.text.trim().slice(0, 80),
      });
    });
  texts.sort((a, b) => a.slot.localeCompare(b.slot));

  const images: RebuildSpec["content"]["images"] = [];
  const imgAssets = (bp.assets || [])
    .filter((a) => a.type === "image" || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(a.url))
    .slice()
    .sort((a, b) => a.url.localeCompare(b.url));
  imgAssets.slice(0, 24).forEach((a, i) => {
    images.push({
      slot: `image.${String(i + 1).padStart(2, "0")}`,
      url: a.url,
    });
  });
  for (const u of bp.design?.fullImageUrls || []) {
    if (!images.some((im) => im.url === u)) {
      images.push({
        slot: `image.full.${String(images.length + 1).padStart(2, "0")}`,
        url: u,
      });
    }
  }
  images.sort((a, b) => a.slot.localeCompare(b.slot));

  return { texts, images };
}

function buildGaps(bp: Blueprint, partial: {
  hasColors: boolean;
  hasFonts: boolean;
  hasSections: boolean;
  hasImages: boolean;
  hasTypography: boolean;
}): RebuildSpec["gaps"] {
  const gaps: RebuildSpec["gaps"] = [];
  const add = (
    id: string,
    category: GapCategory,
    code: string,
    message: string,
  ) => {
    gaps.push({ id, category, code, message });
  };

  // Always-unknown runtime concerns (scanner cannot observe)
  add(
    "gap-hover",
    "hover",
    "NO_HOVER_STATES",
    "Hover / focus / active styles are not captured — do not invent fancy micro-interactions.",
  );
  add(
    "gap-js",
    "js_behavior",
    "NO_JS_BEHAVIOR",
    "Client-side JS behavior (modals, carousels, filters) is unknown — keep static structure only.",
  );
  add(
    "gap-api",
    "api",
    "NO_API",
    "No API contracts or endpoints were reverse-engineered — do not invent fetch URLs or schemas.",
  );
  add(
    "gap-auth",
    "auth",
    "NO_AUTH",
    "Auth flows are not verified — do not invent login providers, tokens, or session rules.",
  );
  add(
    "gap-routing",
    "routing",
    "NO_ROUTING",
    "App Router / client routes beyond crawled URLs are unknown — only use listed paths.",
  );

  if (bp.isThinHtml) {
    add(
      "gap-thin",
      "layout",
      "THIN_HTML",
      "SPA shell / thin HTML detected — DOM content is incomplete without headless render.",
    );
  }
  if (!partial.hasColors) {
    add(
      "gap-colors",
      "other",
      "NO_COLORS",
      "No reliable color tokens extracted — design tokens incomplete.",
    );
  }
  if (!partial.hasFonts) {
    add(
      "gap-fonts",
      "typography",
      "NO_FONTS",
      "No font-family / @font-face signals — typography stack incomplete.",
    );
  }
  if (!partial.hasTypography) {
    add(
      "gap-type-scale",
      "typography",
      "NO_TYPE_SCALE",
      "No measured type scale (h1–body sizes) — only generic scale can be inferred.",
    );
  }
  if (!partial.hasSections) {
    add(
      "gap-layout",
      "layout",
      "NO_SECTIONS",
      "No clear page sections from outline/headings.",
    );
  }
  if (!partial.hasImages) {
    add(
      "gap-media",
      "media",
      "NO_IMAGES",
      "No image assets captured — media slots empty.",
    );
  }
  if (!(bp.forms || []).length) {
    add(
      "gap-forms",
      "data",
      "NO_FORMS",
      "No forms detected — interactive form fields unknown.",
    );
  }
  if (!(bp.cssBundles || []).length && !(bp.stylesheets || []).length) {
    add(
      "gap-css",
      "other",
      "NO_CSS",
      "No CSS bundles captured — visual fidelity will be low.",
    );
  }

  return gaps.sort((a, b) => a.id.localeCompare(b.id));
}

function buildTypography(bp: Blueprint): RebuildSpec["designTokens"]["typography"] {
  const fonts = [
    ...new Set(
      (bp.design?.fonts || [])
        .map((f) => f.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const rows = [...(bp.design?.typography || [])].sort((a, b) =>
    a.selector.localeCompare(b.selector),
  );
  const scale = rows.map((t) => ({
    step: t.selector,
    fontSize: t.fontSize,
    fontWeight: t.fontWeight,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    fontFamily: t.fontFamily,
  }));

  return { fontFamilies: fonts, scale };
}

/**
 * Map any blueprint (including partial / legacy) → validated RebuildSpec.
 * Never throws for missing optional fields.
 */
export function blueprintToRebuildSpec(bp: Blueprint): RebuildSpec {
  const safe: Blueprint = {
    ...bp,
    id: bp.id || "unknown",
    meta: bp.meta || {
      title: "",
      description: "",
      canonical: null,
      language: null,
      robots: null,
      og: {},
      twitter: {},
      icons: [],
      themeColor: null,
      viewport: null,
    },
    design: bp.design || {
      colors: [],
      fonts: [],
      cssVariables: {},
      borderRadii: [],
      shadows: [],
      spacingHints: [],
    },
    tech: bp.tech || [],
    assets: bp.assets || [],
    links: bp.links || [],
    forms: bp.forms || [],
    headings: bp.headings || [],
    outline: bp.outline || [],
    pages: bp.pages || [],
    notes: bp.notes || [],
    limitations: bp.limitations || [],
  };

  const colorClusters = clusterColors(collectColors(safe));
  const colors = assignColorRoles(colorClusters, safe.meta.themeColor);
  const typography = buildTypography(safe);
  const layout = buildLayout(safe);
  const components = buildComponents(safe);
  const content = buildContent(safe);

  const spacing = [
    ...new Set(
      (safe.design.spacingHints || [])
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 16);

  const radii = [
    ...new Set(
      (safe.design.borderRadii || []).map((r) => r.trim()).filter(Boolean),
    ),
  ]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 12);

  const shadows = [
    ...new Set(
      (safe.design.shadows || []).map((s) => s.trim()).filter(Boolean),
    ),
  ]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8);

  const gaps = buildGaps(safe, {
    hasColors: colors.length > 0,
    hasFonts: typography.fontFamilies.length > 0,
    hasSections: layout.sections.length > 0,
    hasImages: content.images.length > 0,
    hasTypography: typography.scale.length > 0,
  });

  const tech = [...(safe.tech || [])]
    .map((t) => ({
      name: t.name,
      confidence: t.confidence,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const raw: RebuildSpec = {
    schemaVersion: REBUILD_SPEC_SCHEMA_VERSION,
    id: `rebuild_${safe.id}`,
    source: {
      blueprintId: safe.id,
      sourceUrl: safe.sourceUrl ?? null,
      finalUrl: safe.finalUrl ?? null,
      title: safe.meta.title || "",
      description: safe.meta.description || "",
      language: safe.meta.language ?? null,
      isThinHtml: Boolean(safe.isThinHtml),
      tech,
    },
    designTokens: {
      colors,
      typography,
      spacing,
      radii,
      shadows,
    },
    layout,
    components,
    content,
    gaps,
  };

  // Validate (throws only if our mapper is wrong — not on input shape)
  return parseRebuildSpec(raw);
}
