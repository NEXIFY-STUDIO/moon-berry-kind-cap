import { describe, expect, it } from "vitest";
import {
  bodyTextLength,
  detectThinHtml,
  hasSpaShellMarkers,
  thinHtmlUserMessage,
} from "@/lib/blueprint/thin-html";
import { scanToBlueprint } from "@/lib/blueprint/scan";

describe("thin HTML / SPA shell detection", () => {
  it("bodyTextLength ignores scripts and tags", () => {
    const html = `<html><body>
      <script>var x=1</script>
      <div id="root"></div>
      <p>Hi</p>
    </body></html>`;
    expect(bodyTextLength(html)).toBeLessThan(20);
  });

  it("hasSpaShellMarkers detects next/react roots", () => {
    expect(hasSpaShellMarkers('<div id="__next"></div>')).toBe(true);
    expect(hasSpaShellMarkers('<div id="root"></div><script>window.__NEXT_DATA__={}</script>')).toBe(
      true,
    );
    expect(hasSpaShellMarkers("<body><h1>Hello world article</h1></body>")).toBe(
      false,
    );
  });

  it("flags SPA shell with little text", () => {
    const r = detectThinHtml({
      html: `<html><body><div id="root"></div><script src="/assets/index.js" type="module"></script></body></html>`,
      headingsCount: 0,
      linkCount: 0,
      tech: [{ name: "React", confidence: "high", evidence: "root" }],
      rendered: false,
    });
    expect(r.isThinHtml).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(thinHtmlUserMessage(r.reasons)).toMatch(/SPA|shell|chudob/i);
  });

  it("does not flag content-rich static page", () => {
    const long =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(8);
    const r = detectThinHtml({
      html: `<html><body><h1>Blog</h1><article><p>${long}</p></article>
        <a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></body></html>`,
      headingsCount: 3,
      linkCount: 5,
      tech: [],
      rendered: false,
    });
    expect(r.isThinHtml).toBe(false);
  });

  it("scanToBlueprint sets isThinHtml on SPA shell HTML", async () => {
    const html = `<!DOCTYPE html><html>
      <head><title>App</title>
        <script src="/_next/static/chunks/main.js"></script>
      </head>
      <body><div id="__next" data-reactroot></div></body>
    </html>`;
    const bp = await scanToBlueprint({
      html,
      baseUrl: "https://spa.example/",
      captureAssets: false,
      render: false,
      wayback: false,
      maxPages: 1,
      wpJetEngine: false,
    });
    expect(bp.isThinHtml).toBe(true);
    expect(bp.thinHtmlReasons?.length).toBeGreaterThan(0);
    expect(bp.notes.some((n) => /SPA|shell|Thin|Tenký|chudob|incomplete/i.test(n))).toBe(true);
  });
});
