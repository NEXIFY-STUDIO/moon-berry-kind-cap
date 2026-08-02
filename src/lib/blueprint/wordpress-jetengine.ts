import { parse, type HTMLElement } from "node-html-parser";

const FETCH_MS = 12_000;
const MAX_JSON_BYTES = 1_500_000;
const MAX_CCT_TYPES = 40;
const MAX_CCT_ITEMS = 50;
const USER_AGENT =
  "BlueprintScanner/1.2 WP+JetEngine (+https://local; public architecture extract)";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIp(hostname: string): boolean {
  if (hostname === "0.0.0.0" || hostname === "::" || hostname === "[::]") return true;
  if (hostname === "127.0.0.1" || hostname.startsWith("127.")) return true;
  if (hostname === "::1" || hostname === "[::1]") return true;
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  return false;
}

function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL for WP extract.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isPrivateIp(host)) {
    throw new Error("Local and private addresses cannot be scanned.");
  }
  return url;
}

export interface JetListingItemTemplate {
  outerHtml: string;
  classes: string[];
  links: string[];
  textSample: string;
  icons: string[];
  typographyHints: string[];
  /** Dynamic fields inside this listing item */
  dynamicFields: JetDynamicField[];
}

export interface JetListingGrid {
  id: string | null;
  classes: string[];
  listingId: string | null;
  postType: string | null;
  itemCount: number;
  itemTemplate: JetListingItemTemplate | null;
  settingsHints: Record<string, string>;
  /** Unique dynamic field map inferred from first item (+ page-level in grid) */
  dynamicFields: JetDynamicField[];
}

/** JetEngine dynamic field / link / image / terms / meta / repeater */
export type JetDynamicFieldKind =
  | "field"
  | "link"
  | "image"
  | "terms"
  | "meta"
  | "repeater"
  | "relation"
  | "unknown";

export type JetDynamicFieldSource =
  | "post_title"
  | "post_content"
  | "post_excerpt"
  | "post_date"
  | "post_id"
  | "post_url"
  | "post_thumbnail"
  | "post_meta"
  | "post_terms"
  | "options_page"
  | "user"
  | "cct"
  | "custom"
  | "unknown";

export interface JetDynamicField {
  /** Stable key for rebuild (field slug / meta key / inferred) */
  key: string;
  kind: JetDynamicFieldKind;
  source: JetDynamicFieldSource;
  /** Meta / CCT field name when known */
  metaKey: string | null;
  /** Taxonomy slug for terms */
  taxonomy: string | null;
  /** Rendered sample value from public DOM */
  sampleValue: string | null;
  /** Image / link URL sample */
  sampleUrl: string | null;
  /** HTML tag of the rendered output */
  tag: string | null;
  /** Elementor data-id of wrapper widget */
  elementorId: string | null;
  classes: string[];
  /** Raw data-settings subset (serializable strings) */
  settings: Record<string, string>;
  /** Format / callback hints (date format, filter_callback, …) */
  formatHints: string[];
  /** Confidence of key/source inference */
  confidence: "high" | "medium" | "low";
  /** Where found */
  context: "listing_item" | "page" | "widget";
  evidence: string;
}

