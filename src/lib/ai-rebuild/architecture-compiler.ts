/**
 * SPA-Aware UI Architecture Compiler prompt builder.
 * Produces the high-signal REVERSPEC-style brief that upgrades AI Rebuild
 * from generic token dump → component tree + interaction model.
 */

import type { Blueprint } from "@/lib/blueprint/types";
import { extractPrimarySecondary } from "./prompter";

export type ArchitectureCompilerOptions = {
  focus?: "product_shell" | "full";
  depth?: "deep" | "shallow";
  thinHtmlMode?: "aggressive" | "normal";
};

export type ArchitectureCompilerPrompt = {
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
  evidence: ArchitectureEvidence;
  meta: {
    thinHtml: boolean;
    routeCandidates: number;
    componentHints: number;
    formCount: number;
    techCount: number;
  };
};

/** Slim, high-signal evidence (no base64 / CSS dump / full HTML). */
export type ArchitectureEvidence = {
  blueprintId: string;
  sourceUrl: string | null;
  finalUrl: string | null;
  isThinHtml: boolean;
  thinHtmlReasons: string[];
  meta: {
    title: string;
    description: string;
    language: string | null;
    themeColor: string | null;
  };
  tech: Array<{ name: string; confidence: string; evidence: string }>;
  design: {
    primary: string | null;
    secondary: string | null;
    palette: string[];
    fonts: string[];
    cssVariables: Record<string, string>;
    borderRadii: string[];
    typography: Array<{
      selector: string;
      fontFamily: string | null;
      fontSize: string | null;
      fontWeight: string | null;
      lineHeight: string | null;
      letterSpacing: string | null;
    }>;
  };
  headings: Array<{ level: number; text: string }>;
  links: {
    internal: Array<{ href: string; text: string }>;
    externalSample: Array<{ href: string; text: string }>;
  };
  forms: Array<{
    action: string;
    method: string;
    category?: string;
    fields: Array<{ name: string; type: string; required: boolean; placeholder?: string }>;
  }>;
  pages: Array<{
    url: string;
    title: string;
    headings: Array<{ level: number; text: string }>;
  }>;
  outlineSample: unknown;
  wordpressHints: {
    isWordPress: boolean;
    isJetEngine: boolean;
    isElementor: boolean;
    listingGridCount: number;
    cctTypeSlugs: string[];
    dynamicFieldCount: number;
  } | null;
  notes: string[];
  limitations: string[];
  partialErrors: Array<{ stage: string; message: string }>;
};

/** Exact system prompt from product spec (SPA-Aware UI Architecture Compiler). */
export const ARCHITECTURE_SYSTEM_PROMPT = `# ROLE
You are a senior product reverse-engineer + UI systems architect.
Task: from Blueprint JSON (and optionally raw HTML) produce a HIGH-SIGNAL UI ARCHITECTURE SPEC
that can rebuild the real app shell — not a generic landing page.

# REALITY
- You are not cloning backend/DB/auth secrets.
- If blueprint.isThinHtml === true, explicitly reconstruct the shell from tech signals,
  internal links, headings and form patterns — do not return empty "Loading…".
- Goal: 80–90% of the public UI + interaction model.

# OPTIONS
  focus: product_shell   # home + core app routes before marketing noise
  depth: deep
  thinHtmlMode: aggressive | normal

# PIPELINE (in this order)

## 1) PRODUCT IDENTITY
- name, oneLiner, category
- primaryUserGoal (1 sentence)
- authGate: what is visible without login vs behind Sign in
- originHints (GitHub, "Deploy your own", clone URL) if present

## 2) ROUTE MAP
For each relevant path:
- path, purpose (shell | feature | marketing | legal)
- priority: core | secondary | noise
- dominantUI (1 sentence)
- keyHeadings (max 8)

## 3) COMPONENT TREE (required, not "div/body")
For each core component include:
- name (PascalCase)
- role (nav | hero | listing-grid | form | sidebar | footer | modal | empty-state …)
- propsSignals (what can be inferred from DOM: title, items[], ctaLabel, imageUrl …)
- children[]
- repeated: true/false (listing item template)
- dataSourceHint (static | jet-listing | rest | client-fetch | unknown)

## 4) INTERACTION MODEL
- happyPath: user steps from entry to primary goal
- authGated: what disappears / redirects without session
- navigation: main CTAs and internal routes
- states: loading | empty | error | success surfaces (if in DOM or logically required)

## 5) DESIGN BINDING
- 4–8 key tokens (primary, surface, text, accent, radius, font)
- typography scale (h1/h2/body/button) from blueprint.design.typography if present
- DO NOT dump --tw-* utility lists

## 6) REBUILD ORDER (5 steps)
Exact implementation order for Next.js App Router + Tailwind.

# OUTPUT (only this, in order)

1) JSON:
{
  "id": "UIARCH_<slug>_<timestamp>",
  "version": "1.0.0",
  "product": { "name": "", "oneLiner": "", "category": "", "primaryUserGoal": "", "authGate": "" },
  "routes": [],
  "components": [],
  "interactions": { "happyPath": [], "authGated": [], "navigation": [], "states": [] },
  "designBinding": { "tokens": {}, "typography": [] },
  "rebuildOrder": [],
  "gaps": [],
  "thinHtmlNotes": []
}

2) HUMAN SUMMARY (EN, max 12 lines)
- what it is
- core shell (3–5 components)
- top 3 gaps
- 5 rebuild steps

# QUALITY BAR — FAIL if:
- components[] is empty or only "Page/Div"
- summary without UI block names
- legal/marketing pages rank above product shell
- JSON contains CSS dump / base64

# START
Confirm receipt of Blueprint evidence in 1 line, then run the pipeline with no further questions.`;


