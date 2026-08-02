import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import { detectTech } from "./detect-tech";
import {
  extractDesignSystem,
  toFullWpUploadUrl,
  type DesignSystemExtract,
} from "./design-system";
import { renderPageHtml } from "./render";
import { fetchPageWithFallback, type PartialError } from "@/lib/scanner/pipeline";
import { captureAssetsWithWarnings } from "./capture-assets";
import { installProcessErrorGuards } from "@/lib/scanner/errors";

import type {
  Blueprint,
  BlueprintAsset,
  BlueprintForm,
  BlueprintLink,
  BlueprintPage,
  DesignTokens,
  DomOutlineNode,
  PartialStats,
  ScanRequest,
  ScanStatus,
  ScanWarnings,
} from "./types";
import {
  harvestCrawlPages,
  type PageHarvest,
} from "./crawl-pages";
import { isTransientError, isTransientHttpStatus, withRetry } from "./retry";
import { compileElementorFromBlueprint } from "./elementor-compiler";
import type { ElementorTemplate } from "./elementor-compiler";
import { extractWordPressArchitecture } from "./wordpress-jetengine";
import type { WordPressArchitecture } from "./wordpress-jetengine";
import {
  absolutizeOpenGraphMeta,
  absolutizeTwitterMeta,
} from "./meta-urls";
import { detectThinHtml, thinHtmlUserMessage } from "./thin-html";

installProcessErrorGuards();



const MAX_HTML_BYTES = 2_500_000;
const MAX_CSS_FILES = 12;
const MAX_CSS_BYTES = 800_000;
const FETCH_TIMEOUT_MS = 18_000;
const MAX_CRAWL_PAGES = 20;
const USER_AGENT =
  "BlueprintScanner/1.1 (+https://local; public page reconstruction)";

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

export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL. Use format https://example.com");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isPrivateIp(host)) {
    throw new Error(
      "Local and private addresses cannot be scanned from the server. " +
        "If you have HTML stored locally, paste it in “Paste HTML” mode.",
    );
  }
  return url;
}