export interface ElementorSection {
  dataId: string | null;
  elementorType: string | null;
  classes: string[];
  role: "hero" | "content" | "grid" | "header" | "footer" | "section" | "unknown";
  headings: string[];
  childSummary: string[];
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface WpRestEndpointResult {
  path: string;
  url: string;
  status: number | null;
  ok: boolean;
  bytes: number;
  summary: string;
  payloadPreview: string;
  data?: JsonValue;
}

export interface JetCctType {
  slug: string;
  endpoint: string;
  itemCount: number | null;
  fields: Array<{ name: string; type?: string; required?: boolean }>;
  sampleItems: JsonValue[];
  schemaHints: { [key: string]: JsonValue };
}

export interface WordPressArchitecture {
  detected: boolean;
  isWordPress: boolean;
  isJetEngine: boolean;
  isElementor: boolean;
  rest: {
    root: WpRestEndpointResult | null;
    namespaces: string[];
    pages: WpRestEndpointResult | null;
    posts: WpRestEndpointResult | null;
    jetCctIndex: WpRestEndpointResult | null;
    otherEndpoints: WpRestEndpointResult[];
  };
  cctTypes: JetCctType[];
  listingGrids: JetListingGrid[];
  /** All JetEngine dynamic fields across page + listings */
  dynamicFields: JetDynamicField[];
  /** Deduped field catalog for CCT / rebuild map */
  dynamicFieldCatalog: Array<{
    key: string;
    kind: JetDynamicFieldKind;
    source: JetDynamicFieldSource;
    metaKey: string | null;
    occurrences: number;
    sampleValues: string[];
  }>;
  elementorSections: ElementorSection[];
  sitemapUrls: string[];
  navLinks: string[];
  footerLinks: string[];
  notes: string[];
  limitations: string[];
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

function textSample(el: HTMLElement, max = 160): string {
  const t = (el.text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Decode common HTML entities used in Elementor data-settings attributes. */
function decodeHtmlEntities(input: string): string {
  // Build named entities at runtime (avoids HTML-pipeline mangling of source).
  const amp = "&" + "amp;";
  const quot = "&" + "quot;";
  const apos = "&" + "apos;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  let cur = input;
  // Iterative: " → " → "
  for (let i = 0; i < 6; i++) {
    const prev = cur;
    cur = cur
      .split(amp)
      .join("&")
      .split(quot)
      .join('"')
      .split(apos)
      .join("'")
      .split(lt)
      .join("<")
      .split(gt)
      .join(">")
      .replace(/&#0*34;/g, '"')
      .replace(/&#x0*22;/gi, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'");
    if (cur === prev) break;
  }
  return cur;
}

function tryParseSettingsObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON object */
  }
  return null;
}

/** Parse Elementor/Jet data-settings (handles HTML entity encoding, double-encoding, escapes). */
export function parseDataSettings(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed === "{}") return {};

  const unescaped = trimmed
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'");

  const decoded = decodeHtmlEntities(trimmed);
  const decodedUnescaped = decodeHtmlEntities(unescaped);

  // Prefer fully decoded variants first so values don't keep entity leftovers.
  const candidates: string[] = [];
  const push = (s: string) => {
    if (s && !candidates.includes(s)) candidates.push(s);
  };
  push(decodedUnescaped);
  push(decoded);
  push(unescaped);
  push(trimmed);

  // Attribute sometimes contains junk around the JSON object
  for (const base of [decodedUnescaped, decoded, trimmed]) {
    const brace = base.match(/\{[\s\S]*\}/);
    if (brace) push(brace[0]);
  }

  for (const c of candidates) {
    const obj = tryParseSettingsObject(c);
    if (obj) return obj;
  }
  return null;
}

function strSetting(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  return null;
}

function kindFromClasses(classes: string[], widgetHint: string | null): JetDynamicFieldKind {
  const blob = `${classes.join(" ")} ${widgetHint || ""}`.toLowerCase();
  if (/dynamic-link|dynamic_link|jet-listing-dynamic-link/.test(blob)) return "link";
  if (/dynamic-image|dynamic_image|jet-listing-dynamic-image|featured-image/.test(blob))
    return "image";
  if (/dynamic-terms|dynamic_terms|jet-listing-dynamic-terms|taxonomy/.test(blob))
    return "terms";
  if (/dynamic-meta|dynamic_meta|jet-listing-dynamic-meta/.test(blob)) return "meta";
  if (/dynamic-repeater|dynamic_repeater|jet-listing-dynamic-repeater/.test(blob))
    return "repeater";
  if (/relation|related|jet-engine-relation/.test(blob)) return "relation";
  if (/dynamic-field|dynamic_field|jet-listing-dynamic-field/.test(blob)) return "field";
  return "unknown";
}

function sourceFromSettings(
  settings: Record<string, unknown>,
  kind: JetDynamicFieldKind,
): {
  source: JetDynamicFieldSource;
  metaKey: string | null;
  taxonomy: string | null;
  formatHints: string[];
  confidence: "high" | "medium" | "low";
  evidence: string;
} {
  const formatHints: string[] = [];
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (settings[k] != null && settings[k] !== "") return settings[k];
    }
    return null;
  };

  const sourceRaw =
    strSetting(
      get(
        "dynamic_field_source",
        "dynamic_link_source",
        "dynamic_image_source",
        "dynamic_terms_source",
        "source",
        "field_source",
      ),
    ) || "";
  const meta =
    strSetting(
      get(
        "dynamic_field_post_meta",
        "dynamic_link_source_custom",
        "dynamic_image_source_custom",
        "meta_field",
        "selected_field",
        "field",
        "key",
        "meta_key",
        "cct_field",
      ),
    ) || null;
  const taxonomy =
    strSetting(get("dynamic_terms_taxonomy", "taxonomy", "tax")) || null;

  for (const k of [
    "filter_callback",
    "field_format",
    "date_format",
    "number_format",
    "fallback",
    "dynamic_field_format",
  ]) {
    const v = strSetting(settings[k]);
    if (v) formatHints.push(`${k}=${v}`);
  }

