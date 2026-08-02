export type ScanSource = "url" | "html" | "wayback";

export interface BlueprintMeta {
  title: string;
  description: string;
  canonical: string | null;
  language: string | null;
  robots: string | null;
  og: Record<string, string>;
  twitter: Record<string, string>;
  icons: string[];
  themeColor: string | null;
  viewport: string | null;
}

export interface BlueprintAsset {
  url: string;
  type: "image" | "script" | "stylesheet" | "font" | "icon" | "other";
  contentType?: string;
  size?: number;
  inline?: boolean;
  /** relative path inside ZIP when captured */
  path?: string;
  /** base64 payload when asset was downloaded */
  base64?: string;
  captured?: boolean;
}

export interface DesignTokens {
  colors: string[];
  fonts: string[];
  cssVariables: Record<string, string>;
  borderRadii: string[];
  shadows: string[];
  spacingHints: string[];
  /** Elementor --e-global-color-* / --e-global-typography-* */
  elementorGlobals?: {
    colors: Record<string, string>;
    typography: Record<string, string>;
    raw: Record<string, string>;
    inlineCssBytes: number;
    styleIds: string[];
  };
  /** Exact typography for h1–h4, body, button */
  typography?: Array<{
    selector: string;
    fontFamily: string | null;
    fontSize: string | null;
    fontWeight: string | null;
    lineHeight: string | null;
    letterSpacing: string | null;
    source: "elementor-global" | "css-rule" | "inferred";
  }>;
  /** WP uploads full-resolution candidates (thumbnail suffix stripped) */
  fullImageUrls?: string[];
}

export interface DomOutlineNode {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
  text?: string;
  children?: DomOutlineNode[];
}

export interface TechSignal {
  name: string;
  confidence: "high" | "medium" | "low";
  evidence: string;
}

export interface BlueprintLink {
  href: string;
  text: string;
  internal: boolean;
}

export interface BlueprintForm {
  action: string;
  method: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    placeholder?: string;
    label?: string;
    autocomplete?: string;
  }>;
  /** login | contact | booking | … */
  category?:
    | "login"
    | "register"
    | "lost_password"
    | "contact"
    | "booking"
    | "search"
    | "newsletter"
    | "checkout"
    | "auth"
    | "other";
  id?: string | null;
  classes?: string[];
  submitText?: string | null;
  confidence?: "high" | "medium" | "low";
  evidence?: string;
}


export interface BlueprintPage {
  url: string;
  title: string;
  contentHash: string;
  statusCode: number | null;
  htmlBytes: number;
  headings: Array<{ level: number; text: string }>;
  internalLinkCount: number;
  formCount: number;
}

/** Per-URL crawl failure (fault isolation) */
export interface FailedUrlRecord {
  url: string;
  statusCode: number | null;
  error: string;
  at: string;
}

export interface PartialStats {
  totalAttempted: number;
  succeeded: number;
  failed: number;
}

export interface ScanWarnings {
  failedUrls: FailedUrlRecord[];
}

export type ScanStatus = "complete" | "partial" | "aborted";

export interface ScanOptionsApplied {
  maxPages: number;
  render: boolean;
  wayback: boolean;
  captureAssets: boolean;
  /** WordPress + JetEngine architecture extract */
  wpJetEngine: boolean;
}

/** Re-export shape used on Blueprint — keep in types for consumers */
export type { WordPressArchitecture } from "./wordpress-jetengine";

export interface Blueprint {
  id: string;
  version: "1.0.0" | "1.1.0" | "1.2.0";
  createdAt: string;
  /** Last local/remote mutation time — used for history merge */
  updatedAt?: string;
  source: ScanSource;
  sourceUrl: string | null;
  finalUrl: string | null;
  statusCode: number | null;
  contentHash: string;
  contentType: string | null;
  headers: Record<string, string>;
  meta: BlueprintMeta;
  tech: TechSignal[];
  design: DesignTokens;
  assets: BlueprintAsset[];
  links: BlueprintLink[];
  forms: BlueprintForm[];
  scripts: string[];
  stylesheets: string[];
  outline: DomOutlineNode[];
  headings: Array<{ level: number; text: string }>;
  html: string;
  cssBundles: Array<{ url: string; css: string }>;
  /** additional same-origin pages from crawl (excludes primary) */
  pages: BlueprintPage[];
  options: ScanOptionsApplied;
  waybackUrl: string | null;
  rendered: boolean;
  /** WordPress / JetEngine / Elementor architecture extract */
  wordpress: import("./wordpress-jetengine").WordPressArchitecture | null;
  /** Compiled Elementor template (importable JSON schema v0.4) */
  elementorTemplate: import("./elementor-compiler").ElementorTemplate | null;
  /**
   * complete = all crawl targets ok;
   * partial = some URLs failed but harvest continued;
   * aborted = user cancel / signal mid-crawl (still returns saved pages)
   */
  scanStatus?: ScanStatus;
  /** Crawl attempt counters (additional pages; primary counted in UI as +1) */
  partialStats?: PartialStats | null;
  /** Structured warnings (failed URLs etc.) */
  scanWarnings?: ScanWarnings | null;
  /**
   * SPA / thin HTML shell — raw DOM has little content (needs headless render).
   */
  isThinHtml?: boolean;
  /** Human-readable reasons for isThinHtml */
  thinHtmlReasons?: string[];
  /** Non-fatal stage failures (headless/http/css/assets…) */
  partialErrors?: Array<{
    stage: string;
    message: string;
    statusCode?: number | null;
    at: string;
  }>;
  stats: {
    htmlBytes: number;
    assetCount: number;
    capturedAssetCount: number;
    pageCount: number;
    internalLinkCount: number;
    externalLinkCount: number;
    formCount: number;
    scriptCount: number;
    stylesheetCount: number;
    scanMs: number;
  };
  notes: string[];
  limitations: string[];
}

export interface ScanRequest {
  url?: string;
  html?: string;
  baseUrl?: string;
  /** same-origin crawl size, 1–20 (default 1) */
  maxPages?: number;
  /** Playwright rendered DOM (default true for URL scans) */
  render?: boolean;
  /** archive.org fallback if live URL fails (default true) */
  wayback?: boolean;
  /** download binary assets into blueprint (default true) */
  captureAssets?: boolean;
  /**
   * WordPress + JetEngine architecture clone extract:
   * REST (/wp-json, pages, jet-cct), listing grids, Elementor sections, sitemap crawl.
   * Default true for URL scans.
   */
  wpJetEngine?: boolean;
  /** Cancel multi-page crawl mid-way → partial blueprint with harvested pages */
  signal?: AbortSignal;
}


export interface CompareChange {
  path: string;
  kind: "added" | "removed" | "changed";
  left?: string;
  right?: string;
}

export interface BlueprintCompareResult {
  leftId: string;
  rightId: string;
  identical: boolean;
  summary: {
    titleChanged: boolean;
    hashChanged: boolean;
    techAdded: string[];
    techRemoved: string[];
    assetCountDelta: number;
    linkCountDelta: number;
    pageCountDelta: number;
  };
  changes: CompareChange[];
}

export interface ScanResponse {
  ok: true;
  blueprint: Blueprint;
}

export interface ScanError {
  ok: false;
  error: string;
  code?: string;
}
