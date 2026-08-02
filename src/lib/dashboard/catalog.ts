/**
 * Blueprint Scanner — tools catalog (TEST dashboard data).
 * Cards launch existing app features via search params / navigation.
 */

export type ToolCategoryId =
  | "scan"
  | "analysis"
  | "wordpress"
  | "export"
  | "ai"
  | "history";

export type ToolAction =
  | { type: "home"; tool?: string; options?: Record<string, string | boolean> }
  | { type: "open"; panel: "history" | "compare" | "import" }
  | { type: "tab"; tab: string }
  | { type: "noop" };

export type ToolCardDef = {
  id: string;
  category: ToolCategoryId;
  icon: string;
  titleEn: string;
  titleSk: string;
  descEn: string;
  descSk: string;
  action: ToolAction;
  tone?: "default" | "accent" | "info" | "success" | "warning";
};

export type ToolCategoryDef = {
  id: ToolCategoryId;
  labelEn: string;
  labelSk: string;
  descEn?: string;
  descSk?: string;
};

export const TOOL_CATEGORIES: ToolCategoryDef[] = [
  {
    id: "scan",
    labelEn: "Scan",
    labelSk: "Skenovanie",
    descEn: "URL, HTML, headless, crawl, assets",
    descSk: "URL, HTML, headless, crawl, assety",
  },
  {
    id: "analysis",
    labelEn: "Analysis",
    labelSk: "Analýza",
    descEn: "Tech stack, SEO, design, DOM, forms",
    descSk: "Tech stack, SEO, dizajn, DOM, formuláre",
  },
  {
    id: "wordpress",
    labelEn: "WordPress / JetEngine",
    labelSk: "WordPress / JetEngine",
    descEn: "REST, CCT, listings, Elementor, sitemap",
    descSk: "REST, CCT, listingy, Elementor, sitemap",
  },
  {
    id: "export",
    labelEn: "Export",
    labelSk: "Export",
    descEn: "JSON, Elementor template, ZIP, import",
    descSk: "JSON, Elementor šablóna, ZIP, import",
  },
  {
    id: "ai",
    labelEn: "AI Rebuild",
    labelSk: "AI Rebuild",
    descEn: "Architecture Compiler + rebuild prompts",
    descSk: "Architecture Compiler + rebuild prompty",
  },
  {
    id: "history",
    labelEn: "History & Diff",
    labelSk: "História a porovnanie",
    descEn: "Local snapshots and compare",
    descSk: "Lokálne snapshoty a porovnanie",
  },
];