  const s = sourceRaw.toLowerCase();
  if (/object_title|post_title|title/.test(s) && !meta) {
    return {
      source: "post_title",
      metaKey: null,
      taxonomy,
      formatHints,
      confidence: "high",
      evidence: `source=${sourceRaw}`,
    };
  }
  if (/object_content|post_content|content/.test(s)) {
    return {
      source: "post_content",
      metaKey: null,
      taxonomy,
      formatHints,
      confidence: "high",
      evidence: `source=${sourceRaw}`,
    };
  }
  if (/object_excerpt|post_excerpt|excerpt/.test(s)) {
    return {
      source: "post_excerpt",
      metaKey: null,
      taxonomy,
      formatHints,
      confidence: "high",
      evidence: `source=${sourceRaw}`,
    };
  }
  if (/object_date|post_date|date/.test(s) && !/update/.test(s)) {
    return {
      source: "post_date",
      metaKey: null,
      taxonomy,
      formatHints,
      confidence: "high",
      evidence: `source=${sourceRaw}`,
    };
  }
  if (/object_id|post_id/.test(s)) {
    return {
      source: "post_id",
      metaKey: null,
      taxonomy,
      formatHints,
      confidence: "high",
      evidence: `source=${sourceRaw}`,
    };
  }
  if (/permalink|post_url|url|href/.test(s) && kind === "link") {
    return {
      source: "post_url",
      metaKey: meta,
      taxonomy,
      formatHints,
      confidence: "high",
      evidence: `source=${sourceRaw}`,
    };
  }
  if (/image|thumbnail|featured/.test(s) || kind === "image") {
    if (meta) {
      return {
        source: "post_meta",
        metaKey: meta,
        taxonomy,
        formatHints,
        confidence: "high",
        evidence: `image meta=${meta}`,
      };
    }
    return {
      source: "post_thumbnail",
      metaKey: null,
      taxonomy,
      formatHints,
      confidence: sourceRaw ? "high" : "medium",
      evidence: sourceRaw || "image widget",
    };
  }
  if (/terms|taxonomy/.test(s) || kind === "terms") {
    return {
      source: "post_terms",
      metaKey: null,
      taxonomy,
      formatHints,
      confidence: taxonomy ? "high" : "medium",
      evidence: taxonomy ? `taxonomy=${taxonomy}` : sourceRaw || "terms widget",
    };
  }
  if (/meta|custom|post_meta|object_meta/.test(s) || meta) {
    return {
      source: "post_meta",
      metaKey: meta,
      taxonomy,
      formatHints,
      confidence: meta ? "high" : "medium",
      evidence: meta ? `meta=${meta}` : `source=${sourceRaw || "meta"}`,
    };
  }
  if (/cct|custom_content_type/.test(s)) {
    return {
      source: "cct",
      metaKey: meta,
      taxonomy,
      formatHints,
      confidence: meta ? "high" : "medium",
      evidence: `cct field=${meta || sourceRaw}`,
    };
  }
  if (/options|option_page/.test(s)) {
    return {
      source: "options_page",
      metaKey: meta,
      taxonomy,
      formatHints,
      confidence: "medium",
      evidence: sourceRaw,
    };
  }
  if (/user/.test(s)) {
    return {
      source: "user",
      metaKey: meta,
      taxonomy,
      formatHints,
      confidence: "medium",
      evidence: sourceRaw,
    };
  }
  if (kind === "link" && !sourceRaw) {
    return {
      source: "post_url",
      metaKey: null,
      taxonomy,
      formatHints,
      confidence: "low",
      evidence: "link without source attr",
    };
  }
  return {
    source: "unknown",
    metaKey: meta,
    taxonomy,
    formatHints,
    confidence: "low",
    evidence: sourceRaw || "no data-settings source",
  };
}

function inferKeyFromDom(
  el: HTMLElement,
  kind: JetDynamicFieldKind,
  metaKey: string | null,
  source: JetDynamicFieldSource,
  sampleValue: string | null,
): string {
  if (metaKey) return metaKey;
  if (source !== "unknown" && source !== "post_meta" && source !== "cct") {
    return source;
  }
  // class pattern jet-dynamic-field--name or field-name
  const classes = (el.getAttribute("class") || "").split(/\s+/);
  for (const c of classes) {
    const m =
      c.match(/dynamic-field--([a-z0-9_-]+)/i) ||
      c.match(/field--([a-z0-9_-]+)/i) ||
      c.match(/meta-([a-z0-9_-]+)/i);
    if (m && m[1] && m[1].length > 1) return m[1];
  }
  const dataField =
    el.getAttribute("data-field") ||
    el.getAttribute("data-meta") ||
    el.getAttribute("data-meta-key");
  if (dataField) return dataField;
  // weak: slug from sample for unique-ish keys
  if (sampleValue && sampleValue.length < 40 && /^[\w\s./-]+$/.test(sampleValue)) {
    return `sample:${sampleValue.slice(0, 24).trim().replace(/\s+/g, "_").toLowerCase()}`;
  }
  return kind === "unknown" ? "unknown_field" : `dynamic_${kind}`;
}

function extractOneDynamicField(
  el: HTMLElement,
  base: string,
  context: JetDynamicField["context"],
): JetDynamicField | null {
  const classes = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
  // climb for widget wrapper settings
  let widgetEl: HTMLElement = el;
  let settings: Record<string, unknown> | null = parseDataSettings(
    el.getAttribute("data-settings"),
  );
  let elementorId = el.getAttribute("data-id");
  // parent walk up to 5 levels for elementor-widget-jet-*
  let p: HTMLElement | null = el.parentNode as HTMLElement | null;
  for (let i = 0; i < 6 && p; i++) {
    if (!p.getAttribute) break;
    const pc = p.getAttribute("class") || "";
    if (/elementor-widget-jet|jet-listing-dynamic|elementor-element/.test(pc)) {
      widgetEl = p;
      if (!settings) settings = parseDataSettings(p.getAttribute("data-settings"));
      if (!elementorId) elementorId = p.getAttribute("data-id");
      if (/elementor-widget-jet/.test(pc) && settings) break;
    }
    p = p.parentNode as HTMLElement | null;
  }

  const widgetClass = widgetEl.getAttribute("class") || "";
  const kind = kindFromClasses(
    [...classes, ...widgetClass.split(/\s+/)],
    widgetClass,
  );
  // skip pure grid containers mistaken as dynamic
  if (
    kind === "unknown" &&
    !/jet-listing-dynamic|dynamic-field|dynamic-link|dynamic-image|dynamic-terms|dynamic-meta|dynamic-repeater/i.test(
      `${classes.join(" ")} ${widgetClass}`,
    )
  ) {
    return null;
  }

  const resolved = sourceFromSettings(settings || {}, kind === "unknown" ? "field" : kind);
  let sampleUrl: string | null = null;
  let sampleValue: string | null = null;
  const tag = (el.tagName || "").toLowerCase() || null;

  if (kind === "image" || el.querySelector("img")) {
    const img = el.tagName?.toLowerCase() === "img" ? el : el.querySelector("img");
    sampleUrl =
      absUrl(base, img?.getAttribute("src")) ||
      absUrl(base, img?.getAttribute("data-src")) ||
      absUrl(base, img?.getAttribute("data-lazy-src"));
    sampleValue = img?.getAttribute("alt") || null;
  }
  if (kind === "link" || el.tagName?.toLowerCase() === "a" || el.querySelector("a")) {
    const a = el.tagName?.toLowerCase() === "a" ? el : el.querySelector("a");
    sampleUrl = absUrl(base, a?.getAttribute("href")) || sampleUrl;
    sampleValue = textSample(a || el, 120) || sampleValue;
  }
  if (!sampleValue) sampleValue = textSample(el, 160) || null;
  if (sampleValue === "") sampleValue = null;

  const finalKind = kind === "unknown" ? "field" : kind;
  const key = inferKeyFromDom(
    el,
    finalKind,
    resolved.metaKey,
    resolved.source,
    sampleValue,
  );

  const settingsOut: Record<string, string> = {};
  if (settings) {
    for (const [k, v] of Object.entries(settings)) {
      const s = strSetting(v);
      if (s != null && s.length < 300) settingsOut[k] = s;
      if (Object.keys(settingsOut).length >= 24) break;
    }
  }

  return {
    key,
    kind: finalKind,
    source: resolved.source,
    metaKey: resolved.metaKey,
    taxonomy: resolved.taxonomy,
    sampleValue,
    sampleUrl,
    tag,
    elementorId: elementorId || null,
    classes: classes.slice(0, 16),
    settings: settingsOut,
    formatHints: resolved.formatHints,
    confidence: resolved.confidence,
    context,
    evidence: resolved.evidence,
  };
}

const DYNAMIC_SELECTORS = [
  ".jet-listing-dynamic-field",
  ".jet-listing-dynamic-link",
  ".jet-listing-dynamic-image",
  ".jet-listing-dynamic-terms",
  ".jet-listing-dynamic-meta",
  ".jet-listing-dynamic-repeater",
  ".jet-engine-listing-overlay-content .jet-listing-dynamic-field",
  ".elementor-widget-jet-listing-dynamic-field",
  ".elementor-widget-jet-listing-dynamic-link",
  ".elementor-widget-jet-listing-dynamic-image",
  ".elementor-widget-jet-listing-dynamic-terms",
  ".elementor-widget-jet-listing-dynamic-meta",
  ".elementor-widget-jet-listing-dynamic-repeater",
  "[class*='jet-listing-dynamic-']",
].join(", ");

export function extractJetDynamicFields(
  html: string,
  base: string,
  scope?: HTMLElement,
): JetDynamicField[] {
  const root =
    scope ||
    parse(html, {
      comment: false,
      blockTextElements: { script: true, style: true, noscript: true },
    });
  const fields: JetDynamicField[] = [];
  const seen = new Set<string>();
  const nodes = root.querySelectorAll(DYNAMIC_SELECTORS);

  for (const node of nodes) {
    // skip nested duplicates (widget wrapping inner dynamic field)
    const parent = node.parentNode as HTMLElement | null;
    if (
      parent?.getAttribute &&
      /jet-listing-dynamic|elementor-widget-jet-listing-dynamic/.test(
        parent.getAttribute("class") || "",
      ) &&
      node.getAttribute("class")?.includes("jet-listing-dynamic") &&
      parent.querySelector(".jet-listing-dynamic-field, .jet-listing-dynamic-link")
    ) {
      // keep both if different kinds; filter later by dedupe
    }
    const inListing = Boolean(
      (node as HTMLElement).closest?.(".jet-listing-grid__item") ||
        (function walkUp(el: HTMLElement | null): boolean {
          let cur = el;
          for (let i = 0; i < 12 && cur; i++) {
            const c = cur.getAttribute?.("class") || "";
            if (/jet-listing-grid__item|jet-listing-dynamic-post/.test(c)) return true;
            cur = cur.parentNode as HTMLElement | null;
          }
          return false;
        })(node as HTMLElement),
    );
    const field = extractOneDynamicField(
      node as HTMLElement,
      base,
      inListing ? "listing_item" : "widget",
    );
    if (!field) continue;
    const dedupe = `${field.kind}|${field.key}|${field.elementorId || ""}|${field.sampleValue || ""}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    fields.push(field);
    if (fields.length >= 120) break;
  }
  return fields;
}

export function buildDynamicFieldCatalog(
  fields: JetDynamicField[],
): WordPressArchitecture["dynamicFieldCatalog"] {
  const map = new Map<
    string,
    WordPressArchitecture["dynamicFieldCatalog"][number]
  >();
  for (const f of fields) {
    const k = `${f.kind}:${f.key}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, {
        key: f.key,
        kind: f.kind,
        source: f.source,
        metaKey: f.metaKey,
        occurrences: 1,
        sampleValues: f.sampleValue ? [f.sampleValue] : [],
      });
    } else {
      prev.occurrences += 1;
      if (f.sampleValue && prev.sampleValues.length < 5 && !prev.sampleValues.includes(f.sampleValue)) {
        prev.sampleValues.push(f.sampleValue);
      }
      if (prev.source === "unknown" && f.source !== "unknown") prev.source = f.source;
      if (!prev.metaKey && f.metaKey) prev.metaKey = f.metaKey;
    }
  }
  return [...map.values()].sort((a, b) => b.occurrences - a.occurrences);
}

