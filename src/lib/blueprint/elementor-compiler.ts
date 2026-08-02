import { parse, type HTMLElement } from "node-html-parser";
import type { Blueprint, DesignTokens } from "./types";
import { toFullWpUploadUrl } from "./design-system";
import type { JsonValue } from "./wordpress-jetengine";
import { parseDataSettings } from "./wordpress-jetengine";

/** Native-ish Elementor template import schema (v0.4) */
export interface ElementorTemplate {
  version: "0.4";
  title: string;
  type: "page" | "section" | "container";
  content: ElementorNode[];
  page_settings: JsonValue[];
  /** non-standard metadata for our scanner */
  _blueprint?: {
    sourceId: string;
    sourceUrl: string | null;
    compiledAt: string;
    nodeCount: number;
    widgetCount: number;
    notes: string[];
  };
}

export type ElementorElType = "container" | "widget" | "section" | "column";

export type ElementorSettings = { [key: string]: JsonValue };

export interface ElementorNode {
  id: string;
  elType: ElementorElType;
  isInner?: boolean;
  isLocked?: boolean;
  widgetType?: string;
  settings: ElementorSettings;
  elements: ElementorNode[];
}

function randId(): string {
  // 7-char hex like Elementor uses
  let s = "";
  for (let i = 0; i < 7; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

function classesOf(el: HTMLElement): string[] {
  return (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
}

function textOf(el: HTMLElement, max = 2000): string {
  return (el.text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function absUrl(base: string, href: string | null | undefined): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("data:") || h.startsWith("javascript:") || h.startsWith("#"))
    return null;
  try {
    return new URL(h, base).toString();
  } catch {
    return null;
  }
}

function parseInlineStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function spacingFromStyle(
  style: Record<string, string>,
  prop: "padding" | "margin",
): Record<string, string | boolean> | undefined {
  const raw = style[prop];
  if (!raw) return undefined;
  const parts = raw
    .trim()
    .split(/\s+/)
    .map((p) => {
      const m = /^(-?[\d.]+)(px|em|rem|%)?$/.exec(p);
      return m ? m[1] : "0";
    });
  if (!parts.length) return undefined;
  const t = parts[0] ?? "0";
  const r = parts[1] ?? t;
  const b = parts[2] ?? t;
  const l = parts[3] ?? r;
  return {
    unit: "px",
    top: t,
    right: r,
    bottom: b,
    left: l,
    isLinked: t === r && r === b && b === l,
  };
}

/** Prefer Elementor global color reference when value matches a known global */
function colorSetting(
  value: string | null | undefined,
  globals: Record<string, string>,
  globalKeyHint?: string,
): { direct?: string; globals?: string } {
  if (!value) return {};
  const v = value.trim().toLowerCase();
  for (const [k, gv] of Object.entries(globals)) {
    if (gv.trim().toLowerCase() === v) {
      const id = k.replace(/^--e-global-color-/, "");
      return { globals: `globals/colors?id=${id}` };
    }
  }
  if (globalKeyHint) {
    const key = `--e-global-color-${globalKeyHint}`;
    if (globals[key]) {
      return { globals: `globals/colors?id=${globalKeyHint}` };
    }
  }
  return { direct: value };
}

function applyColor(
  settings: ElementorSettings,
  prop: string,
  value: string | null | undefined,
  globals: Record<string, string>,
  hint?: string,
) {
  const c = colorSetting(value, globals, hint);
  if (c.globals) {
    const prev = settings.__globals__;
    const g: { [key: string]: JsonValue } =
      prev && typeof prev === "object" && !Array.isArray(prev)
        ? { ...(prev as { [key: string]: JsonValue }) }
        : {};
    g[prop] = c.globals;
    settings.__globals__ = g;
  } else if (c.direct) {
    settings[prop] = c.direct;
  }
}

function isContainer(el: HTMLElement): boolean {
  const c = classesOf(el);
  return c.some((x) =>
    /^(e-con|e-parent|e-child|e-con-full|e-con-boxed|elementor-section|elementor-container|elementor-top-section)$/.test(
      x,
    ) ||
    x.startsWith("e-con") ||
    x === "elementor-section" ||
    x === "elementor-container",
  );
}

function widgetTypeFromClasses(c: string[]): string | null {
  const joined = c.join(" ");
  if (/elementor-widget-heading/.test(joined)) return "heading";
  if (/elementor-widget-text-editor|elementor-widget-text/.test(joined))
    return "text-editor";
  if (
    /elementor-widget-image|elementor-widget-theme-site-logo|elementor-widget-theme-post-featured-image/.test(
      joined,
    )
  )
    return "image";
  if (/elementor-widget-button|elementor-button-wrapper/.test(joined)) return "button";
  if (/elementor-widget-jet-listing-grid|jet-listing-grid(?!-dynamic)/.test(joined))
    return "jet-listing-grid";
  if (/elementor-widget-jet-listing-dynamic-field|jet-listing-dynamic-field/.test(joined))
    return "jet-listing-dynamic-field";
  if (/elementor-widget-jet-listing-dynamic-link|jet-listing-dynamic-link/.test(joined))
    return "jet-listing-dynamic-link";
  if (/elementor-widget-jet-listing-dynamic-image|jet-listing-dynamic-image/.test(joined))
    return "jet-listing-dynamic-image";
  if (/elementor-widget-jet-listing-dynamic-terms|jet-listing-dynamic-terms/.test(joined))
    return "jet-listing-dynamic-terms";
  if (/elementor-widget-jet-listing-dynamic-meta|jet-listing-dynamic-meta/.test(joined))
    return "jet-listing-dynamic-meta";
  if (/elementor-widget-jet-listing-dynamic-repeater|jet-listing-dynamic-repeater/.test(joined))
    return "jet-listing-dynamic-repeater";
  if (/elementor-widget-icon-list/.test(joined)) return "icon-list";
  if (/elementor-widget-icon-box/.test(joined)) return "icon-box";
  if (/elementor-widget-video/.test(joined)) return "video";
  if (/elementor-widget-spacer/.test(joined)) return "spacer";
  if (/elementor-widget-divider/.test(joined)) return "divider";
  if (/elementor-widget-form|elementor-widget-html/.test(joined)) {
    if (/form/.test(joined)) return "form";
    return "html";
  }
  if (/elementor-widget-/.test(joined)) {
    const m = joined.match(/elementor-widget-([a-z0-9_-]+)/i);
    if (m && m[1] !== "wrap") return m[1];
  }
  return null;
}

function findWidgetRoot(el: HTMLElement): HTMLElement {
  // walk up isn't available easily; use self if widget class present
  return el;
}

function extractHeadingWidget(el: HTMLElement, design: DesignTokens): ElementorNode {
  const titleEl =
    el.querySelector(".elementor-heading-title, h1, h2, h3, h4, h5, h6") || el;
  const tag = (titleEl.tagName || "h2").toLowerCase();
  const header_size = /^h[1-6]$/.test(tag) ? tag : "h2";
  const title = textOf(titleEl, 500);
  const style = parseInlineStyle(titleEl.getAttribute("style") || "");
  const settings: ElementorSettings = {
    title,
    header_size,
  };
  const globals = design.elementorGlobals?.colors || {};
  applyColor(settings, "title_color", style.color, globals, "primary");

  const typo = design.typography?.find((t) => t.selector === header_size);
  if (typo?.fontFamily) settings.typography_font_family = typo.fontFamily;
  if (typo?.fontSize) {
    const m = /^([\d.]+)(px|em|rem|%)?$/.exec(typo.fontSize);
    if (m) {
      settings.typography_font_size = { unit: m[2] || "px", size: Number(m[1]) };
    }
  }
  if (typo?.fontWeight) settings.typography_font_weight = typo.fontWeight;
  if (typo?.lineHeight) {
    const m = /^([\d.]+)(px|em|rem)?$/.exec(typo.lineHeight);
    if (m) {
      settings.typography_line_height = {
        unit: m[2] || "em",
        size: Number(m[1]),
      };
    }
  }
  if (typo?.letterSpacing) {
    const m = /^(-?[\d.]+)(px|em|rem)?$/.exec(typo.letterSpacing);
    if (m) {
      settings.typography_letter_spacing = {
        unit: m[2] || "px",
        size: Number(m[1]),
      };
    }
  }

  // Elementor global typography preset hint
  if (design.elementorGlobals?.typography) {
    const prev = settings.__globals__;
    const g: { [key: string]: JsonValue } =
      prev && typeof prev === "object" && !Array.isArray(prev)
        ? { ...(prev as { [key: string]: JsonValue }) }
        : {};
    if (header_size === "h1") g.typography_typography = "globals/typography?id=primary";
    else if (header_size === "h2")
      g.typography_typography = "globals/typography?id=secondary";
    else if (header_size === "body" || header_size === "p")
      g.typography_typography = "globals/typography?id=text";
    if (Object.keys(g).length) settings.__globals__ = g;
  }

  return {
    id: randId(),
    elType: "widget",
    widgetType: "heading",
    settings,
    elements: [],
  };
}

function extractTextEditorWidget(el: HTMLElement): ElementorNode {
  const editor =
    el.querySelector(".elementor-widget-container, .elementor-text-editor") || el;
  const html = (editor.innerHTML || textOf(editor)).slice(0, 8000);
  return {
    id: randId(),
    elType: "widget",
    widgetType: "text-editor",
    settings: { editor: html },
    elements: [],
  };
}

function extractImageWidget(el: HTMLElement, base: string): ElementorNode {
  const img = el.querySelector("img") || (el.tagName?.toLowerCase() === "img" ? el : null);
  let url =
    absUrl(base, img?.getAttribute("src")) ||
    absUrl(base, img?.getAttribute("data-src")) ||
    absUrl(base, img?.getAttribute("data-full-url")) ||
    "";
  if (url && /\/wp-content\/uploads\//i.test(url)) {
    url = toFullWpUploadUrl(url);
  }
  const alt = img?.getAttribute("alt") || "";
  return {
    id: randId(),
    elType: "widget",
    widgetType: "image",
    settings: {
      image: {
        url,
        id: "",
        alt,
        source: "url",
      },
      image_size: "full",
    },
    elements: [],
  };
}

function extractButtonWidget(
  el: HTMLElement,
  base: string,
  design: DesignTokens,
): ElementorNode {
  const a =
    el.querySelector("a.elementor-button, a.elementor-button-link, a") || el;
  const textEl =
    el.querySelector(".elementor-button-text, span") || a;
  const text = textOf(textEl as HTMLElement, 200) || textOf(el, 200);
  const href = absUrl(base, a.getAttribute("href")) || "";
  const style = parseInlineStyle(a.getAttribute("style") || "");
  const settings: ElementorSettings = {
    text,
    link: { url: href, is_external: "", nofollow: "", custom_attributes: "" },
  };
  applyColor(
    settings,
    "button_text_color",
    style.color,
    design.elementorGlobals?.colors || {},
    "accent",
  );
  applyColor(
    settings,
    "background_color",
    style["background-color"] || style.background,
    design.elementorGlobals?.colors || {},
    "primary",
  );
  return {
    id: randId(),
    elType: "widget",
    widgetType: "button",
    settings,
    elements: [],
  };
}

function extractJetListingWidget(el: HTMLElement): ElementorNode {
  const c = classesOf(el);
  const listingId =
    el.getAttribute("data-listing-id") ||
    c.find((x) => /^jet-listing-grid--\d+/.test(x))?.replace("jet-listing-grid--", "") ||
    "";
  let postType = "";
  const raw = el.getAttribute("data-settings");
  const settingsObj = parseDataSettings(raw);
  if (settingsObj) {
    postType = String(
      settingsObj.post_type ||
        settingsObj.listing_post_type ||
        settingsObj.lisitng_post_type ||
        "",
    );
  }
  const items = el.querySelectorAll(
    ".jet-listing-grid__item, .jet-listing-dynamic-post, article",
  );
  const sample = items[0] ? textOf(items[0], 160) : "";

  // Collect dynamic field map from first item for rebinding hints
  const dynFields: Array<Record<string, string | null>> = [];
  const first = items[0];
  if (first) {
    for (const dyn of first.querySelectorAll(
      ".jet-listing-dynamic-field, .jet-listing-dynamic-link, .jet-listing-dynamic-image, .jet-listing-dynamic-terms, .elementor-widget-jet-listing-dynamic-field, .elementor-widget-jet-listing-dynamic-link, .elementor-widget-jet-listing-dynamic-image",
    )) {
      const ds = dyn.getAttribute("data-settings") || "";
      let source = "";
      let meta = "";
      const s = parseDataSettings(ds);
      if (s) {
        source = String(
          s.dynamic_field_source ||
            s.dynamic_link_source ||
            s.dynamic_image_source ||
            "",
        );
        meta = String(s.dynamic_field_post_meta || s.dynamic_link_source_custom || "");
      }
      dynFields.push({
        sample: textOf(dyn, 80),
        source: source || null,
        meta: meta || null,
        classes: (dyn.getAttribute("class") || "").slice(0, 120),
      });
      if (dynFields.length >= 20) break;
    }
  }

  return {
    id: randId(),
    elType: "widget",
    widgetType: "jet-listing-grid",
    settings: {
      lisitng_id: listingId,
      listing_id: listingId,
      post_type: postType,
      _compiled_item_count: items.length,
      _compiled_sample: sample,
      _dynamic_fields: dynFields,
      _note:
        "Jet listing grid reconstructed from public DOM — re-bind listing template + dynamic fields in JetEngine after import.",
    },
    elements: [],
  };
}

function extractJetDynamicFieldWidget(
  el: HTMLElement,
  widgetType: string,
  base: string,
): ElementorNode {
  const raw = el.getAttribute("data-settings") || "";
  let settings: ElementorSettings = {};
  const parsed = parseDataSettings(raw);
  if (parsed) {
    for (const [k, v] of Object.entries(parsed)) {
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean" ||
        v === null
      ) {
        settings[k] = v;
      }
    }
  }

  // Preserve JetEngine source keys for rebinding
  if (widgetType === "jet-listing-dynamic-field") {
    settings.dynamic_field_source =
      settings.dynamic_field_source || "object_title";
    if (!settings.dynamic_field_post_meta && settings.meta_key) {
      settings.dynamic_field_post_meta = settings.meta_key;
    }
    settings._sample = textOf(el, 200);
  } else if (widgetType === "jet-listing-dynamic-link") {
    settings.dynamic_link_source = settings.dynamic_link_source || "permalink";
    const a = el.querySelector("a") || el;
    settings._sample_url = absUrl(base, a.getAttribute("href")) || "";
    settings._sample_text = textOf(a, 80);
  } else if (widgetType === "jet-listing-dynamic-image") {
    settings.dynamic_image_source =
      settings.dynamic_image_source || "post_thumbnail";
    const img = el.querySelector("img");
    const url =
      absUrl(base, img?.getAttribute("src")) ||
      absUrl(base, img?.getAttribute("data-src")) ||
      "";
    settings._sample_url = url;
    settings.image = { url, id: "", alt: img?.getAttribute("alt") || "", source: "url" };
  } else if (widgetType === "jet-listing-dynamic-terms") {
    settings.dynamic_terms_taxonomy =
      settings.dynamic_terms_taxonomy || settings.taxonomy || "";
    settings._sample = textOf(el, 120);
  }

  settings._note =
    "Dynamic field from public DOM — re-bind meta/CCT field in JetEngine after Elementor import.";

  return {
    id: randId(),
    elType: "widget",
    widgetType,
    settings,
    elements: [],
  };
}

function extractGenericWidget(el: HTMLElement, widgetType: string, base: string): ElementorNode {
  if (widgetType === "html" || widgetType === "form") {
    return {
      id: randId(),
      elType: "widget",
      widgetType: widgetType === "form" ? "html" : widgetType,
      settings: {
        html: (el.innerHTML || "").slice(0, 6000),
        _original_widget: widgetType,
      },
      elements: [],
    };
  }
  // fallback: image-like or text
  if (el.querySelector("img")) return extractImageWidget(el, base);
  const t = textOf(el, 400);
  if (t) {
    return {
      id: randId(),
      elType: "widget",
      widgetType: "text-editor",
      settings: { editor: `<p>${escapeHtml(t)}</p>`, _original_widget: widgetType },
      elements: [],
    };
  }
  return {
    id: randId(),
    elType: "widget",
    widgetType: widgetType || "html",
    settings: { html: (el.outerHTML || "").slice(0, 4000) },
    elements: [],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function containerSettings(el: HTMLElement, design: DesignTokens): ElementorSettings {
  const c = classesOf(el);
  const style = parseInlineStyle(el.getAttribute("style") || "");
  const settings: ElementorSettings = {};

  if (c.some((x) => x === "e-con-boxed" || x.includes("boxed"))) {
    settings.content_width = "boxed";
  } else if (c.some((x) => x === "e-con-full" || x.includes("e-con-full"))) {
    settings.content_width = "full";
  } else if (c.some((x) => x.startsWith("e-con"))) {
    settings.content_width = "full";
  }

  if (style["flex-direction"]) {
    settings.flex_direction = style["flex-direction"];
  }
  if (style["align-items"]) settings.flex_align_items = style["align-items"];
  if (style["justify-content"]) settings.flex_justify_content = style["justify-content"];
  if (style.gap) {
    const m = /^([\d.]+)(px|em|rem|%)?$/.exec(style.gap);
    if (m) settings.flex_gap = { unit: m[2] || "px", size: Number(m[1]), column: "", row: "" };
  }

  const pad = spacingFromStyle(style, "padding");
  if (pad) settings.padding = pad;
  const mar = spacingFromStyle(style, "margin");
  if (mar) settings.margin = mar;

  const bg = style["background-color"] || style.background;
  if (bg && !bg.includes("url(")) {
    applyColor(
      settings,
      "background_color",
      bg,
      design.elementorGlobals?.colors || {},
    );
  }
  const bgUrl = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i.exec(style.background || style["background-image"] || "");
  if (bgUrl) {
    settings.background_background = "classic";
    settings.background_image = { url: bgUrl[1], id: "", size: "", alt: "", source: "url" };
  }

  // data-settings JSON from Elementor often has useful bits
  const raw = el.getAttribute("data-settings");
  if (raw) {
    try {
      const s = parseDataSettings(raw);
      if (s) {
        if (s.background_background) settings.background_background = s.background_background as string;
        if (s.content_width) settings.content_width = s.content_width as string;
        if (s.flex_direction) settings.flex_direction = s.flex_direction as string;
      }
    } catch {
      /* ignore */
    }
  }

  return settings;
}

function compileNode(
  el: HTMLElement,
  base: string,
  design: DesignTokens,
  depth: number,
  stats: { nodes: number; widgets: number },
): ElementorNode | null {
  if (depth > 14) return null;
  const tag = el.tagName?.toLowerCase?.() || "";
  if (!tag || ["script", "style", "noscript", "link", "meta", "svg", "path"].includes(tag))
    return null;

  const c = classesOf(el);
  const wType = widgetTypeFromClasses(c);

  // Widget leaf
  if (wType || c.some((x) => x.startsWith("elementor-widget-"))) {
    stats.widgets++;
    stats.nodes++;
    const type = wType || "html";
    if (type === "heading") return extractHeadingWidget(findWidgetRoot(el), design);
    if (type === "text-editor") return extractTextEditorWidget(el);
    if (type === "image") return extractImageWidget(el, base);
    if (type === "button") return extractButtonWidget(el, base, design);
    if (type === "jet-listing-grid") return extractJetListingWidget(el);
    if (
      type === "jet-listing-dynamic-field" ||
      type === "jet-listing-dynamic-link" ||
      type === "jet-listing-dynamic-image" ||
      type === "jet-listing-dynamic-terms" ||
      type === "jet-listing-dynamic-meta" ||
      type === "jet-listing-dynamic-repeater"
    ) {
      return extractJetDynamicFieldWidget(el, type, base);
    }
    return extractGenericWidget(el, type, base);
  }

  // Semantic fallbacks without elementor-widget class
  if (/^h[1-6]$/.test(tag) && depth <= 6) {
    stats.widgets++;
    stats.nodes++;
    return extractHeadingWidget(el, design);
  }
  if (tag === "img" && !c.some((x) => x.includes("emoji"))) {
    stats.widgets++;
    stats.nodes++;
    return extractImageWidget(el, base);
  }
  if (
    (tag === "a" && c.some((x) => /button|btn|elementor-button/.test(x))) ||
    (tag === "button" && textOf(el, 40))
  ) {
    stats.widgets++;
    stats.nodes++;
    return extractButtonWidget(el, base, design);
  }

  // Containers / sections
  if (isContainer(el) || tag === "section" || tag === "main" || c.includes("elementor")) {
    const children: ElementorNode[] = [];
    for (const child of el.childNodes) {
      if ((child as HTMLElement).nodeType !== 1) continue;
      const n = compileNode(child as HTMLElement, base, design, depth + 1, stats);
      if (n) children.push(n);
      if (children.length >= 40) break;
    }
    // skip empty wrappers with no content
    if (children.length === 0 && !textOf(el, 20)) return null;
    stats.nodes++;
    return {
      id: randId(),
      elType: "container",
      isInner: depth > 1 || c.includes("e-child") || c.includes("elementor-inner-section"),
      settings: containerSettings(el, design),
      elements: children,
    };
  }

  // Generic block: if has elementor children, wrap as container
  const childNodes: ElementorNode[] = [];
  for (const child of el.childNodes) {
    if ((child as HTMLElement).nodeType !== 1) continue;
    const n = compileNode(child as HTMLElement, base, design, depth + 1, stats);
    if (n) childNodes.push(n);
    if (childNodes.length >= 40) break;
  }
  if (childNodes.length >= 1) {
    stats.nodes++;
    return {
      id: randId(),
      elType: "container",
      isInner: depth > 0,
      settings: containerSettings(el, design),
      elements: childNodes,
    };
  }

  // leaf paragraph
  if ((tag === "p" || tag === "div") && textOf(el, 20) && depth < 8) {
    stats.widgets++;
    stats.nodes++;
    return {
      id: randId(),
      elType: "widget",
      widgetType: "text-editor",
      settings: { editor: `<p>${escapeHtml(textOf(el, 1500))}</p>` },
      elements: [],
    };
  }

  return null;
}

export function compileElementorTemplate(opts: {
  html: string;
  baseUrl: string;
  title?: string;
  design?: DesignTokens;
  blueprintId?: string;
  sourceUrl?: string | null;
}): ElementorTemplate {
  const design = opts.design || {
    colors: [],
    fonts: [],
    cssVariables: {},
    borderRadii: [],
    shadows: [],
    spacingHints: [],
  };
  const base = opts.baseUrl || "https://blueprint.local/";
  const root = parse(opts.html, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });

  const stats = { nodes: 0, widgets: 0 };
  const notes: string[] = [];

  // Prefer Elementor page root
  const pageRoot =
    root.querySelector("[data-elementor-type], .elementor") ||
    root.querySelector("main") ||
    root.querySelector("body") ||
    root;

  const content: ElementorNode[] = [];
  // If page root is elementor, compile its children as top-level containers
  const directChildren = pageRoot.childNodes.filter(
    (n) => (n as HTMLElement).nodeType === 1,
  ) as HTMLElement[];

  if (
    classesOf(pageRoot as HTMLElement).some((c) => c === "elementor") ||
    pageRoot.getAttribute("data-elementor-type")
  ) {
    for (const ch of directChildren) {
      const n = compileNode(ch, base, design, 0, stats);
      if (n) content.push(n);
      if (content.length >= 30) break;
    }
  } else {
    const n = compileNode(pageRoot as HTMLElement, base, design, 0, stats);
    if (n) content.push(n);
  }

  // Ensure at least one container with title heading
  if (content.length === 0) {
    notes.push("DOM had no Elementor markers — created a fallback container.");
    content.push({
      id: randId(),
      elType: "container",
      isInner: false,
      settings: { content_width: "boxed" },
      elements: [
        {
          id: randId(),
          elType: "widget",
          widgetType: "heading",
          settings: {
            title: opts.title || "Imported Blueprint Template",
            header_size: "h1",
          },
          elements: [],
        },
      ],
    });
    stats.nodes += 2;
    stats.widgets += 1;
  }

  // Global colors into page_settings custom CSS vars for reference
  const page_settings: JsonValue[] = [];
  if (design.elementorGlobals && Object.keys(design.elementorGlobals.colors).length) {
    const system_colors = Object.entries(design.elementorGlobals.colors).map(
      ([k, color], i) => ({
        _id: k.replace("--e-global-color-", "") || `color${i}`,
        title: k.replace("--e-global-color-", ""),
        color,
      }),
    );
    page_settings.push({ system_colors });
    notes.push(`Mapped ${system_colors.length} Elementor global colors into page_settings.`);
  }

  notes.push(
    `Compiled ${stats.nodes} nodes (${stats.widgets} widgets). Import via Templates → Saved Templates → Import.`,
  );
  notes.push(
    "JetEngine listings and dynamic fields need re-binding after import; structure is DOM-derived.",
  );

  return {
    version: "0.4",
    title: opts.title || "Imported Blueprint Template",
    type: "page",
    content,
    page_settings,
    _blueprint: {
      sourceId: opts.blueprintId || "unknown",
      sourceUrl: opts.sourceUrl ?? null,
      compiledAt: new Date().toISOString(),
      nodeCount: stats.nodes,
      widgetCount: stats.widgets,
      notes,
    },
  };
}

/** Compile from full Blueprint snapshot */
export function compileElementorFromBlueprint(bp: Blueprint): ElementorTemplate {
  return compileElementorTemplate({
    html: bp.html,
    baseUrl: bp.finalUrl || bp.sourceUrl || "https://blueprint.local/",
    title: bp.meta.title || "Imported Blueprint Template",
    design: bp.design,
    blueprintId: bp.id,
    sourceUrl: bp.sourceUrl,
  });
}

export function exportElementorTemplateJson(template: ElementorTemplate): string {
  // Elementor import is picky — strip our _blueprint optional or keep it (usually ignored)
  const { _blueprint, ...rest } = template;
  void _blueprint;
  return JSON.stringify(rest, null, 2);
}

/** Full JSON including scanner metadata for ZIP / debug */
export function exportElementorTemplateJsonWithMeta(template: ElementorTemplate): string {
  return JSON.stringify(template, null, 2);
}