export const TOOL_CARDS: ToolCardDef[] = [
  {
    id: "url-scan",
    category: "scan",
    icon: "Globe2",
    titleEn: "URL Scan",
    titleSk: "URL sken",
    descEn: "Scan a public URL into a frontend blueprint.",
    descSk: "Sken verejnej URL do frontend blueprintu.",
    action: { type: "home", tool: "url-scan" },
    tone: "accent",
  },
  {
    id: "html-paste",
    category: "scan",
    icon: "FileCode2",
    titleEn: "Paste HTML",
    titleSk: "Vložiť HTML",
    descEn: "Offline HTML import without URL access.",
    descSk: "Offline import HTML bez prístupu k URL.",
    action: { type: "home", tool: "html-paste" },
  },
  {
    id: "headless-render",
    category: "scan",
    icon: "Bot",
    titleEn: "Headless Render",
    titleSk: "Headless render",
    descEn: "Playwright SPA render instead of raw HTML.",
    descSk: "Playwright SPA render namiesto surového HTML.",
    action: { type: "home", tool: "url-scan", options: { render: true } },
    tone: "info",
  },
  {
    id: "wayback-fallback",
    category: "scan",
    icon: "Archive",
    titleEn: "Wayback Fallback",
    titleSk: "Wayback záloha",
    descEn: "On failure, try an archive.org snapshot.",
    descSk: "Pri chybe skúsi snapshot z archive.org.",
    action: { type: "home", tool: "url-scan", options: { wayback: true } },
  },
  {
    id: "crawl-pages",
    category: "scan",
    icon: "Layers",
    titleEn: "Crawl Pages",
    titleSk: "Crawl stránok",
    descEn: "Same-origin multi-page crawl (up to 5 pages).",
    descSk: "Same-origin crawl viacerých stránok (až 5).",
    action: { type: "home", tool: "url-scan", options: { crawl: true } },
  },
  {
    id: "download-assets",
    category: "scan",
    icon: "Package",
    titleEn: "Download Assets",
    titleSk: "Stiahnuť assety",
    descEn: "Download images and fonts into ZIP export.",
    descSk: "Stiahne obrázky a fonty do ZIP exportu.",
    action: { type: "home", tool: "url-scan", options: { assets: true } },
  },
  {
    id: "wp-jet-extract",
    category: "scan",
    icon: "Blocks",
    titleEn: "WP / JetEngine Extract",
    titleSk: "WP / JetEngine extract",
    descEn: "REST, CCT, listings, Elementor, sitemap seed.",
    descSk: "REST, CCT, listingy, Elementor, seed sitemapy.",
    action: { type: "home", tool: "url-scan", options: { wp: true } },
    tone: "success",
  },
  {
    id: "tech-stack",
    category: "analysis",
    icon: "Network",
    titleEn: "Tech Stack",
    titleSk: "Tech stack",
    descEn: "Framework signals from HTML, CSS and headers.",
    descSk: "Signály frameworkov z HTML, CSS a hlavičiek.",
    action: { type: "tab", tab: "overview" },
  },
  {
    id: "seo-meta",
    category: "analysis",
    icon: "Hash",
    titleEn: "SEO & Meta",
    titleSk: "SEO a meta",
    descEn: "Title, description, Open Graph, canonical.",
    descSk: "Title, popis, Open Graph, canonical.",
    action: { type: "tab", tab: "overview" },
  },
  {
    id: "design-tokens",
    category: "analysis",
    icon: "Palette",
    titleEn: "Design Tokens",
    titleSk: "Design tokeny",
    descEn: "Colors, fonts, typography, CSS variables.",
    descSk: "Farby, fonty, typografia, CSS premenné.",
    action: { type: "tab", tab: "design" },
    tone: "accent",
  },
  {
    id: "dom-structure",
    category: "analysis",
    icon: "LayoutTemplate",
    titleEn: "DOM Structure",
    titleSk: "DOM štruktúra",
    descEn: "Outline, headings, links, hierarchy.",
    descSk: "Strom, nadpisy, odkazy, hierarchia.",
    action: { type: "tab", tab: "structure" },
  },
  {
    id: "forms-classifier",
    category: "analysis",
    icon: "FormInput",
    titleEn: "Forms Classifier",
    titleSk: "Klasifikátor formulárov",
    descEn: "Login, contact, booking and other forms.",
    descSk: "Login, kontakt, booking a ďalšie formuláre.",
    action: { type: "tab", tab: "structure" },
  },
  {
    id: "thin-html-guard",
    category: "analysis",
    icon: "AlertTriangle",
    titleEn: "Thin HTML Guard",
    titleSk: "Stráž tenkého HTML",
    descEn: "Detect SPA shell without rendered content.",
    descSk: "Detekcia SPA shellu bez vyrenderovaného obsahu.",
    action: { type: "tab", tab: "overview" },
    tone: "warning",
  },
  {
    id: "rest-discovery",
    category: "wordpress",
    icon: "Globe",
    titleEn: "REST Discovery",
    titleSk: "REST discovery",
    descEn: "/wp-json, namespaces, pages, jet-cct index.",
    descSk: "/wp-json, namespaces, pages, jet-cct index.",
    action: { type: "tab", tab: "wordpress" },
  },
  {
    id: "jetengine-cct",
    category: "wordpress",
    icon: "Database",
    titleEn: "JetEngine CCT",
    titleSk: "JetEngine CCT",
    descEn: "CCT types and fields from public records.",
    descSk: "CCT typy a polia z verejných záznamov.",
    action: { type: "tab", tab: "wordpress" },
  },
  {
    id: "listing-grids",
    category: "wordpress",
    icon: "LayoutGrid",
    titleEn: "Listing Grids",
    titleSk: "Listing grids",
    descEn: "Reverse-engineer jet-listing-grid templates.",
    descSk: "Reverse-engineering šablón jet-listing-grid.",
    action: { type: "tab", tab: "wordpress" },
  },
  {
    id: "dynamic-fields",
    category: "wordpress",
    icon: "FormInput",
    titleEn: "Dynamic Fields",
    titleSk: "Dynamické polia",
    descEn: "Catalog of jet-listing-dynamic-* from DOM.",
    descSk: "Katalóg jet-listing-dynamic-* z DOM.",
    action: { type: "tab", tab: "wordpress" },
  },
  {
    id: "elementor-sections",
    category: "wordpress",
    icon: "LayoutGrid",
    titleEn: "Elementor Sections",
    titleSk: "Elementor sekcie",
    descEn: "data-id, role, headings from sections.",
    descSk: "data-id, role, nadpisy zo sekcií.",
    action: { type: "tab", tab: "elementor" },
  },
  {
    id: "sitemap-seed",
    category: "wordpress",
    icon: "Map",
    titleEn: "Sitemap Seed",
    titleSk: "Seed sitemapy",
    descEn: "Nav + footer + sitemap URL seed for crawl.",
    descSk: "Nav + footer + URL sitemapy ako seed pre crawl.",
    action: { type: "tab", tab: "wordpress" },
  },
  {
    id: "export-json",
    category: "export",
    icon: "FileJson",
    titleEn: "Export JSON",
    titleSk: "Export JSON",
    descEn: "Download the full blueprint document.",
    descSk: "Stiahni kompletný blueprint dokument.",
    action: { type: "tab", tab: "json" },
  },
  {
    id: "elementor-json",
    category: "export",
    icon: "LayoutGrid",
    titleEn: "Elementor JSON",
    titleSk: "Elementor JSON",
    descEn: "Importable elementor-template-import.json.",
    descSk: "Importovateľný elementor-template-import.json.",
    action: { type: "tab", tab: "elementor" },
    tone: "success",
  },
  {
    id: "export-zip",
    category: "export",
    icon: "FileArchive",
    titleEn: "Export ZIP",
    titleSk: "Export ZIP",
    descEn: "HTML + CSS + captured assets archive.",
    descSk: "Archív HTML + CSS + zachytených assetov.",
    // Export actions live on the result view (any tab after a scan).
    action: { type: "tab", tab: "json" },
  },
  {
    id: "import-json",
    category: "export",
    icon: "Import",
    titleEn: "Import JSON",
    titleSk: "Import JSON",
    descEn: "Load a saved blueprint from a file.",
    descSk: "Načítaj uložený blueprint zo súboru.",
    action: { type: "open", panel: "import" },
  },
  {
    id: "architecture-spec",
    category: "ai",
    icon: "Sparkles",
    titleEn: "Architecture Spec",
    titleSk: "Architecture Spec",
    descEn: "SPA UI Architecture Compiler prompt.",
    descSk: "Prompt SPA UI Architecture Compileru.",
    action: { type: "tab", tab: "ai-rebuild" },
    tone: "accent",
  },
  {
    id: "classic-rebuild",
    category: "ai",
    icon: "Wand2",
    titleEn: "Classic Rebuild",
    titleSk: "Klasický rebuild",
    descEn: "Classic rebuild prompt for Claude / Cursor.",
    descSk: "Klasický rebuild prompt pre Claude / Cursor.",
    action: { type: "tab", tab: "ai-rebuild" },
  },
  {
    id: "tailwind-fragment",
    category: "ai",
    icon: "Code2",
    titleEn: "Tailwind Fragment",
    titleSk: "Tailwind fragment",
    descEn: "Tailwind config snippet from design tokens.",
    descSk: "Úryvok Tailwind configu z design tokenov.",
    action: { type: "tab", tab: "ai-rebuild" },
  },
  {
    id: "architecture-compiler",
    category: "ai",
    icon: "Bot",
    titleEn: "Architecture Compiler",
    titleSk: "Architecture Compiler",
    descEn: "Full system + user prompt studio.",
    descSk: "Kompletné system + user prompt studio.",
    action: { type: "tab", tab: "ai-rebuild" },
    tone: "info",
  },
  {
    id: "scan-history",
    category: "history",
    icon: "History",
    titleEn: "Scan History",
    titleSk: "História skenov",
    descEn: "Locally stored blueprint snapshots.",
    descSk: "Lokálne uložené blueprint snapshoty.",
    action: { type: "open", panel: "history" },
  },
  {
    id: "compare-blueprints",
    category: "history",
    icon: "GitCompareArrows",
    titleEn: "Compare Blueprints",
    titleSk: "Porovnať blueprinty",
    descEn: "Diff title, hash, tech, links, assets, pages.",
    descSk: "Porovná title, hash, tech, odkazy, assety a stránky.",
    action: { type: "open", panel: "compare" },
    tone: "accent",
  },
  {
    id: "partial-recovery",
    category: "history",
    icon: "AlertTriangle",
    titleEn: "Partial Recovery",
    titleSk: "Čiastočná obnova",
    descEn: "Partial / aborted scan status and failed URLs.",
    descSk: "Stav čiastočného / prerušeného skenu a zlyhané URL.",
    action: { type: "tab", tab: "overview" },
    tone: "warning",
  },
];

export function cardsByCategory(category: ToolCategoryId): ToolCardDef[] {
  return TOOL_CARDS.filter((c) => c.category === category);
}

export function homeHrefForAction(action: ToolAction): string {
  if (action.type === "home") {
    const params = new URLSearchParams();
    if (action.tool) params.set("tool", action.tool);
    if (action.options) {
      for (const [k, v] of Object.entries(action.options)) {
        params.set(k, String(v));
      }
    }
    const q = params.toString();
    return q ? `/?${q}` : "/";
  }
  if (action.type === "open") return `/?open=${action.panel}`;
  if (action.type === "tab") return `/?tab=${action.tab}`;
  return "/";
}