async function fetchJson(
  url: string,
): Promise<{ status: number; text: string; json: unknown | null; finalUrl: string }> {
  assertPublicUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json, */*;q=0.8",
        "accept-language": "en,sk;q=0.9",
      },
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced = buf.byteLength > MAX_JSON_BYTES ? buf.slice(0, MAX_JSON_BYTES) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
    let json: unknown | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, text, json, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextPublic(url: string): Promise<{ status: number; text: string }> {
  assertPublicUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/xml,text/xml,text/html,*/*;q=0.8",
      },
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced = buf.byteLength > MAX_JSON_BYTES ? buf.slice(0, MAX_JSON_BYTES) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function endpointResult(
  path: string,
  url: string,
  status: number | null,
  json: unknown | null,
  text: string,
  summary: string,
): WpRestEndpointResult {
  const ok = status != null && status >= 200 && status < 400 && json != null;
  const preview =
    text.length > 4000 ? `${text.slice(0, 4000)}…[truncated]` : text;
  return {
    path,
    url,
    status,
    ok,
    bytes: Buffer.byteLength(text, "utf8"),
    summary,
    payloadPreview: preview,
    ...(ok ? { data: truncateDeep(json, 3, 40) } : {}),
  };
}

function truncateDeep(value: unknown, depth: number, maxKeys: number): JsonValue {
  if (depth <= 0) {
    if (Array.isArray(value)) return `[array:${value.length}]`;
    if (value && typeof value === "object") return "[object]";
    if (value === undefined) return null;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      return value;
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((v) => truncateDeep(v, depth - 1, maxKeys));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, maxKeys);
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of entries) {
      out[k] = truncateDeep(v, depth - 1, maxKeys);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 400) {
    return `${value.slice(0, 400)}…`;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return value === undefined ? null : String(value);
}