function slimOutline(node: unknown, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 3) return undefined;
  const n = node as {
    tag?: string;
    id?: string;
    classes?: string[];
    role?: string;
    text?: string;
    children?: unknown[];
  };
  const out: Record<string, unknown> = {
    tag: n.tag,
  };
  if (n.id) out.id = n.id;
  if (n.classes?.length) out.classes = n.classes.slice(0, 6);
  if (n.role) out.role = n.role;
  if (n.text) out.text = n.text.slice(0, 80);
  if (n.children?.length) {
    out.children = n.children
      .slice(0, depth === 0 ? 12 : 6)
      .map((c) => slimOutline(c, depth + 1))
      .filter(Boolean);
  }
  return out;
}

function pathFromUrl(href: string, base: string | null): string {
  try {
    const u = new URL(href, base || "https://blueprint.local/");
    return u.pathname || "/";
  } catch {
    return href;
  }
}

/** Build slim evidence payload from a full Blueprint (safe for LLM context). */
export function buildArchitectureEvidence(bp: Blueprint): ArchitectureEvidence {
  const { primary, secondary, palette } = extractPrimarySecondary(bp);
  const cssVars = { ...(bp.design?.cssVariables || {}) };
  // drop noisy utility-like keys
  for (const k of Object.keys(cssVars)) {
    if (k.startsWith("--tw-") || cssVars[k].length > 120) delete cssVars[k];
  }
  const cssVarEntries = Object.fromEntries(Object.entries(cssVars).slice(0, 36));

  const internal = (bp.links || [])
    .filter((l) => l.internal)
    .slice(0, 40)
    .map((l) => ({ href: l.href, text: l.text }));
  const external = (bp.links || [])
    .filter((l) => !l.internal)
    .slice(0, 12)
    .map((l) => ({ href: l.href, text: l.text }));

  const wp = bp.wordpress;
  const wordpressHints = wp
    ? {
        isWordPress: Boolean(wp.isWordPress),
        isJetEngine: Boolean(wp.isJetEngine),
        isElementor: Boolean(wp.isElementor),
        listingGridCount: Array.isArray(wp.listingGrids)
          ? wp.listingGrids.length
          : 0,
        cctTypeSlugs: Array.isArray(wp.cctTypes)
          ? wp.cctTypes.map((c: { slug?: string }) => c.slug || "").filter(Boolean).slice(0, 20)
          : [],
        dynamicFieldCount: Array.isArray(wp.dynamicFields)
          ? wp.dynamicFields.length
          : 0,
      }
    : null;

  return {
    blueprintId: bp.id,
    sourceUrl: bp.sourceUrl,
    finalUrl: bp.finalUrl,
    isThinHtml: Boolean(bp.isThinHtml),
    thinHtmlReasons: bp.thinHtmlReasons || [],
    meta: {
      title: bp.meta?.title || "",
      description: bp.meta?.description || "",
      language: bp.meta?.language ?? null,
      themeColor: bp.meta?.themeColor ?? null,
    },
    tech: (bp.tech || []).slice(0, 24).map((t) => ({
      name: t.name,
      confidence: t.confidence,
      evidence: t.evidence,
    })),
    design: {
      primary,
      secondary,
      palette: palette.slice(0, 16),
      fonts: [...new Set(bp.design?.fonts || [])].slice(0, 10),
      cssVariables: cssVarEntries,
      borderRadii: (bp.design?.borderRadii || []).slice(0, 8),
      typography: (bp.design?.typography || []).slice(0, 12).map((t) => ({
        selector: t.selector,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
      })),
    },
    headings: (bp.headings || []).slice(0, 32),
    links: { internal, externalSample: external },
    forms: (bp.forms || []).slice(0, 16).map((f) => ({
      action: f.action,
      method: f.method,
      category: f.category,
      fields: (f.fields || []).slice(0, 20).map((field) => ({
        name: field.name,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
      })),
    })),
    pages: (bp.pages || []).slice(0, 16).map((p) => ({
      url: p.url,
      title: p.title || "",
      headings: (p.headings || []).slice(0, 8),
    })),
    outlineSample: slimOutline(bp.outline),
    wordpressHints,
    notes: (bp.notes || []).slice(0, 20),
    limitations: (bp.limitations || []).slice(0, 12),
    partialErrors: (bp.partialErrors || []).slice(0, 15).map((e) => ({
      stage: e.stage,
      message: e.message,
    })),
  };
}

