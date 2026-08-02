import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 60000 });
await page.getByPlaceholder("https://moja-appka.com").fill("https://example.com");
await page.getByRole("button", { name: /Create blueprint|Vytvoriť blueprint/i }).click();
// Wait for result
await page.waitForSelector("text=BLUEPRINT_", { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "/workspace/screenshots/blueprint-scanned.png", fullPage: true });

// Mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "/workspace/screenshots/blueprint-mobile.png", fullPage: true });

const body = await page.locator("body").innerText();
console.log(JSON.stringify({
  hasBlueprint: body.includes("BLUEPRINT_"),
  hasExample: body.includes("Example Domain") || body.includes("example"),
  hasTechOrMeta: body.includes("Tech") || body.includes("SEO"),
  bodySnippet: body.slice(0, 400),
  errors,
}, null, 2));
await browser.close();