function summarizeRoot(json: unknown): { summary: string; namespaces: string[] } {
  if (!json || typeof json !== "object") {
    return { summary: "invalid JSON root", namespaces: [] };
  }
  const o = json as Record<string, unknown>;
  const ns = Array.isArray(o.namespaces)
    ? o.namespaces.filter((x): x is string => typeof x === "string")
    : [];
  const name = typeof o.name === "string" ? o.name : "WP REST";
  const desc = typeof o.description === "string" ? o.description : "";
  return {
    summary: `${name}${desc ? ` — ${desc.slice(0, 80)}` : ""}; namespaces: ${ns.length}`,
    namespaces: ns.slice(0, 40),
  };
}

function extractFieldsFromItem(item: unknown): JetCctType["fields"] {
  if (!item || typeof item !== "object") return [];
  const o = item as Record<string, unknown>;
  const meta =
    o.meta && typeof o.meta === "object"
      ? (o.meta as Record<string, unknown>)
      : o;
  const skip = new Set([
    "id",
    "_ID",
    "cct_status",
    "cct_created",
    "cct_modified",
    "cct_author_id",
    "_links",
  ]);
  const fields: JetCctType["fields"] = [];
  for (const [name, val] of Object.entries(meta)) {
    if (skip.has(name) || name.startsWith("_")) continue;
    const type =
      typeof val === "number"
        ? "number"
        : typeof val === "boolean"
          ? "boolean"
          : Array.isArray(val)
            ? "array"
            : typeof val === "object" && val !== null
              ? "object"
              : "string";
    fields.push({ name, type });
    if (fields.length >= 60) break;
  }
  return fields;
}

function guessSectionRole(
  classes: string[],
  headings: string[],
  dataId: string | null,
): ElementorSection["role"] {
  const blob = `${classes.join(" ")} ${headings.join(" ")} ${dataId || ""}`.toLowerCase();
  if (/header|site-header|elementor-location-header/.test(blob)) return "header";
  if (/footer|site-footer|elementor-location-footer/.test(blob)) return "footer";
  if (/hero|banner|jumbotron|masthead/.test(blob)) return "hero";
  if (/grid|listing|cards|archive|loop/.test(blob)) return "grid";
  if (/content|main|article|entry/.test(blob)) return "content";
  if (headings.some((h) => h.length > 8) && classes.some((c) => /elementor-section/.test(c)))
    return "section";
  return "unknown";
}

