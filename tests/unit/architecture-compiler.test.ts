import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_SYSTEM_PROMPT,
  buildArchitectureEvidence,
  deriveRouteCandidates,
  generateArchitectureCompilerPrompt,
} from "@/lib/ai-rebuild/architecture-compiler";
import { makeMinimalBlueprint } from "../fixtures/minimal-blueprint";

describe("SPA-Aware UI Architecture Compiler", () => {
  it("system prompt contains pipeline sections and quality bar", () => {
    expect(ARCHITECTURE_SYSTEM_PROMPT).toMatch(/COMPONENT TREE/);
    expect(ARCHITECTURE_SYSTEM_PROMPT).toMatch(/INTERACTION MODEL/);
    expect(ARCHITECTURE_SYSTEM_PROMPT).toMatch(/UIARCH_/);
    expect(ARCHITECTURE_SYSTEM_PROMPT).toMatch(/FAIL if|FAIL ak/);
    expect(ARCHITECTURE_SYSTEM_PROMPT).toMatch(/COMPONENT TREE/);
  });

  it("buildArchitectureEvidence strips base64 and keeps high-signal fields", () => {
    const bp = makeMinimalBlueprint({
      isThinHtml: true,
      thinHtmlReasons: ["SPA shell"],
      design: {
        colors: ["#0a0a0b", "#C8A16E"],
        fonts: ["Inter"],
        cssVariables: {
          "--color-primary": "#C8A16E",
          "--tw-shadow": "0 0 #000",
        },
        borderRadii: ["12px"],
        shadows: [],
        spacingHints: [],
      },
    });
    const ev = buildArchitectureEvidence(bp);
    expect(ev.isThinHtml).toBe(true);
    expect(JSON.stringify(ev)).not.toMatch(/aGVsbG8=/); // base64 from fixture asset
    expect(ev.design.cssVariables["--tw-shadow"]).toBeUndefined();
    expect(ev.design.primary).toBeTruthy();
    expect(ev.meta.title).toBe("Sample Blueprint App");
    expect(ev.forms.length).toBeGreaterThan(0);
  });

  it("deriveRouteCandidates includes / and internal paths", () => {
    const bp = makeMinimalBlueprint({
      links: [
        { href: "https://sample.example/app", text: "Home", internal: true },
        { href: "https://sample.example/app/login", text: "Login", internal: true },
        { href: "https://other.com/x", text: "ext", internal: false },
      ],
      pages: [
        {
          url: "https://sample.example/app/dashboard",
          title: "Dash",
          contentHash: "x",
          statusCode: 200,
          htmlBytes: 10,
          headings: [],
          internalLinkCount: 0,
          formCount: 0,
        },
      ],
    });
    const paths = deriveRouteCandidates(bp);
    expect(paths).toContain("/");
    expect(paths.some((p) => p.includes("login"))).toBe(true);
    expect(paths.some((p) => p.includes("dashboard"))).toBe(true);
  });

  it("generateArchitectureCompilerPrompt is non-empty and embeds evidence JSON", () => {
    const out = generateArchitectureCompilerPrompt(makeMinimalBlueprint(), {
      focus: "product_shell",
      depth: "deep",
      thinHtmlMode: "normal",
    });
    expect(out.systemPrompt.length).toBeGreaterThan(200);
    expect(out.userPrompt).toMatch(/HIGH-SIGNAL EVIDENCE/);
    expect(out.userPrompt).toMatch(/BLUEPRINT_ID/);
    expect(out.fullPrompt).toContain("=== SYSTEM ===");
    expect(out.fullPrompt).toContain("=== USER ===");
    expect(out.meta.formCount).toBeGreaterThanOrEqual(0);
    expect(out.meta.routeCandidates).toBeGreaterThan(0);
    // parse evidence block
    const m = out.userPrompt.match(/```json\n([\s\S]*?)\n```/);
    expect(m).toBeTruthy();
    const parsed = JSON.parse(m![1]);
    expect(parsed.blueprintId).toMatch(/^BLUEPRINT_/);
  });

  it("aggressive thinHtmlMode note when isThinHtml", () => {
    const out = generateArchitectureCompilerPrompt(
      makeMinimalBlueprint({ isThinHtml: true }),
    );
    expect(out.userPrompt).toMatch(/isThinHtml=true|thinHtmlMode: aggressive/i);
    expect(out.meta.thinHtml).toBe(true);
  });

  it("does not embed full HTML from blueprint", () => {
    const huge = "<html>" + "x".repeat(5000) + "</html>";
    const out = generateArchitectureCompilerPrompt(
      makeMinimalBlueprint({ html: huge }),
    );
    expect(out.fullPrompt.includes(huge)).toBe(false);
    expect(out.fullPrompt.length).toBeLessThan(80_000);
  });
});
