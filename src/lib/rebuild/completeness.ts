/**
 * Explicit weighted completeness score for a RebuildSpec.
 * Weights sum to 100 — no invented numbers in UI.
 */

import type { RebuildSpec } from "./spec";

export type CompletenessWeightId =
  | "colors"
  | "typography"
  | "fonts"
  | "spacing"
  | "layout"
  | "components"
  | "contentText"
  | "contentImages"
  | "shell"
  | "forms"
  | "nav";

export type CompletenessWeight = {
  id: CompletenessWeightId;
  /** Absolute points toward 100 */
  max: number;
  /** Points earned 0..max */
  earned: number;
  /** i18n key for label */
  labelKey: string;
  /** i18n key for fix when incomplete (actionable) */
  fixKey?: string;
  /** Interpolation vars for fix */
  fixVars?: Record<string, string | number>;
  ok: boolean;
};

export type CompletenessReport = {
  /** 0–100 integer */
  score: number;
  weights: CompletenessWeight[];
  missing: CompletenessWeight[];
  gapCodes: string[];
};

/**
 * Canonical weights (must sum to 100).
 * Change only here — tests assert the sum.
 */
export const COMPLETENESS_WEIGHTS: Record<CompletenessWeightId, number> = {
  colors: 15,
  typography: 10,
  fonts: 5,
  spacing: 5,
  layout: 15,
  components: 10,
  contentText: 10,
  contentImages: 5,
  shell: 15,
  forms: 5,
  nav: 5,
};

export function assertWeightsSum100(): number {
  return Object.values(COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0);
}

function hasGap(spec: RebuildSpec, code: string): boolean {
  return spec.gaps.some((g) => g.code === code);
}

function hasRole(spec: RebuildSpec, role: string): boolean {
  return spec.layout.sections.some((s) => s.role === role);
}

export function scoreRebuildSpec(spec: RebuildSpec): CompletenessReport {
  const W = COMPLETENESS_WEIGHTS;
  const weights: CompletenessWeight[] = [];

  // colors: full if ≥3 roles incl accent or bg+text; half if any
  {
    const n = spec.designTokens.colors.length;
    const hasAccent = spec.designTokens.colors.some((c) => c.role === "accent");
    const hasPair =
      spec.designTokens.colors.some((c) => c.role === "bg") &&
      spec.designTokens.colors.some((c) => c.role === "text");
    let earned = 0;
    if (n >= 3 && (hasAccent || hasPair)) earned = W.colors;
    else if (n >= 1) earned = Math.round(W.colors * 0.5);
    weights.push({
      id: "colors",
      max: W.colors,
      earned,
      labelKey: "rebuild.weight.colors",
      fixKey: earned < W.colors ? "rebuild.fix.colors" : undefined,
      ok: earned === W.colors,
    });
  }

  // typography scale
  {
    const n = spec.designTokens.typography.scale.length;
    let earned = 0;
    if (n >= 3) earned = W.typography;
    else if (n >= 1) earned = Math.round(W.typography * 0.5);
    weights.push({
      id: "typography",
      max: W.typography,
      earned,
      labelKey: "rebuild.weight.typography",
      fixKey: earned < W.typography ? "rebuild.fix.typography" : undefined,
      ok: earned === W.typography,
    });
  }

  // fonts
  {
    const n = spec.designTokens.typography.fontFamilies.length;
    const earned = n >= 1 ? W.fonts : 0;
    weights.push({
      id: "fonts",
      max: W.fonts,
      earned,
      labelKey: "rebuild.weight.fonts",
      fixKey: earned < W.fonts ? "rebuild.fix.fonts" : undefined,
      ok: earned === W.fonts,
    });
  }

  // spacing / radii
  {
    const n =
      spec.designTokens.spacing.length + spec.designTokens.radii.length;
    let earned = 0;
    if (n >= 3) earned = W.spacing;
    else if (n >= 1) earned = Math.round(W.spacing * 0.5);
    weights.push({
      id: "spacing",
      max: W.spacing,
      earned,
      labelKey: "rebuild.weight.spacing",
      fixKey: earned < W.spacing ? "rebuild.fix.spacing" : undefined,
      ok: earned === W.spacing,
    });
  }

  // layout sections
  {
    const n = spec.layout.sections.length;
    let earned = 0;
    if (n >= 4) earned = W.layout;
    else if (n >= 2) earned = Math.round(W.layout * 0.66);
    else if (n >= 1) earned = Math.round(W.layout * 0.33);
    weights.push({
      id: "layout",
      max: W.layout,
      earned,
      labelKey: "rebuild.weight.layout",
      fixKey: earned < W.layout ? "rebuild.fix.layout" : undefined,
      ok: earned === W.layout,
    });
  }

  // components
  {
    const n = spec.components.length;
    let earned = 0;
    if (n >= 2) earned = W.components;
    else if (n >= 1) earned = Math.round(W.components * 0.5);
    weights.push({
      id: "components",
      max: W.components,
      earned,
      labelKey: "rebuild.weight.components",
      fixKey: earned < W.components ? "rebuild.fix.components" : undefined,
      ok: earned === W.components,
    });
  }

  // content text
  {
    const n = spec.content.texts.length;
    let earned = 0;
    if (n >= 6) earned = W.contentText;
    else if (n >= 2) earned = Math.round(W.contentText * 0.5);
    weights.push({
      id: "contentText",
      max: W.contentText,
      earned,
      labelKey: "rebuild.weight.contentText",
      fixKey: earned < W.contentText ? "rebuild.fix.contentText" : undefined,
      ok: earned === W.contentText,
    });
  }

  // images
  {
    const n = spec.content.images.length;
    let earned = 0;
    if (n >= 3) earned = W.contentImages;
    else if (n >= 1) earned = Math.round(W.contentImages * 0.5);
    weights.push({
      id: "contentImages",
      max: W.contentImages,
      earned,
      labelKey: "rebuild.weight.contentImages",
      fixKey:
        earned < W.contentImages ? "rebuild.fix.contentImages" : undefined,
      ok: earned === W.contentImages,
    });
  }

  // shell (thin HTML penalty)
  {
    const thin = spec.source.isThinHtml || hasGap(spec, "THIN_HTML");
    const earned = thin ? 0 : W.shell;
    weights.push({
      id: "shell",
      max: W.shell,
      earned,
      labelKey: "rebuild.weight.shell",
      fixKey: thin ? "rebuild.fix.shell" : undefined,
      ok: !thin,
    });
  }

  // forms
  {
    const hasForm =
      spec.components.some((c) => c.kind === "form") ||
      hasRole(spec, "form");
    const earned = hasForm ? W.forms : 0;
    weights.push({
      id: "forms",
      max: W.forms,
      earned,
      labelKey: "rebuild.weight.forms",
      fixKey: earned < W.forms ? "rebuild.fix.forms" : undefined,
      ok: earned === W.forms,
    });
  }

  // nav
  {
    const hasNav =
      hasRole(spec, "nav") ||
      spec.content.texts.some((t) => t.slot.startsWith("nav."));
    const earned = hasNav ? W.nav : 0;
    weights.push({
      id: "nav",
      max: W.nav,
      earned,
      labelKey: "rebuild.weight.nav",
      fixKey: earned < W.nav ? "rebuild.fix.nav" : undefined,
      ok: earned === W.nav,
    });
  }

  const score = Math.min(
    100,
    Math.max(
      0,
      weights.reduce((sum, w) => sum + w.earned, 0),
    ),
  );

  return {
    score,
    weights,
    missing: weights.filter((w) => !w.ok),
    gapCodes: spec.gaps.map((g) => g.code).sort(),
  };
}