export function extractJetListingGrids(html: string, base: string): JetListingGrid[] {
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });
  const grids: JetListingGrid[] = [];
  const nodes = root.querySelectorAll(
    ".jet-listing-grid, [class*='jet-listing-grid--'], .jet-listing, .elementor-widget-jet-listing-grid",
  );

  for (const node of nodes) {
    const classAttr = node.getAttribute("class") || "";
    const classes = classAttr.split(/\s+/).filter(Boolean);
    const idClass = classes.find((c) => /^jet-listing-grid--\d+/.test(c));
    const listingId =
      node.getAttribute("data-listing-id") ||
      idClass?.replace("jet-listing-grid--", "") ||
      node.getAttribute("data-id") ||
      null;

    const settingsHints: Record<string, string> = {};
    for (const attr of [
      "data-widget-id",
      "data-id",
      "data-element_type",
      "data-settings",
      "data-post-id",
    ]) {
      const v = node.getAttribute(attr);
      if (v) settingsHints[attr] = v.slice(0, 500);
    }

    let postType: string | null = null;
    const parsedSettings = parseDataSettings(node.getAttribute("data-settings"));
    if (parsedSettings) {
      postType =
        strSetting(parsedSettings.post_type) ||
        strSetting(parsedSettings.lisitng_post_type) ||
        strSetting(parsedSettings.listing_post_type) ||
        null;
    }

    const items = node.querySelectorAll(
      ".jet-listing-grid__item, .jet-listing-dynamic-post, .jet-engine-listing-overlay-wrap, article",
    );
    let itemTemplate: JetListingItemTemplate | null = null;
    const first = items[0];
    let itemDynamicFields: JetDynamicField[] = [];
    if (first) {
      const itemClasses = (first.getAttribute("class") || "").split(/\s+/).filter(Boolean);
      const links = first
        .querySelectorAll("a[href]")
        .map((a) => absUrl(base, a.getAttribute("href")))
        .filter((u): u is string => Boolean(u))
        .slice(0, 12);
      const icons = first
        .querySelectorAll("i[class], svg, .elementor-icon")
        .map((el) => el.getAttribute("class") || el.tagName.toLowerCase())
        .filter(Boolean)
        .slice(0, 12);
      const typographyHints: string[] = [];
      for (const el of first.querySelectorAll(
        "h1,h2,h3,h4,h5,h6,p,.elementor-heading-title,.jet-listing-dynamic-field",
      )) {
        const cls = el.getAttribute("class") || "";
        const tag = el.tagName.toLowerCase();
        typographyHints.push(
          `${tag}${cls ? `.${cls.split(/\s+/).slice(0, 3).join(".")}` : ""}: ${textSample(el, 60)}`,
        );
        if (typographyHints.length >= 10) break;
      }
      itemDynamicFields = extractJetDynamicFields("", base, first as HTMLElement);
      // ensure context listing_item
      itemDynamicFields = itemDynamicFields.map((f) => ({
        ...f,
        context: "listing_item" as const,
      }));
      itemTemplate = {
        outerHtml: first.toString().slice(0, 2500),
        classes: itemClasses.slice(0, 20),
        links,
        textSample: textSample(first, 200),
        icons,
        typographyHints,
        dynamicFields: itemDynamicFields,
      };
    }

    // grid-level dynamic fields (includes all items — catalog later dedupes)
    const gridFields = extractJetDynamicFields("", base, node as HTMLElement);

    grids.push({
      id: node.getAttribute("id") || idClass || listingId,
      classes: classes.slice(0, 24),
      listingId,
      postType,
      itemCount: items.length,
      itemTemplate,
      settingsHints,
      dynamicFields: itemDynamicFields.length
        ? itemDynamicFields
        : gridFields.slice(0, 40),
    });
    if (grids.length >= 30) break;
  }
  return grids;
}

export function extractElementorSections(html: string): ElementorSection[] {
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });
  const sections: ElementorSection[] = [];
  const nodes = root.querySelectorAll(
    "[data-elementor-type], .elementor-section, .elementor-top-section, [data-id].elementor-element",
  );

  const seen = new Set<string>();
  for (const node of nodes) {
    const dataId = node.getAttribute("data-id") || null;
    const elementorType =
      node.getAttribute("data-elementor-type") ||
      node.getAttribute("data-element_type") ||
      null;
    const classes = (node.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    if (
      !elementorType &&
      !classes.some((c) =>
        /elementor-section|elementor-top-section|e-con-full|e-parent/.test(c),
      )
    ) {
      continue;
    }
    const key = dataId || classes.slice(0, 4).join(".");
    if (seen.has(key)) continue;
    seen.add(key);

    const headings = node
      .querySelectorAll("h1,h2,h3,.elementor-heading-title")
      .map((h) => textSample(h, 80))
      .filter(Boolean)
      .slice(0, 8);
    const childSummary: string[] = [];
    for (const ch of node.childNodes) {
      if ((ch as HTMLElement).nodeType !== 1) continue;
      const el = ch as HTMLElement;
      const tag = el.tagName?.toLowerCase?.() || "";
      if (!tag) continue;
      const c = (el.getAttribute("class") || "").split(/\s+/).slice(0, 3).join(".");
      childSummary.push(c ? `${tag}.${c}` : tag);
      if (childSummary.length >= 12) break;
    }

    sections.push({
      dataId,
      elementorType,
      classes: classes.slice(0, 16),
      role: guessSectionRole(classes, headings, dataId),
      headings,
      childSummary,
    });
    if (sections.length >= 40) break;
  }
  return sections;
}

export function extractNavFooterLinks(html: string, base: string): {
  navLinks: string[];
  footerLinks: string[];
} {
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });
  const collect = (sel: string, limit: number) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const scope of root.querySelectorAll(sel)) {
      for (const a of scope.querySelectorAll("a[href]")) {
        const u = absUrl(base, a.getAttribute("href"));
        if (!u || seen.has(u)) continue;
        seen.add(u);
        out.push(u);
        if (out.length >= limit) return out;
      }
    }
    return out;
  };
  return {
    navLinks: collect(
      "header, nav, .site-header, .elementor-location-header, #site-navigation, .main-navigation",
      80,
    ),
    footerLinks: collect(
      "footer, .site-footer, .elementor-location-footer, #colophon",
      80,
    ),
  };
}