async function fetchTextOnce(
  url: string,
  opts?: { maxBytes?: number; signal?: AbortSignal },
): Promise<{
  text: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  contentType: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  opts?.signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,text/css,*/*;q=0.8",
        "accept-language": "en,sk;q=0.9",
      },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const contentType = headers["content-type"] ?? null;
    const max = opts?.maxBytes ?? MAX_HTML_BYTES;
    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced = buf.byteLength > max ? buf.slice(0, max) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);

    // Transient HTTP → throw so withRetry can re-attempt
    if (isTransientHttpStatus(res.status)) {
      const err = new Error(`HTTP ${res.status}`);
      (err as Error & { statusCode?: number }).statusCode = res.status;
      throw err;
    }

    return {
      text,
      finalUrl: res.url || url,
      status: res.status,
      headers,
      contentType,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const e = new Error("Request timeout");
      e.name = "AbortError";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** Fetch with retries on transient network / 429 / 5xx */
async function fetchText(
  url: string,
  opts?: { maxBytes?: number; signal?: AbortSignal; maxAttempts?: number },
): Promise<{
  text: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  contentType: string | null;
}> {
  try {
    return await withRetry(
      (attempt) => fetchTextOnce(url, opts),
      {
        maxAttempts: opts?.maxAttempts ?? 3,
        baseDelayMs: 250,
        maxDelayMs: 2_000,
        signal: opts?.signal,
        shouldRetry: (err) => {
          if (opts?.signal?.aborted) return false;
          if (
            err instanceof Error &&
            (err as Error & { statusCode?: number }).statusCode != null
          ) {
            return isTransientHttpStatus(
              (err as Error & { statusCode?: number }).statusCode,
            );
          }
          return isTransientError(err);
        },
      },
    );
  } catch (err) {
    // After retries exhausted on HTTP transient — return last status as response-like
    // so callers can record partial; rethrow network errors
    if (
      err instanceof Error &&
      (err as Error & { statusCode?: number }).statusCode != null
    ) {
      return {
        text: "",
        finalUrl: url,
        status: (err as Error & { statusCode: number }).statusCode,
        headers: {},
        contentType: null,
      };
    }
    throw err;
  }
}

function absUrl(base: string, href: string | undefined | null): string | null {
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

function textContent(el: HTMLElement, max = 120): string {
  const t = (el.text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function extractMeta(root: HTMLElement, base: string) {
  const get = (sel: string, attr = "content") =>
    root.querySelector(sel)?.getAttribute(attr)?.trim() || "";

  const title =
    root.querySelector("title")?.text?.trim() ||
    get('meta[property="og:title"]') ||
    get('meta[name="twitter:title"]') ||
    "";

  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  for (const el of root.querySelectorAll("meta")) {
    const prop = el.getAttribute("property") || "";
    const name = el.getAttribute("name") || "";
    const content = el.getAttribute("content") || "";
    if (prop.startsWith("og:") && content) og[prop] = content;
    if (name.startsWith("twitter:") && content) twitter[name] = content;
  }

  const icons = root
    .querySelectorAll('link[rel*="icon"]')
    .map((l) => absUrl(base, l.getAttribute("href")))
    .filter((u): u is string => Boolean(u));

  const ogAbs = absolutizeOpenGraphMeta(og, base);
  const twitterAbs = absolutizeTwitterMeta(twitter, base);

  return {
    title,
    description:
      get('meta[name="description"]') ||
      get('meta[property="og:description"]') ||
      "",
    canonical: absUrl(base, get('link[rel="canonical"]', "href")),
    language:
      root.querySelector("html")?.getAttribute("lang") ||
      get('meta[http-equiv="content-language"]') ||
      null,
    robots: get('meta[name="robots"]') || null,
    og: ogAbs,
    twitter: twitterAbs,
    icons,
    themeColor: get('meta[name="theme-color"]') || null,
    viewport: get('meta[name="viewport"]') || null,
  };
}

function extractDesign(html: string, cssBundles: string[]): DesignTokens {
  const css = cssBundles.join("\n");
  const blob = `${html}\n${css}`;

  const colorSet = new Set<string>();
  const colorRe =
    /#(?:[0-9a-fA-F]{3,4}){1,2}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|hsla?\(\s*[\d.]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+(?:\s*,\s*[\d.]+)?\s*\)|oklch\([^)]+\)/gi;
  let m: RegExpExecArray | null;
  while ((m = colorRe.exec(blob)) && colorSet.size < 48) {
    colorSet.add(m[0].toLowerCase());
  }

  const fontSet = new Set<string>();
  const fontFace = /font-family\s*:\s*([^;}{]+)/gi;
  while ((m = fontFace.exec(blob)) && fontSet.size < 24) {
    const parts = m[1]
      .split(",")
      .map((p) => p.trim().replace(/^["']|["']$/g, ""))
      .filter(
        (p) =>
          p &&
          !/^(inherit|initial|unset|serif|sans-serif|monospace|system-ui)$/i.test(
            p,
          ),
      );
    for (const p of parts) fontSet.add(p);
  }

  const gFont = /family=([^&"']+)/gi;
  while ((m = gFont.exec(html)) && fontSet.size < 24) {
    decodeURIComponent(m[1])
      .split("|")
      .forEach((f) => {
        const name = f.split(":")[0]?.replace(/\+/g, " ").trim();
        if (name) fontSet.add(name);
      });
  }

  const cssVariables: Record<string, string> = {};
  // Prefer Elementor globals first (higher signal), then other vars
  const eGlobalRe = /(--e-global-[a-zA-Z0-9-_]+)\s*:\s*([^;}{]+)/g;
  while ((m = eGlobalRe.exec(blob)) && Object.keys(cssVariables).length < 120) {
    cssVariables[m[1]] = m[2].trim();
  }
  const varRe = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;}{]+)/g;
  while ((m = varRe.exec(css)) && Object.keys(cssVariables).length < 160) {
    if (!cssVariables[m[1]]) cssVariables[m[1]] = m[2].trim();
  }

  const borderRadii = new Set<string>();
  const radRe = /border-radius\s*:\s*([^;}{]+)/gi;
  while ((m = radRe.exec(css)) && borderRadii.size < 20) {
    borderRadii.add(m[1].trim());
  }

  const shadows = new Set<string>();
  const shRe = /box-shadow\s*:\s*([^;}{]+)/gi;
  while ((m = shRe.exec(css)) && shadows.size < 16) {
    shadows.add(m[1].trim().slice(0, 160));
  }

  const spacingHints = new Set<string>();
  const spRe = /(?:padding|margin|gap)\s*:\s*([^;}{]+)/gi;
  while ((m = spRe.exec(css)) && spacingHints.size < 24) {
    spacingHints.add(m[1].trim());
  }

  // Enrich colors from Elementor globals
  for (const [, val] of Object.entries(cssVariables)) {
    if (/^#|^rgb|^hsl|^oklch/i.test(val) && colorSet.size < 64) {
      colorSet.add(val.toLowerCase());
    }
  }

  return {
    colors: [...colorSet],
    fonts: [...fontSet],
    cssVariables,
    borderRadii: [...borderRadii],
    shadows: [...shadows],
    spacingHints: [...spacingHints],
  };
}

function buildOutline(el: HTMLElement, depth = 0): DomOutlineNode | null {
  if (depth > 5) return null;
  const tag = el.tagName?.toLowerCase?.() || el.rawTagName?.toLowerCase?.();
  if (
    !tag ||
    ["script", "style", "noscript", "svg", "path", "meta", "link"].includes(tag)
  )
    return null;

  const id = el.getAttribute("id") || undefined;
  const classAttr = el.getAttribute("class") || "";
  const classes = classAttr
    ? classAttr.split(/\s+/).filter(Boolean).slice(0, 8)
    : undefined;
  const role = el.getAttribute("role") || undefined;

  const children: DomOutlineNode[] = [];
  if (depth < 5) {
    for (const child of el.childNodes) {
      if ((child as HTMLElement).nodeType === 1) {
        const node = buildOutline(child as HTMLElement, depth + 1);
        if (node) children.push(node);
        if (children.length >= 12) break;
      }
    }
  }

  const text =
    children.length === 0 ? textContent(el, 80) || undefined : undefined;

  if (!id && !classes?.length && !role && !text && children.length === 0) {
    return null;
  }

  return {
    tag,
    ...(id ? { id } : {}),
    ...(classes?.length ? { classes } : {}),
    ...(role ? { role } : {}),
    ...(text ? { text } : {}),
    ...(children.length ? { children } : {}),
  };
}

function extractLinks(root: HTMLElement, base: string): BlueprintLink[] {
  const origin = new URL(base).origin;
  const seen = new Set<string>();
  const links: BlueprintLink[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    const href = absUrl(base, a.getAttribute("href"));
    if (!href || seen.has(href)) continue;
    seen.add(href);
    let internal = false;
    try {
      internal = new URL(href).origin === origin;
    } catch {
      internal = false;
    }
    links.push({
      href,
      text: textContent(a, 60),
      internal,
    });
    if (links.length >= 120) break;
  }
  return links;
}

function extractForms(root: HTMLElement, base: string): BlueprintForm[] {
  // legacy path — full classify happens in design-system extractDesignForms
  const forms: BlueprintForm[] = [];
  for (const form of root.querySelectorAll("form")) {
    const action = absUrl(base, form.getAttribute("action")) || base;
    const method = (form.getAttribute("method") || "get").toUpperCase();
    const fields: BlueprintForm["fields"] = [];
    for (const input of form.querySelectorAll("input, select, textarea")) {
      const name = input.getAttribute("name") || "";
      if (!name) continue;
      const type = input.getAttribute("type") || input.tagName.toLowerCase();
      if (type === "submit" || type === "button") continue;
      fields.push({
        name,
        type,
        required:
          input.hasAttribute("required") ||
          input.getAttribute("aria-required") === "true",
        placeholder: input.getAttribute("placeholder") || undefined,
      });
    }
    forms.push({ action, method, fields: fields.slice(0, 40), category: "other" });
    if (forms.length >= 20) break;
  }
  return forms;
}

function extractAssets(root: HTMLElement, base: string): BlueprintAsset[] {
  const assets: BlueprintAsset[] = [];
  const push = (url: string | null, type: BlueprintAsset["type"]) => {
    if (!url) return;
    const normalized =
      type === "image" && /\/wp-content\/uploads\//i.test(url)
        ? toFullWpUploadUrl(url)
        : url;
    if (assets.some((a) => a.url === normalized)) return;
    assets.push({ url: normalized, type });
  };

  for (const img of root.querySelectorAll("img[src]")) {
    push(absUrl(base, img.getAttribute("src")), "image");
    push(absUrl(base, img.getAttribute("data-src")), "image");
    push(absUrl(base, img.getAttribute("data-full-url")), "image");
    push(absUrl(base, img.getAttribute("data-large_image")), "image");
  }
  for (const s of root.querySelectorAll("script[src]")) {
    push(absUrl(base, s.getAttribute("src")), "script");
  }
  for (const l of root.querySelectorAll('link[rel="stylesheet"]')) {
    push(absUrl(base, l.getAttribute("href")), "stylesheet");
  }
  for (const l of root.querySelectorAll('link[rel*="icon"]')) {
    push(absUrl(base, l.getAttribute("href")), "icon");
  }
  for (const img of root.querySelectorAll("img[srcset], source[srcset]")) {
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
    for (const part of srcset.split(",")) {
      const u = part.trim().split(/\s+/)[0];
      push(absUrl(base, u), "image");
    }
  }
  return assets.slice(0, 200);
}

function extractHeadings(root: HTMLElement) {
  const out: Array<{ level: number; text: string }> = [];
  for (let level = 1; level <= 6; level++) {
    for (const h of root.querySelectorAll(`h${level}`)) {
      const text = textContent(h, 140);
      if (text) out.push({ level, text });
      if (out.length >= 60) return out;
    }
  }
  return out;
}

function makeId(sourceLabel: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const slug =
    sourceLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 28) || "page";
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BLUEPRINT_${slug}_${stamp}_${rnd}`;
}

function rewriteAssetUrls(html: string, base: string): string {
  return html
    .replace(
      /(\s(?:src|href)=["'])([^"']+)(["'])/gi,
      (full, pre, url, post) => {
        const abs = absUrl(base, url);
        return abs ? `${pre}${abs}${post}` : full;
      },
    )
    .replace(/(\ssrcset=["'])([^"']+)(["'])/gi, (full, pre, srcset, post) => {
      const next = srcset
        .split(",")
        .map((part: string) => {
          const [u, d] = part.trim().split(/\s+/);
          const abs = absUrl(base, u);
          return abs ? `${abs}${d ? ` ${d}` : ""}` : part.trim();
        })
        .join(", ");
      return `${pre}${next}${post}`;
    });
}

async function loadStylesheets(
  root: HTMLElement,
  base: string,
): Promise<Array<{ url: string; css: string }>> {
  const hrefs: string[] = [];
  for (const l of root.querySelectorAll('link[rel="stylesheet"]')) {
    const u = absUrl(base, l.getAttribute("href"));
    if (u) hrefs.push(u);
  }
  const unique = [...new Set(hrefs)].slice(0, MAX_CSS_FILES);
  const bundles: Array<{ url: string; css: string }> = [];

  for (const s of root.querySelectorAll("style")) {
    const css = s.text || "";
    if (css.trim()) {
      bundles.push({ url: "inline:style", css: css.slice(0, MAX_CSS_BYTES) });
    }
  }

  await Promise.all(
    unique.map(async (url) => {
      try {
        const res = await fetchText(url, { maxBytes: MAX_CSS_BYTES });
        if (res.status >= 200 && res.status < 400 && res.text) {
          bundles.push({ url, css: res.text });
        }
      } catch {
        /* skip */
      }
    }),
  );

  return bundles;
}

function pullCssUrls(css: string, base: string, assets: BlueprintAsset[]) {
  const re = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) && assets.length < 250) {
    const raw = m[1];
    if (raw.startsWith("data:")) continue;
    const url = absUrl(base, raw);
    if (!url || assets.some((a) => a.url === url)) continue;
    const type: BlueprintAsset["type"] =
      /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url)
        ? "font"
        : /\.(png|jpe?g|gif|webp|svg|avif|ico)(\?|$)/i.test(url)
          ? "image"
          : "other";
    assets.push({ url, type });
  }
}

function pickSafeHeaders(headers: Record<string, string>): Record<string, string> {
  const keep = [
    "content-type",
    "server",
    "x-powered-by",
    "x-frame-options",
    "content-security-policy",
    "strict-transport-security",
    "x-vercel-id",
    "cf-ray",
    "x-nf-request-id",
    "cache-control",
  ];
  const out: Record<string, string> = {};
  for (const k of keep) {
    if (headers[k]) out[k] = headers[k];
  }
  return out;
}

function normalizePageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // strip trailing slash for dedupe except root
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

type ParsedPage = {
  html: string;
  base: string;
  statusCode: number | null;
  headers: Record<string, string>;
  contentType: string | null;
  meta: ReturnType<typeof extractMeta>;
  links: BlueprintLink[];
  forms: BlueprintForm[];
  assets: BlueprintAsset[];
  headings: Array<{ level: number; text: string }>;
  outline: DomOutlineNode[];
  scripts: string[];
  stylesheets: string[];
  cssBundles: Array<{ url: string; css: string }>;
  design: DesignTokens;
  rewritten: string;
  contentHash: string;
};

async function parseHtmlDocument(
  html: string,
  base: string,
  headers: Record<string, string>,
  statusCode: number | null,
  contentType: string | null,
): Promise<ParsedPage> {
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });
  const meta = extractMeta(root, base);
  const links = extractLinks(root, base);
  const forms = extractForms(root, base);
  const assets = extractAssets(root, base);
  const headings = extractHeadings(root);
  const cssBundles = await loadStylesheets(root, base);
  for (const b of cssBundles) {
    pullCssUrls(b.css, b.url.startsWith("inline:") ? base : b.url, assets);
  }
  const design = extractDesign(
    html,
    cssBundles.map((b) => b.css),
  );
  const body = root.querySelector("body") || root;
  const outlineRoot = buildOutline(body as HTMLElement, 0);
  const outline = outlineRoot ? [outlineRoot] : [];
  const scripts = root
    .querySelectorAll("script[src]")
    .map((s) => absUrl(base, s.getAttribute("src")))
    .filter((u): u is string => Boolean(u));
  const stylesheets = root
    .querySelectorAll('link[rel="stylesheet"]')
    .map((s) => absUrl(base, s.getAttribute("href")))
    .filter((u): u is string => Boolean(u));
  const rewritten = rewriteAssetUrls(html, base);
  const contentHash = createHash("sha256").update(html).digest("hex");
  return {
    html,
    base,
    statusCode,
    headers,
    contentType,
    meta,
    links,
    forms,
    assets,
    headings,
    outline,
    scripts,
    stylesheets,
    cssBundles,
    design,
    rewritten,
    contentHash,
  };
}

async function fetchPageHtml(
  url: string,
  render: boolean,
  signal?: AbortSignal,
): Promise<{
  html: string;
  finalUrl: string;
  status: number | null;
  headers: Record<string, string>;
  contentType: string | null;
  rendered: boolean;
}> {
  if (render) {
    try {
      const r = await renderPageHtml(url, { signal, timeoutMs: 30_000 });
      return {
        html: r.html.slice(0, MAX_HTML_BYTES),
        finalUrl: r.finalUrl,
        status: r.statusCode,
        headers: { "content-type": "text/html; charset=utf-8" },
        contentType: "text/html",
        rendered: true,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      // fall through to static fetch
      console.warn("[blueprint] headless render failed, fallback HTTP:", err);
    }
  }
  const res = await fetchText(url, { signal });
  return {
    html: res.text,
    finalUrl: res.finalUrl,
    status: res.status,
    headers: res.headers,
    contentType: res.contentType,
    rendered: false,
  };
}

export async function scanToBlueprint(input: ScanRequest): Promise<Blueprint> {
  const started = Date.now();
  const maxPages = Math.min(
    MAX_CRAWL_PAGES,
    Math.max(1, Math.floor(input.maxPages ?? 1)),
  );
  const wantRender = input.render !== false;
  const wantWayback = input.wayback !== false;
  const wantAssets = input.captureAssets !== false;
  // WP/JetEngine deep extract: default ON for URL, OFF for pure HTML unless set
  const wantWp =
    input.wpJetEngine !== undefined
      ? input.wpJetEngine
      : Boolean(input.url?.trim());


  const notes: string[] = [];
  const partialErrors: PartialError[] = [];
  const limitations = [
    "Blueprint is a frontend snapshot of public content (HTML/CSS/assets/pages) — not a server, DB, or private API clone.",
    "Headless render helps with SPAs, but still cannot see data behind login or WebSocket/API payloads.",
    "Crawl is same-origin with a page limit; asset capture has size limits.",
    "Scan local URLs (localhost) via “Paste HTML”.",
    "WP/JetEngine mode only reads public REST endpoints and the DOM (not wp-admin / private CCT).",
  ];


  let source: Blueprint["source"] = "url";
  let sourceUrl: string | null = null;
  let waybackUrl: string | null = null;
  let rendered = false;

  let primaryHtml = "";
  let finalUrl: string | null = null;
  let statusCode: number | null = null;
  let headers: Record<string, string> = {};
  let contentType: string | null = null;

  if (input.html && input.html.trim()) {
    source = "html";
    primaryHtml = input.html.slice(0, MAX_HTML_BYTES);
    sourceUrl = input.baseUrl?.trim() || null;
    finalUrl = sourceUrl;
    notes.push("Blueprint from pasted HTML (offline / no URL access).");
  } else if (input.url?.trim()) {
    const url = assertPublicUrl(input.url.trim());
    sourceUrl = url.toString();
    const pipe = await fetchPageWithFallback({
      url: url.toString(),
      wantRender,
      wantWayback,
      signal: input.signal,
    });
    primaryHtml = pipe.html;
    finalUrl = pipe.finalUrl;
    statusCode = pipe.statusCode;
    headers = pipe.headers;
    contentType = pipe.contentType;
    rendered = pipe.rendered;
    waybackUrl = pipe.waybackUrl;
    source = pipe.source;
    partialErrors.push(...pipe.partialErrors);
    if (pipe.stageUsed === "headless") {
      notes.push("Primary page captured via headless render (Playwright shield).");
    } else if (pipe.stageUsed === "http" && pipe.partialErrors.some((e) => e.stage === "headless")) {
      notes.push("Headless failed/timeout — falling back to HTTP static fetch.");
    } else if (pipe.source === "wayback") {
      notes.push(`Restored from archive.org (fallback chain).`);
    }
    for (const e of pipe.partialErrors) {
      notes.push(`[${e.stage}] ${e.message}`);
    }
  } else {
    throw new Error("Enter a URL or paste HTML.");
  }

  const base = finalUrl || sourceUrl || "https://blueprint.local/";
  const primary = await parseHtmlDocument(
    primaryHtml,
    base,
    headers,
    statusCode,
    contentType,
  );

  // CSS & Design System extract (Elementor globals, typography, full images, forms)
  const designSystem: DesignSystemExtract = extractDesignSystem(
    primary.html,
    base,
    primary.cssBundles.map((b) => b.css),
  );
  primary.design = {
    ...primary.design,
    elementorGlobals: designSystem.elementor,
    typography: designSystem.typography,
    fullImageUrls: designSystem.fullImageUrls,
    cssVariables: {
      ...primary.design.cssVariables,
      ...designSystem.elementor.raw,
    },
    colors: [
      ...new Set([
        ...primary.design.colors,
        ...Object.values(designSystem.elementor.colors).filter((v) =>
          /^#|^rgb|^hsl|^oklch/i.test(v),
        ),
      ]),
    ].slice(0, 64),
  };
  // Prefer classified interactive forms
  if (designSystem.forms.length) {
    primary.forms = designSystem.forms.map((f) => ({
      action: f.action,
      method: f.method,
      fields: f.fields,
      category: f.category,
      id: f.id,
      classes: f.classes,
      submitText: f.submitText,
      confidence: f.confidence,
      evidence: f.evidence,
    }));
  }
  // Prefer full-res WP images in assets
  for (const full of designSystem.fullImageUrls) {
    if (!primary.assets.some((a) => a.url === full)) {
      primary.assets.push({ url: full, type: "image" });
    }
  }
  notes.push(...designSystem.notes);

  // WordPress + JetEngine architecture extract (REST + listing + Elementor + sitemap)
  let wordpress: WordPressArchitecture | null = null;
  if (wantWp && source !== "html") {
    try {
      wordpress = await extractWordPressArchitecture({
        baseUrl: base,
        html: primary.html,
        headers: primary.headers,
        deep: true,
      });
      notes.push(...wordpress.notes);
      for (const l of wordpress.limitations) {
        if (!limitations.includes(l)) limitations.push(l);
      }
      if (wordpress.detected) {
        notes.push(
          `WP/JetEngine clone extract: WP=${wordpress.isWordPress} Jet=${wordpress.isJetEngine} Elementor=${wordpress.isElementor}; CCT=${wordpress.cctTypes.length}; listings=${wordpress.listingGrids.length}.`,
        );
      }
    } catch (err) {
      notes.push(
        `WP/JetEngine extract failed: ${err instanceof Error ? err.message : "error"}`,
      );
    }
  } else if (wantWp && source === "html") {
    // HTML-only: DOM listing/Elementor (no live REST/sitemap unless explicitly URL scan)
    try {
      wordpress = await extractWordPressArchitecture({
        baseUrl: base,
        html: primary.html,
        headers: primary.headers,
        deep: false,
        liveRest: false,
      });
      notes.push(...wordpress.notes.slice(0, 6));
    } catch {
      wordpress = null;
    }
  }

  // Crawl same-origin pages (fault-tolerant, per-URL isolation)
  const pages: BlueprintPage[] = [];
  const allLinks = [...primary.links];
  const allForms = [...primary.forms];
  const allAssets = [...primary.assets];
  const allScripts = [...primary.scripts];
  const allStyles = [...primary.stylesheets];
  let allCss = [...primary.cssBundles];
  let mergedDesign = primary.design;
  let scanStatus: ScanStatus = "complete";
  let partialStats: PartialStats | null = null;
  let scanWarnings: ScanWarnings | null = null;

  if (maxPages > 1 && source !== "html") {
    const seedUrls: string[] = [];
    if (wordpress) {
      seedUrls.push(...wordpress.navLinks, ...wordpress.footerLinks, ...wordpress.sitemapUrls);
      const restPages = wordpress.rest.pages?.data;
      if (Array.isArray(restPages)) {
        for (const p of restPages) {
          if (p && typeof p === "object" && "link" in p) {
            const link = (p as { link?: string }).link;
            if (link) seedUrls.push(link);
          }
        }
      }
    }

    const harvestOne = async (nextUrl: string): Promise<PageHarvest | null> => {
      assertPublicUrl(nextUrl);
      const pageFetch = await fetchPageHtml(nextUrl, false, input.signal);
      if (pageFetch.status != null && pageFetch.status >= 400) {
        // Represent as failed harvest with status (crawl layer records warning)
        return {
          page: {
            url: pageFetch.finalUrl || nextUrl,
            title: "",
            contentHash: "",
            statusCode: pageFetch.status,
            htmlBytes: 0,
            headings: [],
            internalLinkCount: 0,
            formCount: 0,
          },
          links: [],
          forms: [],
          assets: [],
          scripts: [],
          stylesheets: [],
          cssBundles: [],
          design: {
            colors: [],
            fonts: [],
            cssVariables: {},
            borderRadii: [],
            shadows: [],
            spacingHints: [],
          },
        };
      }
      const parsed = await parseHtmlDocument(
        pageFetch.html,
        pageFetch.finalUrl || nextUrl,
        pageFetch.headers,
        pageFetch.status,
        pageFetch.contentType,
      );
      return {
        page: {
          url: pageFetch.finalUrl || nextUrl,
          title: parsed.meta.title,
          contentHash: parsed.contentHash,
          statusCode: parsed.statusCode,
          htmlBytes: Buffer.byteLength(parsed.html, "utf8"),
          headings: parsed.headings.slice(0, 20),
          internalLinkCount: parsed.links.filter((x) => x.internal).length,
          formCount: parsed.forms.length,
        },
        links: parsed.links,
        forms: parsed.forms,
        assets: parsed.assets,
        scripts: parsed.scripts,
        stylesheets: parsed.stylesheets,
        cssBundles: parsed.cssBundles,
        design: parsed.design,
      };
    };

    // Incremental checkpoint list (crash / cancel recovery)
    const scannedPagesCheckpoint: BlueprintPage[] = [];

    try {
      const crawl = await harvestCrawlPages({
        baseUrl: base,
        maxAdditionalPages: maxPages - 1,
        seedUrls,
        primaryInternalLinks: primary.links.filter((l) => l.internal).map((l) => l.href),
        initialDesign: primary.design,
        signal: input.signal,
        harvestOne,
        onProgress: ({ scannedPages }) => {
          scannedPagesCheckpoint.length = 0;
          scannedPagesCheckpoint.push(...scannedPages);
        },
      });

      pages.push(...crawl.scannedPages);
      allLinks.push(...crawl.links);
      allForms.push(...crawl.forms);
      allAssets.push(...crawl.assets);
      allScripts.push(...crawl.scripts);
      allStyles.push(...crawl.stylesheets);
      allCss = allCss.concat(crawl.cssBundles);
      mergedDesign = crawl.design;
      scanStatus = crawl.scanStatus;
      partialStats = crawl.partialStats;
      scanWarnings = crawl.scanWarnings;

      if (crawl.failedUrls.length || crawl.aborted) {
        notes.push(
          `Crawl recovery: ${crawl.scannedPages.length} OK, ${crawl.failedUrls.length} failed` +
            (crawl.aborted ? " (aborted)" : "") +
            `. scanStatus=${crawl.scanStatus}.`,
        );
      }
      if (pages.length) {
        notes.push(
          `Crawl: ${pages.length + 1} same-origin pages (limit ${maxPages})${
            wordpress?.sitemapUrls.length ? " + sitemap/nav seed" : ""
          }.`,
        );
      }
    } catch (err) {
      // Fatal mid-crawl: still keep checkpointed pages as partial blueprint data
      pages.push(...scannedPagesCheckpoint);
      scanStatus = "partial";
      partialStats = {
        totalAttempted: scannedPagesCheckpoint.length + 1,
        succeeded: scannedPagesCheckpoint.length,
        failed: 1,
      };
      scanWarnings = {
        failedUrls: [
          {
            url: base,
            statusCode: null,
            error:
              err instanceof Error
                ? `Fatal crawl error: ${err.message}`
                : "Fatal crawl error",
            at: new Date().toISOString(),
          },
        ],
      };
      notes.push(
        `Crawl fatal recovery: saved ${scannedPagesCheckpoint.length} pages before crash.`,
      );
      limitations.push(
        "Crawl was interrupted by a fatal error — blueprint is partial.",
      );
    }
  }

  // dedupe links/assets
  const linkSeen = new Set<string>();
  const links: BlueprintLink[] = [];
  for (const l of allLinks) {
    if (linkSeen.has(l.href)) continue;
    linkSeen.add(l.href);
    links.push(l);
    if (links.length >= 200) break;
  }
  const assetSeen = new Set<string>();
  let assets: BlueprintAsset[] = [];
  for (const a of allAssets) {
    if (assetSeen.has(a.url)) continue;
    assetSeen.add(a.url);
    assets.push(a);
    if (assets.length >= 250) break;
  }

  if (wantAssets) {
    try {
      const cap = await captureAssetsWithWarnings(assets, {
        signal: input.signal,
      });
      assets = cap.assets;
      const captured = assets.filter((a) => a.captured).length;
      if (captured) notes.push(`Assets downloaded into blueprint: ${captured}.`);
      for (const w of cap.warnings.slice(0, 20)) {
        partialErrors.push({
          stage: "assets",
          message: `${w.reason}: ${w.url}`.slice(0, 500),
          at: new Date().toISOString(),
        });
      }
      if (cap.skippedOversize) {
        notes.push(
          `${cap.skippedOversize} assets skipped over size limit (memory guard).`,
        );
      }
      if (cap.skippedBudget) {
        notes.push(
          `${cap.skippedBudget} assets skipped due to ZIP budget (50 MB).`,
        );
      }
    } catch (err) {
      partialErrors.push({
        stage: "assets",
        message: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      });
      notes.push("Asset capture failed — blueprint continues without binary assets.");
    }
  }

  const tech = detectTech({
    html: primary.html,
    css: allCss.map((b) => b.css).join("\n"),
    headers: primary.headers,
    scripts: [...new Set(allScripts)],
  });

  // Enrich tech from WP architecture flags
  if (wordpress?.isWordPress && !tech.some((t) => t.name === "WordPress")) {
    tech.push({

      name: "WordPress",
      confidence: "high",
      evidence: wordpress.rest.root?.ok ? "WP REST /wp-json" : "WP markers",
    });
  }
  if (wordpress?.isJetEngine && !tech.some((t) => t.name === "JetEngine")) {
    tech.push({
      name: "JetEngine",
      confidence: "high",
      evidence:
        wordpress.cctTypes.length > 0
          ? `CCT types: ${wordpress.cctTypes.map((c) => c.slug).slice(0, 5).join(", ")}`
          : `${wordpress.listingGrids.length} listing grid(s)`,
    });
  }
  if (wordpress?.isElementor && !tech.some((t) => t.name === "Elementor")) {
    tech.push({
      name: "Elementor",
      confidence: "high",
      evidence: `${wordpress.elementorSections.length} sections with data-id`,
    });
  }


  const idLabel =
    (sourceUrl &&
      (() => {
        try {
          return new URL(sourceUrl).hostname.replace(/\./g, "_");
        } catch {
          return "html";
        }
      })()) ||
    "html";

  const internalLinkCount = links.filter((l) => l.internal).length;
  const externalLinkCount = links.length - internalLinkCount;
  const uniqueCss = (() => {
    const seen = new Set<string>();
    const out: Array<{ url: string; css: string }> = [];
    for (const b of allCss) {
      const key = b.url.startsWith("inline:")
        ? `inline:${createHash("sha256").update(b.css).digest("hex").slice(0, 12)}`
        : b.url;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: b.url, css: b.css.slice(0, MAX_CSS_BYTES) });
      if (out.length >= 24) break;
    }
    return out;
  })();

  const thin = detectThinHtml({
    html: primary.html,
    headingsCount: primary.headings.length,
    linkCount: primary.links.length,
    tech,
    rendered,
  });
  if (thin.isThinHtml) {
    notes.push(thinHtmlUserMessage(thin.reasons));
    for (const r of thin.reasons) {
      if (!notes.includes(r)) notes.push(r);
    }
    limitations.push(
      "Thin HTML / SPA shell — blueprint may be incomplete without headless render.",
    );
  }

  const blueprint: Blueprint = {
    id: makeId(idLabel),
    version: "1.2.0",
    createdAt: new Date().toISOString(),
    source,
    sourceUrl,
    finalUrl,
    statusCode: primary.statusCode,
    contentHash: primary.contentHash,
    contentType: primary.contentType,
    headers: pickSafeHeaders(primary.headers),
    meta: primary.meta,
    tech,
    design: mergedDesign,
    assets,
    links,
    forms: allForms.slice(0, 40),
    scripts: [...new Set(allScripts)].slice(0, 100),
    stylesheets: [...new Set(allStyles)].slice(0, 50),
    outline: primary.outline,
    headings: primary.headings,
    html: primary.rewritten.slice(0, MAX_HTML_BYTES),
    cssBundles: uniqueCss,
    pages,
    options: {
      maxPages,
      render: wantRender && source === "url",
      wayback: wantWayback,
      captureAssets: wantAssets,
      wpJetEngine: wantWp,
    },
    waybackUrl,
    rendered,
    wordpress,
    elementorTemplate: null,
    scanStatus,
    partialStats,
    scanWarnings,
    isThinHtml: thin.isThinHtml,
    thinHtmlReasons: thin.reasons,
    partialErrors: partialErrors.length ? partialErrors : [],
    stats: {
      htmlBytes: Buffer.byteLength(primary.html, "utf8"),
      assetCount: assets.length,
      capturedAssetCount: assets.filter((a) => a.captured).length,
      pageCount: pages.length + 1,
      internalLinkCount,
      externalLinkCount,
      formCount: allForms.length,
      scriptCount: new Set(allScripts).size,
      stylesheetCount: new Set(allStyles).size,
      scanMs: Date.now() - started,
    },
    notes,
    limitations,
  };

  // Elementor DOM → importable template JSON
  try {
    const tpl = compileElementorFromBlueprint(blueprint);
    blueprint.elementorTemplate = tpl;
    notes.push(
      `Elementor template compiled: ${tpl._blueprint?.widgetCount ?? 0} widgets, ${tpl.content.length} top containers.`,
    );
  } catch (err) {
    notes.push(
      `Elementor compile failed: ${err instanceof Error ? err.message : "error"}`,
    );
    blueprint.elementorTemplate = null;
  }
  blueprint.notes = notes;
  blueprint.stats.scanMs = Date.now() - started;

  return blueprint;
}