/** Route path candidates derived from internal links + crawled pages. */
export function deriveRouteCandidates(bp: Blueprint): string[] {
  const base = bp.finalUrl || bp.sourceUrl;
  const paths = new Set<string>(["/"]);
  for (const l of bp.links || []) {
    if (!l.internal) continue;
    paths.add(pathFromUrl(l.href, base));
  }
  for (const p of bp.pages || []) {
    paths.add(pathFromUrl(p.url, base));
  }
  return [...paths].slice(0, 30);
}

/**
 * Generate the full Architecture Compiler prompt (system + user with evidence).
 */
export function generateArchitectureCompilerPrompt(
  bp: Blueprint,
  options: ArchitectureCompilerOptions = {},
): ArchitectureCompilerPrompt {
  const focus = options.focus ?? "product_shell";
  const depth = options.depth ?? "deep";
  const thinHtmlMode =
    options.thinHtmlMode ?? (bp.isThinHtml ? "aggressive" : "normal");

  const evidence = buildArchitectureEvidence(bp);
  const routes = deriveRouteCandidates(bp);

  const userPrompt = [
    `# VSTUP — Architecture Compiler`,
    ``,
    `OPTIONS:`,
    `  focus: ${focus}`,
    `  depth: ${depth}`,
    `  thinHtmlMode: ${thinHtmlMode}`,
    ``,
    `BLUEPRINT_ID: ${bp.id}`,
    `SOURCE: ${bp.source} | thinHtml=${Boolean(bp.isThinHtml)}`,
    `URL: ${bp.finalUrl || bp.sourceUrl || "(html paste)"}`,
    ``,
    `## Route path candidates (from crawl/links)`,
    ...routes.map((r) => `- ${r}`),
    ``,
    `## HIGH-SIGNAL EVIDENCE (slim Blueprint — no HTML/CSS dump/base64)`,
    "```json",
    JSON.stringify(evidence, null, 2),
    "```",
    ``,
    `Run the pipeline. Return JSON UIARCH spec + HUMAN SUMMARY (EN).`,
    bp.isThinHtml
      ? `NOTE: isThinHtml=true — reconstruct product shell aggressively from tech/links/forms/headings.`
      : `Prefer product_shell over marketing/legal noise.`,
  ].join("\n");

  const fullPrompt = [
    "=== SYSTEM ===",
    ARCHITECTURE_SYSTEM_PROMPT,
    "",
    "=== USER ===",
    userPrompt,
  ].join("\n");

  const componentHints =
    (evidence.forms?.length || 0) +
    (evidence.wordpressHints?.listingGridCount || 0) +
    (evidence.headings?.length
      ? Math.min(8, evidence.headings.length)
      : 0) +
    (evidence.outlineSample ? 3 : 0);

  return {
    systemPrompt: ARCHITECTURE_SYSTEM_PROMPT,
    userPrompt,
    fullPrompt,
    evidence,
    meta: {
      thinHtml: Boolean(bp.isThinHtml),
      routeCandidates: routes.length,
      componentHints,
      formCount: evidence.forms.length,
      techCount: evidence.tech.length,
    },
  };
}
