import type { TechSignal } from "./types";

const SPA_TECH = new Set([
  "React",
  "Next.js",
  "Vue",
  "Nuxt",
  "Angular",
  "Svelte",
  "SvelteKit",
  "Remix",
  "Astro",
  "Solid",
  "Qwik",
]);

/** Strip tags and collapse whitespace for body text volume estimate */
export function bodyTextLength(html: string): number {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const chunk = bodyMatch ? bodyMatch[1] : html;
  return chunk
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export function hasSpaShellMarkers(html: string): boolean {
  const h = html.toLowerCase();
  return (
    /id=["'](__next|root|app|__nuxt|__svelte|sapper)["']/.test(h) ||
    /data-reactroot|data-reactid|_next\/static|__next_f|ng-version|ng-app/.test(
      h,
    ) ||
    /window\.__NEXT_DATA__|__NUXT__|vite\/client|@vite\/client/.test(html) ||
    /type=["']module["'][^>]+src=["'][^"']*\/(assets|static|_next)\//.test(h)
  );
}

export function detectThinHtml(opts: {
  html: string;
  headingsCount: number;
  linkCount?: number;
  tech: TechSignal[];
  rendered?: boolean;
  /** max meaningful body text chars to count as thin (default 180) */
  textThreshold?: number;
}): { isThinHtml: boolean; reasons: string[] } {
  const threshold = opts.textThreshold ?? 180;
  const textLen = bodyTextLength(opts.html);
  const spaTech = opts.tech.some((t) => SPA_TECH.has(t.name));
  const spaMarkers = hasSpaShellMarkers(opts.html);
  const fewHeadings = opts.headingsCount <= 1;
  const fewLinks = (opts.linkCount ?? 0) <= 2;

  const reasons: string[] = [];

  const looksLikeSpa = spaTech || spaMarkers;
  const thinContent =
    textLen < threshold || (fewHeadings && textLen < threshold * 2);

  if (!looksLikeSpa && !thinContent) {
    return { isThinHtml: false, reasons: [] };
  }

  // Thin HTML only when SPA signals + sparse content, or extremely empty body
  if (textLen < 40) {
    reasons.push(`Page body has almost no text (${textLen} characters).`);
  } else if (textLen < threshold) {
    reasons.push(
      `Little visible text in HTML (${textLen} characters) — content is likely loaded by JavaScript.`,
    );
  }

  if (spaTech) {
    const names = opts.tech
      .filter((t) => SPA_TECH.has(t.name))
      .map((t) => t.name);
    reasons.push(`Detected SPA stack: ${[...new Set(names)].join(", ")}.`);
  } else if (spaMarkers) {
    reasons.push("SPA shell markers found (#root / #__next / __NEXT_DATA__).");
  }

  if (fewHeadings && looksLikeSpa) {
    reasons.push("Few headings in raw HTML (shell without rendered content).");
  }
  if (fewLinks && looksLikeSpa && textLen < threshold) {
    reasons.push("Minimal number of links in initial HTML.");
  }
  if (opts.rendered === false && looksLikeSpa && thinContent) {
    reasons.push(
      "Headless render was not used or failed — try enabling “Headless render”.",
    );
  }

  const isThinHtml =
    (looksLikeSpa && thinContent) || textLen < 40 || reasons.length >= 2;

  return { isThinHtml, reasons: isThinHtml ? reasons : [] };
}

export function thinHtmlUserMessage(reasons: string[]): string {
  const base =
    "Thin HTML shell (SPA): output is thinner because the server mostly sent an empty shell and content is painted in the browser.";
  if (!reasons.length) return base;
  return `${base} ${reasons.slice(0, 3).join(" ")}`;
}