export async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/wp-sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ];
  const urls: string[] = [];
  const seen = new Set<string>();

  const pushLocs = (xml: string) => {
    const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) && urls.length < 200) {
      try {
        const u = new URL(m[1].trim()).toString();
        if (seen.has(u)) continue;
        seen.add(u);
        urls.push(u);
      } catch {
        /* skip */
      }
    }
  };

  for (const sm of candidates) {
    try {
      const res = await fetchTextPublic(sm);
      if (res.status < 200 || res.status >= 400) continue;
      pushLocs(res.text);
      const childMaps = [...res.text.matchAll(/<loc>\s*([^<\s]+\.xml[^<\s]*)\s*<\/loc>/gi)]
        .map((x) => x[1])
        .slice(0, 8);
      for (const child of childMaps) {
        try {
          const c = await fetchTextPublic(child);
          if (c.status >= 200 && c.status < 400) pushLocs(c.text);
        } catch {
          /* skip */
        }
      }
      if (urls.length) break;
    } catch {
      /* try next */
    }
  }
  return urls;
}

function detectWpFromHtml(html: string, headers: Record<string, string>): {
  isWordPress: boolean;
  isJetEngine: boolean;
  isElementor: boolean;
} {
  const isWordPress =
    /wp-content|wp-includes|wp-json|wordpress/i.test(html) ||
    /wordpress/i.test(headers["x-powered-by"] || "") ||
    Boolean(headers["link"]?.includes("wp-json"));
  const isJetEngine =
    /jet-engine|jet-listing|jet-cct|jet-smart-filters|JetEngine/i.test(html);
  const isElementor =
    /elementor|data-elementor-type|elementor-widget/i.test(html);
  return { isWordPress, isJetEngine, isElementor };
}

