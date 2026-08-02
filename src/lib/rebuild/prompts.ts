/**
 * Prompt builders — read RebuildSpec only (never raw Blueprint).
 * Three deterministic stack variants from the same spec.
 */

import type { RebuildSpec } from "./spec";
import { stableStringify } from "./spec";
import { scoreRebuildSpec } from "./completeness";

export type RebuildStack = "react-tailwind" | "html-css" | "nextjs-app";

export type RebuildPrompt = {
  stack: RebuildStack;
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
  meta: {
    title: string;
    completeness: number;
    gapCount: number;
    sectionCount: number;
    componentCount: number;
  };
};

function gapsBlock(spec: RebuildSpec): string {
  const lines = [
    "## UNKNOWN — do not invent",
    "The scanner could not observe the following. You MUST NOT invent data,",
    "endpoints, routes, auth providers, hover animations, or API schemas for them.",
    "",
  ];
  for (const g of spec.gaps) {
    lines.push(`- [${g.category}/${g.code}] ${g.message}`);
  }
  if (!spec.gaps.length) {
    lines.push("- (no explicit gaps — still do not invent backend contracts)");
  }
  return lines.join("\n");
}

function acceptanceBlock(spec: RebuildSpec, stack: RebuildStack): string {
  const score = scoreRebuildSpec(spec).score;
  const stackLine =
    stack === "react-tailwind"
      ? "React function components + Tailwind utility classes only (no CSS-in-JS)"
      : stack === "html-css"
        ? "Single HTML file + one CSS file; no framework, no build step required"
        : "Next.js App Router (`app/`), Server Components by default, Tailwind";

  return [
    "## Acceptance criteria",
    `- Stack: ${stackLine}`,
    `- Visual system matches RebuildSpec designTokens (roles: bg/surface/text/muted/accent/border)`,
    `- Section order matches layout.sections (roles: ${spec.layout.sections.map((s) => s.role).join(" → ") || "n/a"})`,
    `- All content.texts slots appear in the UI (or as placeholders with the exact slot id)`,
    `- Images use only URLs listed in content.images (or gray placeholders if empty)`,
    `- Forms use only fields listed under components (kind=form); no invented actions`,
    `- Completeness of source spec was ${score}% — missing areas must stay simple, not faked`,
    `- Zero invented API routes, env vars, or auth beyond what gaps forbid`,
    `- Responsive: mobile-first; collapse nav if breakpointHints mention mobile`,
    `- Accessible: semantic landmarks, labels on inputs, focus states (static CSS only)`,
  ].join("\n");
}

function antiHallucinationBlock(): string {
  return [
    "## Hard rules",
    "- Do NOT invent REST/GraphQL endpoints, database tables, or secrets.",
    "- Do NOT invent routes not listed in the spec content/layout.",
    "- Do NOT invent brand colors outside designTokens.colors.",
    "- Do NOT invent copy — use content.texts only; if a slot is missing, use `[slot:id]`.",
    "- If a gap says UNKNOWN, leave a short TODO comment, do not fabricate behavior.",
  ].join("\n");
}

function specDigest(spec: RebuildSpec): string {
  // Compact but complete — full stable JSON for the model
  return [
    "## RebuildSpec (source of truth)",
    "```json",
    stableStringify(spec).trimEnd(),
    "```",
  ].join("\n");
}

function systemFor(stack: RebuildStack): string {
  const role =
    stack === "react-tailwind"
      ? "senior React + Tailwind engineer"
      : stack === "html-css"
        ? "senior HTML/CSS engineer"
        : "senior Next.js App Router engineer";

  return [
    `# ROLE`,
    `You are a ${role}. Rebuild a production-quality UI from a RebuildSpec JSON.`,
    ``,
    `# INPUT`,
    `You receive a versioned RebuildSpec (not raw HTML). Treat it as the only source of truth.`,
    ``,
    `# OUTPUT`,
    stack === "react-tailwind"
      ? `Return a single self-contained React component file (TSX) using Tailwind classes, ready to paste.`
      : stack === "html-css"
        ? `Return index.html and styles.css in one response (clearly separated).`
        : `Return app/page.tsx (+ optional layout.tsx) using Next.js App Router conventions and Tailwind.`,
    ``,
    `# QUALITY`,
    `- Prefer real structure over decorative filler.`,
    `- Match section roles (nav/hero/grid/cta/footer).`,
    `- Keep code deterministic and readable.`,
  ].join("\n");
}

function userFor(spec: RebuildSpec, stack: RebuildStack): string {
  const title = spec.source.title || spec.source.blueprintId;
  return [
    `# Rebuild: ${title}`,
    ``,
    `Stack target: **${stack}**`,
    `Source URL: ${spec.source.sourceUrl || spec.source.finalUrl || "(html paste)"}`,
    `Thin HTML / SPA shell: ${spec.source.isThinHtml ? "YES" : "no"}`,
    `Tech signals: ${spec.source.tech.map((t) => t.name).join(", ") || "(none)"}`,
    ``,
    gapsBlock(spec),
    ``,
    antiHallucinationBlock(),
    ``,
    acceptanceBlock(spec, stack),
    ``,
    specDigest(spec),
    ``,
    `## Task`,
    `Implement the UI now. Start with layout shell, then sections in order, then components.`,
    `End with a short checklist of acceptance criteria you satisfied.`,
  ].join("\n");
}

export function buildRebuildPrompt(
  spec: RebuildSpec,
  stack: RebuildStack,
): RebuildPrompt {
  const systemPrompt = systemFor(stack);
  const userPrompt = userFor(spec, stack);
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  const report = scoreRebuildSpec(spec);
  return {
    stack,
    systemPrompt,
    userPrompt,
    fullPrompt,
    meta: {
      title: spec.source.title || spec.source.blueprintId,
      completeness: report.score,
      gapCount: spec.gaps.length,
      sectionCount: spec.layout.sections.length,
      componentCount: spec.components.length,
    },
  };
}

export function buildAllRebuildPrompts(spec: RebuildSpec): Record<
  RebuildStack,
  RebuildPrompt
> {
  return {
    "react-tailwind": buildRebuildPrompt(spec, "react-tailwind"),
    "html-css": buildRebuildPrompt(spec, "html-css"),
    "nextjs-app": buildRebuildPrompt(spec, "nextjs-app"),
  };
}

/** Tailwind theme fragment derived from RebuildSpec tokens (not raw blueprint). */
export function generateTailwindFromSpec(spec: RebuildSpec): string {
  const colors: Record<string, string> = {};
  for (const c of spec.designTokens.colors) {
    colors[c.role] = c.value;
  }
  if (!Object.keys(colors).length) {
    colors.bg = "#0a0a0b";
    colors.surface = "#141416";
    colors.text = "#f4f4f5";
    colors.muted = "#a1a1aa";
    colors.accent = "#c8a16e";
    colors.border = "#27272a";
  }
  const fonts = spec.designTokens.typography.fontFamilies;
  const fontFamily = {
    sans: fonts[0]
      ? [fonts[0], "ui-sans-serif", "system-ui", "sans-serif"]
      : ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
  };
  const borderRadius: Record<string, string> = {};
  spec.designTokens.radii.slice(0, 6).forEach((r, i) => {
    borderRadius[i === 0 ? "DEFAULT" : `r${i + 1}`] = r;
  });

  const theme = { extend: { colors, fontFamily, borderRadius } };
  return `// Generated from RebuildSpec ${spec.id}
// Paste into theme.extend of tailwind.config
module.exports = ${JSON.stringify(theme, null, 2)};
`;
}