export async function extractWordPressArchitecture(opts: {
  baseUrl: string;
  html: string;
  headers?: Record<string, string>;
  deep?: boolean;
  /** probe live /wp-json and jet-cct (default true) */
  liveRest?: boolean;
}): Promise<WordPressArchitecture> {
  const notes: string[] = [];
  const limitations = [
    "WP/JetEngine extract is only from public REST endpoints and the DOM — not wp-admin, private CCT, or DB.",
    "CCT schemas are derived from public records / index; hidden fields may be missing from output.",
    "Elementor template JSON (postmeta) without REST/export is not available 1:1.",
    "JetEngine dynamic fields are reconstructed from rendered DOM + data-settings — not from hidden query builder definitions.",
  ];

  let origin: string;
  try {
    origin = new URL(opts.baseUrl).origin;
  } catch {
    return emptyArchitecture("Invalid base URL for WP extract.");
  }

  const flags = detectWpFromHtml(opts.html, opts.headers || {});
  const listingGrids = extractJetListingGrids(opts.html, opts.baseUrl);
  const elementorSections = extractElementorSections(opts.html);
  const { navLinks, footerLinks } = extractNavFooterLinks(opts.html, opts.baseUrl);
  const dynamicFields = extractJetDynamicFields(opts.html, opts.baseUrl);
  // merge listing-only fields that might have been scoped differently
  for (const g of listingGrids) {
    for (const f of g.dynamicFields) {
      const exists = dynamicFields.some(
        (d) =>
          d.key === f.key &&
          d.kind === f.kind &&
          d.sampleValue === f.sampleValue &&
          d.elementorId === f.elementorId,
      );
      if (!exists) dynamicFields.push(f);
    }
  }
  const dynamicFieldCatalog = buildDynamicFieldCatalog(dynamicFields);
  if (dynamicFields.length) {
    flags.isJetEngine = true;
  }

  const rest = {
    root: null as WpRestEndpointResult | null,
    namespaces: [] as string[],
    pages: null as WpRestEndpointResult | null,
    posts: null as WpRestEndpointResult | null,
    jetCctIndex: null as WpRestEndpointResult | null,
    otherEndpoints: [] as WpRestEndpointResult[],
  };
  const cctTypes: JetCctType[] = [];
  const liveRest = opts.liveRest !== false;

  if (liveRest) {
  try {
    const rootUrl = `${origin}/wp-json/`;
    const rootRes = await fetchJson(rootUrl);
    const { summary, namespaces } = summarizeRoot(rootRes.json);
    rest.root = endpointResult(
      "/wp-json/",
      rootUrl,
      rootRes.status,
      rootRes.json,
      rootRes.text,
      summary,
    );
    rest.namespaces = namespaces;
    if (rest.root.ok) {
      notes.push(`WP REST root OK (${namespaces.length} namespaces).`);
      flags.isWordPress = true;
    }
  } catch (e) {
    notes.push(
      `WP REST root unavailable: ${e instanceof Error ? e.message : "error"}`,
    );
  }

  for (const path of [
    "/wp-json/wp/v2/pages?per_page=20",
    "/wp-json/wp/v2/posts?per_page=10",
  ] as const) {
    try {
      const url = `${origin}${path}`;
      const res = await fetchJson(url);
      const count = Array.isArray(res.json) ? res.json.length : 0;
      const result = endpointResult(
        path.split("?")[0],
        url,
        res.status,
        res.json,
        res.text,
        Array.isArray(res.json)
          ? `${count} records`
          : res.json
            ? "JSON objekt"
            : "bez JSON",
      );
      if (path.includes("/pages")) rest.pages = result;
      else rest.posts = result;
      if (result.ok) flags.isWordPress = true;
    } catch {
      /* skip */
    }
  }

  const jetPaths = [
    "/wp-json/jet-cct/",
    "/wp-json/jet-engine/v2/",
    "/wp-json/jet-engine/",
  ];
  for (const path of jetPaths) {
    try {
      const url = `${origin}${path}`;
      const res = await fetchJson(url);
      const result = endpointResult(
        path,
        url,
        res.status,
        res.json,
        res.text,
        res.json ? "Jet endpoint response" : "no JSON",
      );
      if (path === "/wp-json/jet-cct/") {
        rest.jetCctIndex = result;
        if (result.ok) {
          flags.isJetEngine = true;
          notes.push("JetEngine CCT index found.");
          const routes =
            res.json &&
            typeof res.json === "object" &&
            (res.json as { routes?: Record<string, unknown> }).routes
              ? Object.keys((res.json as { routes: Record<string, unknown> }).routes)
              : [];
          const cctSlugs = new Set<string>();
          for (const r of routes) {
            const m = r.match(/\/jet-cct\/([a-zA-Z0-9_-]+)/);
            if (m) cctSlugs.add(m[1]);
          }
          for (const ns of rest.namespaces) {
            const m = ns.match(/^jet-cct\/([a-zA-Z0-9_-]+)/);
            if (m) cctSlugs.add(m[1]);
          }
          if (cctSlugs.size === 0) {
            const htmlCct = opts.html.matchAll(/jet-cct[_/]([a-zA-Z0-9_-]+)/gi);
            for (const m of htmlCct) cctSlugs.add(m[1]);
          }

          let i = 0;
          for (const slug of cctSlugs) {
            if (i++ >= MAX_CCT_TYPES) break;
            if (slug === "jet-cct" || slug === "v1" || slug === "v2") continue;
            try {
              const cctUrl = `${origin}/wp-json/jet-cct/${slug}?per_page=${MAX_CCT_ITEMS}`;
              const cctRes = await fetchJson(cctUrl);
              if (cctRes.status >= 200 && cctRes.status < 400 && Array.isArray(cctRes.json)) {
                const items = cctRes.json as unknown[];
                const fields = items[0] ? extractFieldsFromItem(items[0]) : [];
                cctTypes.push({
                  slug,
                  endpoint: `/wp-json/jet-cct/${slug}`,
                  itemCount: items.length,
                  fields,
                  sampleItems: items
                    .slice(0, 3)
                    .map((it) => truncateDeep(it, 2, 30)),
                  schemaHints: {
                    source: "inferred-from-public-items",
                    fieldCount: fields.length,
                  },
                });
              } else if (
                cctRes.status >= 200 &&
                cctRes.status < 400 &&
                cctRes.json &&
                typeof cctRes.json === "object"
              ) {
                cctTypes.push({
                  slug,
                  endpoint: `/wp-json/jet-cct/${slug}`,
                  itemCount: null,
                  fields: extractFieldsFromItem(cctRes.json),
                  sampleItems: [truncateDeep(cctRes.json, 2, 30)],
                  schemaHints: { source: "object-response" },
                });
              }
            } catch {
              /* skip type */
            }
          }
        }
      } else if (result.ok) {
        rest.otherEndpoints.push(result);
        flags.isJetEngine = true;
      }
    } catch {
      /* skip */
    }
  }

  if (cctTypes.length === 0 && rest.namespaces.some((n) => n.startsWith("jet-cct"))) {
    flags.isJetEngine = true;
  }
  } else {
    notes.push("Live REST disabled — DOM extract only (listings, Elementor, nav/footer).");
  }

  let sitemapUrls: string[] = [];
  if (opts.deep !== false) {
    try {
      sitemapUrls = await fetchSitemapUrls(origin);
      if (sitemapUrls.length) {
        notes.push(`Sitemap: ${sitemapUrls.length} URL.`);
      }
    } catch {
      notes.push("Sitemap unavailable or empty.");
    }
  }

  if (listingGrids.length) {
    notes.push(`Jet listing grids v DOM: ${listingGrids.length}.`);
    flags.isJetEngine = true;
  }
  if (dynamicFields.length) {
    notes.push(
      `JetEngine dynamic fields: ${dynamicFields.length} occurrences, ${dynamicFieldCatalog.length} unique keys.`,
    );
    flags.isJetEngine = true;
  }
  if (elementorSections.length) {
    notes.push(`Elementor sekcie: ${elementorSections.length}.`);
    flags.isElementor = true;
  }

  const detected =
    flags.isWordPress ||
    flags.isJetEngine ||
    flags.isElementor ||
    listingGrids.length > 0 ||
    dynamicFields.length > 0 ||
    Boolean(rest.root?.ok);

  return {
    detected,
    isWordPress: flags.isWordPress,
    isJetEngine: flags.isJetEngine,
    isElementor: flags.isElementor,
    rest,
    cctTypes,
    listingGrids,
    dynamicFields: dynamicFields.slice(0, 120),
    dynamicFieldCatalog,
    elementorSections,
    sitemapUrls: sitemapUrls.slice(0, 200),
    navLinks,
    footerLinks,
    notes,
    limitations,
  };
}

function emptyArchitecture(note: string): WordPressArchitecture {
  return {
    detected: false,
    isWordPress: false,
    isJetEngine: false,
    isElementor: false,
    rest: {
      root: null,
      namespaces: [],
      pages: null,
      posts: null,
      jetCctIndex: null,
      otherEndpoints: [],
    },
    cctTypes: [],
    listingGrids: [],
    dynamicFields: [],
    dynamicFieldCatalog: [],
    elementorSections: [],
    sitemapUrls: [],
    navLinks: [],
    footerLinks: [],
    notes: [note],
    limitations: [
      "WP/JetEngine extract is only from public REST endpoints and the DOM — not wp-admin, private CCT, or DB.",
    ],
  };
}
